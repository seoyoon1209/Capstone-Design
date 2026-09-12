import hashlib
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os,smtplib, random
from email.mime.text import MIMEText
from dotenv import load_dotenv
from db.dbpool import DbPoolDep


router = APIRouter(prefix="/email", tags=["이메일"])

load_dotenv()
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")
# SMTP_HOST가 없으면 네이버를 기본값으로 시도 (기존 gmail에서 변경)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))

# 수신 이메일 스키마 정의
class EmailRequest(BaseModel):
    email: str

# 검증 요청 스키마 정의
class VerifyRequest(BaseModel):
    email: str
    code: str

# 이메일 전송 양식
def send_verification_email(to_email: str, code: str):
    subject = "Somking Clinic 이메일 인증번호"
    body = (
        f"안녕하세요!\n\n"
        f"Somking Clinic 회원가입을 위한 인증번호는 다음과 같습니다.\n\n"
        f"인증번호: {code}\n\n"
        f"이 번호는 10분 동안만 유효합니다.\n\n"
        f"감사합니다."
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email

    try:
        print(f"이메일 발송 시도: {to_email} (SENDER: {SENDER_EMAIL}, HOST: {SMTP_HOST}:{SMTP_PORT})")
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            smtp.set_debuglevel(1)
            smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
            smtp.send_message(msg)
            print(f"이메일 발송 성공: {to_email}")
    except smtplib.SMTPAuthenticationError:
        error_msg = f"SMTP 인증 실패: {SENDER_EMAIL} 주소나 비밀번호를 확인하세요."
        print(error_msg)
        raise Exception(error_msg)
    except Exception as e:
        error_msg = f"이메일 전송 중 상세 예외 발생 ({type(e).__name__}): {str(e)}"
        print(error_msg)
        raise Exception(error_msg)


# 인증번호 생성
def generate_code() -> str:
    return str(random.randint(100000, 999999))

# 인증번호 해싱
def hash_token(token: str) -> str:
    """인증 코드를 SHA-256으로 해시화"""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


# 전송 검증(이메일 형식 확인, 중복 확인, 인증코드 중복 확인)
@router.post("/send-verification")
async def send_verification(
        req: EmailRequest,
        conn: DbPoolDep
):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="유효한 이메일을 입력하세요.")

    code = generate_code()
    hashed_code = hash_token(code)

    try:
        async with conn.transaction():
            # 이미 가입된/대기 중인 이메일인지 확인
            user_record = await conn.fetchrow("""
                                              SELECT user_id, is_active, user_password_hash
                                              FROM app_user
                                              WHERE lower(user_email) = $1
                                              """, email)

            if user_record:
                if user_record['user_password_hash'] != 'PENDING' or user_record['is_active']:
                    raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다.")
                user_id = user_record['user_id']
            else:
                user_id = await conn.fetchval("""
                                              INSERT INTO app_user (user_role, user_login_id, user_email,
                                                                    user_password_hash, user_name, is_active)
                                              VALUES ('USER', $1, $1, 'PENDING', 'PENDING', false) RETURNING user_id
                                              """, email)

            # 기존 진행 중이던 인증 코드 무효화
            await conn.execute("""
                               UPDATE auth_token
                               SET used_at = CURRENT_TIMESTAMP
                               WHERE user_id = $1
                                 AND token_type = 'EMAIL_VERIFY'
                                 AND used_at IS NULL
                               """, user_id)

            # 새 인증 토큰 삽입
            await conn.execute("""
                               INSERT INTO auth_token (user_id, token_type, token_hash, expires_at)
                               VALUES ($1, 'EMAIL_VERIFY', $2, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
                               """, user_id, hashed_code)

        # [수정] BackgroundTasks 대신 즉시 발송하여 성공/실패 확인
        send_verification_email(email, code)

        return {"success": True, "message": "인증번호가 발송되었습니다."}

    except HTTPException as he:
        raise he
    except Exception as e:
        print("send_verification 오류:", e)
        # 상세 에러 메시지를 프론트로 전달하여 원인 파악 용이하게 함
        raise HTTPException(status_code=500, detail=f"메일 발송 실패: {str(e)}")


# 인증 코드 검증(토큰 유효 확인)
@router.post("/verify")  # GET에서 POST로 변경
async def verify(req: VerifyRequest, conn: DbPoolDep): # 파라미터를 req 모델로 받음
    email = req.email.strip().lower()
    hashed_code = hash_token(req.code) # req.code 사용

    try:
        async with conn.transaction():
            # 1. 임시 유저 ID 찾기
            user_record = await conn.fetchrow("""
                SELECT user_id
                FROM app_user
                WHERE lower(user_email) = $1
                  AND is_active = false
            """, email)

            if not user_record:
                raise HTTPException(status_code=404, detail="인증을 요청한 사용자를 찾을 수 없습니다.")

            user_id = user_record['user_id']

            # 2. 토큰 유효성 검증
            token_record = await conn.fetchrow("""
                SELECT token_id
                FROM auth_token
                WHERE user_id = $1
                  AND token_type = 'EMAIL_VERIFY'
                  AND token_hash = $2
                  AND used_at IS NULL
                  AND expires_at > CURRENT_TIMESTAMP LIMIT 1
            """, user_id, hashed_code)

            if not token_record:
                raise HTTPException(status_code=400, detail="인증번호가 유효하지 않거나 만료되었습니다.")

            # 3. 사용 처리 및 이메일 인증 시간 기록
            await conn.execute("""
                UPDATE auth_token
                SET used_at = CURRENT_TIMESTAMP
                WHERE token_id = $1
            """, token_record['token_id'])

            await conn.execute("""
                UPDATE app_user
                SET email_verified_at = CURRENT_TIMESTAMP
                WHERE user_id = $1
            """, user_id)

        return {
            "success": True,
            "message": "이메일 인증 완료. 다음 단계로 이동합니다.",
            "token": email
        }

    except HTTPException:
        raise
    except Exception as e:
        print("verify 오류:", e)
        raise HTTPException(status_code=500, detail="서버 오류 발생")