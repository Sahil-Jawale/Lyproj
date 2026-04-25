"""
MedScript Backend — Configuration Management
Uses environment variables with sensible defaults for prototype.
"""
import os
from pathlib import Path


class Settings:
    """Application settings with environment variable overrides."""

    # Application
    APP_NAME: str = os.getenv("APP_NAME", "MedScript API")
    APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Database — SQLite for prototype, PostgreSQL-ready
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{Path(__file__).resolve().parent.parent / 'medscript.db'}"
    )

    # CORS
    CORS_ORIGINS: list = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3001,http://localhost:3000"
    ).split(",")

    # ML Service
    ML_SERVICE_URL: str = os.getenv("ML_SERVICE_URL", "http://localhost:8001")

    # File uploads
    UPLOAD_DIR: str = os.getenv(
        "UPLOAD_DIR",
        str(Path(__file__).resolve().parent.parent / "uploads")
    )
    MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", str(10 * 1024 * 1024)))  # 10MB

    # JWT Auth (scaffolded for production)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "medscript-dev-secret-key-change-in-production")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    ALGORITHM: str = "HS256"

    # Redis (scaffolded, not active in prototype)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Celery (scaffolded, not active in prototype)
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")


settings = Settings()
