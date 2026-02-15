import os
import httpx
from datetime import datetime, timedelta
from typing import Optional

# --- ИСПРАВЛЕНИЕ ОШИБКИ BCRYPT (ПАТЧ) ---
# Это лечит ошибку "AttributeError: module 'bcrypt' has no attribute '__about__'"
import bcrypt
if not hasattr(bcrypt, '__about__'):
    class About:
        __version__ = bcrypt.__version__
    bcrypt.__about__ = About()
# ----------------------------------------

from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from dotenv import load_dotenv

# Библиотеки для БД и Auth
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# 1. Загрузка настроек
load_dotenv()
API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# 2. Настройка Базы Данных (SQLite)
SQLALCHEMY_DATABASE_URL = "sqlite:///./studify.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)

# Создаем таблицы при запуске
Base.metadata.create_all(bind=engine)

# 3. Настройка Безопасности (JWT)
SECRET_KEY = "my_secret_key_change_it_later"  # В реальном проекте храни в .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 дней

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Вспомогательные функции ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# 4. Инициализация FastAPI
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="static")

# Модели данных (Pydantic)
class CreateUser(BaseModel):
    email: str
    password: str

class ChatRequest(BaseModel):
    message: str
    model_type: str = "notes"
    image: Optional[str] = None

# Конфигурация ИИ
MODELS_CONFIG = {
    "notes": {
        "model": "arcee-ai/trinity-large-preview:free",
        "system": "Ты — эксперт по составлению конспектов. Структурируй информацию, выделяй главное. Используй Markdown."
    },
    "search": {
        "model": "qwen/qwen3-vl-235b-a22b-thinking",
        "system": "Ты — исследователь. Давай подробные, глубокие ответы с фактами."
    },
    "eye": {
        "model": "qwen/qwen3-vl-235b-a22b-thinking",
        "system": "Ты — 'Око Studify'. Ты видишь изображения.Ответь на запрос смотря на фото или документ. Решай задачи с фото, объясняй схемы или переводи текст."
    }
}

# --- ENDPOINTS ---

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Регистрация
@app.post("/register")
def register(user: CreateUser, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Этот email уже зарегистрирован")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    return {"msg": "Пользователь создан"}

# Вход (Login)
@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный email или пароль")
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# Чат с ИИ
@app.post("/api/chat")
async def chat_endpoint(
    chat_request: ChatRequest, 
    current_user: User = Depends(get_current_user) # Проверка авторизации
):
    if not API_KEY:
        return JSONResponse(status_code=500, content={"error": "API Key not found"})

    # Выбор режима
    mode = chat_request.model_type
    config = MODELS_CONFIG.get(mode, MODELS_CONFIG["notes"])
    
    # Если пришла картинка, принудительно берем мультимодальную модель
    if chat_request.image and mode != "eye":
        config = MODELS_CONFIG["eye"]

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Studify.AI",
    }
    
    # Формируем контент
    user_content = []
    if chat_request.message:
        user_content.append({"type": "text", "text": chat_request.message})
    
    if chat_request.image:
        user_content.append({
            "type": "image_url", 
            "image_url": {"url": chat_request.image}
        })

    payload = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": config["system"]},
            {"role": "user", "content": user_content}
        ]
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(OPENROUTER_URL, json=payload, headers=headers, timeout=60.0)
            
            if response.status_code != 200:
                print(f"OpenRouter Error: {response.text}")
                return JSONResponse(status_code=500, content={"error": "Ошибка провайдера ИИ"})

            data = response.json()
            if "choices" in data and len(data["choices"]) > 0:
                return {"reply": data["choices"][0]["message"]["content"]}
            else:
                return JSONResponse(status_code=500, content={"error": "Пустой ответ от ИИ"})

        except Exception as e:
            print(f"Server Error: {str(e)}")
            return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
