import os
import random
import string
import httpx
import json
from datetime import datetime, timedelta
from typing import Optional


import bcrypt
if not hasattr(bcrypt, '__about__'):
    class About:
        __version__ = bcrypt.__version__
    bcrypt.__about__ = About()


from fastapi import FastAPI, Request, Depends, HTTPException, status, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

# Auth & DB
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, ForeignKey 
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Mail
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType


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



def generate_short_id():
    return ''.join(random.choices(string.digits, k=6))

class User(Base):
    __tablename__ = "users_final"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
   
    user_id = Column(String, unique=True, default=generate_short_id)
    is_pro = Column(Boolean, default=False)
    reset_code = Column(String, nullable=True)
    streak_days = Column(Integer, default=0) # <-- ДОБАВЛЕНО: Счетчик дней (Огонек)
    
    
    user_preferences = Column(String, default='{"ui_lang":"ru","edu_level":"student","explain_style":"detailed"}')

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_final.id"))
    session_id = Column(String, index=True)
    role = Column(String)
    content = Column(Text)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

Base.metadata.create_all(bind=engine)


class CreateUser(BaseModel):
    email: EmailStr
    password: str
    preferences: dict = {} 

class ChatRequest(BaseModel):
    message: str
    model_type: str = "chat"
    image: Optional[str] = None
    session_id: str = "default_session"

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str
    new_password: str


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
        payload = jwt.decode(
            token, 
            SECRET_KEY, 
            algorithms=[ALGORITHM], 
            options={"verify_iat": False}
        )
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError as e:
        print(f"❌ Ошибка декодирования токена: {str(e)}")
        raise credentials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="static")


CURRENT_MODEL = "google/gemini-2.0-pro-exp-02-05:free"

MODELS_CONFIG = {
    "chat": {
        "model": "arcee-ai/trinity-mini:free",
        "system": "Ты — дружелюбный ассистент Studify. Спроси чего хочет пользователь. Отвечай понятно."
    },
    "planner": {
        "model": "arcee-ai/trinity-mini:free",
        "system": "Ты — планировщик задач. Помогай структурировать день, разбивать задачи и расставлять приоритеты."
    },
    "coding": {
        "model": "deepseek/deepseek-r1-0528:free",
        "system": "Ты — Senior Developer. Пиши чистый код на стандарте PEP8, объясняй сложные моменты. Код оборачивай в блоки Markdown ```language ... ```."
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
        "model": "qwen/qwen3-vl-235b-a22b-thinking",
        "system": "Ты — 'Око Studify'. Ты видишь изображения. Решай задачи (LaTeX $$...$$), переводи текст."
    }
}




@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/register")
def register(user: CreateUser, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email занят")
        
    
    prefs_json = json.dumps(user.preferences, ensure_ascii=False) if user.preferences else '{"ui_lang":"ru","edu_level":"student","explain_style":"detailed"}'
    
    new_user = User(
        email=user.email, 
        hashed_password=get_password_hash(user.password),
        user_preferences=prefs_json
    )
    
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
    return {
        "email": current_user.email, 
        "user_id": current_user.user_id, 
        "is_pro": current_user.is_pro,
        "streak_days": current_user.streak_days 
    }

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
async def chat_endpoint(chat_request: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not API_KEY: 
        return JSONResponse(status_code=500, content={"error": "API Key missing"})
    
    mode = chat_request.model_type
    config = MODELS_CONFIG.get(mode, MODELS_CONFIG["chat"]).copy()
    if chat_request.image and mode != "eye": 
        config = MODELS_CONFIG["eye"].copy()

    
    prefs = json.loads(current_user.user_preferences or "{}")
    system_prompt = config["system"]
    
    if mode in ["chat", "coding", "eye"]:
        level = "Школьник" if prefs.get("edu_level") == "school" else "Студент"
        style_map = {"brief": "Кратко", "detailed": "Подробно", "teacher": "Как преподаватель"}
        style = style_map.get(prefs.get("explain_style"), "Подробно")
        system_prompt += f" (Учитывай контекст: Уровень пользователя - {level}, Требуемый стиль объяснения - {style})."

    
    new_user_msg = ChatMessage(user_id=current_user.id, session_id=chat_request.session_id, role="user", content=chat_request.message)
    db.add(new_user_msg)
    db.commit()

    
    recent_messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.session_id == chat_request.session_id
    ).order_by(ChatMessage.id.desc()).limit(5).all()
    
    keep_ids = [msg.id for msg in recent_messages]

   
    if keep_ids:
        db.query(ChatMessage).filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.session_id == chat_request.session_id,
            ChatMessage.id.notin_(keep_ids)
        ).delete(synchronize_session=False)
        db.commit()

    
    history = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id, 
        ChatMessage.session_id == chat_request.session_id
    ).order_by(ChatMessage.id.asc()).all()

    messages_payload = [{"role": "system", "content": system_prompt}]

    for msg in history:
        if chat_request.image and msg.id == new_user_msg.id:
            user_content = [{"type": "text", "text": msg.content or "..."}]
            user_content.append({"type": "image_url", "image_url": {"url": chat_request.image}})
            messages_payload.append({"role": "user", "content": user_content})
        else:
            messages_payload.append({"role": msg.role, "content": msg.content})

    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Studify"
    }
    
    payload = {
        "model": config["model"],
        "messages": messages_payload,
        "stream": True 
    }

    async def event_generator():
        full_reply = ""
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream("POST", OPENROUTER_URL, json=payload, headers=headers, timeout=60.0) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        print(f"ОШИБКА ПРОВАЙДЕРА ИИ: {error_text.decode('utf-8')}")
                        yield f"data: {json.dumps({'error': 'Ошибка API: ' + str(response.status_code)})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data_json = json.loads(data_str)
                                if "choices" in data_json:
                                    delta = data_json["choices"][0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        full_reply += content
                                        yield f"data: {json.dumps({'text': content})}\n\n"
                            except json.JSONDecodeError:
                                pass
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        if full_reply:
            new_ai_msg = ChatMessage(user_id=current_user.id, session_id=chat_request.session_id, role="assistant", content=full_reply)
            db.add(new_ai_msg)
            db.commit()
            
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
