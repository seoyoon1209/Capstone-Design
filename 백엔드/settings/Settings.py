from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # DB 접속 정보
    db_host: str
    db_port: int
    db_service_name: str
    db_user: str
    db_password: str

    # 로그인에 당장 필요 없으니 optional, 기본값
    sender_email: Optional[str] = None
    sender_password: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = "gpt-4o"

    public_data_api_key: str
    kakao_rest_api_key: str

    # 솔라피 SMS
    solapi_api_key: Optional[str] = None
    solapi_api_secret: Optional[str] = None
    solapi_from_number: Optional[str] = None

    # .env에서 읽어오기
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()