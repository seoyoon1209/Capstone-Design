import hashlib
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from passlib.context import CryptContext
from db.dbpool import DbPoolDep

router = APIRouter(prefix="/userlogin", tags=["유저로그인"])
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

class LoginReq(BaseModel):
    user_login_id: str
    user_password: str

@router.post("/")
async def login(body: LoginReq, conn: DbPoolDep):
    row = await conn.fetchrow(
        """
        SELECT user_id, user_role, user_login_id, user_email, user_phone,
               user_password_hash, user_name, is_active
        FROM app_user
        WHERE user_login_id = $1
        LIMIT 1
        """,
        body.user_login_id
    )

    if not row:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다.")
    
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")

    # 사용자가 입력한 비밀번호를 SHA-256으로 먼저 해싱 (MembershipRouter와 동일한 방식)
    pre_hashed_pw = hashlib.sha256(body.user_password.encode('utf-8')).hexdigest()

    # 암호화된 비밀번호(Argon2) 검증
    if row["user_password_hash"] == "PENDING":
        raise HTTPException(status_code=401, detail="회원가입이 완료되지 않은 계정입니다.")

    if not pwd_context.verify(pre_hashed_pw, row["user_password_hash"]):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다.")

    return {
        "ok": True,
        "user": {
            "user_id": str(row["user_id"]),
            "user_role": row["user_role"],
            "user_login_id": row["user_login_id"],
            "user_email": row["user_email"],
            "user_phone": row["user_phone"],
            "user_name": row["user_name"],
        }
    }