import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from db.dbpool import DbPoolDep

router = APIRouter(prefix="/UserHeart", tags=["심박수"])

# 측정 시각은 한국시간(KST) 기준으로 저장 (DB 컬럼이 timestamp without time zone)
KST = ZoneInfo("Asia/Seoul")


class HeartRateCreateReq(BaseModel):
    user_id: uuid.UUID
    bpm: int = Field(ge=1, le=260)
    measured_at: Optional[datetime] = None
    source: str = Field(default="watch", min_length=1, max_length=50)


class HeartRateLogRes(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    bpm: int
    measured_at: datetime
    source: Optional[str] = None
    created_at: datetime


class HeartRateBatchItem(BaseModel):
    bpm: float = Field(ge=1, le=260)
    measured_at: Optional[datetime] = None
    source: str = Field(default="watch")


class HeartRateBatchReq(BaseModel):
    user_id: uuid.UUID
    readings: list[HeartRateBatchItem]


class WatchHeartLogRes(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    bpm: int
    bucket_start: Optional[datetime]
    bucket_end: Optional[datetime]
    source: Optional[str]
    sample_count: Optional[int]
    created_at: datetime


# ──────────────────────────────────────────
# 유틸
# ──────────────────────────────────────────

def normalize_datetime(value: Optional[datetime]) -> datetime:
    """측정 시각을 한국시간(KST) 기준 naive datetime으로 변환.

    워치는 +09:00(KST)로 보내고 DB 컬럼은 시간대 정보가 없으므로,
    KST로 변환 후 tzinfo를 제거해 DB에서 본 시각이 실제 한국시간과 일치하게 한다.
    """
    if value is None:
        return datetime.now(KST).replace(tzinfo=None)
    if value.tzinfo is None:
        # 시간대 정보 없이 들어오면 KST로 측정된 값으로 간주
        return value
    return value.astimezone(KST).replace(tzinfo=None)


def row_to_dict(row):
    return dict(row) if row else None


# ──────────────────────────────────────────
# 엔드포인트
# ──────────────────────────────────────────

# Watch → iPhone → 서버: 심박수 1건 저장
@router.post("/log", response_model=HeartRateLogRes)
async def create_heart_rate_log(body: HeartRateCreateReq, conn: DbPoolDep):
    measured_at = normalize_datetime(body.measured_at)

    # 유저 존재 확인
    exists = await conn.fetchval(
        "SELECT 1 FROM app_user WHERE user_id = $1 AND is_active = true",
        body.user_id
    )
    if not exists:
        raise HTTPException(status_code=404, detail="존재하지 않는 사용자입니다.")

    row = await conn.fetchrow(
        """
        INSERT INTO heart_rate_logs (id, user_id, bpm, measured_at, source)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ON CONSTRAINT unique_user_hr DO NOTHING
        RETURNING id, user_id, bpm, measured_at, source, created_at
        """,
        uuid.uuid4(),
        body.user_id,
        body.bpm,
        measured_at,
        body.source.strip(),
    )

    return row_to_dict(row) if row else {}


# 심박수 배치 저장 (30초 윈도우 묶음)
@router.post("/batch", status_code=201)
async def save_heart_rate_batch(body: HeartRateBatchReq, conn: DbPoolDep):
    if not body.readings:
        return {"saved": 0}

    # 유저 존재 확인
    exists = await conn.fetchval(
        "SELECT 1 FROM app_user WHERE user_id = $1 AND is_active = true",
        body.user_id
    )
    if not exists:
        raise HTTPException(status_code=404, detail="존재하지 않는 사용자입니다.")

    rows_saved = 0
    rows_skipped = 0
    for item in body.readings:
        measured_at = normalize_datetime(item.measured_at)
        result = await conn.execute(
            """
            INSERT INTO heart_rate_logs (id, user_id, bpm, measured_at, source)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT ON CONSTRAINT unique_user_hr DO NOTHING
            """,
            uuid.uuid4(),
            body.user_id,
            round(item.bpm),
            measured_at,
            item.source.strip(),
        )
        # asyncpg execute() returns 'INSERT 0 N' — N=0 이면 중복 스킵
        if result.endswith(" 1"):
            rows_saved += 1
        else:
            rows_skipped += 1

    print(f"[UserHeart] 배치 저장 완료 — 저장={rows_saved}개 / 중복스킵={rows_skipped}개")
    return {"saved": rows_saved, "skipped": rows_skipped}


# 최신 심박수 1건 조회
@router.get("/{user_id}/latest", response_model=HeartRateLogRes)
async def get_latest_heart_rate_log(user_id: uuid.UUID, conn: DbPoolDep):
    row = await conn.fetchrow(
        """
        SELECT id, user_id, bpm, measured_at, source, created_at
        FROM heart_rate_logs
        WHERE user_id = $1
        ORDER BY measured_at DESC, created_at DESC
        LIMIT 1
        """,
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="심박수 기록이 없습니다.")
    return row_to_dict(row)


# 심박수 목록 조회
@router.get("/{user_id}/logs", response_model=list[HeartRateLogRes])
async def get_heart_rate_logs(
    user_id: uuid.UUID,
    conn: DbPoolDep,
    limit: int = Query(default=20, ge=1, le=200),
):
    rows = await conn.fetch(
        """
        SELECT id, user_id, bpm, measured_at, source, created_at
        FROM heart_rate_logs
        WHERE user_id = $1
        ORDER BY measured_at DESC, created_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return [row_to_dict(r) for r in rows]


# watch_heart_logs 최신 1개 조회
@router.get("/{user_id}/watch-latest", response_model=WatchHeartLogRes)
async def get_watch_heart_latest(user_id: uuid.UUID, conn: DbPoolDep):
    row = await conn.fetchrow(
        """
        SELECT id, user_id, bpm, bucket_start, bucket_end, source, sample_count, created_at
        FROM watch_heart_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="집계된 심박수 기록이 없습니다.")
    return row_to_dict(row)


# watch_heart_logs 목록 조회
@router.get("/{user_id}/watch-logs", response_model=list[WatchHeartLogRes])
async def get_watch_heart_logs(
    user_id: uuid.UUID,
    conn: DbPoolDep,
    limit: int = Query(default=120, ge=1, le=120),
):
    rows = await conn.fetch(
        """
        SELECT id, user_id, bpm, bucket_start, bucket_end, source, sample_count, created_at
        FROM watch_heart_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return [row_to_dict(r) for r in rows]
