import uuid
import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import dbpool as _dbpool_module

scheduler = AsyncIOScheduler()

# DB 작업이 죽은 커넥션에서 무한 대기하지 않도록 거는 타임아웃(초)
_DB_TIMEOUT = 8.0


async def aggregate_heart_rate():
    """
    heart_rate_logs에서 created_at이 10초 이상 지난 raw 데이터를
    user_id별로 묶어 평균 bpm을 계산한 뒤 watch_heart_logs에 저장한다.
    처리된 raw 데이터는 삭제하고, watch_heart_logs는 user_id별 최신 120개만 유지한다.

    원격 DB 연결이 끊겨도 작업이 멈추거나 쌓이지 않도록
    전체를 try/except로 감싸고 모든 쿼리에 타임아웃을 건다.
    """
    pool = _dbpool_module.dbpool
    if pool is None:
        return

    try:
        # 죽은 커넥션을 무한정 기다리지 않도록 acquire 자체에 타임아웃
        async with pool.acquire(timeout=_DB_TIMEOUT) as conn:
            # 10초 이상 지난 raw 데이터를 user_id별로 집계
            # 기준 시각을 파이썬이 아닌 DB 자체 시계(now())로 계산 → 시간대 혼선 제거
            rows = await conn.fetch(
                """
                SELECT
                    user_id,
                    ROUND(AVG(bpm))::INT    AS avg_bpm,
                    MIN(measured_at)        AS bucket_start,
                    MAX(measured_at)        AS bucket_end,
                    ARRAY_AGG(id)           AS ids
                FROM heart_rate_logs
                WHERE created_at <= now() - interval '10 seconds'
                GROUP BY user_id
                """,
                timeout=_DB_TIMEOUT,
            )

            if not rows:
                return

            for row in rows:
                user_id      = row["user_id"]
                avg_bpm      = row["avg_bpm"]
                bucket_start = row["bucket_start"]
                bucket_end   = row["bucket_end"]
                raw_ids      = row["ids"]

                # watch_heart_logs에 집계값 INSERT (중복이면 스킵)
                await conn.execute(
                    """
                    INSERT INTO watch_heart_logs
                        (id, user_id, bpm, bucket_start, bucket_end, source, sample_count)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT DO NOTHING
                    """,
                    uuid.uuid4(),
                    user_id,
                    avg_bpm,
                    bucket_start,
                    bucket_end,
                    "watch",
                    len(raw_ids),
                    timeout=_DB_TIMEOUT,
                )

                # 처리된 raw 데이터 DELETE
                await conn.execute(
                    "DELETE FROM heart_rate_logs WHERE id = ANY($1::uuid[])",
                    raw_ids,
                    timeout=_DB_TIMEOUT,
                )

                # watch_heart_logs에서 user_id별 120개 초과분 DELETE
                await conn.execute(
                    """
                    DELETE FROM watch_heart_logs
                    WHERE id IN (
                        SELECT id FROM watch_heart_logs
                        WHERE user_id = $1
                        ORDER BY created_at DESC
                        OFFSET 120
                    )
                    """,
                    user_id,
                    timeout=_DB_TIMEOUT,
                )

    except asyncio.TimeoutError:
        # 죽은 커넥션 등으로 시간 초과 → 이번 주기는 건너뜀.
        # 풀이 다음 acquire 때 새 커넥션을 발급하므로 자동 복구된다.
        print("⚠️ [Scheduler] DB 타임아웃 — 이번 집계 주기 건너뜀")
    except Exception as e:
        # 일시적 연결 끊김(ConnectionDoesNotExistError 등)은 무시하고 다음 주기에 재시도
        print(f"⚠️ [Scheduler] 심박 집계 오류(무시): {type(e).__name__}: {e}")


def start_scheduler():
    scheduler.add_job(
        aggregate_heart_rate,
        trigger="interval",
        seconds=10,
        id="aggregate_heart_rate",
        replace_existing=True,
        max_instances=1,        # 동시 실행 금지
        coalesce=True,          # 밀린 주기는 합쳐서 1회만 실행
        misfire_grace_time=5,   # 5초 이상 늦으면 그 주기는 버림(쌓임 방지)
    )
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
