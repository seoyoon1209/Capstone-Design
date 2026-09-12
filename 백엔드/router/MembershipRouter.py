import hashlib
import asyncpg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from db.dbpool import DbPoolDep

from datetime import datetime, timedelta, timezone
import random, json, uuid

router = APIRouter(prefix="/membership", tags=["회원가입"])
pwd = CryptContext(schemes=["argon2"], deprecated="auto")

def now_utc():
    return datetime.now(timezone.utc)

def norm_email(email: str) -> str:
    return email.strip().lower()


class SendCodeReq(BaseModel):
    email: EmailStr

class VerifyCodeReq(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)

class VerifyCodeRes(BaseModel):
    verified: bool
    token: str  # 2/3 가입 요청 시 같이 보냄

class RegisterReq(BaseModel):
    email: EmailStr
    email_token: str  # verify에서 받은 token
    name: str
    birth_year: int = Field(ge=1900, le=2100)
    gender: str = Field(pattern="^(M|F)$")
    phone: str
    password: str = Field(min_length=8, max_length=50)
    login_id: str | None = None  # 없으면 email로

class RegisterRes(BaseModel):
    user_id: uuid.UUID

class ExtraReq(BaseModel):
    user_id: uuid.UUID

    # 추가된 필드들
    gender: str | None = Field(default=None, pattern="^(M|F)$")
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    marital_status: str | None = None  # 기혼/미혼 등
    height: float | None = Field(default=None, ge=30, le=250)
    weight: float | None = Field(default=None, ge=20, le=300)

    avg_cigs_per_day: int | None = Field(default=None, ge=0, le=200)
    smoking_days_last_30: int | None = Field(default=None, ge=0, le=30)
    quit_attempts_1y_over_1day: int | None = Field(default=None, ge=0, le=365)

    shs_home_exposed: bool | None = None
    shs_home_hours_per_week: float | None = Field(default=None, ge=0, le=168)
    shs_work_exposed: bool | None = None
    shs_work_hours_per_week: float | None = Field(default=None, ge=0, le=168)

    alcohol_freq_label: str | None = None
    binge_freq_label: str | None = None

    work_high_intensity_days_per_week: int | None = Field(default=None, ge=0, le=7)
    work_high_intensity_hours_per_day: float | None = Field(default=None, ge=0, le=24)

    leisure_moderate_days_per_week: int | None = Field(default=None, ge=0, le=7)
    leisure_moderate_hours_per_day: float | None = Field(default=None, ge=0, le=24)

    stress_awareness_level: str | None = None
    body_shape_perception: str | None = None
    household_type: str | None = None

    # 스키마에 없는 항목은 note JSON에 같이 저장
    smoking_start_age: int | None = Field(default=None, ge=0, le=120)
    tobacco_types: list[str] | None = None
    education_level: str | None = None
    occupation_type: str | None = None
    lifetime_smoking: str | None = None  # 평생 흡연량(BS1_1): NONE / LT_5PACKS / GE_5PACKS


# Helpers
def map_alcohol_binge(alcohol_label: str | None, binge_label: str | None):
    alcohol_map = {
        None: None,
        "전혀 안 함": 0,
        "월 1회 미만": 0,
        "월 2~4회": 1,     # 근사
        "주 2~3회": 3,
        "주 4회 이상": 5,
        "매일": 7,
    }
    binge_map = {
        None: None,
        "전혀 없음": 0,
        "월 1회 미만": 0,
        "월 1회": 1,
        "월 2~3회": 3,
        "주 1회": 4,
        "주 2회 이상": 8,
    }
    return alcohol_map.get(alcohol_label, None), binge_map.get(binge_label, None)

def hours_week_to_minutes_day(hours_week: float | None) -> int | None:
    if hours_week is None:
        return None
    return int(round(hours_week * 60 / 7))

def hours_day_to_minutes(hours_day: float | None) -> int | None:
    if hours_day is None:
        return None
    return int(round(hours_day * 60))


# 2/3 기본정보로 계정 생성
@router.post("/register", response_model=RegisterRes)
async def register(body: RegisterReq, conn: DbPoolDep):
    email = norm_email(str(body.email))

    if norm_email(body.email_token) != email:
        raise HTTPException(status_code=400, detail="이메일 인증 토큰이 유효하지 않습니다.")

    login_id = norm_email(body.login_id) if body.login_id else email

    # Argon2통일
    pre_hashed_pw = hashlib.sha256(body.password.encode('utf-8')).hexdigest()
    pw_hash = pwd.hash(pre_hashed_pw)



    try:
        async with conn.transaction():
            # 유저 정보 및 이메일 인증 완료 여부 확인
            user_record = await conn.fetchrow("""
                SELECT user_id, is_active, user_password_hash, email_verified_at
                FROM app_user
                WHERE lower(user_email) = $1
            """, email)

            if not user_record:
                raise HTTPException(status_code=404, detail="이메일 인증을 먼저 진행해주세요.")

            # 이미 가입된 계정인지 확인
            if user_record['is_active'] or user_record['user_password_hash'] != 'PENDING':
                raise HTTPException(status_code=409, detail="이미 가입이 완료된 계정입니다.")

            # 이메일 인증이 완료되었는지 확인
            if not user_record['email_verified_at']:
                raise HTTPException(status_code=403, detail="이메일 인증이 완료되지 않았습니다.")

            user_id = user_record['user_id']

            phone_owner = await conn.fetchval("""
                SELECT user_id
                FROM app_user
                WHERE user_phone = $1
                  AND user_id <> $2
                LIMIT 1
            """, body.phone, user_id)

            if phone_owner:
                raise HTTPException(status_code=409, detail="이미 가입된 전화번호입니다.")

            # 2. 계정 정보 업데이트 (PENDING -> ACTIVE)
            await conn.execute("""
                UPDATE app_user
                SET user_login_id      = $1,
                    user_phone         = $2,
                    user_password_hash = $3,
                    user_name          = $4,
                    is_active          = true
                WHERE user_id = $5
            """, login_id, body.phone, pw_hash, body.name, user_id)

            # 테이블 업데이트 (전달받은 출생연도 그대로 저장)
            await conn.execute("""
                INSERT INTO user_profile (user_id, gender, birth_year)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id) DO UPDATE 
                SET gender = EXCLUDED.gender,
                    birth_year = EXCLUDED.birth_year
            """, user_id, body.gender, body.birth_year)

        return RegisterRes(user_id=user_id)

    except HTTPException:
        raise
    except asyncpg.exceptions.UniqueViolationError as e:
        print("register unique 오류:", e)
        if "user_phone" in str(e):
            raise HTTPException(status_code=409, detail="이미 가입된 전화번호입니다.")
        if "user_login_id" in str(e):
            raise HTTPException(status_code=409, detail="이미 사용 중인 로그인 ID입니다.")
        if "user_email" in str(e):
            raise HTTPException(status_code=409, detail="이미 가입이 완료된 이메일입니다.")
        raise HTTPException(status_code=409, detail="중복된 회원 정보입니다.")
    except Exception as e:
        print("register 오류:", e)
        raise HTTPException(status_code=500, detail="서버 오류 발생")

@router.get("/extra/{user_id}")
async def get_extra(user_id: uuid.UUID, conn: DbPoolDep):
    row = await conn.fetchrow(
        """
        SELECT h.*, p.gender, p.birth_year, p.marital_status, p.height_cm, p.weight_kg,
               p.education_level, p.occupation_type
        FROM health_behavior_snapshot h
        LEFT JOIN user_profile p ON h.user_id = p.user_id
        WHERE h.user_id=$1
        """,
        user_id
    )
    if not row:
        # snapshot이 없어도 profile은 있을 수 있으므로 profile만이라도 조회
        row = await conn.fetchrow("SELECT * FROM user_profile WHERE user_id=$1", user_id)
        if not row:
            return None
    return dict(row)


# 3/3 추가정보 저장
@router.post("/extra")
async def save_extra(body: ExtraReq, conn: DbPoolDep):  # 타입은 그대로여도 일단 동작
    shs_home_minutes = hours_week_to_minutes_day(body.shs_home_hours_per_week)
    shs_work_minutes = hours_week_to_minutes_day(body.shs_work_hours_per_week)
    work_hi_minutes = hours_day_to_minutes(body.work_high_intensity_hours_per_day)
    leisure_mod_minutes = hours_day_to_minutes(body.leisure_moderate_hours_per_day)

    alcohol_per_week, binge_per_month = map_alcohol_binge(body.alcohol_freq_label, body.binge_freq_label)

    # 학력/직업은 user_profile 정식 컬럼에 저장 (note JSON 아님)
    # - education_level: DB CHECK가 '한글(공백 없음)'만 허용 → 매핑
    # - occupation_type: DB CHECK가 '영문 코드'만 허용 → 매핑
    edu_db_map = {"초졸 이하": "초졸이하", "중졸": "중졸", "고졸": "고졸", "대졸 이상": "대졸이상"}
    occ_db_map = {"사무직/관리직": "WORKER", "자영업": "SELF_EMPLOYED", "학생": "STUDENT", "무직/주부": "UNEMPLOYED", "기타": "OTHER"}
    db_education = edu_db_map.get(body.education_level)    # 미지정/미매핑이면 None → 기존값 유지(COALESCE)
    db_occupation = occ_db_map.get(body.occupation_type)

    # 평생 흡연량 한글 라벨 → 코드 (BS1_1)
    life_map = {"피운 적 없음": "NONE", "5갑(100개비) 미만": "LT_5PACKS", "5갑(100개비) 이상": "GE_5PACKS"}
    db_lifetime = life_map.get(body.lifetime_smoking, body.lifetime_smoking)

    note = json.dumps(
        {
            "smoking_start_age": body.smoking_start_age,
            "tobacco_types": body.tobacco_types or [],
            "alcohol_freq_label": body.alcohol_freq_label,
            "binge_freq_label": body.binge_freq_label,
            "lifetime_smoking": db_lifetime,
        },
        ensure_ascii=False
    )

    u = await conn.fetchval("SELECT 1 FROM app_user WHERE user_id=$1", body.user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user_id가 존재하지 않습니다.")

    # 매핑
    db_marital_status = "UNKNOWN"
    if body.marital_status == "기혼":
        db_marital_status = "WITH_SPOUSE"
    elif body.marital_status == "미혼":
        db_marital_status = "WITHOUT_SPOUSE"

    await conn.execute("""
        INSERT INTO user_profile (user_id, height_cm, weight_kg, marital_status, household_type, birth_year, education_level, occupation_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id) DO UPDATE
        SET height_cm = EXCLUDED.height_cm,
            weight_kg = EXCLUDED.weight_kg,
            marital_status = EXCLUDED.marital_status,
            household_type = EXCLUDED.household_type,
            birth_year = COALESCE(EXCLUDED.birth_year, user_profile.birth_year),
            education_level = COALESCE(EXCLUDED.education_level, user_profile.education_level),
            occupation_type = COALESCE(EXCLUDED.occupation_type, user_profile.occupation_type)
    """, body.user_id, body.height, body.weight, db_marital_status, body.household_type, body.birth_year, db_education, db_occupation)

    snapshot_id = await conn.fetchval(
        """
        INSERT INTO health_behavior_snapshot (user_id,
                                              avg_cigs_per_day,
                                              smoking_days_last_30,
                                              quit_attempts_1y_over_1day,
                                              shs_home_exposed,
                                              shs_home_minutes_per_day,
                                              shs_work_exposed,
                                              shs_work_minutes_per_day,
                                              alcohol_freq_per_week,
                                              binge_freq_per_month,
                                              work_high_intensity_days_per_week,
                                              work_high_intensity_minutes_per_day,
                                              leisure_moderate_days_per_week,
                                              leisure_moderate_minutes_per_day,
                                              stress_awareness_level,
                                              body_shape_perception,
                                              household_type,
                                              note)
        VALUES ($1,
                $2, $3, $4,
                $5, $6,
                $7, $8,
                $9, $10,
                $11, $12,
                $13, $14,
                $15, $16, $17,
                $18) ON CONFLICT (user_id) DO
        UPDATE SET
            avg_cigs_per_day = EXCLUDED.avg_cigs_per_day,
            smoking_days_last_30 = EXCLUDED.smoking_days_last_30,
            quit_attempts_1y_over_1day = EXCLUDED.quit_attempts_1y_over_1day,
            shs_home_exposed = EXCLUDED.shs_home_exposed,
            shs_home_minutes_per_day = EXCLUDED.shs_home_minutes_per_day,
            shs_work_exposed = EXCLUDED.shs_work_exposed,
            shs_work_minutes_per_day = EXCLUDED.shs_work_minutes_per_day,
            alcohol_freq_per_week = EXCLUDED.alcohol_freq_per_week,
            binge_freq_per_month = EXCLUDED.binge_freq_per_month,
            work_high_intensity_days_per_week = EXCLUDED.work_high_intensity_days_per_week,
            work_high_intensity_minutes_per_day = EXCLUDED.work_high_intensity_minutes_per_day,
            leisure_moderate_days_per_week = EXCLUDED.leisure_moderate_days_per_week,
            leisure_moderate_minutes_per_day = EXCLUDED.leisure_moderate_minutes_per_day,
            stress_awareness_level = EXCLUDED.stress_awareness_level,
            body_shape_perception = EXCLUDED.body_shape_perception,
            household_type = EXCLUDED.household_type,
            note = EXCLUDED.note
            RETURNING snapshot_id
        """,
        body.user_id,
        body.avg_cigs_per_day,
        body.smoking_days_last_30,
        body.quit_attempts_1y_over_1day,
        body.shs_home_exposed,
        shs_home_minutes,
        body.shs_work_exposed,
        shs_work_minutes,
        alcohol_per_week,
        binge_per_month,
        body.work_high_intensity_days_per_week,
        work_hi_minutes,
        body.leisure_moderate_days_per_week,
        leisure_mod_minutes,
        body.stress_awareness_level,
        body.body_shape_perception,
        body.household_type,
        note
    )

    return {"snapshot_id": snapshot_id}
