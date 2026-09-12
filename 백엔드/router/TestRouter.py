import hashlib
import random
import traceback
import os
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from db.dbpool import DbPoolDep
from dotenv import load_dotenv

router = APIRouter(prefix="/test", tags=["프론트엔드 테스트용"])

#  비밀번호 암호화 컨텍스트 추가
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

load_dotenv()
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

# --- 요청 스키마 ---
class EmailReq(BaseModel):
    email: EmailStr

class VerifyReq(BaseModel):
    email: EmailStr
    code: str

class ResetPwReq(BaseModel):
    name: str
    email: EmailStr
    new_password: str

class FindIdReq(BaseModel):
    name: str
    phone: str

class LoginReq(BaseModel):
    login_id: str
    password: str

# --- 이메일 전송 함수 ---
def send_password_reset_email(to_email: str, code: str):
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        print(">>> [메일 설정 오류] .env 파일을 확인하세요.")
        return

    subject = "Somking Clinic 비밀번호 찾기 인증번호"
    body = (
        f"안녕하세요!\n\n"
        f"비밀번호 재설정을 위한 인증번호는 다음과 같습니다.\n\n"
        f"인증번호: {code}\n\n"
        f"이 번호는 5분 동안만 유효합니다.\n\n"
        f"감사합니다."
    )
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            smtp.starttls()
            smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
            smtp.send_message(msg)
        print(f">>> [메일 발송 성공] {to_email}")
    except Exception as e:
        print(f">>> [메일 발송 실패] {str(e)}")

# 1. 아이디 찾기
@router.post("/find-id")
async def test_find_id(body: FindIdReq, conn: DbPoolDep):
    print(f">>> [FindId] 요청 수신: {body.name}, {body.phone}")
    row = await conn.fetchrow("""
        SELECT user_login_id FROM app_user 
        WHERE user_name = $1 AND user_phone = $2 LIMIT 1
    """, body.name, body.phone)
    
    if not row:
        raise HTTPException(status_code=404, detail="일치하는 정보가 없습니다. 이름과 전화번호를 다시 확인해주세요.")
        
    return {"ok": True, "user_login_id": row["user_login_id"]}

# 3. 인증번호 발송
@router.post("/send-verification")
async def test_send_verification(body: EmailReq, conn: DbPoolDep, background_tasks: BackgroundTasks):
    email = body.email.strip().lower()
    try:
        user = await conn.fetchrow("SELECT user_id FROM app_user WHERE lower(user_email) = $1", email)
        if not user:
            raise HTTPException(status_code=404, detail="가입되지 않은 이메일입니다.")
        
        user_id = user['user_id']
        test_code = str(random.randint(111111, 999999))
        expires_at = datetime.now() + timedelta(minutes=5)

        async with conn.transaction():
            await conn.execute("DELETE FROM auth_token WHERE user_id = $1 AND token_type = 'PASSWORD_RESET'", user_id)
            await conn.execute("""
                INSERT INTO auth_token (user_id, token_type, token_hash, expires_at)
                VALUES ($1, 'PASSWORD_RESET', $2, $3)
            """, user_id, test_code, expires_at)
        
        background_tasks.add_task(send_password_reset_email, email, test_code)
        return {"ok": True, "message": "인증번호가 메일로 발송되었습니다."}
    except HTTPException: raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")

# 4. 인증번호 확인
@router.post("/verify")
async def test_verify(body: VerifyReq, conn: DbPoolDep):
    email = body.email.strip().lower()
    try:
        row = await conn.fetchrow("""
            SELECT t.user_id 
            FROM auth_token t
            JOIN app_user u ON t.user_id = u.user_id
            WHERE lower(u.user_email) = $1 
              AND t.token_hash = $2 
              AND t.token_type = 'PASSWORD_RESET' 
              AND t.expires_at > CURRENT_TIMESTAMP
        """, email, body.code)
        
        if not row:
            raise HTTPException(status_code=400, detail="인증번호가 틀렸거나 만료되었습니다.")
        
        return {"ok": True, "message": "인증 성공"}
    except HTTPException: raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="인증 처리 중 오류 발생")

# 5. 비밀번호 재설정 (암호화 적용)
@router.post("/reset-pw")
async def test_reset_pw(body: ResetPwReq, conn: DbPoolDep):
    email = body.email.strip().lower()
    name = body.name.strip()
    
    # ✅ 수정: SHA-256 선행 해싱 후 Argon2 암호화
    pre_hashed_pw = hashlib.sha256(body.new_password.encode('utf-8')).hexdigest()
    pw_hash = pwd_context.hash(pre_hashed_pw)
    
    try:
        async with conn.transaction():
            status = await conn.execute("""
                UPDATE app_user 
                SET user_password_hash = $1
                WHERE user_name = $2 AND lower(user_email) = $3
            """, pw_hash, name, email)

            if status == "UPDATE 0":
                raise HTTPException(status_code=404, detail="입력하신 정보(이름/이메일)와 일치하는 사용자가 없습니다.")

            # 토큰 삭제 시 user_id 조회
            user_id = await conn.fetchval("SELECT user_id FROM app_user WHERE lower(user_email) = $1", email)
            if user_id:
                await conn.execute("""
                    DELETE FROM auth_token 
                    WHERE user_id = $1 AND token_type = 'PASSWORD_RESET'
                """, user_id)
            
        print(f">>> [Reset-PW] 성공: {email}의 비밀번호가 안전하게 암호화되어 변경됨")
        return {"ok": True, "message": "비밀번호가 성공적으로 변경되었습니다. 이제 새 비밀번호로 로그인할 수 있습니다."}
    
    except HTTPException: raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="비밀번호 변경 중 서버 오류가 발생했습니다.")