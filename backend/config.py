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

    # OpenAI
    openai_api_key: str = ""

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "smartjobapply-resumes"

    # SendGrid
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@smartjobapply.com"

    # Netlify frontend URL (for CORS)
    frontend_url: str = "http://localhost:3000"

    # Match threshold for auto-apply
    match_score_threshold: float = 75.0

    class Config:
        env_file = ".env"


settings = Settings()
