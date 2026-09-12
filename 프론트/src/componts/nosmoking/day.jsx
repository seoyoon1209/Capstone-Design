import React, { useEffect, useMemo, useState } from "react";
import axios from "src/api/axios";
import { FaCalendarAlt, FaFlagCheckered } from "react-icons/fa";
import AppLoadingScreen from "../common/AppLoadingScreen";
import { syncQuitDaysToWatch } from "../../native/quitDaySync";

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

// 금연 시작일부터 오늘까지 경과일 계산
function calcQuitDays(startDate) {
    if (!startDate) return 0;

    const today = new Date();
    const start = new Date(startDate);

    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);

    const diff = today - start;
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}
// 두 날짜 사이 일수 계산
function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);

    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}
// 시작일 기준 1년 계산 (목표 종료일)
function addMonthsToDate(dateString, months = 12) {
    if (!dateString) return "";

    const d = new Date(dateString);
    const originalDate = d.getDate();

    d.setMonth(d.getMonth() + months);
// 월 넘어가면서 날짜 깨지는 경우 보정
    if (d.getDate() !== originalDate) {
        d.setDate(0);
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

const milestones = [
    { day: 1, label: "D+1", desc: "금연 시작" },
    { day: 7, label: "D+7", desc: "금단 증상 완화" },
    { day: 14, label: "D+14", desc: "폐 기능 개선 시작" },
    { day: 30, label: "D+30", desc: "호흡 안정화" },
    { day: 60, label: "D+60", desc: "체력 회복" },
    { day: 90, label: "D+90", desc: "습관 안정화" },
    { day: 180, label: "D+180", desc: "6개월 달성" },
    { day: 270, label: "D+270", desc: "장기 유지 단계" },
    { day: 365, label: "D+365", desc: "1년 달성" },
];

export default function SmokingDayPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasPlan, setHasPlan] = useState(false);
    const [error, setError] = useState("");
    const [userName, setUserName] = useState("");

    const [userId, setUserId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [baselineCigsPerDay, setBaselineCigsPerDay] = useState(10);
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
            setBaselineCigsPerDay(data.baseline_cigs_per_day ?? 10);
            setBaselinePricePerPack(data.baseline_price_per_pack ?? 4500);
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

    const targetEndDate = useMemo(() => {
        return addMonthsToDate(startDate, 12);
    }, [startDate]);

    const quitDays = useMemo(() => {
        return calcQuitDays(startDate);
    }, [startDate]);

    useEffect(() => {
        syncQuitDaysToWatch(quitDays);
    }, [quitDays]);

    const progress = useMemo(() => {
        if (!startDate || !targetEndDate) {
            return {
                percent: 0,
                remainingDays: 0,
                totalDays: 360,
            };
        }

        const totalDays = Math.max(1, daysBetween(startDate, targetEndDate));
        const elapsedDays = Math.max(
            0,
            Math.min(totalDays, daysBetween(startDate, new Date()))
        );
        const remainingDays = Math.max(0, daysBetween(new Date(), targetEndDate));
        const percent = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

        return {
            percent,
            remainingDays,
            totalDays,
        };
    }, [startDate, targetEndDate]);

    const handleSave = async () => {
        if (!userId) {
            setError("user_id가 없습니다.");
            return;
        }

        if (!startDate) {
            setError("금연 시작일을 선택해주세요.");
            return;
        }

        try {
            setSaving(true);
            setError("");

            const payload = {
                user_id: userId,
                start_date: startDate,
                target_end_date: targetEndDate || null,
                baseline_cigs_per_day: Number(baselineCigsPerDay),
                baseline_price_per_pack:
                    baselinePricePerPack === "" || baselinePricePerPack === null
                        ? null
                        : Number(baselinePricePerPack),
                cigs_per_pack: 20,
            };

            if (hasPlan) {
                await axios.put("/api/SmokingDay", payload);
                alert("금연 시작일이 수정되었습니다.");
            } else {
                await axios.post("/api/SmokingDay", {
                    ...payload,
                    smoke_free_goal_hours: 24,
                    quit_methods: [],
                    nicotine_type: null,
                });
                alert("금연 플랜이 생성되었습니다.");
            }

            await fetchSmokingDay(userId);
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <AppLoadingScreen
                title="금연 진행 상황을 불러오고 있습니다"
            />
        );
    }

    return (
        <div className="min-h-screen bg-white pb-24 overflow-x-hidden">
            {/* 상단 */}
            <section className="bg-white px-5 pt-20 pb-1">
                <h1 className="text-2xl tracking-tight text-slate-900 leading-tight">
                    {userName ? `${userName}님` : "사용자님"}
                </h1>
                <p className="text-2xl tracking-tight text-slate-900 leading-tight">
                    오늘도 하루도 노담 데이
                </p>
            </section>
            <div className="px-2 pt-4 space-y-1">
                <section className="rounded-3xl bg-blue-600 px-5 py-6 text-white ">
                    <div className="text-sm font-semibold text-blue-100">
                        현재 금연 진행일
                    </div>
                    <div className="mt-3 text-5xl font-black tracking-tight">
                        D+{quitDays}
                    </div>
                    <div className="mt-2 text-sm text-blue-100">
                        {startDate ? `${startDate}부터 금연 중` : "금연 시작일을 설정해주세요"}
                    </div>

                    <div className="mt-6">
                        <div className="flex items-center justify-between text-sm font-semibold text-blue-100">
                            <span>{progress.percent}% 달성</span>
                            <span>{progress.remainingDays}일 남음</span>
                        </div>

                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/25">
                            <div
                                className="h-full rounded-full bg-white transition-all duration-300"
                                style={{ width: `${progress.percent}%` }}
                            />
                        </div>
                    </div>
                </section>

                {/* 날짜 설정 카드 */}
                <section className="border-b border-slate-200 px-4 py-5 bg-white">
                    <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                            <FaCalendarAlt />
                        </span>
                        <div>
                            <div className="text-base font-extrabold text-slate-900">
                                금연 일정 설정
                            </div>
                            <div className="text-xs text-slate-500">
                                종료일은 시작일 기준 12개월 뒤로 자동 설정됩니다.
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-bold text-slate-700">
                                금연 시작일
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full border-0 border-b border-slate-300 px-0 py-3 text-base outline-none focus:border-blue-500 bg-transparent"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-bold text-slate-700">
                                목표 종료일
                            </label>
                            <input
                                type="date"
                                value={targetEndDate}
                                readOnly
                                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-0 py-3 text-base text-slate-600 outline-none"
                            />
                        </div>

                        {!hasPlan && (
                            <>
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700">
                                        기존 하루 흡연량
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="200"
                                        value={baselineCigsPerDay}
                                        onChange={(e) => setBaselineCigsPerDay(e.target.value)}
                                        className="w-full border-0 border-b border-slate-300 px-0 py-3 text-base outline-none focus:border-blue-500 bg-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700">
                                        담배 한 갑 가격
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={baselinePricePerPack}
                                        onChange={(e) => setBaselinePricePerPack(e.target.value)}
                                        className="w-full border-0 border-b border-slate-300 px-0 py-3 text-base outline-none focus:border-blue-500 bg-transparent"
                                    />
                                </div>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full rounded-2xl bg-blue-600 px-4 py-3.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "저장 중..." : hasPlan ? "시작일 수정하기" : "금연 플랜 시작하기"}
                        </button>
                    </div>
                </section>

                {/* 일정 요약 */}
                <section className="bg-white px-1 py-4">
                    <div className="border-b border-slate-200 pb-4">
                        <div className="text-base font-extrabold text-slate-900">일정 요약</div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <LineInfo title="시작일" value={startDate || "-"} />
                            <LineInfo title="목표일" value={targetEndDate || "-"} />
                            <LineInfo title="진행률" value={`${progress.percent}%`} />
                            <LineInfo title="남은 기간" value={`${progress.remainingDays}일`} />
                        </div>
                    </div>
                </section>

                {/* 진척도 */}
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-base font-extrabold text-slate-900">진척도</div>
                    <div className="mt-1 text-sm text-slate-500">
                        금연 단계별 목표를 확인하세요.
                    </div>

                    <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                        {milestones.map((item) => {
                            const done = quitDays >= item.day;

                            return (
                                <div
                                    key={item.day}
                                    className={`min-w-[108px] rounded-2xl border p-4 text-center shrink-0 ${
                                        done
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-slate-200 bg-slate-50"
                                    }`}
                                >
                                    <div className="text-sm font-extrabold text-slate-800">
                                        {item.label}
                                    </div>

                                    <div
                                        className={`mx-auto mt-3 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${
                                            done
                                                ? "border-blue-600 bg-blue-600 text-white"
                                                : "border-slate-300 bg-white text-slate-400"
                                        }`}
                                    >
                                        ✓
                                    </div>

                                    <div className="mt-3 text-xs font-medium leading-snug text-slate-600">
                                        {item.desc}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {error && (
                    <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
function LineInfo({ title, value }) {
    return (
        <div className="border-b border-slate-100 py-3">
            <div className="text-xs font-medium text-slate-500">{title}</div>
            <div className="mt-1 text-base font-bold text-slate-900">{value}</div>
        </div>
    );
}
