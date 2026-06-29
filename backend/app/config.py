from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Intelligence Analyzer API"
    app_env: str = "local"
    database_url: str = "postgresql://intel:intel@localhost:5432/intel"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000,http://localhost:5678"
    jwt_secret_key: str = "local-dev-change-me"
    jwt_expires_minutes: int = 480
    auth_users: str = "admin:admin123:admin,analyst:analyst123:analyst,viewer:viewer123:viewer,portal:portal123:submitter"
    n8n_ingest_webhook_url: str = "http://n8n:5678/webhook/int-ingestion"
    maxar_api_key: str = ""
    maxar_catalog_search_url: str = "https://api.maxar.com/discovery/v1/catalogs/imagery/search"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
