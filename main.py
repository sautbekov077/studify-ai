import os
import random
import string
import httpx
import json
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
if not hasattr(bcrypt, '__about__'):
    class About: __version__ = bcrypt.__version__
    bcrypt.__about__ = About()

from fastapi import FastAPI, Request, Depends, HTTPException, status, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
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

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"), MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"), MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER"), MAIL_STARTTLS=True, MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True, VALIDATE_CERTS=True
)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL: DATABASE_URL = "sqlite:///./studify.db"

if "sqlite" in DATABASE_URL: engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else: engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20, pool_recycle=1800)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def generate_short_id(): return ''.join(random.choices(string.digits, k=6))

class User(Base):
    __tablename__ = "users_final"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    user_id = Column(String, unique=True, default=generate_short_id)
    is_pro = Column(Boolean, default=False)
    reset_code = Column(String, nullable=True)
    streak_days = Column(Integer, default=0)
    user_preferences = Column(String, default='{}')

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


SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_IN_PRODUCTION")
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
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_iat": False})
        email: str = payload.get("sub")
        if email is None: raise HTTPException(status_code=401)
    except JWTError: raise HTTPException(status_code=401)
    user = db.query(User).filter(User.email == email).first()
    if user is None: raise HTTPException(status_code=401)
    return user

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="static")

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
async def root(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.post("/register")
async def register(user: CreateUser, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    new_user = User(email=user.email, hashed_password=get_password_hash(user.password), user_preferences=json.dumps(user.preferences))
    db.add(new_user)
    db.commit()
    return {"message": "Успешная регистрация"}

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный логин или пароль")
    return {"access_token": create_access_token(data={"sub": user.email}), "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    prefs = json.loads(current_user.user_preferences) if current_user.user_preferences else {}
    return {"email": current_user.email, "user_id": current_user.user_id, "is_pro": current_user.is_pro, "streak_days": current_user.streak_days, "preferences": prefs}

@app.post("/api/chat")
async def chat_endpoint(chat_request: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.add(ChatMessage(user_id=current_user.id, session_id=chat_request.session_id, role="user", content=chat_request.message))
    db.commit()
    
    
    prefs = json.loads(current_user.user_preferences) if current_user.user_preferences else {}
    
    role_map = {"school": "школьником", "student": "студентом", "self": "человеком, занимающимся самообразованием", "work": "работающим специалистом"}
    goal_map = {"homework": "помощь с задачами", "exams": "подготовка к экзаменам", "coding": "написание и ревью кода", "languages": "изучение языков"}
    style_map = {"friendly": "Общайся максимально дружелюбно, используй эмодзи.", "strict": "Общайся строго, академично, без воды и лишних эмоций.", "socratic": "Используй метод Сократа: вместо прямых ответов задавай наводящие вопросы, чтобы пользователь сам пришел к решению.", "brief": "Отвечай максимально кратко и по существу."}
    
    pers_prompt = f"Контекст пользователя: общается с {role_map.get(prefs.get('role'), 'студентом')}. Его главная цель: {goal_map.get(prefs.get('goal'), 'учеба')}. Как отвечать: {style_map.get(prefs.get('style'), 'Дружелюбно')}."
    
    model_info = MODELS_CONFIG.get(chat_request.model_type, MODELS_CONFIG["chat"])
    final_system_prompt = f"{model_info['system']}\n\n{pers_prompt}"
    
    messages = [{"role": "system", "content": final_system_prompt}]
    
    history = db.query(ChatMessage).filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == chat_request.session_id).order_by(ChatMessage.id.desc()).limit(10).all()
    for msg in reversed(history): messages.append({"role": msg.role, "content": msg.content})
        
    user_content = []
    if chat_request.message: user_content.append({"type": "text", "text": chat_request.message})
    if chat_request.image: user_content.append({"type": "image_url", "image_url": {"url": chat_request.image}})
    messages.append({"role": "user", "content": user_content if len(user_content) > 1 else chat_request.message})

    async def event_generator():
        headers = { "Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json" }
        payload = { "model": model_info["model"], "messages": messages, "stream": True }
        
        full_reply = ""
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream("POST", OPENROUTER_URL, headers=headers, json=payload, timeout=60.0) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': 'Ошибка API'})}\n\n"
                        return
                    async for line in response.aiter_lines():
                        if line.startswith("data: ") and "[DONE]" not in line:
                            try:
                                data_json = json.loads(line[6:])
                                content = data_json.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                if content: full_reply += content; yield f"data: {json.dumps({'text': content})}\n\n"
                            except: pass
            except Exception as e: yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        if full_reply:
            db.add(ChatMessage(user_id=current_user.id, session_id=chat_request.session_id, role="assistant", content=full_reply))
            db.commit()
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
