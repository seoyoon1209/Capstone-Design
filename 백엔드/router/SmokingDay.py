import uuid
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from db.dbpool import DbPoolDep

router = APIRouter(prefix="/SmokingDay", tags=["금연 일수"])

# 스키마 정의
class QuitPlanCreateReq(BaseModel):
    user_id: uuid.UUID
    start_date: date
    target_end_date: Optional[date] = None
    baseline_cigs_per_day: int = Field(ge=0, le=200)
    baseline_price_per_pack: Optional[int] = Field(default=None, ge=0, le=500000)
    cigs_per_pack: int = Field(default=20, ge=1, le=50)
    smoke_free_goal_hours: int = Field(default=24, ge=1, le=168)
    quit_methods: List[str] = []
    nicotine_type: Optional[str] = None

class QuitPlanUpdateReq(BaseModel):
    user_id: uuid.UUID
    start_date: date
    target_end_date: Optional[date] = None
    baseline_cigs_per_day: int = Field(ge=0, le=200)
    baseline_price_per_pack: Optional[int] = Field(default=None, ge=0, le=500000)
    cigs_per_pack: int = Field(default=20, ge=1, le=50)

class QuitPlanRes(BaseModel):
    plan_id: uuid.UUID
    user_id: uuid.UUID
    start_date: date
    target_end_date: Optional[date] = None
    baseline_cigs_per_day: int
    baseline_price_per_pack: Optional[int] = None
    cigs_per_pack: int
    last_smoke_at: Optional[datetime] = None
    smoke_free_goal_hours: int
    quit_methods: List[str]
    nicotine_type: Optional[str] = None
    status: str
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

#헬퍼 함수
def row_to_dict(row):
    if not row:
        return None
    # DB 행 객체를 딕셔너리로 변환 (Pydantic이 자동 처리하도록 객체 그대로 유지)
    return dict(row)

# 엔드포인트
# 금연 플랜 생성
@router.post("", response_model=QuitPlanRes)
async def create_smoking_day(body: QuitPlanCreateReq, conn: DbPoolDep):
    existing = await conn.fetchrow("""
        SELECT plan_id FROM quit_plan
        WHERE user_id = $1 AND status = 'ACTIVE'
        LIMIT 1
    """, body.user_id)

    if existing:
        raise HTTPException(status_code=409, detail="이미 활성 금연 플랜이 존재합니다.")

    row = await conn.fetchrow("""
        INSERT INTO quit_plan (
            user_id, start_date, target_end_date,
            baseline_cigs_per_day, baseline_price_per_pack, cigs_per_pack,
            smoke_free_goal_hours, quit_methods, nicotine_type, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
        RETURNING *
    """, body.user_id, body.start_date, body.target_end_date,
         body.baseline_cigs_per_day, body.baseline_price_per_pack, body.cigs_per_pack,
         body.smoke_free_goal_hours, body.quit_methods, body.nicotine_type)

    return row_to_dict(row)

# 금연 플랜 조회
@router.get("/{user_id}", response_model=QuitPlanRes)
async def get_smoking_day(user_id: uuid.UUID, conn: DbPoolDep):
    row = await conn.fetchrow("""
        SELECT plan_id, user_id, start_date, target_end_date, 
               baseline_cigs_per_day, baseline_price_per_pack, cigs_per_pack, 
               last_smoke_at, smoke_free_goal_hours, quit_methods, 
               nicotine_type, status, completed_at, created_at, updated_at
        FROM quit_plan
        WHERE user_id = $1 AND status = 'ACTIVE'
        ORDER BY created_at DESC LIMIT 1
    """, user_id)

    if not row:
        # 에러 대신 빈 데이터를 보내거나 명확한 메시지 전달
        raise HTTPException(status_code=404, detail="활성 금연 플랜이 없습니다.")

    return row_to_dict(row)

# 금연 플랜 수정 (중복 함수 제거 및 통합)
@router.put("", response_model=QuitPlanRes)
async def update_smoking_day(body: QuitPlanUpdateReq, conn: DbPoolDep):
    row = await conn.fetchrow("""
        UPDATE quit_plan
        SET start_date = $2,
            target_end_date = $3,
            baseline_cigs_per_day = $4,
            baseline_price_per_pack = $5,
            cigs_per_pack = $6,
            updated_at = now()
        WHERE user_id = $1 AND status = 'ACTIVE'
        RETURNING *
    """, body.user_id, body.start_date, body.target_end_date, 
         body.baseline_cigs_per_day, body.baseline_price_per_pack, body.cigs_per_pack)

    if not row:
        raise HTTPException(status_code=404, detail="수정할 활성 금연 플랜이 없습니다.")

    return row_to_dict(row)

# 플랜 종료
@router.patch("/complete/{user_id}")
async def complete_smoking_day(user_id: uuid.UUID, conn: DbPoolDep):
    row = await conn.fetchrow("""
        UPDATE quit_plan
        SET status = 'COMPLETED',
            completed_at = now(),
            updated_at = now()
        WHERE user_id = $1 AND status = 'ACTIVE'
        RETURNING plan_id
    """, user_id)

    if not row:
        raise HTTPException(status_code=404, detail="종료할 활성 금연 플랜이 없습니다.")

    return {"message": "금연 플랜이 완료 처리되었습니다.", "plan_id": row["plan_id"]}
