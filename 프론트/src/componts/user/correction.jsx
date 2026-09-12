import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "src/api/axios";
import AppLoadingScreen from "src/componts/common/AppLoadingScreen";
import {
    FaChevronDown,
    FaSmoking,
    FaWineBottle,
    FaHeartbeat,
    FaUsers,
    FaHome,
    FaSave,
    FaArrowLeft,
} from "react-icons/fa";

const errMsg = (e) =>
    e?.response?.data?.detail || e?.message || "요청에 실패했습니다.";

const toNumOrNull = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const numToInput = (v) => (v === null || v === undefined ? "" : String(v));

function Accordion({
                       title,
                       desc,
                       icon,
                       children,
                       defaultOpen = true,
                   }) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50"
            >
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        {icon}
                    </div>
                    <div>
                        <div className="text-[15px] font-bold text-slate-900">{title}</div>
                        <div className="mt-1 text-xs text-slate-500">{desc}</div>
                    </div>
                </div>

                <FaChevronDown
                    className={`text-slate-400 transition-transform duration-200 ${
                        open ? "rotate-180" : ""
                    }`}
                />
            </button>

            {open && <div className="border-t border-slate-100 px-5 py-5">{children}</div>}
        </div>
    );
}

function TwoCol({ left, right }) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{left}{right}</div>;
}

function Label({ children, required = false }) {
    return (
        <div className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700">
            <span>{children}</span>
            {required && <span className="text-red-500">*</span>}
        </div>
    );
}

function TextInput({ value, onChange, placeholder, type = "text" }) {
    return (
        <input
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            type={type}
        />
    );
}

function Select({ value, onChange, options }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
        >
            {options.map((op) => (
                <option key={op} value={op}>
                    {op}
                </option>
            ))}
        </select>
    );
}

function YesNo({ value, onChange }) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <button
                type="button"
                onClick={() => onChange(true)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    value === true
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
            >
                예
            </button>
            <button
                type="button"
                onClick={() => onChange(false)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    value === false
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
            >
                아니오
            </button>
        </div>
    );
}

function CheckPill({ label, checked, onChange }) {
    return (
        <button
            type="button"
            onClick={onChange}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                checked
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
        >
            {label}
        </button>
    );
}

function FieldCard({ children }) {
    return <div className="rounded-2xl bg-slate-50 p-4">{children}</div>;
}

export default function Correction({ userId, onSkip, onDone }) {
    const [loading, setLoading] = useState(false);
    const [loadingInit, setLoadingInit] = useState(false);
    const navigate = useNavigate();

    const resolvedUserId = useMemo(() => {
        if (typeof userId === "string" && userId) return userId;
        try {
            const u = JSON.parse(localStorage.getItem("user") || "null");
            return u?.user_id || u?.userId || null;
        } catch {
            return null;
        }
    }, [userId]);

    const [avgCigs, setAvgCigs] = useState("");
    const [quitAttempts, setQuitAttempts] = useState("");
    const [smokingDays30, setSmokingDays30] = useState("");
    const [startAge, setStartAge] = useState("");
    const [tobaccoTypes, setTobaccoTypes] = useState(["cigarette"]);
    const [lifetimeSmoking, setLifetimeSmoking] = useState("5갑(100개비) 이상");

    const [homeExposed, setHomeExposed] = useState(null);
    const [homeHoursWeek, setHomeHoursWeek] = useState("");
    const [workExposed, setWorkExposed] = useState(null);
    const [workHoursWeek, setWorkHoursWeek] = useState("");

    const [alcoholLabel, setAlcoholLabel] = useState("월 2~4회");
    const [bingeLabel, setBingeLabel] = useState("월 1회 미만");

    const [workHiDays, setWorkHiDays] = useState("");
    const [workHiHours, setWorkHiHours] = useState("");
    const [leisDays, setLeisDays] = useState("");
    const [leisHours, setLeisHours] = useState("");

    const [stress, setStress] = useState("보통");
    const [houseType, setHouseType] = useState("무부");
    const [bodyShape, setBodyShape] = useState("보통");
    const [education, setEducation] = useState("대졸 이상");
    const [occupation, setOccupation] = useState("사무직/관리직");
    const [gender, setGender] = useState("");
    const [age, setAge] = useState("");
    const [maritalStatus, setMaritalStatus] = useState("미혼");
    const [height, setHeight] = useState("");
    const [weight, setWeight] = useState("");

    const toggleType = (k) => {
        setTobaccoTypes((prev) =>
            prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
        );
    };

    const loadExisting = async () => {
        if (!resolvedUserId) return;

        setLoadingInit(true);
        try {
            const res = await axios.get(`/api/membership/extra/${resolvedUserId}`);
            const d = res.data;
            if (!d) return;

            setAvgCigs(numToInput(d.avg_cigs_per_day));
            setQuitAttempts(numToInput(d.quit_attempts_1y_over_1day));
            setSmokingDays30(numToInput(d.smoking_days_last_30));

            setHomeExposed(d.shs_home_exposed ?? null);
            setWorkExposed(d.shs_work_exposed ?? null);

            setHeight(numToInput(d.height_cm));
            setWeight(numToInput(d.weight_kg));
            setGender(d.gender || "");
            if (d.birth_year) {
                setAge(String(new Date().getFullYear() - d.birth_year));
            }
            if (d.marital_status === "WITH_SPOUSE") setMaritalStatus("기혼");
            else if (d.marital_status === "WITHOUT_SPOUSE") setMaritalStatus("미혼");
            else setMaritalStatus("미혼");

            if (d.shs_home_minutes_per_day != null) {
                setHomeHoursWeek(String((d.shs_home_minutes_per_day * 7) / 60));
            } else {
                setHomeHoursWeek("");
            }

            if (d.shs_work_minutes_per_day != null) {
                setWorkHoursWeek(String((d.shs_work_minutes_per_day * 7) / 60));
            } else {
                setWorkHoursWeek("");
            }

            setWorkHiDays(numToInput(d.work_high_intensity_days_per_week));
            setLeisDays(numToInput(d.leisure_moderate_days_per_week));

            if (d.work_high_intensity_minutes_per_day != null) {
                setWorkHiHours(String(d.work_high_intensity_minutes_per_day / 60));
            } else {
                setWorkHiHours("");
            }

            if (d.leisure_moderate_minutes_per_day != null) {
                setLeisHours(String(d.leisure_moderate_minutes_per_day / 60));
            } else {
                setLeisHours("");
            }

            setStress(d.stress_awareness_level ?? "보통");
            setBodyShape(d.body_shape_perception ?? "보통");
            setHouseType(d.household_type ?? "무부");

            try {
                const note = d.note ? JSON.parse(d.note) : null;

                if (note?.smoking_start_age != null) setStartAge(String(note.smoking_start_age));
                else setStartAge("");

                if (Array.isArray(note?.tobacco_types) && note.tobacco_types.length > 0) {
                    setTobaccoTypes(note.tobacco_types);
                } else {
                    setTobaccoTypes(["cigarette"]);
                }

                if (note?.alcohol_freq_label) setAlcoholLabel(note.alcohol_freq_label);
                if (note?.binge_freq_label) setBingeLabel(note.binge_freq_label);

                const lifeCodeToKr = { NONE: "피운 적 없음", LT_5PACKS: "5갑(100개비) 미만", GE_5PACKS: "5갑(100개비) 이상" };
                if (note?.lifetime_smoking) setLifetimeSmoking(lifeCodeToKr[note.lifetime_smoking] || "5갑(100개비) 이상");

                // 학력·직업은 user_profile 정식 컬럼(GET /extra 응답 최상위 d)에서 읽는다
                const eduDbToOption = { "초졸이하": "초졸 이하", "중졸": "중졸", "고졸": "고졸", "대졸이상": "대졸 이상", "무응답": "대졸 이상" };
                const occCodeToKr = { WORKER: "사무직/관리직", SELF_EMPLOYED: "자영업", STUDENT: "학생", UNEMPLOYED: "무직/주부", OTHER: "기타" };
                if (d.education_level) setEducation(eduDbToOption[d.education_level] || "대졸 이상");
                if (d.occupation_type) setOccupation(occCodeToKr[d.occupation_type] || "사무직/관리직");
            } catch {}
        } catch (e) {
            console.log(e);
        } finally {
            setLoadingInit(false);
        }
    };

    useEffect(() => {
        loadExisting();
    }, [resolvedUserId]);

    const submit = async () => {
        if (!resolvedUserId) {
            alert("user_id가 없습니다. (회원가입 후 user_id 저장/전달 확인 필요)");
            return;
        }

        const payload = {
            user_id: resolvedUserId,
            gender: gender,
            age: toNumOrNull(age),
            marital_status: maritalStatus,
            height: toNumOrNull(height),
            weight: toNumOrNull(weight),
            avg_cigs_per_day: toNumOrNull(avgCigs),
            quit_attempts_1y_over_1day: toNumOrNull(quitAttempts),
            smoking_days_last_30: toNumOrNull(smokingDays30),
            smoking_start_age: toNumOrNull(startAge),
            tobacco_types: tobaccoTypes,
            shs_home_exposed: homeExposed,
            shs_home_hours_per_week: toNumOrNull(homeHoursWeek),
            shs_work_exposed: workExposed,
            shs_work_hours_per_week: toNumOrNull(workHoursWeek),
            alcohol_freq_label: alcoholLabel,
            binge_freq_label: bingeLabel,
            work_high_intensity_days_per_week: toNumOrNull(workHiDays),
            work_high_intensity_hours_per_day: toNumOrNull(workHiHours),
            leisure_moderate_days_per_week: toNumOrNull(leisDays),
            leisure_moderate_hours_per_day: toNumOrNull(leisHours),
            stress_awareness_level: stress,
            household_type: houseType,
            body_shape_perception: bodyShape,
            education_level: education,
            occupation_type: occupation,
            lifetime_smoking: lifetimeSmoking,
        };

        setLoading(true);
        try {
            await axios.post("/api/membership/extra", payload);
            window.location.reload();
        } catch (e) {
            console.log("STATUS", e?.response?.status);
            console.log("RAW", e?.response?.data);
            alert(
                typeof e?.response?.data === "object"
                    ? JSON.stringify(e?.response?.data, null, 2)
                    : errMsg(e)
            );
        } finally {
            setLoading(false);
        }
    };

    if (loadingInit) {
        return <AppLoadingScreen title="세부 정보를 불러오고 있습니다" />;
    }

    return (
        <div className="min-h-screen px-4 pt-20 pb-10 text-left bg-slate-50">
            <div className="mx-auto max-w-3xl space-y-4">
                {/* 상단 헤더 (뒤로가기 추가) */}
                <div className="mb-4 flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                    >
                        <FaArrowLeft />
                    </button>

                    <div>
                        <h1 className="text-xl font-bold text-slate-900">세부 정보 수정</h1>
                        <p className="text-sm text-slate-500">
                            생활 습관 등 추가 정보를 수정할 수 있어요
                        </p>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[28px] bg-blue-600 p-6 text-white">
                    <p className="text-sm font-medium text-white/80">추가 회원 정보</p>
                    <h1 className="mt-1 text-2xl font-bold">건강 생활 습관을 알려주세요</h1>
                    <p className="mt-2 text-sm leading-6 text-white/90">
                        입력한 정보는 맞춤형 금연 AI추천과 금연 컨설팅 품질 향상을 위해 활용됩니다.
                    </p>
                </div>

                <Accordion
                    title="흡연 정보"
                    desc="흡연량, 금연 시도, 담배 종류를 입력해 주세요"
                    icon={<FaSmoking />}
                    defaultOpen
                >
                    <div className="space-y-4">
                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>하루 평균 흡연량(개비/일)</Label>
                                    <TextInput value={avgCigs} onChange={setAvgCigs} placeholder="예: 15" />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>1년간 하루 이상 금연 경험(횟수)</Label>
                                    <TextInput value={quitAttempts} onChange={setQuitAttempts} placeholder="예: 3" />
                                </FieldCard>
                            }
                        />

                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>최근 한 달간 흡연 일수(일)</Label>
                                    <TextInput value={smokingDays30} onChange={setSmokingDays30} placeholder="0~30" />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>흡연 시작 연령</Label>
                                    <TextInput value={startAge} onChange={setStartAge} placeholder="예: 20" />
                                </FieldCard>
                            }
                        />

                        <FieldCard>
                            <Label>담배 종류</Label>
                            <div className="flex flex-wrap gap-2">
                                <CheckPill
                                    label="궐련"
                                    checked={tobaccoTypes.includes("cigarette")}
                                    onChange={() => toggleType("cigarette")}
                                />
                                <CheckPill
                                    label="전자담배(액상형)"
                                    checked={tobaccoTypes.includes("vape")}
                                    onChange={() => toggleType("vape")}
                                />
                                <CheckPill
                                    label="가열담배(궐련형)"
                                    checked={tobaccoTypes.includes("heated")}
                                    onChange={() => toggleType("heated")}
                                />
                            </div>
                        </FieldCard>

                        <FieldCard>
                            <Label>평생 흡연량 (지금까지 피운 총량)</Label>
                            <Select
                                value={lifetimeSmoking}
                                onChange={setLifetimeSmoking}
                                options={["피운 적 없음", "5갑(100개비) 미만", "5갑(100개비) 이상"]}
                            />
                        </FieldCard>
                    </div>
                </Accordion>

                <Accordion
                    title="간접흡연 노출"
                    desc="가정과 직장에서의 간접흡연 노출 정보를 입력해 주세요"
                    icon={<FaHome />}
                    defaultOpen={false}
                >
                    <div className="space-y-4">
                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>가정 실내 간접흡연 노출 여부</Label>
                                    <YesNo value={homeExposed} onChange={setHomeExposed} />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>노출 시간(시간/주)</Label>
                                    <TextInput value={homeHoursWeek} onChange={setHomeHoursWeek} placeholder="예: 5" />
                                </FieldCard>
                            }
                        />

                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>직장 내 간접흡연 노출 여부</Label>
                                    <YesNo value={workExposed} onChange={setWorkExposed} />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>노출 시간(시간/주)</Label>
                                    <TextInput value={workHoursWeek} onChange={setWorkHoursWeek} placeholder="예: 10" />
                                </FieldCard>
                            }
                        />
                    </div>
                </Accordion>

                <Accordion
                    title="음주"
                    desc="평소 음주 빈도와 폭음 빈도를 선택해 주세요"
                    icon={<FaWineBottle />}
                    defaultOpen={false}
                >
                    <TwoCol
                        left={
                            <FieldCard>
                                <Label>음주 빈도</Label>
                                <Select
                                    value={alcoholLabel}
                                    onChange={setAlcoholLabel}
                                    options={["전혀 안 함", "월 1회 미만", "월 2~4회", "주 2~3회", "주 4회 이상", "매일"]}
                                />
                            </FieldCard>
                        }
                        right={
                            <FieldCard>
                                <Label>폭음 빈도(7잔 이상)</Label>
                                <Select
                                    value={bingeLabel}
                                    onChange={setBingeLabel}
                                    options={["전혀 없음", "월 1회 미만", "월 1회", "월 2~3회", "주 1회", "주 2회 이상"]}
                                />
                            </FieldCard>
                        }
                    />
                </Accordion>

                <Accordion
                    title="신체활동"
                    desc="주간 운동 습관을 입력해 주세요"
                    icon={<FaHeartbeat />}
                    defaultOpen={false}
                >
                    <div className="space-y-4">
                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>고강도 신체활동 일수(일/주)</Label>
                                    <TextInput value={workHiDays} onChange={setWorkHiDays} placeholder="예: 0" />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>고강도 신체활동 시간(시간/일)</Label>
                                    <TextInput value={workHiHours} onChange={setWorkHiHours} placeholder="예: 0.0" />
                                </FieldCard>
                            }
                        />

                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>여가 중강도 활동 일수(일/주)</Label>
                                    <TextInput value={leisDays} onChange={setLeisDays} placeholder="예: 3" />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>여가 중강도 활동 시간(시간/일)</Label>
                                    <TextInput value={leisHours} onChange={setLeisHours} placeholder="예: 1.5" />
                                </FieldCard>
                            }
                        />
                    </div>
                </Accordion>

                {/* 신체 정보(키/몸무게)는 '기본 정보' 화면(basic.jsx)에서 수정합니다.
                    여기와 중복되어 세부정보에 기본정보가 같이 뜨는 문제가 있어 제거했습니다.
                    값 자체는 서버에서 불러와 저장 시 그대로 유지됩니다. */}

                <Accordion
                    title="사회·심리"
                    desc="생활환경과 심리 상태를 선택해 주세요"
                    icon={<FaUsers />}
                    defaultOpen={false}
                >
                    <div className="space-y-4">
                        <FieldCard>
                            <Label>기혼 여부</Label>
                            <Select
                                value={maritalStatus}
                                onChange={setMaritalStatus}
                                options={["미혼", "기혼", "기타"]}
                            />
                        </FieldCard>

                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>스트레스 인지</Label>
                                    <Select
                                        value={stress}
                                        onChange={setStress}
                                        options={["매우 낮음", "낮음", "보통", "높음", "매우 높음"]}
                                    />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>세대유형</Label>
                                    <Select
                                        value={houseType}
                                        onChange={setHouseType}
                                        options={["무부", "부부", "부부+자녀", "한부모", "1인가구", "기타"]}
                                    />
                                </FieldCard>
                            }
                        />

                        <TwoCol
                            left={
                                <FieldCard>
                                    <Label>학력</Label>
                                    <Select
                                        value={education}
                                        onChange={setEducation}
                                        options={["초졸 이하", "중졸", "고졸", "대졸 이상"]}
                                    />
                                </FieldCard>
                            }
                            right={
                                <FieldCard>
                                    <Label>직업</Label>
                                    <Select
                                        value={occupation}
                                        onChange={setOccupation}
                                        options={["사무직/관리직", "자영업", "학생", "무직/주부", "기타"]}
                                    />
                                </FieldCard>
                            }
                        />
                    </div>
                </Accordion>

                <div className="sticky bottom-4">
                    <div className="rounded-3xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
                        <button
                            type="button"
                            onClick={submit}
                            disabled={loading || loadingInit}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-4 text-base font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <FaSave />
                            {loading ? "저장 중..." : "추가 정보 저장하기"}
                        </button>
                    </div>
                </div>

                <p className="pb-4 text-center text-xs leading-5 text-slate-500">
                    추가 정보는 맞춤 추천 목적에만 사용되며 언제든지 수정할 수 있습니다.
                </p>
            </div>
        </div>
    );
}
