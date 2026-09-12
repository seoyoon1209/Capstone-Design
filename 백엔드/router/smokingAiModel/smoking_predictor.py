"""
smoking_predictor.py
Layer1 흡연 예측 — smoking_rf_binary.pkl (sklearn Pipeline) 사용

pkl 구조:
    data['pipeline'] : StandardScaler + RandomForestClassifier
    data['features'] : 24개 피처명 (acc_x_max / acc_x_kurt / acc_x_skew … 형식)
    data['classes']  : ['non_smoke', 'smoke']

DB·API 피처명(accel_x_max / accel_x_kurtosis …)을 pkl 피처명으로 매핑 후
numpy 배열로 변환해 예측.
"""
import os
import numpy as np

# ── 모델 싱글턴
_pipeline = None
_features: list[str] = []
_classes:  list[str] = []

# ── DB/API 피처명 → pkl 피처명 매핑
#    DB    : accel_x_max / accel_x_min / accel_x_skewness / accel_x_kurtosis
#    pkl   : acc_x_max   / acc_x_min   / acc_x_skew       / acc_x_kurt
_DB_TO_PKL: dict[str, str] = {}
for _axis_db, _axis_pkl in [
    ("accel_x", "acc_x"), ("accel_y", "acc_y"), ("accel_z", "acc_z"),
    ("gyro_x",  "gyro_x"), ("gyro_y", "gyro_y"), ("gyro_z",  "gyro_z"),
]:
    _DB_TO_PKL[f"{_axis_db}_max"]      = f"{_axis_pkl}_max"
    _DB_TO_PKL[f"{_axis_db}_min"]      = f"{_axis_pkl}_min"
    _DB_TO_PKL[f"{_axis_db}_skewness"] = f"{_axis_pkl}_skew"
    _DB_TO_PKL[f"{_axis_db}_kurtosis"] = f"{_axis_pkl}_kurt"

SMOKE_LABEL     = "smoke"
NON_SMOKE_LABEL = "non_smoke"


def _load():
    global _pipeline, _features, _classes
    if _pipeline is not None:
        return

    import joblib
    pkl_path = os.path.join(os.path.dirname(__file__), "smoking_rf_binary.pkl")
    print(f"[SmokingPredictor] pkl 모델 로드 중: {pkl_path}")
    data      = joblib.load(pkl_path)
    _pipeline = data["pipeline"]
    _features = data["features"]   # pkl 피처 순서
    _classes  = list(data["classes"])
    print(f"[SmokingPredictor] ✅ 로드 완료 — 피처 {len(_features)}개, 클래스: {_classes}")
    print(f"[SmokingPredictor] 피처 순서: {_features}")


def predict_smoking(features: dict) -> dict:
    """
    DB/API 피처명 딕셔너리를 받아 흡연 여부 예측.

    Args:
        features: DB 컬럼명 키 (accel_x_max, accel_x_skewness, …)

    Returns:
        {
          "is_smoking" : bool,
          "confidence" : float,   # smoke 확률
          "label"      : str,     # "smoke" / "non_smoke"
        }
    """
    _load()

    # ── DB 피처명 → pkl 피처명으로 변환 후 pkl 피처 순서대로 벡터 구성
    pkl_vals: dict[str, float] = {}
    for db_key, val in features.items():
        pkl_key = _DB_TO_PKL.get(db_key)
        if pkl_key:
            pkl_vals[pkl_key] = float(val)

    missing = [f for f in _features if f not in pkl_vals]
    if missing:
        print(f"  ⚠️  [SmokingPredictor] 누락 피처 (0 대체): {missing}")

    row = [pkl_vals.get(f, 0.0) for f in _features]
    arr = np.array([row], dtype=np.float64)

    print(f"  📐 [SmokingPredictor] 입력 벡터 ({len(row)}개): {[round(v,4) for v in row]}")

    try:
        label      = _pipeline.predict(arr)[0]            # "smoke" / "non_smoke"
        proba      = _pipeline.predict_proba(arr)[0]      # [p_non_smoke, p_smoke]
        smoke_idx  = list(_pipeline.classes_).index(SMOKE_LABEL)
        confidence = float(proba[smoke_idx])
    except Exception as e:
        print(f"  ❌ [SmokingPredictor] 예측 실패: {e}")
        return {"is_smoking": False, "confidence": 0.0, "label": "error"}

    result = {
        "is_smoking": label == SMOKE_LABEL,
        "confidence": round(confidence, 4),
        "label":      label,
    }
    icon = "🚬" if result["is_smoking"] else "✅"
    print(f"  {icon} [SmokingPredictor] label={label}  smoke={confidence:.2%}  non_smoke={1-confidence:.2%}")
    return result
