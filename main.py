import os
import random
import string
import httpx
from datetime import datetime, timedelta
from typing import Optional

# --- FIX: Patch for passlib + new bcrypt ---
import bcrypt
if not hasattr(bcrypt, '__about__'):
    class About:
        __version__ = bcrypt.__version__
    bcrypt.__about__ = About()
# -------------------------------------------

from fastapi import FastAPI, Request, Depends, HTTPException, status, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

# Auth & DB
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Mail
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

# --- CONFIGURATION ---
load_dotenv()

API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Mail Config
conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

# Database Config
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./studify.db"

if "sqlite" in DATABASE_URL:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELS ---

def generate_short_id():
    return ''.join(random.choices(string.digits, k=6))

class User(Base):
    # Используем чистое имя таблицы, чтобы не было конфликтов
    __tablename__ = "users_final"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Profile Fields
    user_id = Column(String, unique=True, default=generate_short_id)
    is_pro = Column(Boolean, default=False)
    reset_code = Column(String, nullable=True)
    # СВЯЗЬ С СООБЩЕНИЯМИ УБРАНА - ПАМЯТИ НЕТ

Base.metadata.create_all(bind=engine)

# Pydantic Schemas
class CreateUser(BaseModel):
    email: EmailStr
    password: str

class ChatRequest(BaseModel):
    message: str
    model_type: str = "chat"
    image: Optional[str] = None

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str
    new_password: str

# --- SECURITY ---
SECRET_KEY = "CHANGE_THIS_IN_PRODUCTION"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30 

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def get_password_hash(password): return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    # FIX ВРЕМЕНИ: Отнимаем 1 минуту, чтобы токен был валиден сразу
    now = datetime.utcnow() - timedelta(minutes=1)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # --- ГЛАВНОЕ ИСПРАВЛЕНИЕ ---
        # Мы отключаем проверку 'iat' (время создания), так как она вызывает вечный цикл
        # если часы сервера и токена не совпадают идеально.
        payload = jwt.decode(
            token, 
            SECRET_KEY, 
            algorithms=[ALGORITHM], 
            options={"verify_iat": False}  # <--- ВОТ ЭТО ЛЕЧИТ ЦИКЛ
        )
        
        email: str = payload.get("sub")
        if email is None:
            print("❌ Ошибка Auth: В токене нет email")
            raise credentials_exception
            
    except JWTError as e:
        # Теперь мы увидим реальную причину в консоли, если это не сработает
        print(f"❌ Ошибка декодирования токена: {str(e)}")
        raise credentials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        print(f"❌ Ошибка Auth: Пользователь {email} не найден в базе")
        raise credentials_exception
        
    return user

# --- APP SETUP ---
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="static")

# --- AI CONFIGURATION ---
CURRENT_MODEL = "google/gemini-2.0-pro-exp-02-05:free"

MODELS_CONFIG = {
    "chat": {
        "model": "stepfun/step-3.5-flash:free",
        "system": "Ты — дружелюбный ассистент Studify. Спроси чего хочет пользователь. Отвечай понятно."
    },
    "planner": {
        "model": "arcee-ai/trinity-mini:free",
        "system": "Ты — планировщик задач. Помогай структурировать день, разбивать задачи и расставлять приоритеты."
    },
    "coding": {
        "model": "qwen/qwen3-next-80b-a3b-instruct:free",
        "system": "Ты — Senior Developer. Пиши чистый код, объясняй сложные моменты. Код оборачивай в блоки Markdown ```language ... ```."
    },
    "notes": {
        "model": "qwen/qwen3-vl-30b-a3b-thinking",
        "system": "Ты — эксперт по конспектам. Сжимай информацию, выделяй главное, используй списки."
    },
    "search": {
        "model": "arcee-ai/trinity-large-preview:free",
        "system": "Ты — исследователь. Давай полные и фактологические ответы."
    },
    "eye": {
        "model": "qwen/qwen3-vl-30b-a3b-thinking",
        "system": "Ты — 'Око Studify'. Ты видишь изображения. Решай задачи (LaTeX $$...$$), переводи текст."
    }
}

# --- ENDPOINTS ---

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/register")
def register(user: CreateUser, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email занят")
    new_user = User(email=user.email, hashed_password=get_password_hash(user.password))
    while db.query(User).filter(User.user_id == new_user.user_id).first():
        new_user.user_id = generate_short_id()
    db.add(new_user)
    db.commit()
    return {"msg": "Пользователь создан"}

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный логин/пароль")
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email, "user_id": current_user.user_id, "is_pro": current_user.is_pro}

@app.post("/forgot-password")
async def forgot_password(request: PasswordResetRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user: return {"msg": "Sent"}
    code = ''.join(random.choices(string.digits, k=6))
    user.reset_code = code
    db.commit()
    message = MessageSchema(subject="Studify Code", recipients=[request.email], body=f"Code: {code}", subtype=MessageType.html)
    fm = FastMail(conf)
    background_tasks.add_task(fm.send_message, message)
    return {"msg": "Sent"}

@app.post("/reset-password")
def reset_password(request: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user or user.reset_code != request.code: raise HTTPException(status_code=400, detail="Неверный код")
    user.hashed_password = get_password_hash(request.new_password)
    user.reset_code = None
    db.commit()
    return {"msg": "Updated"}

@app.post("/api/chat")
async def chat_endpoint(chat_request: ChatRequest, current_user: User = Depends(get_current_user)):
    # ВНИМАНИЕ: Память убрана. Мы просто берем сообщение и режим.
    if not API_KEY: return JSONResponse(status_code=500, content={"error": "API Key missing"})
    
    mode = chat_request.model_type
    config = MODELS_CONFIG.get(mode, MODELS_CONFIG["chat"])
    if chat_request.image and mode != "eye": config = MODELS_CONFIG["eye"]

    # Формируем контекст БЕЗ истории
    messages_payload = [{"role": "system", "content": config["system"]}]
    
    user_content = [{"type": "text", "text": chat_request.message or "..."}]
    if chat_request.image:
        user_content.append({"type": "image_url", "image_url": {"url": chat_request.image}})
    
    if not chat_request.image:
        messages_payload.append({"role": "user", "content": chat_request.message})
    else:
        messages_payload.append({"role": "user", "content": user_content})

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Studify"
    }
    
    payload = {
        "model": config["model"],
        "messages": messages_payload
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(OPENROUTER_URL, json=payload, headers=headers, timeout=60.0)
            if response.status_code != 200:
                print(f"AI Error: {response.text}")
                return JSONResponse(status_code=500, content={"error": "Ошибка провайдера ИИ"})
            
            data = response.json()
            if "choices" in data:
                return {"reply": data["choices"][0]["message"]["content"]}
            else:
                return JSONResponse(status_code=500, content={"error": "Пустой ответ"})
        except Exception as e:
            print(f"Error: {e}")
            return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)