from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from db.dbpool import DbPoolDep
import uuid

router = APIRouter(prefix="/user_information", tags=["유저정보"])

class UpdateUserReq(BaseModel):
    user_id: uuid.UUID
    user_name: str
    user_email: str
    birth_year: int
    user_gender: str
    user_phone: str
    user_address: str
    user_height: float | None = None
    user_weight: float | None = None

@router.post("/update")
async def update_user_info(body: UpdateUserReq, conn: DbPoolDep):
    try:
        async with conn.transaction():
            # 1. app_user 업데이트 (이름, 전화번호, 이메일)
            await conn.execute("""
                UPDATE app_user
                SET user_name = $1,
                    user_phone = $2,
                    user_email = $3,
                    user_login_id = $3, -- 이메일이 로그인 ID인 경우 동기화
                    updated_at = now()
                WHERE user_id = $4
            """, body.user_name, body.user_phone, body.user_email, body.user_id)


            # 성별 매핑 (프론트: 남성/여성 -> DB: M/F)
            db_gender = "UNKNOWN"
            if body.user_gender == "남성":
                db_gender = "M"
            elif body.user_gender == "여성":
                db_gender = "F"

            await conn.execute("""
                INSERT INTO user_profile (user_id, gender, birth_year, height_cm, weight_kg, user_address)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id) DO UPDATE 
                SET gender = EXCLUDED.gender,
                    birth_year = EXCLUDED.birth_year,
                    height_cm = EXCLUDED.height_cm,
                    weight_kg = EXCLUDED.weight_kg,
                    user_address = EXCLUDED.user_address,
                    updated_at = now()
            """, body.user_id, db_gender, body.birth_year, body.user_height, body.user_weight, body.user_address)

        return {"ok": True, "message": "회원 정보가 업데이트되었습니다."}

    except Exception as e:
        print("Update Error:", e)
        raise HTTPException(status_code=500, detail=str(e))
