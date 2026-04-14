import json
import httpx
import secrets
import re
from datetime import datetime, timedelta, time
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session


from config import (
    GROQ_API_KEY,
    GROQ_URL,
    AI_MODEL,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ADMIN_LOGIN,
    ADMIN_PASSWORD,
    FREE_DAILY_MESSAGES,
    FREE_DAILY_QUIZZES,
    FREE_DAILY_FLASHCARDS,
    PRO_DAILY_MESSAGES,
)
from database import get_db, User, Chat, Message, AccessCode, Quiz, QuizQuestion, Flashcard
from auth import get_password_hash, verify_password, create_access_token, get_current_user

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory=".")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    access_code: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class ChatRequest(BaseModel):
    message: str
    model_type: str = "auto"
    session_id: str = "default"
    image: Optional[str] = None
    speech_style: Optional[str] = "friendly"
    response_size: Optional[str] = "medium"
    creativity: Optional[int] = 35

class CodeCreate(BaseModel):
    code: str
    max_uses: int
    expires_at: Optional[datetime] = None

class CodeUpdate(BaseModel):
    max_uses: int

class GenerateRequest(BaseModel):
    chat_id: int
    append: bool = False

class ChatCreateRequest(BaseModel):
    title: Optional[str] = "Новый чат"

class ApplyCodeRequest(BaseModel):
    code: str


security = HTTPBasic()

def get_current_admin(credentials: HTTPBasicCredentials = Depends(security)):
    is_user_ok = secrets.compare_digest(credentials.username, ADMIN_LOGIN)
    is_pass_ok = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    
    if not (is_user_ok and is_pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль администратора",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def add_xp(user: User, db: Session, amount: int):
    user.xp += amount
    new_level = (user.xp // 100) + 1
    if new_level > user.level:
        user.level = new_level
    db.commit()
    db.refresh(user)

def check_limits(user: User, db: Session, action: str):
    today_start = datetime.combine(datetime.utcnow().date(), time.min)

    if user.plan == "pro" and action != "message":
        return True
    
    if action == "message":
        count = db.query(Message).join(Chat).filter(
            Chat.user_id == user.id,
            Message.role == "user",
            Message.created_at >= today_start
        ).count()
        limit = PRO_DAILY_MESSAGES if user.plan == "pro" else FREE_DAILY_MESSAGES
        if count >= limit:
            raise HTTPException(status_code=403, detail=f"Лимит сообщений на сегодня исчерпан ({limit}/{limit}).")
            
    elif action == "quiz":
        count = db.query(Quiz).join(Chat).filter(
            Chat.user_id == user.id,
            Quiz.created_at >= today_start
        ).count()
        if count >= FREE_DAILY_QUIZZES:
            raise HTTPException(status_code=403, detail=f"Лимит квизов на сегодня исчерпан ({FREE_DAILY_QUIZZES}/{FREE_DAILY_QUIZZES}).")
            
    elif action == "flashcard":
        count = db.query(Flashcard).join(Chat).filter(
            Chat.user_id == user.id,
            Flashcard.created_at >= today_start
        ).count()
        if count >= FREE_DAILY_FLASHCARDS:
            raise HTTPException(status_code=403, detail=f"Лимит карточек на сегодня исчерпан ({FREE_DAILY_FLASHCARDS}/{FREE_DAILY_FLASHCARDS}).")
    return True

BASE_SYSTEM_PROMPT = """
Ты Studify.AI — дружелюбный образовательный ассистент.
Правила:
1) Отвечай кратко, понятно, структурно.
2) Если просят формат JSON, возвращай только валидный JSON без markdown.
3) Всегда отвечай строго на том языке, на котором пользователь задал последний вопрос.
4) Не переводи язык ответа без явной просьбы пользователя.
5) Если вопрос на казахском, отвечай на естественном современном казахском (кириллица), без смешивания с русским/английским.
6) Не показывай внутренние рассуждения, черновики, служебные инструкции и шаги размышления.
""".strip()

MODE_PROMPTS = {
    "chat": "Режим chat: отвечай как ассистент для диалога и обучения.",
    "quiz": "Режим quiz: создай 5-10 вопросов с 4 вариантами и правильным ответом.",
    "flashcards": "Режим flashcards: создай 3-10 флешкарт вопрос-ответ.",
}

QUIZ_QUESTIONS_PER_CHAT_MAX = 10
FLASHCARDS_PER_CHAT_MAX = 15

def parse_json_array(content: str) -> list:
    cleaned = content.replace("```json", "").replace("```", "").strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("questions", "quiz", "items", "flashcards", "cards", "data"):
                value = data.get(key)
                if isinstance(value, list):
                    return value
    except Exception:
        pass

    match = re.search(r"\[[\s\S]*\]", cleaned)
    if not match:
        raise ValueError("Model did not return JSON array")
    data = json.loads(match.group(0))
    if not isinstance(data, list):
        raise ValueError("Parsed JSON is not an array")
    return data

def build_mode_messages(mode: str, user_content: str) -> List[Dict[str, str]]:
    return [
        {"role": "system", "content": f"{BASE_SYSTEM_PROMPT}\n{MODE_PROMPTS.get(mode, MODE_PROMPTS['chat'])}"},
        {"role": "user", "content": user_content},
    ]

def normalize_quiz_questions(raw_questions: list) -> list:
    normalized = []

    def strip_option_prefix(text: str) -> str:
       
        return re.sub(r"^\s*([A-Da-d]|[1-4])[\)\.:\-\s]+", "", text).strip()

    def resolve_correct_answer(raw_correct: str, options: list) -> Optional[str]:
        if not raw_correct:
            return None

        c = raw_correct.strip()

        
        for opt in options:
            if c.lower() == opt.lower():
                return opt

        
        m_label = re.match(r"^([A-Da-d])$", c)
        if m_label:
            idx = ord(m_label.group(1).upper()) - ord("A")
            if 0 <= idx < len(options):
                return options[idx]

        
        if c.isdigit():
            idx = int(c) - 1
            if 0 <= idx < len(options):
                return options[idx]

        return None

    for item in raw_questions:
        if not isinstance(item, dict):
            continue

        question = str(item.get("question", "")).strip()
        if not question:
            continue

        raw_options = item.get("options", [])
        if not isinstance(raw_options, list):
            raw_options = []

        options = []
        seen = set()
        for opt in raw_options:
            opt_text = strip_option_prefix(str(opt))
            if not opt_text:
                continue
            key = opt_text.lower()
            if key in seen:
                continue
            seen.add(key)
            options.append(opt_text)

        
        if len(options) < 4:
            continue
        options = options[:4]

        correct_answer = str(item.get("correct_answer", "")).strip()
        resolved_correct = resolve_correct_answer(correct_answer, options)
        if not resolved_correct:
            continue

        normalized.append({
            "question": question,
            "options": options,
            "correct_answer": resolved_correct,
        })

    if not normalized:
        raise ValueError("No valid quiz questions generated")

    normalized = normalized[:10]

    return normalized

async def groq_nonstream(messages: List[Dict[str, Any]], temperature: float = 0.2) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY не задан в .env")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": AI_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(GROQ_URL, headers=headers, json=payload, timeout=45.0)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Ошибка Groq API")
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")


@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/auth/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    
    plan = "free"
    access_code_id = None
    
    if req.access_code:
        code_obj = db.query(AccessCode).filter(AccessCode.code == req.access_code).first()
        is_not_expired = bool(code_obj) and ((code_obj.expires_at is None) or (code_obj.expires_at >= datetime.utcnow()))
        if code_obj and code_obj.used_count < code_obj.max_uses and is_not_expired:
            plan = "pro"
            access_code_id = code_obj.id
            code_obj.used_count += 1
        else:
            raise HTTPException(status_code=400, detail="Неверный или просроченный код")

    hashed_pw = get_password_hash(req.password)
    new_user = User(email=req.email, password_hash=hashed_pw, plan=plan, access_code_id=access_code_id)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(
        data={"sub": new_user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer", "plan": plan}

@app.post("/auth/login")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer", "plan": user.plan}

@app.post("/auth/apply-code")
async def apply_code(req: ApplyCodeRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code_value = req.code.strip()
    if not code_value:
        raise HTTPException(status_code=400, detail="Введите промокод")

    code_obj = db.query(AccessCode).filter(AccessCode.code == code_value).first()
    is_not_expired = bool(code_obj) and ((code_obj.expires_at is None) or (code_obj.expires_at >= datetime.utcnow()))

    if not code_obj or code_obj.used_count >= code_obj.max_uses or not is_not_expired:
        raise HTTPException(status_code=400, detail="Неверный или просроченный промокод")

    if current_user.access_code_id == code_obj.id and current_user.plan == "pro":
        return {"message": "Промокод уже активирован", "plan": current_user.plan}

    code_obj.used_count += 1
    current_user.plan = "pro"
    current_user.access_code_id = code_obj.id
    db.commit()
    db.refresh(current_user)
    return {"message": "PRO тариф активирован", "plan": current_user.plan}

@app.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email, "plan": current_user.plan, "xp": current_user.xp, "level": current_user.level}

@app.get("/chats")
async def get_chats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chats = db.query(Chat).filter(Chat.user_id == current_user.id).order_by(Chat.created_at.desc()).all()
    response = []
    for c in chats:
        last_message = db.query(Message).filter(Message.chat_id == c.id).order_by(Message.created_at.desc()).first()
        response.append({
            "id": c.id,
            "title": c.title,
            "last_message": (last_message.content[:80] if last_message else ""),
            "created_at": c.created_at,
        })
    return response

@app.get("/chats/{chat_id}/messages")
async def get_chat_messages(chat_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    msgs = db.query(Message).filter(Message.chat_id == chat.id).order_by(Message.created_at.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in msgs]

@app.post("/chats")
async def create_chat(req: ChatCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat_obj = Chat(user_id=current_user.id, title=(req.title or "Новый чат"))
    db.add(chat_obj)
    db.commit()
    db.refresh(chat_obj)
    return {"id": chat_obj.id, "title": chat_obj.title, "created_at": chat_obj.created_at}


@app.post("/chat")
async def chat(chat_request: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_limits(current_user, db, "message")

    chat_obj = None
    if chat_request.session_id and chat_request.session_id.isdigit():
        chat_obj = db.query(Chat).filter(Chat.id == int(chat_request.session_id), Chat.user_id == current_user.id).first()

    if not chat_obj:
        chat_obj = db.query(Chat).filter(Chat.user_id == current_user.id).first()

    if not chat_obj:
        chat_obj = Chat(user_id=current_user.id, title="Новый чат")
        db.add(chat_obj)
        db.commit()
        db.refresh(chat_obj)

    user_msg = Message(chat_id=chat_obj.id, role="user", content=chat_request.message)
    db.add(user_msg)

    if chat_obj.title == "Новый чат" and chat_request.message:
        chat_obj.title = chat_request.message[:50]

    db.commit()

    add_xp(current_user, db, 2)

    recent_messages = db.query(Message).filter(Message.chat_id == chat_obj.id).order_by(Message.created_at.desc()).limit(5).all()
    recent_messages.reverse() 

    speech_style = (chat_request.speech_style or "friendly").strip().lower()
    response_size = (chat_request.response_size or "medium").strip().lower()
    creativity = max(0, min(100, int(chat_request.creativity if chat_request.creativity is not None else 35)))

    style_map = {
        "friendly": "дружелюбный",
        "neutral": "нейтральный",
        "formal": "формальный",
    }
    size_map = {
        "short": "короткий",
        "medium": "средний",
        "detailed": "подробный",
    }

    style_instruction = style_map.get(speech_style, "дружелюбный")
    size_instruction = size_map.get(response_size, "средний")

    messages = [{
        "role": "system",
        "content": (
            f"{BASE_SYSTEM_PROMPT}\n{MODE_PROMPTS['chat']}\n"
            f"Стиль речи: {style_instruction}. Размер ответа: {size_instruction}."
        )
    }]
    messages.extend([{"role": ("user" if m.role == "user" else "assistant"), "content": m.content} for m in recent_messages])

    if chat_request.image:
        messages[-1] = {
            "role": "user", 
            "content": [
                {"type": "text", "text": chat_request.message},
                {"type": "image_url", "image_url": {"url": chat_request.image}}
            ]
        }

    async def event_generator():
        if not GROQ_API_KEY:
            yield f"data: {json.dumps({'error': 'GROQ_API_KEY не задан'})}\n\n"
            return

        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": AI_MODEL,
            "messages": messages,
            "stream": True,
            "temperature": 0.1 + (creativity / 100.0) * 0.8,
        }

        full_reply = ""
        yield f"data: {json.dumps({'chat_id': chat_obj.id})}\n\n"
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream("POST", GROQ_URL, headers=headers, json=payload, timeout=45.0) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': 'Ошибка Groq API'})}\n\n"
                        return
                    async for line in response.aiter_lines():
                        if line.startswith("data:") and "[DONE]" not in line:
                            try:
                                data_json = json.loads(line[5:].strip())
                                content = data_json.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                if content: 
                                    full_reply += content
                                    yield f"data: {json.dumps({'text': content})}\n\n"
                            except: pass
            except Exception as e: 
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        if full_reply:
            ai_msg = Message(chat_id=chat_obj.id, role="ai", content=full_reply)
            db.add(ai_msg)
            db.commit()
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/quiz/generate")
async def generate_quiz(req: GenerateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_limits(current_user, db, "quiz")
    
    chat_obj = db.query(Chat).filter(Chat.id == req.chat_id, Chat.user_id == current_user.id).first()
    if not chat_obj:
        raise HTTPException(status_code=404, detail="Чат не найден")
        
    latest_quiz = db.query(Quiz).filter(Quiz.chat_id == chat_obj.id).order_by(Quiz.created_at.desc()).first()
    existing_questions_count = 0
    if latest_quiz:
        existing_questions_count = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == latest_quiz.id).count()

    if req.append and existing_questions_count >= QUIZ_QUESTIONS_PER_CHAT_MAX:
        raise HTTPException(status_code=400, detail=f"Лимит вопросов для этого чата достигнут ({QUIZ_QUESTIONS_PER_CHAT_MAX}).")

    if (not req.append) and latest_quiz and existing_questions_count > 0:
        return {"message": "Квиз уже существует", "quiz_id": latest_quiz.id, "total_questions": existing_questions_count}

    recent_messages = db.query(Message).filter(Message.chat_id == chat_obj.id).order_by(Message.created_at.desc()).limit(5).all()
    recent_messages.reverse()
    chat_history = "\n".join([f"{m.role}: {m.content}" for m in recent_messages])

    remaining = QUIZ_QUESTIONS_PER_CHAT_MAX - existing_questions_count
    if remaining <= 0:
        raise HTTPException(status_code=400, detail=f"Лимит вопросов для этого чата достигнут ({QUIZ_QUESTIONS_PER_CHAT_MAX}).")

    target_count = remaining if req.append else min(5, remaining)

    user_prompt = (
        f"Сгенерируй квиз по этой истории. Нужно строго {target_count} вопросов, у каждого ровно 4 варианта ответа и correct_answer. "
        "Верни только JSON-массив формата: "
        "[{\"question\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correct_answer\":\"A\"}]\n"
        f"История чата:\n{chat_history}"
    )

    collected = []
    seen_questions = set()

    for _ in range(3):
        remaining_for_attempt = target_count - len(collected)
        if remaining_for_attempt <= 0:
            break

        attempt_prompt = user_prompt.replace(f"строго {target_count}", f"строго {remaining_for_attempt}")
        try:
            content = await groq_nonstream(build_mode_messages("quiz", attempt_prompt), temperature=0.2)
            attempt_questions = normalize_quiz_questions(parse_json_array(content))
        except Exception:
            continue

        for q in attempt_questions:
            q_key = q["question"].strip().lower()
            if q_key in seen_questions:
                continue
            seen_questions.add(q_key)
            collected.append(q)
            if len(collected) >= target_count:
                break

    if len(collected) == 0:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать валидный квиз.")

    questions_data = collected[:target_count]
            
    if req.append and latest_quiz:
        new_quiz = latest_quiz
    else:
        new_quiz = Quiz(chat_id=chat_obj.id)
        db.add(new_quiz)
        db.commit()
        db.refresh(new_quiz)
    
    for q in questions_data:
        quiz_q = QuizQuestion(quiz_id=new_quiz.id, question=q.get("question"), options=q.get("options", []), correct_answer=q.get("correct_answer"))
        db.add(quiz_q)
    
    add_xp(current_user, db, 10)
    db.commit()
    total_questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == new_quiz.id).count()
    return {"message": "Квиз сгенерирован", "quiz_id": new_quiz.id, "total_questions": total_questions}

@app.get("/quiz/chat/{chat_id}")
async def get_quiz_by_chat(chat_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")

    quiz = db.query(Quiz).filter(Quiz.chat_id == chat.id).order_by(Quiz.created_at.desc()).first()
    if not quiz:
        return {"quiz_id": None, "questions": []}

    questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).all()
    return {
        "quiz_id": quiz.id,
        "questions": [{"id": q.id, "question": q.question, "options": q.options, "correct_answer": q.correct_answer} for q in questions]
    }

@app.get("/quiz/{quiz_id}")
async def get_quiz(quiz_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quiz = db.query(Quiz).join(Chat).filter(Quiz.id == quiz_id, Chat.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Квиз не найден")
    questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).all()
    return {"quiz_id": quiz.id, "questions": [{"id": q.id, "question": q.question, "options": q.options, "correct_answer": q.correct_answer} for q in questions]}

@app.post("/flashcards/generate")
async def generate_flashcards(req: GenerateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_limits(current_user, db, "flashcard")
    
    chat_obj = db.query(Chat).filter(Chat.id == req.chat_id, Chat.user_id == current_user.id).first()
    if not chat_obj:
        raise HTTPException(status_code=404, detail="Чат не найден")
        
    existing_cards_count = db.query(Flashcard).filter(Flashcard.chat_id == chat_obj.id).count()

    if req.append and existing_cards_count >= FLASHCARDS_PER_CHAT_MAX:
        raise HTTPException(status_code=400, detail=f"Лимит карточек для этого чата достигнут ({FLASHCARDS_PER_CHAT_MAX}).")

    if (not req.append) and existing_cards_count > 0:
        return {"message": "Карточки уже существуют", "count": existing_cards_count}

    recent_messages = db.query(Message).filter(Message.chat_id == chat_obj.id).order_by(Message.created_at.desc()).limit(5).all()
    recent_messages.reverse()
    chat_history = "\n".join([f"{m.role}: {m.content}" for m in recent_messages])

    remaining = FLASHCARDS_PER_CHAT_MAX - existing_cards_count
    if remaining <= 0:
        raise HTTPException(status_code=400, detail=f"Лимит карточек для этого чата достигнут ({FLASHCARDS_PER_CHAT_MAX}).")

    target_count = remaining if req.append else min(5, remaining)

    user_prompt = (
        f"Сгенерируй ровно {target_count} флешкарт по истории чата. Верни только JSON-массив формата: "
        "[{\"question\":\"...\",\"answer\":\"...\"}]\n"
        f"История чата:\n{chat_history}"
    )

    try:
        content = await groq_nonstream(build_mode_messages("flashcards", user_prompt), temperature=0.3)
        cards_data = parse_json_array(content)
    except Exception:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать карточки.")
            
    created_cards = []
    for c in cards_data[:target_count]:
        card = Flashcard(chat_id=chat_obj.id, question=c.get("question"), answer=c.get("answer"))
        db.add(card)
        created_cards.append(card)
        
    add_xp(current_user, db, 5)
    db.commit()
    total_count = db.query(Flashcard).filter(Flashcard.chat_id == chat_obj.id).count()
    return {"message": "Флешкарты успешно сгенерированы", "count": total_count}

@app.get("/flashcards/{chat_id}")
async def get_flashcards(chat_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    cards = db.query(Flashcard).filter(Flashcard.chat_id == chat.id).all()
    return [{"id": c.id, "question": c.question, "answer": c.answer} for c in cards]


@app.get("/adminkaa", response_class=HTMLResponse)
async def admin_panel(admin: str = Depends(get_current_admin)):
    return """
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Admin Access Codes</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; }
            .row { display: flex; gap: 10px; margin: 8px 0; }
            input, button { padding: 8px 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f3f3f3; }
        </style>
    </head>
    <body>
        <h2>Access Codes</h2>
        <div class="row">
            <input id="code" placeholder="CODE123" />
            <input id="max_uses" type="number" placeholder="100" />
            <button onclick="createCode()">Создать</button>
        </div>
        <table>
            <thead>
                <tr><th>Code</th><th>Usage</th><th>Max uses</th><th>Expires</th><th>Actions</th></tr>
            </thead>
            <tbody id="codesBody"></tbody>
        </table>
        <script>
            async function loadCodes() {
                const res = await fetch('/adminkaa/codes');
                const data = await res.json();
                const body = document.getElementById('codesBody');
                body.innerHTML = '';
                data.forEach(c => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${c.code}</td><td>${c.usage}</td><td><input type='number' value='${c.max_uses}' id='m_${c.id}' style='width:90px'/></td><td>${c.expires_at || '-'}</td><td><button onclick='updateCode(${c.id})'>Сохранить</button> <button onclick='deleteCode(${c.id})'>Удалить</button></td>`;
                    body.appendChild(tr);
                });
            }
            async function createCode() {
                const code = document.getElementById('code').value.trim();
                const max_uses = Number(document.getElementById('max_uses').value);
                await fetch('/adminkaa/codes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ code, max_uses }) });
                loadCodes();
            }
            async function updateCode(id) {
                const max_uses = Number(document.getElementById('m_' + id).value);
                await fetch('/adminkaa/codes/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ max_uses }) });
                loadCodes();
            }
            async function deleteCode(id) {
                await fetch('/adminkaa/codes/' + id, { method: 'DELETE' });
                loadCodes();
            }
            loadCodes();
        </script>
    </body>
    </html>
    """

@app.get("/adminkaa/codes")
@app.get("/adminka_077_seka/codes")
async def admin_get_codes(admin: str = Depends(get_current_admin), db: Session = Depends(get_db)):
    codes = db.query(AccessCode).all()
    return [{"id": c.id, "code": c.code, "usage": f"{c.used_count}/{c.max_uses}", "max_uses": c.max_uses, "expires_at": c.expires_at} for c in codes]

@app.post("/adminkaa/codes")
@app.post("/adminka_077_seka/codes")
async def admin_create_code(req: CodeCreate, admin: str = Depends(get_current_admin), db: Session = Depends(get_db)):
    if db.query(AccessCode).filter(AccessCode.code == req.code).first():
        raise HTTPException(status_code=400, detail="Такой код уже существует")
    new_code = AccessCode(code=req.code, max_uses=req.max_uses, expires_at=req.expires_at)
    db.add(new_code)
    db.commit()
    db.refresh(new_code)
    return {"message": "Код успешно создан", "code_id": new_code.id}

@app.patch("/adminkaa/codes/{code_id}")
@app.patch("/adminka_077_seka/codes/{code_id}")
async def admin_update_code(code_id: int, req: CodeUpdate, admin: str = Depends(get_current_admin), db: Session = Depends(get_db)):
    code = db.query(AccessCode).filter(AccessCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Код не найден")
    if req.max_uses < code.used_count:
        raise HTTPException(status_code=400, detail="max_uses не может быть меньше used_count")
    code.max_uses = req.max_uses
    db.commit()
    return {"message": "Код обновлен"}

@app.delete("/adminkaa/codes/{code_id}")
@app.delete("/adminka_077_seka/codes/{code_id}")
async def admin_delete_code(code_id: int, admin: str = Depends(get_current_admin), db: Session = Depends(get_db)):
    code = db.query(AccessCode).filter(AccessCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Код не найден")
    db.delete(code)
    db.commit()
    return {"message": "Код удален"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
