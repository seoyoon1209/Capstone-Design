import os
import joblib
import pandas as pd
import numpy as np

# 현재 파일 기준 모델 경로 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "ensemble_model.pkl")

# 모델 로드 및 타입 확인
# ensemble_model.pkl 은 {'rf': ..., 'xgb': ..., 'features': [...]} 형태의 앙상블이다.
# 예전 코드는 'rf' 하나만 꺼내 써서 xgb 절반을 버렸으므로,
# 여기서는 predict_proba 가 가능한 추정기를 전부 모아 평균 앙상블로 사용한다.
model_data = None
models = []   # 실제 예측에 사용할 추정기 목록 (rf, xgb, ...)

try:
    if os.path.exists(MODEL_PATH):
        model_data = joblib.load(MODEL_PATH)

        if isinstance(model_data, dict):
            print(f"모델 파일이 딕셔너리 형태입니다. 키 목록: {list(model_data.keys())}")
            # 우선순위 키를 먼저, 그다음 나머지 값 중 추정기를 모두 수집
            ordered_keys = [k for k in ['rf', 'xgb', 'model', 'clf', 'voting', 'best_estimator_'] if k in model_data]
            ordered_keys += [k for k in model_data.keys() if k not in ordered_keys]
            for key in ordered_keys:
                est = model_data[key]
                if hasattr(est, 'predict'):
                    models.append((key, est))
                    print(f" '{key}' 추정기를 앙상블에 추가했습니다: {type(est).__name__}")
        elif hasattr(model_data, 'predict'):
            models.append(('model', model_data))

        if models:
            print(f"AI 모델 로드 성공 (앙상블 {len(models)}개): {[n for n, _ in models]}")
        else:
            print("⚠로드된 파일에서 사용할 추정기를 찾지 못했습니다.")
    else:
        print(f"⚠모델 파일을 찾을 수 없습니다: {MODEL_PATH}")
except Exception as e:
    print(f"⚠모델 로드 실패: {e}")

# 모델이 학습할 때 사용한 피처 목록
features = [
    "sex", "age", "edu", "marri_1", "occp", "BS1_1", "BS2_1", 
    "BS12_37", "BS12_1", "HE_BMI", "mh_stress", "BD2_1", "BS8_2", "BS13"
]

def _failure_proba(est, df):
    """
    한 추정기에서 '재흡연(금연 실패)' 확률을 뽑는다.
    classes_ = [0, 1] 이고 0 = 실패(재흡연) 클래스이므로 predict_proba 의 0번 컬럼이 실패 확률.
    (검증: 스트레스/음주/간접흡연 등 위험요인이 늘면 0번 컬럼 값이 함께 올라감)
    classes_ 를 직접 확인해 컬럼 위치를 안전하게 찾는다.
    """
    if hasattr(est, "predict_proba"):
        proba = est.predict_proba(df)[0]
        classes = list(getattr(est, "classes_", [0, 1]))
        fail_idx = classes.index(0) if 0 in classes else 0
        return float(proba[fail_idx])
    # 확률을 못 주는 모델은 예측 클래스로 근사
    pred = est.predict(df)[0]
    return 0.8 if int(pred) == 0 else 0.2


def predict_smoking_success(data: dict):
    if not models:
        return {"error": "모델이 정상적으로 로드되지 않았습니다.", "result": 0.5}

    try:
        # 데이터프레임 변환 + 피처 순서 정렬 (누락 피처는 학습 분포를 해치므로 사용하지 않음)
        df = pd.DataFrame([data])
        for f in features:
            if f not in df.columns:
                df[f] = 0
        df = df[features]

        # 앙상블: 각 추정기의 실패 확률을 평균
        risks = []
        for name, est in models:
            try:
                risks.append(_failure_proba(est, df))
            except Exception as e:
                print(f"[{name}] predict 에러: {e}")
        if not risks:
            return {"error": "모든 추정기 예측 실패", "result": 0.5}

        risk_val = float(sum(risks) / len(risks))
        prediction = 0 if risk_val >= 0.5 else 1   # 0 = 실패 우세, 1 = 성공 우세

        return {
            "prediction": prediction,
            "result": risk_val,                    # 금연 실패(재흡연) 위험도 0~1
            "members": {n: round(r, 4) for (n, _), r in zip(models, risks)},
            "input_features": data,
        }
    except Exception as e:
        print(f"예측 프로세스 중 오류: {e}")
        return {"error": str(e), "result": 0.5}
