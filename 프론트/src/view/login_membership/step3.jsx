import { useState } from "react";
import axios from "src/api/axios";
import { FaChevronDown } from "react-icons/fa";
import {useNavigate} from "react-router-dom";

const errMsg = (e) =>
    e?.response?.data?.detail || e?.message || "요청에 실패했습니다.";

function Accordion({ title, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-xl border border-blue-300 bg-white">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 font-bold text-slate-800 bg-blue-50 rounded-xl"
            >
                <span>{title}</span>
                <FaChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <div className="px-4 pb-4 pt-3">{children}</div>}
        </div>
    );
}

function TwoCol({ left, right }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>{left}</div>
            <div>{right}</div>
        </div>
    );
}

function Label({ children }) {
    return <div className="text-sm font-medium text-slate-700 mb-2">{children}</div>;
}

function TextInput({ value, onChange, placeholder, type = "text" }) {
    return (
        <input
            className="w-full rounded-xl border border-slate-200 bg-white py-3 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full rounded-xl border border-slate-200 bg-white py-3 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
    const v = value === null ? "" : value ? "yes" : "no";
    return (
        <select
            value={v}
            onChange={(e) => {
                const x = e.target.value;
                if (x === "") onChange(null);
                else onChange(x === "yes");
            }}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            <option value="">예/아니오</option>
            <option value="yes">예</option>
            <option value="no">아니오</option>
        </select>
    );
}

function Check({ label, checked, onChange }) {
    return (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="w-4 h-4" checked={checked} onChange={onChange} />
            {label}
        </label>
    );
}

export default function Step3({ userId, gender, birthYear, onPrev, onSkip, onDone }) {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // 흡연
    const [avgCigs, setAvgCigs] = useState("");
    const [quitAttempts, setQuitAttempts] = useState("");
    const [smokingDays30, setSmokingDays30] = useState("");
    const [startAge, setStartAge] = useState("");
    const [tobaccoTypes, setTobaccoTypes] = useState(["cigarette"]);
    const [lifetimeSmoking, setLifetimeSmoking] = useState("5갑(100개비) 이상");

    // 간접흡연
    const [homeExposed, setHomeExposed] = useState(null);
    const [homeHoursWeek, setHomeHoursWeek] = useState("");
    const [workExposed, setWorkExposed] = useState(null);
    const [workHoursWeek, setWorkHoursWeek] = useState("");

    // 음주
    const [alcoholLabel, setAlcoholLabel] = useState("월 2~4회");
    const [bingeLabel, setBingeLabel] = useState("월 1회 미만");

    // 신체활동
    const [workHiDays, setWorkHiDays] = useState("");
    const [workHiHours, setWorkHiHours] = useState("");
    const [leisDays, setLeisDays] = useState("");
    const [leisHours, setLeisHours] = useState("");

    // 사회·심리
    const [stress, setStress] = useState("보통");
    const [houseType, setHouseType] = useState("무부");
    const [bodyShape, setBodyShape] = useState("보통");
    const [maritalStatus, setMaritalStatus] = useState("미혼");
    const [education, setEducation] = useState("대졸 이상");
    const [occupation, setOccupation] = useState("사무직/관리직");
    const [height, setHeight] = useState("");
    const [weight, setWeight] = useState("");

    const toggleType = (k) => {
        setTobaccoTypes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    };

    const submitAndGoLogin = async () => {
        setLoading(true);
        try {
            await axios.post("/api/membership/extra", {
                user_id: userId,
                gender: gender,
                birth_year: birthYear,
                marital_status: maritalStatus,
                height: height === "" ? null : Number(height),
                weight: weight === "" ? null : Number(weight),
                avg_cigs_per_day: avgCigs === "" ? null : Number(avgCigs),
                quit_attempts_1y_over_1day: quitAttempts === "" ? null : Number(quitAttempts),
                smoking_days_last_30: smokingDays30 === "" ? null : Number(smokingDays30),
                smoking_start_age: startAge === "" ? null : Number(startAge),
                tobacco_types: tobaccoTypes,
                lifetime_smoking: lifetimeSmoking,
                shs_home_exposed: homeExposed,
                shs_home_hours_per_week: homeHoursWeek === "" ? null : Number(homeHoursWeek),
                shs_work_exposed: workExposed,
                shs_work_hours_per_week: workHoursWeek === "" ? null : Number(workHoursWeek),
                alcohol_freq_label: alcoholLabel,
                binge_freq_label: bingeLabel,
                work_high_intensity_days_per_week: workHiDays === "" ? null : Number(workHiDays),
                work_high_intensity_hours_per_day: workHiHours === "" ? null : Number(workHiHours),
                leisure_moderate_days_per_week: leisDays === "" ? null : Number(leisDays),
                leisure_moderate_hours_per_day: leisHours === "" ? null : Number(leisHours),
                stress_awareness_level: stress,
                household_type: houseType,
                body_shape_perception: bodyShape,
                education_level: education,
                occupation_type: occupation,
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            navigate("/login", { replace: true }); // 뒤로가기 시 Step3로 안 돌아가게
        }
    };

    return (
        <div>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">추가 정보(선택)</h1>
                    <p className="mt-2 text-slate-600">
                        입력하면 맞춤 분석 정확도가 높아집니다. 안받아도 나중에 수정할 수 있어요.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onSkip}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-700 whitespace-nowrap"
                >
                    나중에 입력하기
                </button>
            </div>

            <div className="mt-6 space-y-4">
                <Accordion title="흡연 정보" defaultOpen>
                    <div className="space-y-3">
                        <TwoCol
                            left={
                                <div>
                                    <Label>하루 평균 흡연량(개비/일)</Label>
                                    <TextInput value={avgCigs} onChange={setAvgCigs} placeholder="예: 15" />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>1년간 하루 이상 금연 경험(횟수)</Label>
                                    <TextInput value={quitAttempts} onChange={setQuitAttempts} placeholder="예: 3" />
                                </div>
                            }
                        />

                        <TwoCol
                            left={
                                <div>
                                    <Label>최근 한 달간 흡연 일수(일)</Label>
                                    <TextInput value={smokingDays30} onChange={setSmokingDays30} placeholder="0~30" />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>일반 담배(궐련) 흡연 시작 연령</Label>
                                    <TextInput value={startAge} onChange={setStartAge} placeholder="예: 20" />
                                </div>
                            }
                        />

                        <div>
                            <Label>담배 종류별 평생 사용 여부</Label>
                            <div className="flex flex-wrap gap-4">
                                <Check
                                    label="궐련"
                                    checked={tobaccoTypes.includes("cigarette")}
                                    onChange={() => toggleType("cigarette")}
                                />
                                <Check
                                    label="전자담배(액상형)"
                                    checked={tobaccoTypes.includes("vape")}
                                    onChange={() => toggleType("vape")}
                                />
                                <Check
                                    label="가열담배(궐련형)"
                                    checked={tobaccoTypes.includes("heated")}
                                    onChange={() => toggleType("heated")}
                                />
                            </div>
                        </div>

                        <div>
                            <Label>평생 흡연량 (지금까지 피운 총량)</Label>
                            <Select
                                value={lifetimeSmoking}
                                onChange={setLifetimeSmoking}
                                options={["피운 적 없음", "5갑(100개비) 미만", "5갑(100개비) 이상"]}
                            />
                        </div>
                    </div>
                </Accordion>

                <Accordion title="간접흡연 노출" defaultOpen={false}>
                    <div className="space-y-3">
                        <TwoCol
                            left={
                                <div>
                                    <Label>가정 실내 간접흡연 노출 여부</Label>
                                    <YesNo value={homeExposed} onChange={setHomeExposed} />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>노출 시간(시간/주)</Label>
                                    <TextInput value={homeHoursWeek} onChange={setHomeHoursWeek} placeholder="예: 5" />
                                </div>
                            }
                        />
                        <TwoCol
                            left={
                                <div>
                                    <Label>직장 내 간접흡연 노출 여부</Label>
                                    <YesNo value={workExposed} onChange={setWorkExposed} />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>노출 시간(시간/주)</Label>
                                    <TextInput value={workHoursWeek} onChange={setWorkHoursWeek} placeholder="예: 10" />
                                </div>
                            }
                        />
                    </div>
                </Accordion>

                <Accordion title="음주" defaultOpen={false}>
                    <div className="space-y-3">
                        <TwoCol
                            left={
                                <div>
                                    <Label>음주 빈도</Label>
                                    <Select
                                        value={alcoholLabel}
                                        onChange={setAlcoholLabel}
                                        options={["전혀 안 함","월 1회 미만","월 2~4회","주 2~3회","주 4회 이상","매일"]}
                                    />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>폭음 빈도(7잔 이상)</Label>
                                    <Select
                                        value={bingeLabel}
                                        onChange={setBingeLabel}
                                        options={["전혀 없음","월 1회 미만","월 1회","월 2~3회","주 1회","주 2회 이상"]}
                                    />
                                </div>
                            }
                        />
                    </div>
                </Accordion>

                <Accordion title="신체활동(평소 1주)" defaultOpen={false}>
                    <div className="space-y-3">
                        <TwoCol
                            left={
                                <div>
                                    <Label>평소 1주간 고강도 신체활동 일수(일/주)</Label>
                                    <TextInput value={workHiDays} onChange={setWorkHiDays} placeholder="예: 0" />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>평소 1주간 고강도 신체활동 시간(시간/일)</Label>
                                    <TextInput value={workHiHours} onChange={setWorkHiHours} placeholder="예: 0.0" />
                                </div>
                            }
                        />
                        <TwoCol
                            left={
                                <div>
                                    <Label>평소 1주간 여가 관련 중강도 신체활동 일수(일/주)</Label>
                                    <TextInput value={leisDays} onChange={setLeisDays} placeholder="예: 3" />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>평소 1주간 여가 관련 중강도 신체활동 시간(시간/일)</Label>
                                    <TextInput value={leisHours} onChange={setLeisHours} placeholder="예: 1.5" />
                                </div>
                            }
                        />
                    </div>
                </Accordion>

                <Accordion title="신체 정보" defaultOpen={false}>
                    <div className="space-y-3">
                        <TwoCol
                            left={
                                <div>
                                    <Label>키 (cm)</Label>
                                    <TextInput value={height} onChange={setHeight} placeholder="예: 175" type="number" />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>몸무게 (kg)</Label>
                                    <TextInput value={weight} onChange={setWeight} placeholder="예: 70" type="number" />
                                </div>
                            }
                        />
                    </div>
                </Accordion>

                <Accordion title="사회·심리" defaultOpen={false}>
                    <div className="space-y-3">
                        <div>
                            <Label>기혼 여부</Label>
                            <Select
                                value={maritalStatus}
                                onChange={setMaritalStatus}
                                options={["미혼", "기혼", "기타"]}
                            />
                        </div>
                        <TwoCol
                            left={
                                <div>
                                    <Label>스트레스 인지</Label>
                                    <Select
                                        value={stress}
                                        onChange={setStress}
                                        options={["매우 낮음","낮음","보통","높음","매우 높음"]}
                                    />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>세대유형</Label>
                                    <Select
                                        value={houseType}
                                        onChange={setHouseType}
                                        options={["무부","부부","부부+자녀","한부모","1인가구","기타"]}
                                    />
                                </div>
                            }
                        />
                        <TwoCol
                            left={
                                <div>
                                    <Label>학력</Label>
                                    <Select
                                        value={education}
                                        onChange={setEducation}
                                        options={["초졸 이하","중졸","고졸","대졸 이상"]}
                                    />
                                </div>
                            }
                            right={
                                <div>
                                    <Label>직업</Label>
                                    <Select
                                        value={occupation}
                                        onChange={setOccupation}
                                        options={["사무직/관리직","자영업","학생","무직/주부","기타"]}
                                    />
                                </div>
                            }
                        />
                    </div>
                </Accordion>

                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => navigate("/login", { replace: true })}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-700 whitespace-nowrap"
                    >
                        나중에 입력하기
                    </button>
                    <button
                        type="button"
                        onClick={submitAndGoLogin}
                        disabled={loading}
                        className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "이동 중..." : "가입 완료"}
                    </button>
                </div>

                <p className="text-xs text-slate-500 text-center">
                    추가 정보는 맞춤 추천 목적에만 사용되며 언제든지 수정할 수 있습니다.
                </p>
            </div>
        </div>
    );
}
