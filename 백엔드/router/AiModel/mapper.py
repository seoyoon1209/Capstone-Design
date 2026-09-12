from datetime import datetime


def map_gender(gender: str | None) -> int:
    """
    DB: M / F / OTHER / UNKNOWN
    AI: 1=남, 2=여
    """
    if gender == "M":
        return 1
    if gender == "F":
        return 2
    return 2


def calc_age_from_birth_year(birth_year: int | None) -> int:
    """
    DB: birth_year
    AI: age
    """
    if birth_year is None:
        return 30

    current_year = datetime.now().year
    age = current_year - birth_year

    if age < 19:
        return 19
    if age > 80:
        return 80
    return age


def map_education(education_level: str | None) -> int:
    """
    DB: education_level
    AI: edu
    """
    mapping = {
        # 영문 코드,user_profile 컬럼의 한글값(DB CHECK 기준) 모두 허용
        "ELEMENTARY_OR_LESS": 1, "초졸이하": 1,
        "MIDDLE": 2, "중졸": 2,
        "HIGH": 3, "고졸": 3,
        "COLLEGE_OR_MORE": 4, "대졸이상": 4,
        "UNKNOWN": 4, "무응답": 4,
    }
    return mapping.get(education_level, 4)


def map_marital_status(marital_status: str | None) -> int:
    """
    DB: marital_status
    AI: marri_1
    """
    mapping = {
        "WITH_SPOUSE": 1,
        "WITHOUT_SPOUSE": 2,
        "UNKNOWN": 2,
    }
    return mapping.get(marital_status, 2)


def map_occupation(occupation_type: str | None) -> int:
    """
    DB: occupation_type
    AI: occp (1~7)

    정확한 원 코드 체계가 DB에 없으므로
    서비스용 직업군을 AI 코드로 근사 매핑
    """
    mapping = {
        "WORKER": 2,
        "SELF_EMPLOYED": 5,
        "STUDENT": 7,
        "UNEMPLOYED": 7,
        "OTHER": 7,
    }
    return mapping.get(occupation_type, 7)


def map_lifetime_smoking(value: str | None) -> int:
    """
    평생 흡연량 → AI BS1_1 (KNHANES '평생 흡연 여부/양')
      1 = 피운 적 없음
      2 = 5갑(100개비) 미만
      3 = 5갑(100개비) 이상
    (소득이 아니라 흡연량이 BS1_1의 원래 의미)
    프론트는 코드 문자열(NONE/LT_5PACKS/GE_5PACKS)을 보낸다.
    """
    mapping = {"NONE": 1, "LT_5PACKS": 2, "GE_5PACKS": 3}
    # 금연 앱 사용자는 대부분 흡연 경험자 → 미상은 '5갑 미만'(2, 중립)로 둠
    return mapping.get(value, 2)


def map_started_age(started_age: int | None) -> int:
    """
    DB: started_age
    AI: BS2_1
    """
    if started_age is None:
        return 19

    if started_age < 10:
        return 10
    if started_age > 30:
        return 30
    return started_age


def map_ever_used_to_binary(value: bool | None) -> int:
    """
    DB: boolean
    AI: 1=예, 2=아니오
    """
    if value is True:
        return 1
    return 2


def map_bmi(bmi: float | None) -> float:
    """
    DB: bmi
    AI: HE_BMI
    """
    if bmi is None:
        return 22.0

    bmi = float(bmi)

    if bmi < 10.0:
        return 10.0
    if bmi > 60.0:
        return 60.0
    return round(bmi, 1)


def map_stress(stress_awareness_level: str | None) -> int:
    """
    DB: "매우 낮음", "낮음", "보통", "높음", "매우 높음"
    AI(KNHANES mh_stress): 1=대단히 많이, 2=많이, 3=조금, 4=거의 느끼지 않음
    (모델은 1~4 스케일로 학습됨. 기존 0/1 매핑은 학습 분포 밖이라 무력화되어 있었음)
    """
    mapping = {
        "매우 높음": 1,
        "높음": 2,
        "보통": 3,
        "낮음": 4,
        "매우 낮음": 4,
    }
    return mapping.get(stress_awareness_level, 3)  # 기본값: 보통(조금)


def map_alcohol_freq(alcohol_freq_per_week: int | None) -> int:
    """
    DB: alcohol_freq_per_week (정수, 주당 횟수)
    AI(KNHANES BD2_1, 최근 1년 음주빈도) — 숫자가 클수록 자주 마심:
      1: 최근 1년간 전혀 안 마심
      2: 월 1회 미만
      3: 월 1회 정도
      4: 월 2~4회
      5: 주 2~3회
      6: 주 4회 이상
    (기존 매핑은 1=매일 … 5=거의안함으로 KNHANES와 순서가 정반대였음 → 매일 음주자가 저위험으로 잘못 계산)
    """
    if alcohol_freq_per_week is None or alcohol_freq_per_week <= 0:
        return 1            # 전혀 안 마심
    if alcohol_freq_per_week >= 4:
        return 6            # 주 4회 이상
    if alcohol_freq_per_week >= 2:
        return 5            # 주 2~3회
    return 4               # 주 1회 정도(≈ 월 2~4회)


def map_secondhand_work(shs_work_exposed: bool | None) -> int:
    """
    DB: shs_work_exposed
    AI: BS8_2
    """
    return 1 if shs_work_exposed is True else 2


def map_secondhand_public(shs_home_exposed: bool | None) -> int:
    """
    주의:
    AI의 BS13이 공공장소 간접흡연 노출인데,
    현재 DB에는 공공장소 컬럼이 없어서 임시로 home 값을 사용.
    나중에 public 컬럼 생기면 여기만 바꾸면 됨.
    """
    return 1 if shs_home_exposed is True else 2


def build_tobacco_map(tobacco_rows: list[dict]) -> dict:
    """
    user_tobacco_lifetime_use + tobacco_product_type join 결과를
    코드별 딕셔너리로 변환
    """
    result = {
        "HEATED_TOBACCO": {"ever_used": False, "started_age": None},
        "LIQUID_ECIG": {"ever_used": False, "started_age": None},
    }

    for row in tobacco_rows:
        code = row.get("code")
        ever_used = row.get("ever_used")
        started_age = row.get("started_age")

        if code in result:
            result[code]["ever_used"] = bool(ever_used)
            result[code]["started_age"] = started_age

    return result


def build_model_input(profile: dict, snapshot: dict, tobacco_rows: list[dict]) -> dict:
    """
    profile: user_profile 조회 결과
    snapshot: health_behavior_snapshot 최신 1건
    tobacco_rows: user_tobacco_lifetime_use join 조회 결과
    """
    tobacco_map = build_tobacco_map(tobacco_rows)

    started_age = tobacco_map["HEATED_TOBACCO"]["started_age"]
    if started_age is None:
        started_age = tobacco_map["LIQUID_ECIG"]["started_age"]

    model_input = {
        "sex": map_gender(profile.get("gender")),
        "age": calc_age_from_birth_year(profile.get("birth_year")),
        "edu": map_education(profile.get("education_level")),
        "marri_1": map_marital_status(profile.get("marital_status")),
        "occp": map_occupation(profile.get("occupation_type")),
        "BS1_1": map_lifetime_smoking(profile.get("lifetime_smoking")),
        "BS2_1": map_started_age(started_age),
        "BS12_37": map_ever_used_to_binary(
            tobacco_map["HEATED_TOBACCO"]["ever_used"]
        ),
        "BS12_1": map_ever_used_to_binary(
            tobacco_map["LIQUID_ECIG"]["ever_used"]
        ),
        "HE_BMI": map_bmi(profile.get("bmi")), # profile에서 계산된 bmi 사용
        "mh_stress": map_stress(snapshot.get("stress_awareness_level")),
        "BD2_1": map_alcohol_freq(snapshot.get("alcohol_freq_per_week")),
        "BS8_2": map_secondhand_work(snapshot.get("shs_work_exposed")),
        "BS13": map_secondhand_public(snapshot.get("shs_home_exposed")),
    }

    return model_input