import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.dbpool import DbPoolDep
from settings.Settings import get_settings

# solapi 는 실제 문자 발송 시점에만 import (미설치 환경에서도 앱은 정상 기동)

router = APIRouter(prefix="/sms", tags=["문자 서포터"])
settings = get_settings()


# 요청/응답 스키마

class SupporterSaveReq(BaseModel):
    user_id: uuid.UUID
    supporter_name: str | None = None
    supporter_phone: str
    relationship: str | None = "기타"


class SendSmsReq(BaseModel):
    user_id: uuid.UUID
    message: str | None = None  # 없으면 기본 문구


# 서포터 등록/수정

@router.post("/supporter", summary="서포터 저장")
async def save_supporter(req: SupporterSaveReq, db: DbPoolDep):
    # 기존에 있으면 업데이트, 없으면 INSERT
    existing = await db.fetchrow(
        "SELECT contact_id FROM user_emergency_contact WHERE user_id = $1 AND priority = 1",
        req.user_id,
    )

    if existing:
        await db.execute(
            """
            UPDATE user_emergency_contact
            SET contact_name  = $1,
                contact_phone = $2,
                relationship  = $3,
                updated_at    = NOW()
            WHERE contact_id = $4
            """,
            req.supporter_name,
            req.supporter_phone,
            req.relationship,
            existing["contact_id"],
        )
    else:
        await db.execute(
            """
            INSERT INTO user_emergency_contact
                (user_id, contact_name, contact_phone, relationship, priority, is_active)
            VALUES ($1, $2, $3, $4, 1, true)
            """,
            req.user_id,
            req.supporter_name,
            req.supporter_phone,
            req.relationship,
        )

    return {"message": "서포터 저장 완료"}


@router.get("/supporter/{user_id}", summary="서포터 조회")
async def get_supporter(user_id: uuid.UUID, db: DbPoolDep):
    row = await db.fetchrow(
        """
        SELECT contact_name, contact_phone, relationship
        FROM user_emergency_contact
        WHERE user_id = $1 AND priority = 1 AND is_active = true
        """,
        user_id,
    )
    if not row:
        return {"supporter_name": None, "supporter_phone": None, "relationship": None}
    return {
        "supporter_name": row["contact_name"],
        "supporter_phone": row["contact_phone"],
        "relationship": row["relationship"],
    }


#문자 발송

async def send_supporter_sms(conn, user_id, message: str | None = None, smoking_detected: bool = False) -> dict:
    """서포터에게 문자 발송 (공통 로직).
    - 다른 라우터(예: 흡연 감지)에서도 호출할 수 있게 분리.
    - 서포터 없으면 LookupError, SMS 설정 없으면 RuntimeError, 발송 실패는 그대로 예외 전파.
    """
    row = await conn.fetchrow(
        """
        SELECT contact_name, contact_phone
        FROM user_emergency_contact
        WHERE user_id = $1 AND priority = 1 AND is_active = true
        """,
        user_id,
    )
    if not row or not row["contact_phone"]:
        raise LookupError("등록된 서포터가 없습니다.")

    supporter_phone = row["contact_phone"]
    supporter_name  = row["contact_name"] or "서포터"

    # 사용자 이름 조회 (실패해도 기본값 사용)
    try:
        user_row = await conn.fetchrow(
            "SELECT user_name FROM app_user WHERE user_id = $1", user_id,
        )
        user_name = (user_row["user_name"] if user_row and user_row["user_name"] else "친구")
    except Exception:
        user_name = "친구"

    # 문자 내용
    if message:
        message_body = message
    elif smoking_detected:
        message_body = (
            f"[금연해듀오]\n"
            f"{supporter_name}님, {user_name}님에게 흡연 행동이 감지됐어요.\n"
            f"지금 따뜻한 응원 한마디로 금연을 도와주세요!"
        )
    else:
        message_body = (
            f"[금연해듀오]\n"
            f"{supporter_name}님, {user_name}님이 지금 금연이 힘든 상황이에요.\n"
            f"따뜻한 응원 한마디 부탁드려요!"
        )

    if not settings.solapi_api_key:
        raise RuntimeError("SMS 설정이 없습니다.")

    # 지연 import: solapi 미설치 환경에서도 앱 기동은 막지 않는다.
    from solapi import SolapiMessageService
    from solapi.model.request.message import Message

    service = SolapiMessageService(
        api_key=settings.solapi_api_key,
        api_secret=settings.solapi_api_secret,
    )
    service.send(Message(
        to=supporter_phone,
        from_=settings.solapi_from_number,
        text=message_body,
    ))
    return {"to": supporter_phone}


@router.post("/send", summary="서포터에게 응원 문자 발송")
async def send_sms(req: SendSmsReq, db: DbPoolDep):
    try:
        result = await send_supporter_sms(db, req.user_id, message=req.message)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"문자 발송 실패: {str(e)}")
    return {"message": "문자 발송 완료", "to": result["to"]}
