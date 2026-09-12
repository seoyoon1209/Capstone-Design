from pydantic import BaseModel

class GptChatRequest(BaseModel):
    message: str
    user_id: str  # 세션 저장을 위해 추가
    missing: list[str] | None = None  # 비어서 기본값 처리된 입력 항목(세션에 함께 저장)

class GptChatResponse(BaseModel):
    answer: str
