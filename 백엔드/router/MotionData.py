import time
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from db.dbpool import DbPoolDep
from router.smokingAiModel.smoking_predictor import predict_smoking
from router.smokingAiModel.hlsda_postprocess import hlsda_correct, SMOKE_LABEL, NON_SMOKE_LABEL
from router.SmsRouter import send_supporter_sms

# 흡연 감지 문자 중복 발송 방지 쿨다운 (초) + user별 마지막 발송 시각
_SMS_COOLDOWN = 300
_last_sms_time: dict[str, float] = {}

router = APIRouter(prefix="/motion", tags=["모션 데이터"])

# 측정 시각은 한국시간(KST) 기준으로 저장한다 (DB 컬럼이 timestamp without time zone)
KST = ZoneInfo("Asia/Seoul")


def _kst_now_naive() -> datetime:
    """현재 한국시간을 tzinfo 없는 naive datetime으로 반환"""
    return datetime.now(KST).replace(tzinfo=None)

# ──────────────────────────────────────────
# HLSDA 세션 예측 캐시 (in-memory, per 서버 프로세스)
# 키: str(user_id), 값: 시간순 raw 예측 라벨 리스트
# 5분 세션 + 여유 100s 동안 유지 후 자동 리셋
# ──────────────────────────────────────────
_SESSION_TTL = 400   # 초
_pred_cache: dict[str, list[str]] = {}   # user_id_str → ["smoke","non_smoke",...]
_pred_times: dict[str, float]     = {}   # user_id_str → last update timestamp


def _get_session_preds(uid: str) -> list[str]:
    """현재 세션 예측 리스트 반환 (TTL 초과 시 리셋)"""
    if time.time() - _pred_times.get(uid, 0) > _SESSION_TTL:
        _pred_cache[uid] = []
    return _pred_cache.setdefault(uid, [])


def _push_pred(uid: str, raw_label: str) -> list[str]:
    """예측 하나 추가 → HLSDA 보정 전 시퀀스 반환"""
    preds = _get_session_preds(uid)
    preds.append(raw_label)
    _pred_times[uid] = time.time()
    return list(preds)


def _clear_session(uid: str) -> None:
    """세션 종료 시 캐시 초기화"""
    _pred_cache.pop(uid, None)
    _pred_times.pop(uid, None)

# ──────────────────────────────────────────
# 스키마 (DB: watch_motion_features)
# ──────────────────────────────────────────

class MotionWindowReq(BaseModel):
    user_id:      uuid.UUID
    sample_count: int = Field(..., ge=1)
    measured_at:  datetime

    # 3축 가속도 × 4통계 (12개)
    accel_x_max:      float
    accel_x_min:      float
    accel_x_skewness: float
    accel_x_kurtosis: float
    accel_y_max:      float
    accel_y_min:      float
    accel_y_skewness: float
    accel_y_kurtosis: float
    accel_z_max:      float
    accel_z_min:      float
    accel_z_skewness: float
    accel_z_kurtosis: float

    # 3축 자이로 × 4통계 (12개)
    gyro_x_max:      float
    gyro_x_min:      float
    gyro_x_skewness: float
    gyro_x_kurtosis: float
    gyro_y_max:      float
    gyro_y_min:      float
    gyro_y_skewness: float
    gyro_y_kurtosis: float
    gyro_z_max:      float
    gyro_z_min:      float
    gyro_z_skewness: float
    gyro_z_kurtosis: float


class MotionWindowRes(BaseModel):
    id:           int
    user_id:      uuid.UUID
    sample_count: int
    measured_at:  datetime
    created_at:   datetime
    updated_at:   datetime

    accel_x_max:      float
    accel_x_min:      float
    accel_x_skewness: float
    accel_x_kurtosis: float
    accel_y_max:      float
    accel_y_min:      float
    accel_y_skewness: float
    accel_y_kurtosis: float
    accel_z_max:      float
    accel_z_min:      float
    accel_z_skewness: float
    accel_z_kurtosis: float

    gyro_x_max:      float
    gyro_x_min:      float
    gyro_x_skewness: float
    gyro_x_kurtosis: float
    gyro_y_max:      float
    gyro_y_min:      float
    gyro_y_skewness: float
    gyro_y_kurtosis: float
    gyro_z_max:      float
    gyro_z_min:      float
    gyro_z_skewness: float
    gyro_z_kurtosis: float

    # AI 예측 결과 (DB 비저장, 응답 전용)
    is_smoking:          bool  = False   # HLSDA 보정 후 최종 판정
    smoking_confidence:  float = 0.0    # Layer1 raw confidence
    raw_label:           str   = ""     # Layer1 raw 라벨 ("smoke"/"non_smoke")
    corrected_label:     str   = ""     # HLSDA 보정 라벨
    session_window_count: int  = 0      # 현재 세션 누적 윈도우 수


def _naive(value: datetime) -> datetime:
    """timestamp without time zone 컬럼에 넣기 위해 한국시간(KST)으로 변환 후 tzinfo 제거.

    워치는 +09:00(KST) ISO8601로 보내고, DB 컬럼은 시간대 정보가 없으므로
    KST 기준 naive datetime으로 저장해 DB에서 본 시각이 실제 한국시간과 일치하게 한다.
    """
    if value.tzinfo is not None:
        value = value.astimezone(KST).replace(tzinfo=None)
    return value


# ──────────────────────────────────────────
# 엔드포인트
# ──────────────────────────────────────────

@router.post("/window", response_model=MotionWindowRes, status_code=201)
async def save_motion_window(body: MotionWindowReq, conn: DbPoolDep):
    """
    Watch 30초 윈도우 24 피처 저장 + 흡연 AI 예측
    (DB 테이블: watch_motion_features)
    """
    print("=" * 60)
    print(f"📥 [MotionAPI] POST /motion/window 수신")
    print(f"   user_id      : {body.user_id}")
    print(f"   sample_count : {body.sample_count}")
    print(f"   measured_at  : {body.measured_at}")
    print(f"   accel_x  max={body.accel_x_max:.4f}  min={body.accel_x_min:.4f}  skew={body.accel_x_skewness:.4f}  kurt={body.accel_x_kurtosis:.4f}")
    print(f"   accel_y  max={body.accel_y_max:.4f}  min={body.accel_y_min:.4f}  skew={body.accel_y_skewness:.4f}  kurt={body.accel_y_kurtosis:.4f}")
    print(f"   accel_z  max={body.accel_z_max:.4f}  min={body.accel_z_min:.4f}  skew={body.accel_z_skewness:.4f}  kurt={body.accel_z_kurtosis:.4f}")
    print(f"   gyro_x   max={body.gyro_x_max:.4f}  min={body.gyro_x_min:.4f}  skew={body.gyro_x_skewness:.4f}  kurt={body.gyro_x_kurtosis:.4f}")
    print(f"   gyro_y   max={body.gyro_y_max:.4f}  min={body.gyro_y_min:.4f}  skew={body.gyro_y_skewness:.4f}  kurt={body.gyro_y_kurtosis:.4f}")
    print(f"   gyro_z   max={body.gyro_z_max:.4f}  min={body.gyro_z_min:.4f}  skew={body.gyro_z_skewness:.4f}  kurt={body.gyro_z_kurtosis:.4f}")

    # ── 유저 존재 확인
    exists = await conn.fetchval(
        "SELECT 1 FROM app_user WHERE user_id = $1 AND is_active = true",
        body.user_id
    )
    if not exists:
        print(f"   ❌ [MotionAPI] 존재하지 않는 사용자: {body.user_id}")
        raise HTTPException(status_code=404, detail="존재하지 않는 사용자입니다.")
    print(f"   ✅ [MotionAPI] 사용자 확인 완료")

    # ── DB 저장
    print(f"   💾 [MotionAPI] DB 저장 시작 (watch_motion_features)")
    row = await conn.fetchrow(
        """
        INSERT INTO watch_motion_features (
            user_id, sample_count, measured_at,
            accel_x_max, accel_x_min, accel_x_skewness, accel_x_kurtosis,
            accel_y_max, accel_y_min, accel_y_skewness, accel_y_kurtosis,
            accel_z_max, accel_z_min, accel_z_skewness, accel_z_kurtosis,
            gyro_x_max,  gyro_x_min,  gyro_x_skewness,  gyro_x_kurtosis,
            gyro_y_max,  gyro_y_min,  gyro_y_skewness,  gyro_y_kurtosis,
            gyro_z_max,  gyro_z_min,  gyro_z_skewness,  gyro_z_kurtosis
        ) VALUES (
            $1,$2,$3,
            $4,$5,$6,$7,
            $8,$9,$10,$11,
            $12,$13,$14,$15,
            $16,$17,$18,$19,
            $20,$21,$22,$23,
            $24,$25,$26,$27
        )
        RETURNING
            id, user_id, sample_count, measured_at, created_at, updated_at,
            accel_x_max, accel_x_min, accel_x_skewness, accel_x_kurtosis,
            accel_y_max, accel_y_min, accel_y_skewness, accel_y_kurtosis,
            accel_z_max, accel_z_min, accel_z_skewness, accel_z_kurtosis,
            gyro_x_max,  gyro_x_min,  gyro_x_skewness,  gyro_x_kurtosis,
            gyro_y_max,  gyro_y_min,  gyro_y_skewness,  gyro_y_kurtosis,
            gyro_z_max,  gyro_z_min,  gyro_z_skewness,  gyro_z_kurtosis
        """,
        body.user_id,
        body.sample_count,
        _naive(body.measured_at),
        # accel X
        body.accel_x_max, body.accel_x_min, body.accel_x_skewness, body.accel_x_kurtosis,
        # accel Y
        body.accel_y_max, body.accel_y_min, body.accel_y_skewness, body.accel_y_kurtosis,
        # accel Z
        body.accel_z_max, body.accel_z_min, body.accel_z_skewness, body.accel_z_kurtosis,
        # gyro X
        body.gyro_x_max, body.gyro_x_min, body.gyro_x_skewness, body.gyro_x_kurtosis,
        # gyro Y
        body.gyro_y_max, body.gyro_y_min, body.gyro_y_skewness, body.gyro_y_kurtosis,
        # gyro Z
        body.gyro_z_max, body.gyro_z_min, body.gyro_z_skewness, body.gyro_z_kurtosis,
    )
    result = dict(row)
    print(f"   ✅ [MotionAPI] DB 저장 완료 — id={result['id']}, measured_at={result['measured_at']}")

    # ── 실시간 예측은 하지 않는다. (저장만)
    #    수집이 끝나면 GET /{user_id}/reanalyze 에서
    #    저장된 윈도우를 한 행씩 모델에 넣어 HLSDA까지 일괄 계산한다.
    result["is_smoking"]           = False
    result["smoking_confidence"]   = 0.0
    result["raw_label"]            = ""
    result["corrected_label"]      = ""
    result["session_window_count"] = 0

    print(f"   💾 [MotionAPI] 저장만 완료 (예측은 수집 종료 시 reanalyze에서 수행)")
    print("=" * 60)

    return result


@router.get("/{user_id}/windows", response_model=list[MotionWindowRes])
async def get_motion_windows(
    user_id: uuid.UUID,
    conn:    DbPoolDep,
    limit:   int = Query(default=20, ge=1, le=200),
):
    """최근 모션 윈도우 목록 조회 (watch_motion_features)"""
    print(f"📋 [MotionAPI] GET /{user_id}/windows (limit={limit})")
    rows = await conn.fetch(
        """
        SELECT
            id, user_id, sample_count, measured_at, created_at, updated_at,
            accel_x_max, accel_x_min, accel_x_skewness, accel_x_kurtosis,
            accel_y_max, accel_y_min, accel_y_skewness, accel_y_kurtosis,
            accel_z_max, accel_z_min, accel_z_skewness, accel_z_kurtosis,
            gyro_x_max,  gyro_x_min,  gyro_x_skewness,  gyro_x_kurtosis,
            gyro_y_max,  gyro_y_min,  gyro_y_skewness,  gyro_y_kurtosis,
            gyro_z_max,  gyro_z_min,  gyro_z_skewness,  gyro_z_kurtosis
        FROM watch_motion_features
        WHERE user_id = $1
        ORDER BY measured_at DESC
        LIMIT $2
        """,
        user_id, limit,
    )
    results = []
    for r in rows:
        row = dict(r)
        row["is_smoking"]         = False
        row["smoking_confidence"] = 0.0
        results.append(row)
    print(f"   ✅ [MotionAPI] {len(results)}개 레코드 반환")
    return results


@router.delete("/{user_id}/session", status_code=200)
async def reset_session(user_id: uuid.UUID):
    """HLSDA 세션 예측 캐시 초기화 (수집 세션 종료 시 호출)"""
    uid_str = str(user_id)
    before = len(_pred_cache.get(uid_str, []))
    _clear_session(uid_str)
    print(f"🗑️  [MotionAPI] HLSDA 세션 캐시 초기화 — user={user_id} ({before}개 예측 삭제)")
    return {"cleared": before}


@router.get("/{user_id}/reanalyze", response_model=MotionWindowRes)
async def reanalyze_latest(user_id: uuid.UUID, conn: DbPoolDep):
    """
    수동 수집 후 '모델에 입력' 버튼 → 최근 세션(5분) 데이터로 재예측
    새 DB 저장 없이 HLSDA 포함 AI 결과만 반환
    """
    print(f"🔁 [MotionAPI] 재분석 요청 — user={user_id}")

    # 마지막으로 저장된 윈도우(measured_at)를 기준으로 5분 세션을 자른다.
    #  → 현재 시각이 아니라 "방금 끝난 수집의 마지막 데이터"가 기준이라
    #    재분석이 몇 초/분 늦게 호출돼도 정확히 그 세션만 잡힌다.
    last_measured_at = await conn.fetchval(
        "SELECT MAX(measured_at) FROM watch_motion_features WHERE user_id = $1",
        user_id,
    )
    if last_measured_at is None:
        raise HTTPException(status_code=404, detail="수집된 데이터 없음")

    session_start = last_measured_at - timedelta(seconds=300)

    FEATURE_COLS = [
        "accel_x_max", "accel_x_min", "accel_x_skewness", "accel_x_kurtosis",
        "accel_y_max", "accel_y_min", "accel_y_skewness", "accel_y_kurtosis",
        "accel_z_max", "accel_z_min", "accel_z_skewness", "accel_z_kurtosis",
        "gyro_x_max",  "gyro_x_min",  "gyro_x_skewness",  "gyro_x_kurtosis",
        "gyro_y_max",  "gyro_y_min",  "gyro_y_skewness",  "gyro_y_kurtosis",
        "gyro_z_max",  "gyro_z_min",  "gyro_z_skewness",  "gyro_z_kurtosis",
    ]
    cols_sql = ", ".join(FEATURE_COLS)
    rows = await conn.fetch(
        f"""
        SELECT {cols_sql}, measured_at
        FROM watch_motion_features
        WHERE user_id = $1 AND measured_at >= $2 AND measured_at <= $3
        ORDER BY measured_at ASC
        """,
        user_id, session_start, last_measured_at,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="마지막 데이터 기준 5분 내 수집 데이터 없음")

    print(f"   🕐 기준 시각(마지막 데이터)={last_measured_at}, 세션 시작={session_start}")

    n = len(rows)
    print(f"   📂 재분석 — 세션 내 {n}개 윈도우 (평균 없이 윈도우별 예측)")

    # ── 윈도우마다 "그대로" 예측해서 raw 라벨 시퀀스를 만든다 (평균 X)
    uid_str = str(user_id)
    _clear_session(uid_str)            # 재분석 시 세션 리셋 후 처음부터 다시 쌓음

    pred_seq: list[str] = []
    last_raw_label  = NON_SMOKE_LABEL
    for i, r in enumerate(rows):
        win_feat = {col: float(r[col]) if r[col] is not None else 0.0 for col in FEATURE_COLS}
        pred = predict_smoking(win_feat)
        last_raw_label  = pred["label"]
        pred_seq = _push_pred(uid_str, last_raw_label)
        print(f"      [{i+1}/{n}] raw={last_raw_label}  conf={pred['confidence']:.2%}")

    # ── 윈도우별 raw 시퀀스 전체에 HLSDA 보정 적용
    corrected_seq   = hlsda_correct(pred_seq)
    corrected_label = corrected_seq[-1]
    is_smoking_final = corrected_label == SMOKE_LABEL

    # ── confidence = 보정된 시퀀스에서 흡연 윈도우 비율 (전체 세션 기준)
    smoke_count   = sum(1 for lbl in corrected_seq if lbl == SMOKE_LABEL)
    smoke_ratio   = round(smoke_count / len(corrected_seq), 4) if corrected_seq else 0.0

    print(f"   🔁 재분석 결과 — raw 시퀀스={pred_seq}")
    print(f"                   보정 시퀀스={corrected_seq}")
    print(f"   흡연 비율 — {smoke_count}/{len(corrected_seq)} = {smoke_ratio:.1%}")
    print(f"   최종 — corrected={corrected_label} | final={is_smoking_final}")

    # ── 흡연 감지 시: 서포터(지인)에게 문자 발송 (5분 쿨다운으로 중복 방지)
    if is_smoking_final:
        if time.time() - _last_sms_time.get(uid_str, 0) > _SMS_COOLDOWN:
            try:
                sms_res = await send_supporter_sms(conn, user_id, smoking_detected=True)
                _last_sms_time[uid_str] = time.time()
                print(f"   📨 흡연 감지 → 서포터 문자 발송 완료: {sms_res['to']}")
            except LookupError:
                print("   ⚠️ 서포터 미등록 — 문자 미발송")
            except Exception as e:
                print(f"   ⚠️ 흡연 감지 문자 발송 실패: {e}")
        else:
            print("   ⏳ 흡연 감지 문자 쿨다운 중 — 발송 생략")

    # 응답에 최신 DB 행 메타데이터 + 마지막 윈도우 피처 사용
    latest = dict(rows[-1])
    latest["id"]           = 0
    latest["user_id"]      = user_id
    latest["sample_count"] = 0
    latest["measured_at"]  = rows[-1]["measured_at"]
    latest["created_at"]   = _kst_now_naive()
    latest["updated_at"]   = _kst_now_naive()
    latest["is_smoking"]           = is_smoking_final
    latest["smoking_confidence"]   = smoke_ratio       # 전체 세션 흡연 윈도우 비율
    latest["raw_label"]            = last_raw_label
    latest["corrected_label"]      = corrected_label
    latest["session_window_count"] = n
    return latest
