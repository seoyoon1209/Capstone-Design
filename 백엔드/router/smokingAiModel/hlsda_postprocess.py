"""
HLSDA Layer2 후처리 — 백엔드 연동용

흡연 감지 모델(Layer1, RandomForest)의 예측 결과에 적용하는 후처리 알고리즘.
논문 HLSDA(Shoaib et al., 2016, Figure 2)의 sandwich rule 3종을 구현.

[핵심 개념]
흡연은 보통 몇 분간 연속되는 활동이다. 따라서 흡연 예측들 한가운데
한두 개만 다른 라벨이 끼어 있으면 오분류일 가능성이 높다.
→ 시간순 예측 시퀀스에서 그런 "끼인 오답"을 양옆 라벨로 보정한다.

[사용법 — 백엔드]
    from hlsda_postprocess import hlsda_correct

    predictions = []                    # 30초마다 모델 예측이 하나씩 쌓임
    for window in sensor_stream:
        feat = extract_features(window) # raw 30초 -> 24개 특징
        pred = model.predict([feat])[0] # Layer1: 'smoke' / 'non_smoke'
        predictions.append(pred)

        corrected = hlsda_correct(predictions)  # Layer2 보정
        final = corrected[-1]                    # 가장 최근의 (보정된) 판단
        if final == SMOKE_LABEL:
            alert("흡연 상황이 의심됩니다")

[주의]
- 입력은 "한 사용자"의 시간순 예측 리스트여야 한다.
- 보정 특성상 과거 시점(n-3 등)을 수정하므로, 흡연 확정까지 최대 30~90초
  지연이 생길 수 있다 (뒤따르는 예측을 보고 보정하기 때문).
- 라벨 문자열은 학습 모델과 동일해야 한다 (기본: 'smoke' / 'non_smoke').
"""
from __future__ import annotations

from collections import Counter

# 모델이 출력하는 흡연 라벨 (학습 시 사용한 값과 일치해야 함)
SMOKE_LABEL = "smoke"
NON_SMOKE_LABEL = "non_smoke"


def hlsda_correct(pred: list, winlimit: int = 10) -> list:
    """시간순 예측 시퀀스에 HLSDA sandwich rule 3종을 적용해 보정한다.

    Args:
        pred: 한 사용자의 시간순 예측 리스트 (예: ['non_smoke', 'smoke', ...]).
        winlimit: Rule 3에서 단발성 판단을 검사할 이동 윈도우 크기.

    Returns:
        보정된 예측 리스트 (입력과 길이 동일).
    """
    p = list(pred)
    for n in range(len(p)):
        # Rule 1: 끼인 1개 오답 ([A A X A A] -> [A A A A A])
        if n >= 2 and p[n] == p[n - 2] and p[n] != p[n - 1]:
            p[n - 1] = p[n]
        # Rule 2: 끼인 2개 연속 오답 보정
        elif n >= 5 and (
            (p[n] == p[n - 1] == p[n - 4]) or
            (p[n - 1] == p[n - 4] == p[n - 5])
        ) and p[n - 1] != p[n - 2]:
            p[n - 2] = p[n - 1]
            p[n - 3] = p[n - 1]
        # Rule 3: 이동 윈도우 내 단발성(count=1) 흡연 오탐 보정
        elif n >= 3:
            window = p[max(0, n - winlimit):n + 1]
            cnt = Counter(window)
            most_common = cnt.most_common(1)[0][0]
            if p[n - 3] == SMOKE_LABEL and cnt[SMOKE_LABEL] == 1:
                p[n - 3] = most_common
    return p


# ---------------------------------------------------------------------
# 간단 동작 예시 (직접 실행 시)
# ---------------------------------------------------------------------
if __name__ == "__main__":
    # 흡연 연속 중 1개가 비흡연으로 잘못 예측된 경우
    raw = ["smoke", "smoke", "non_smoke", "smoke", "smoke"]
    fixed = hlsda_correct(raw)
    print("보정 전:", raw)
    print("보정 후:", fixed)   # 가운데 non_smoke -> smoke 로 보정됨
