import React, { useEffect, useMemo, useState } from "react";
import axios from "src/api/axios";
import { useNavigate } from "react-router-dom";
import {
    FaArrowRight,
    FaLungs,
    FaWind,
    FaWalking,
    FaRegChartBar,
    FaHeartbeat,
} from "react-icons/fa";
import { GiPiggyBank, GiNoseFront } from "react-icons/gi";
import { MdSmokingRooms } from "react-icons/md";
import SavingsCalculator from "src/view/no_smoking/SavingsCalculator";
import AppLoadingScreen from "src/componts/common/AppLoadingScreen";

function getUserFromStorage() {
    try {
        const raw = localStorage.getItem("user");
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function formatDateInput(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function getErrorMessage(e) {
    const detail = e?.response?.data?.detail;

    if (Array.isArray(detail)) {
        return detail.map((item) => item.msg).join(", ");
    }

    if (typeof detail === "string") {
        return detail;
    }

    return e?.message || "요청에 실패했습니다.";
}

function calcQuitDays(startDate) {
    if (!startDate) return 0;

    const today = new Date();
    const start = new Date(startDate);

    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);

    const diff = today - start;
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

function addMonthsToDate(dateString, months = 6) {
    if (!dateString) return "";

    const d = new Date(dateString);
    const originalDate = d.getDate();

    d.setMonth(d.getMonth() + months);

    if (d.getDate() !== originalDate) {
        d.setDate(0);
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("ko-KR");
}

function getRecoveryScore(days) {
    if (days <= 0) return 0;
    return Math.min(100, Math.round((days / 360) * 100));
}

function getWeeklyChange(days) {
    if (days <= 0) return 0;
    return Math.min(7, Math.max(1, Math.round(days / 7)));
}

function getRecoveryStages(days) {
    return [
        {
            title: "1~3일",
            sub: "혈압/맥박 안정",
            desc: "혈압과 맥박이 정상 수준으로 떨어집니다.",
            min: 1,
            max: 3,
            icon: <FaHeartbeat />,
        },
        {
            title: "3~7일",
            sub: "일산화탄소 감소",
            desc: "혈액 속 일산화탄소 수치가 정상으로 회복됩니다.",
            min: 3,
            max: 7,
            icon: <FaWind />,
        },
        {
            title: "1~2주",
            sub: "미각/후각 개선",
            desc: "손상된 신경 말단이 재생되며 감각이 돌아옵니다.",
            min: 7,
            max: 14,
            icon: <GiNoseFront />,
        },
        {
            title: "2~4주",
            sub: "호흡 곤란 완화",
            desc: "폐 기능이 향상되어 숨쉬기가 편해집니다.",
            min: 14,
            max: 28,
            icon: <FaLungs />,
        },
        {
            title: "1~3개월",
            sub: "폐 기능 회복",
            desc: "폐활량이 증가하고 감염 위험이 줄어듭니다.",
            min: 30,
            max: 90,
            icon: <FaLungs />,
        },
        {
            title: "3~9개월",
            sub: "기침/피로 감소",
            desc: "에너지 수준이 높아지고 전반적인 건강이 개선됩니다.",
            min: 90,
            max: 270,
            icon: <FaWalking />,
        },
    ].map((item) => {
        let status = "예정";
        if (days > item.max) status = "완료";
        else if (days >= item.min && days <= item.max) status = "진행중";

        return { ...item, status };
    });
}

function getWeeklySavingsTrend(totalSavedMoney) {
    const base = Number(totalSavedMoney || 0);
    return [
        Math.round(base * 0.55),
        Math.round(base * 0.68),
        Math.round(base * 0.84),
        Math.round(base),
    ];
}

function StatusBadge({ status }) {
    const map = {
        완료: "bg-blue-100 text-blue-700",
        진행중: "bg-amber-100 text-amber-700",
        예정: "bg-slate-100 text-slate-500",
    };

    return (
        <span
            className={`inline-flex min-w-[58px] justify-center rounded-full px-2.5 py-1 text-xs font-bold ${map[status]}`}
        >
            {status}
        </span>
    );
}

function SummaryCard({ icon, label, value, subText, iconBg = "bg-blue-100", iconColor = "text-blue-600" }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg} ${iconColor} text-lg`}>
                    {icon}
                </div>
                <div className="text-xs font-bold text-slate-400">{label}</div>
            </div>

            <div className="mt-4 text-2xl font-black tracking-tight text-slate-900">
                {value}
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
                {subText}
            </div>
        </div>
    );
}

export default function Recovery() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [hasPlan, setHasPlan] = useState(false);

    const [userId, setUserId] = useState("");
    const [userName, setUserName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [baselineCigsPerDay, setBaselineCigsPerDay] = useState(20);
    const [cigsPerPack, setCigsPerPack] = useState(20);
    const [baselinePricePerPack, setBaselinePricePerPack] = useState(4500);

    useEffect(() => {
        const user = getUserFromStorage();

        if (!user) {
            setError("로그인 정보가 없습니다.");
            setLoading(false);
            return;
        }

        const uid = user.user_id || user.userId;
        const name = user.user_name || user.username || user.name || "";

        if (!uid) {
            setError("user_id를 찾을 수 없습니다.");
            setLoading(false);
            return;
        }

        setUserId(uid);
        setUserName(name);
        fetchSmokingDay(uid);
    }, []);

    const fetchSmokingDay = async (uid) => {
        try {
            setLoading(true);
            setError("");

            const res = await axios.get(`/api/SmokingDay/${uid}`);
            const data = res.data;

            setHasPlan(true);
            setStartDate(formatDateInput(data.start_date));
            setBaselineCigsPerDay(data.baseline_cigs_per_day ?? 20);
            setBaselinePricePerPack(data.baseline_price_per_pack ?? 4500);
            setCigsPerPack(data.cigs_per_pack ?? 20);
        } catch (e) {
            if (e?.response?.status === 404) {
                setHasPlan(false);
            } else {
                setError(getErrorMessage(e));
            }
        } finally {
            setLoading(false);
        }
    };

    const targetEndDate = useMemo(() => addMonthsToDate(startDate, 6), [startDate]);
    const quitDays = useMemo(() => calcQuitDays(startDate), [startDate]);
    const recoveryScore = useMemo(() => getRecoveryScore(quitDays), [quitDays]);
    const weeklyChange = useMemo(() => getWeeklyChange(quitDays), [quitDays]);
    const recoveryStages = useMemo(() => getRecoveryStages(quitDays), [quitDays]);

    const savedCigs = useMemo(() => {
        return quitDays > 0 ? Number(baselineCigsPerDay || 0) * quitDays : 0;
    }, [baselineCigsPerDay, quitDays]);

    const savedPacks = useMemo(() => {
        if (!cigsPerPack) return 0;
        return Math.floor(savedCigs / Number(cigsPerPack));
    }, [savedCigs, cigsPerPack]);

    const totalSavedMoney = useMemo(() => {
        if (!baselinePricePerPack || !cigsPerPack) return 0;
        const perCig = Number(baselinePricePerPack) / Number(cigsPerPack);
        return Math.round(savedCigs * perCig);
    }, [savedCigs, baselinePricePerPack, cigsPerPack]);

    const weeklyTrend = useMemo(() => {
        return getWeeklySavingsTrend(totalSavedMoney);
    }, [totalSavedMoney]);

    const handleSaveSmokingInfo = async () => {
        if (!userId) {
            setError("user_id가 없습니다.");
            return;
        }

        if (!startDate) {
            setError("금연 시작일이 없습니다.");
            return;
        }

        try {
            setSaving(true);
            setError("");

            if (!hasPlan) {
                await axios.post("/api/SmokingDay", {
                    user_id: userId,
                    start_date: startDate,
                    target_end_date: targetEndDate,
                    baseline_cigs_per_day: Number(baselineCigsPerDay),
                    baseline_price_per_pack: Number(baselinePricePerPack) || null,
                    cigs_per_pack: Number(cigsPerPack) || 20,
                    smoke_free_goal_hours: 24,
                    quit_methods: [],
                    nicotine_type: null,
                });
            } else {
                await axios.put("/api/SmokingDay", {
                    user_id: userId,
                    start_date: startDate,
                    target_end_date: targetEndDate,
                    baseline_cigs_per_day: Number(baselineCigsPerDay),
                    baseline_price_per_pack: Number(baselinePricePerPack) || null,
                    cigs_per_pack: Number(cigsPerPack) || 20,
                });
            }

            alert("저장되었습니다.");
            await fetchSmokingDay(userId);
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const maxBar = Math.max(...weeklyTrend, 1);

    if (loading) {
        return (
            <AppLoadingScreen
                title="회복 리포트를 불러오고 있습니다"
            />
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            <div className="mx-auto w-full max-w-md">
                {/* 상단 여백만 확보 */}
                <div className="pt-16"></div>

                <div className="space-y-4 px-4">
                    {/* 금연 회복 정도 */}
                    <section className="rounded-[28px] bg-blue-600 px-5 py-5 text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-blue-100">
                                    금연 회복 정도
                                </div>
                                <div className="mt-2 text-4xl font-black tracking-tight">
                                    {recoveryScore}%
                                </div>
                                <div className="mt-1 text-sm text-blue-100">
                                    금연 D+{quitDays} 기준 회복 상태
                                </div>
                            </div>

                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-2xl">
                                <FaLungs />
                            </div>
                        </div>

                        <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/25">
                            <div
                                className="h-full rounded-full bg-white"
                                style={{ width: `${recoveryScore}%` }}
                            />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-white/15 px-4 py-3">
                                <div className="text-xs font-semibold text-blue-100">금연 일수</div>
                                <div className="mt-1 text-xl font-black">D+{quitDays}</div>
                            </div>
                            <div className="rounded-2xl bg-white/15 px-4 py-3">
                                <div className="text-xs font-semibold text-blue-100">이번 주 변화</div>
                                <div className="mt-1 text-xl font-black">+{weeklyChange}</div>
                            </div>
                        </div>
                    </section>

                    {/* 요약 카드 */}
                    <section className="grid grid-cols-3 gap-3">
                        <SummaryCard
                            icon={<MdSmokingRooms />}
                            label="금연"
                            value={`D+${quitDays}`}
                            subText={startDate ? `${startDate} 시작` : "시작일 없음"}
                            iconBg="bg-blue-100"
                            iconColor="text-blue-600"
                        />
                        <SummaryCard
                            icon={<FaHeartbeat />}
                            label="회복"
                            value={`${recoveryScore}/100`}
                            subText="신체 회복 점수"
                            iconBg="bg-rose-100"
                            iconColor="text-rose-600"
                        />
                        <SummaryCard
                            icon={<FaRegChartBar />}
                            label="변화"
                            value={`+${weeklyChange}`}
                            subText="이번 주 변화"
                            iconBg="bg-emerald-100"
                            iconColor="text-emerald-600"
                        />
                    </section>

                    <section className="rounded-[28px] border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-sm font-semibold text-rose-500">
                                    워치 연동 건강 데이터
                                </div>
                                <div className="mt-2 text-xl font-black tracking-tight text-slate-900">
                                    사용자 심박수 기록 보기
                                </div>
                                <div className="mt-2 text-sm leading-6 text-slate-500">
                                    워치에서 받은 최근 심박수를 저장하고, 시간대별 기록을 확인할 수 있습니다.
                                </div>
                            </div>

                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 text-lg">
                                <FaHeartbeat />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate("/heartrate")}
                            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 text-sm font-bold text-white transition hover:bg-rose-600"
                        >
                            심박수 리포트 열기
                            <FaArrowRight />
                        </button>
                    </section>

                    {/* 절약 금액 (통합형 계산기로 교체) */}
                    <SavingsCalculator 
                        quitDays={quitDays} 
                        baselineCigsPerDay={baselineCigsPerDay} 
                        setBaselineCigsPerDay={setBaselineCigsPerDay}
                        baselinePricePerPack={baselinePricePerPack} 
                        setBaselinePricePerPack={setBaselinePricePerPack}
                        startDate={startDate}
                        setStartDate={setStartDate}
                        onSave={handleSaveSmokingInfo}
                        saving={saving}
                    />

                    {/* 주간 절약 추이 그래프 */}
                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                                <FaRegChartBar />
                            </div>
                            <div>
                                <div className="text-base font-extrabold text-slate-900">
                                    주간 절약 추이
                                </div>
                                <div className="text-sm text-slate-500">
                                    최근 4주 절약 금액 변화
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex h-52 items-end justify-between gap-3">
                            {weeklyTrend.map((value, idx) => {
                                const height = Math.max(28, Math.round((value / maxBar) * 145));
                                const labels = ["4주 전", "3주 전", "2주 전", "이번 주"];

                                return (
                                    <div
                                        key={labels[idx]}
                                        className="flex flex-1 flex-col items-center justify-end"
                                    >
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">
                                            {formatNumber(value)}원
                                        </div>

                                        <div
                                            className={`w-full max-w-[52px] rounded-t-2xl transition-all ${
                                                idx === 3 ? "bg-blue-600" : "bg-slate-200"
                                            }`}
                                            style={{ height: `${height}px` }}
                                        />

                                        <div className="mt-3 text-xs font-bold text-slate-500">
                                            {labels[idx]}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* 회복 단계 */}
                    <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="px-1 pb-2">
                            <div className="text-base font-extrabold text-slate-900">
                                회복 단계
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                                금연 경과에 따른 일반적인 신체 변화를 보여줍니다.
                            </div>
                        </div>

                        <div className="mt-2 space-y-3">
                            {recoveryStages.map((item) => (
                                <div
                                    key={item.title + item.sub}
                                    className="flex items-center gap-3 rounded-3xl bg-slate-50 px-4 py-4"
                                >
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-lg text-slate-600">
                                        {item.icon}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-black text-slate-900">
                                                    {item.title}
                                                </div>
                                                <div className="text-sm font-bold text-slate-700">
                                                    {item.sub}
                                                </div>
                                            </div>

                                            <StatusBadge status={item.status} />
                                        </div>

                                        <div className="mt-1 text-sm leading-5 text-slate-500">
                                            {item.desc}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="mt-4 px-1 text-xs text-slate-400">
                            회복 단계는 일반적 가이드이며 개인차가 있습니다.
                        </p>
                    </section>

                    {/* 에러 메시지 */}
                    {error && (
                        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                            {error}
                        </div>
                    )}
                    </div>
                    </div>
                    </div>
                    );
                    }
