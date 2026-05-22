from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/smartjobapply"
    sync_database_url: str = "postgresql://postgres:postgres@localhost:5432/smartjobapply"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 1 week

    # Supabase Storage
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_storage_bucket: str = "resumes"

    # SMTP email (optional — app logs if unconfigured)
    # For Gmail: use an App Password from myaccount.google.com/security
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Netlify frontend URL (for CORS)
    frontend_url: str = "http://localhost:3000"

    # Match threshold for auto-apply
    match_score_threshold: float = 75.0

    # Indeed Publisher API (register free at ads.indeed.com/jobroll/xmlfeed)
    # Leave empty to skip Indeed fetching
    indeed_publisher_id: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
