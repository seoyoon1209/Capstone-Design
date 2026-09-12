import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db.dbpool import DbPoolDep
from .schemas import GptChatRequest, GptChatResponse
from .service import ask_gpt
import json

router = APIRouter(prefix="/gpt", tags=["GPT"])

class SessionReq(BaseModel):
    user_id: uuid.UUID

#  최근 내역 불러오기
@router.get("/session/{user_id}")
async def get_latest_session(user_id: uuid.UUID, conn: DbPoolDep):
    row = await conn.fetchrow("""
        SELECT response_text, context_json, created_at
        FROM gpt_consult_session
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
    """, user_id)
    
    if not row:
        return None
        
    ctx = json.loads(row["context_json"])
    return {
        "answer": row["response_text"],
        "risk_percent": ctx.get("risk_percent", 0),
        "missing": ctx.get("missing", []),   # 부족 입력 항목(없으면 빈 배열)
        "created_at": row["created_at"]
    }

# 새로운 생성 및 저장
@router.post("/chat", response_model=GptChatResponse)
async def gpt_chat(data: GptChatRequest, conn: DbPoolDep):
    # GPT 조언 생성
    answer = ask_gpt(data.message)
    
    # DB에 저장
    try:
        # 프롬프트에서 위험도 숫자 추출 (예: "위험도는 70%야")
        risk_percent = 0
        if "위험도는" in data.message:
            import re
            match = re.search(r'(\d+)%', data.message)
            if match:
                risk_percent = int(match.group(1))

        await conn.execute("""
            INSERT INTO gpt_consult_session (user_id, context_json, prompt_text, response_text, model_name)
            VALUES ($1, $2, $3, $4, $5)
        """, uuid.UUID(data.user_id),
             json.dumps({"risk_percent": risk_percent, "missing": data.missing or []}, ensure_ascii=False),
             data.message, answer, "gpt-4o")
        
    except Exception as e:
        print(f"세션 저장 에러: {e}")
        # 저장이 실패해도 일단 답변은 반환

    return GptChatResponse(answer=answer)
