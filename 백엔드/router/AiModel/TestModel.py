import uuid
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db.dbpool import DbPoolDep
from router.AiModel.predictor import predict_smoking_success, features
from router.AiModel.mapper import build_model_input, map_started_age

router = APIRouter(prefix="/ai", tags=["AI Model"])

class PredictReq(BaseModel):
    user_id: uuid.UUID

@router.post("/predict")
async def predict_smoking(body: PredictReq, conn: DbPoolDep):
    try:
        #유저 및 프로필 정보 조회
        user_info = await conn.fetchrow("""
            SELECT u.user_id, p.gender, p.birth_year, p.marital_status, p.height_cm, p.weight_kg,
                   p.user_address, p.education_level, p.occupation_type
            FROM app_user u
            LEFT JOIN user_profile p ON u.user_id = p.user_id
            WHERE u.user_id = $1
        """, body.user_id)

        if not user_info:
            raise HTTPException(status_code=404, detail="존재하지 않는 사용자입니다.")

        # 건강행동 스냅샷 조회 (스트레스, 음주, 간접흡연 정보용)
        snapshot = await conn.fetchrow("""
            SELECT *
            FROM health_behavior_snapshot
            WHERE user_id = $1
            ORDER BY taken_at DESC
            LIMIT 1
        """, body.user_id)

        # 2-1. 입력 데이터 충분 여부 판단
        # 프로필/스냅샷이 비어 있으면 mapper 가 기본값(30세 등)으로 채워 항상 ~50%가 나온다.
        # 이 경우 가짜 위험도를 보여주지 말고 "데이터 부족"으로 응답한다.
        has_profile = any([
            user_info["gender"],
            user_info["birth_year"],
            user_info["height_cm"],
            user_info["weight_kg"],
            user_info["marital_status"],
        ])
        data_sufficient = bool(has_profile or snapshot)

        if not data_sufficient:
            return {
                "ok": True,
                "data_sufficient": False,
                "message": "분석에 필요한 프로필 정보가 부족합니다.",
                "result": None,
                "prediction": None,
                "top_risks": [],
            }

        # 3. BMI 계산
        height = user_info["height_cm"] or 170.0
        weight = user_info["weight_kg"] or 65.0
        calculated_bmi = weight / ((height / 100) ** 2)

        # 3-1. snapshot.note(JSON)에 저장된 추가 항목 파싱
        #      (학력/직업/흡연시작연령/담배종류는 별도 컬럼이 아니라 note JSON에 들어있다)
        snapshot_dict = dict(snapshot) if snapshot else {}
        note = {}
        raw_note = snapshot_dict.get("note")
        if raw_note:
            try:
                note = json.loads(raw_note) if isinstance(raw_note, str) else dict(raw_note)
            except Exception:
                note = {}

        # 주의: BS1_1 에는 소득을 연결하지 않는다.
        # 모델 민감도 검증 결과 BS1_1 은 소득 그라데이션이 아니라 범주형(1만 특이값)으로,
        # KNHANES 원본 BS1_1(평생흡연 여부)일 가능성이 높다. 소득을 넣으면 저소득자가
        # 실패율 7%로 둔갑하는 오류가 생겨, 학습 코드북으로 의미가 확정되기 전까지는 중립 기본값을 둔다.

        # 담배 종류(vape/heated) → mapper용 tobacco_rows 구성 (흡연 시작연령 포함)
        tobacco_types = note.get("tobacco_types") or []
        start_age = note.get("smoking_start_age")
        tobacco_rows = []
        if "vape" in tobacco_types:
            tobacco_rows.append({"code": "LIQUID_ECIG", "ever_used": True, "started_age": start_age})
        if "heated" in tobacco_types:
            tobacco_rows.append({"code": "HEATED_TOBACCO", "ever_used": True, "started_age": start_age})

        # 4. AI 모델 입력 규격 매핑
        profile_data = {
            "gender": user_info["gender"] or "M",
            "birth_year": user_info["birth_year"] or 1995,
            "marital_status": user_info["marital_status"] or "UNKNOWN",
            "height_cm": height,
            "weight_kg": weight,
            "bmi": calculated_bmi,
            "education_level": user_info["education_level"],   # user_profile 정식 컬럼(한글)
            "occupation_type": user_info["occupation_type"],   # user_profile 정식 컬럼(코드)
            "lifetime_smoking": note.get("lifetime_smoking"),  # BS1_1: 평생 흡연량
        }

        model_input = build_model_input(
            profile=profile_data,
            snapshot=snapshot_dict,
            tobacco_rows=tobacco_rows,
        )

        # BS2_1(궐련 흡연 시작연령)은 note의 smoking_start_age 기준으로 보정
        # (mapper는 시작연령을 가열/전자담배 행에서만 끌어오므로 궐련만 피운 경우 누락됨)
        if start_age is not None:
            model_input["BS2_1"] = map_started_age(start_age)


        # 디버깅 로그: AI에게 전달되는 실제 값 확인
        print(f"[AI Input Data] ---\n{model_input}\n")

        # AI 모델 예측 실행
        result_data = predict_smoking_success(model_input)

        print(f"[AI Prediction Result] ---\n{result_data}\n")
        
        # GPT 개인화용: 사용자 실제 맥락(factors) + 위험요인(top_risks)
        from datetime import datetime
        age_val = (datetime.now().year - user_info["birth_year"]) if user_info["birth_year"] else None

        occ_kr = {"WORKER": "사무직/관리직", "SELF_EMPLOYED": "자영업", "STUDENT": "학생", "UNEMPLOYED": "무직/주부", "OTHER": "기타"}
        tob_kr = {"cigarette": "궐련", "vape": "전자담배", "heated": "가열담배"}

        def _has(x):
            return x is not None and x != ""

        s = snapshot_dict
        factors = []
        if age_val is not None:
            factors.append(f"{age_val}세")
        if _has(s.get("avg_cigs_per_day")):
            factors.append(f"하루 흡연량 약 {s['avg_cigs_per_day']}개비")
        if _has(s.get("smoking_days_last_30")):
            factors.append(f"최근 30일 중 {s['smoking_days_last_30']}일 흡연")
        if _has(s.get("quit_attempts_1y_over_1day")):
            factors.append(f"최근 1년 금연 시도 {s['quit_attempts_1y_over_1day']}회")
        if _has(start_age):
            factors.append(f"{start_age}세에 흡연 시작")
        if tobacco_types:
            factors.append("사용 담배: " + ", ".join(tob_kr.get(t, t) for t in tobacco_types))
        if _has(note.get("alcohol_freq_label")):
            factors.append(f"음주 빈도 {note['alcohol_freq_label']}")
        if _has(note.get("binge_freq_label")):
            factors.append(f"폭음 빈도 {note['binge_freq_label']}")
        if _has(s.get("stress_awareness_level")):
            factors.append(f"스트레스 인지 {s['stress_awareness_level']}")
        if s.get("shs_home_exposed") is True:
            factors.append("가정 내 간접흡연 노출")
        if s.get("shs_work_exposed") is True:
            factors.append("직장 내 간접흡연 노출")
        factors.append(f"BMI {calculated_bmi:.1f}")
        if _has(s.get("leisure_moderate_days_per_week")):
            factors.append(f"주간 중강도 운동 {s['leisure_moderate_days_per_week']}일")
        if _has(user_info["education_level"]):
            factors.append("학력 " + user_info["education_level"])   # 이미 한글
        if _has(user_info["occupation_type"]):
            factors.append("직업 " + occ_kr.get(user_info["occupation_type"], user_info["occupation_type"]))

        # 위험 요인(강조용) — 교정된 인코딩 기준으로 판정
        top_risks = []
        if model_input.get("mh_stress", 4) <= 2:
            top_risks.append("높은 스트레스")
        if model_input.get("BD2_1", 1) >= 5:
            top_risks.append("잦은 음주")
        if s.get("shs_home_exposed") is True or s.get("shs_work_exposed") is True:
            top_risks.append("간접흡연 노출")
        if calculated_bmi >= 25:
            top_risks.append("높은 체질량지수(BMI)")
        if _has(s.get("avg_cigs_per_day")) and s["avg_cigs_per_day"] >= 15:
            top_risks.append("많은 흡연량")
        if _has(start_age) and start_age <= 15:
            top_risks.append("이른 흡연 시작")
        if "vape" in tobacco_types or "heated" in tobacco_types:
            top_risks.append("전자/가열담배 병용")

        # 비어 있어서 기본값으로 처리된(=정확도를 떨어뜨리는) 입력 항목
        missing = []
        if not user_info["gender"]:
            missing.append("성별")
        if not user_info["birth_year"]:
            missing.append("출생연도")
        if not user_info["marital_status"]:
            missing.append("결혼 여부")
        if not user_info["education_level"]:
            missing.append("학력")
        if not user_info["occupation_type"]:
            missing.append("직업")
        if not (user_info["height_cm"] and user_info["weight_kg"]):
            missing.append("키·몸무게")
        if not _has(s.get("stress_awareness_level")):
            missing.append("스트레스 인지")
        if s.get("alcohol_freq_per_week") is None:
            missing.append("음주 빈도")
        if s.get("shs_home_exposed") is None and s.get("shs_work_exposed") is None:
            missing.append("간접흡연 노출")
        if not _has(start_age):
            missing.append("흡연 시작연령")
        if not tobacco_types:
            missing.append("담배 종류")
        if s.get("avg_cigs_per_day") is None:
            missing.append("하루 흡연량")

        return {
            "ok": True,
            "data_sufficient": True,
            "message": "AI 분석 성공",
            "result": result_data.get("result", 0.5),
            "prediction": result_data.get("prediction", 0),
            "top_risks": top_risks,
            "factors": factors,
            "missing": missing,
        }

    except Exception as e:
        print(f"AI 분석 상세 에러: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI 분석 중 오류 발생: {str(e)}")
