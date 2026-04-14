import os
from dotenv import load_dotenv
from fastapi_mail import ConnectionConfig

load_dotenv()


GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = os.getenv("GROQ_URL", "https://api.groq.com/openai/v1/chat/completions")
AI_MODEL = os.getenv("AI_MODEL")


SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 


FREE_DAILY_MESSAGES = int(os.getenv("FREE_DAILY_MESSAGES", 30))
FREE_DAILY_QUIZZES = int(os.getenv("FREE_DAILY_QUIZZES", 3))
FREE_DAILY_FLASHCARDS = int(os.getenv("FREE_DAILY_FLASHCARDS", 20))
PRO_DAILY_MESSAGES = int(os.getenv("PRO_DAILY_MESSAGES", 250))

ADMIN_LOGIN = os.getenv("ADMIN_LOGIN", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


MAIL_CONF = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", "example@mail.com"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "password"),
    MAIL_FROM=os.getenv("MAIL_FROM", "example@mail.com"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)