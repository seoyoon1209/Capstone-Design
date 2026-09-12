import React, { useEffect, useMemo, useState } from "react";
import axios from "src/api/axios";
import { useNavigate } from "react-router-dom";
import {
    FaArrowLeft,
    FaBluetoothB,
    FaHeartbeat,
    FaHistory,
    FaRegClock,
    FaSignal,
} from "react-icons/fa";
import AppLoadingScreen from "../common/AppLoadingScreen";
import { syncHeartRateToServer } from "../../native/heartRateSync";

function getUserFromStorage() {
    try {
        const raw = localStorage.getItem("user");
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function getErrorMessage(error) {
    const detail = error?.response?.data?.detail;

    if (Array.isArray(detail)) {
        return detail.map((item) => item.msg).join(", ");
    }

    if (typeof detail === "string") {
        return detail;
    }

    return error?.message || "심박수 정보를 불러오지 못했습니다.";
}

function formatMeasuredAt(value) {
    if (!value) return "측정 시간 없음";

    return new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function getHeartStatus(bpm) {
    if (!bpm) {
        return {
            label: "대기",
            desc: "워치에서 심박수를 보내면 여기에 최신 상태가 표시됩니다.",
            tone: "text-slate-500",
            bg: "bg-slate-100",
        };
    }

    if (bpm < 60) {
        return {
            label: "안정",
            desc: "낮은 편의 안정 심박수입니다.",
            tone: "text-blue-700",
            bg: "bg-blue-100",
        };
    }

    if (bpm <= 100) {
        return {
            label: "보통",
            desc: "일반적인 안정 범위에 가깝습니다.",
            tone: "text-emerald-700",
            bg: "bg-emerald-100",
        };
    }

    return {
        label: "상승",
        desc: "활동 직후이거나 긴장 상태일 수 있습니다.",
        tone: "text-rose-700",
        bg: "bg-rose-100",
    };
}

function MetricCard({ label, value, subText, icon, iconClassName }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconClassName}`}>
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

export default function HeartRate() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [userId, setUserId] = useState("");
    const [userName, setUserName] = useState("");
    const [latest, setLatest] = useState(null);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        const user = getUserFromStorage();

        if (!user) {
            navigate("/login", { replace: true });
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
        loadHeartRate(uid);
    }, [navigate]);

    const loadHeartRate = async (uid, isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError("");
            // 화면 조회 전에 워치의 최신 심박수를 먼저 백엔드에 동기화한다.
            await syncHeartRateToServer(uid);

            // 최신 1건과 최근 로그 목록을 동시에 요청해서 화면에 필요한 데이터를 채운다.
            const [latestRes, logsRes] = await Promise.allSettled([
                axios.get(`/api/UserHeart/${uid}/watch-latest`),
                axios.get(`/api/UserHeart/${uid}/watch-logs`, { params: { limit: 120 } }),
            ]);

            if (latestRes.status === "fulfilled") {
                setLatest(latestRes.value.data);
            } else if (latestRes.reason?.response?.status === 404) {
                setLatest(null);
            } else {
                throw latestRes.reason;
            }

            if (logsRes.status === "fulfilled") {
                setLogs(logsRes.value.data || []);
            } else if (logsRes.reason?.response?.status === 404) {
                setLogs([]);
            } else {
                throw logsRes.reason;
            }
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const stats = useMemo(() => {
        // 최근 로그 배열로 평균, 최소, 최대 BPM을 계산한다.
        if (!logs.length) {
            return {
                avg: 0,
                min: 0,
                max: 0,
            };
        }

        const values = logs.map((item) => Number(item.bpm || 0)).filter(Boolean);
        const total = values.reduce((sum, value) => sum + value, 0);

        return {
            avg: Math.round(total / values.length),
            min: Math.min(...values),
            max: Math.max(...values),
        };
    }, [logs]);

    const latestStatus = useMemo(() => getHeartStatus(latest?.bpm), [latest]);

    if (loading) {
        return (
            <AppLoadingScreen
                title="심박수 데이터를 불러오고 있습니다"
            />
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            <div className="mx-auto w-full max-w-md px-4 pt-16">
                <section className="rounded-[30px] bg-gradient-to-br from-rose-500 via-red-500 to-orange-400 px-5 py-5 text-white shadow-[0_18px_38px_rgba(244,63,94,0.28)]">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <button
                                type="button"
                                onClick={() => navigate("/recovery")}
                                className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white/95"
                            >
                                <FaArrowLeft />
                                회복 화면으로
                            </button>

                            <p className="mt-4 text-sm font-semibold text-white/80">
                                워치 심박수
                            </p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight">
                                {userName ? `${userName}님 심박 리포트` : "심박 리포트"}
                            </h1>
                            <p className="mt-2 text-sm leading-6 text-white/85">
                                Apple Watch에서 전달된 최근 심박수를 기준으로 앱에 표시합니다.
                            </p>
                        </div>

                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl">
                            <FaHeartbeat />
                        </div>
                    </div>

                    <div className="mt-6 rounded-3xl bg-white/14 p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-white/80">최신 심박수</div>
                                <div className="mt-2 text-5xl font-black tracking-tight">
                                    {latest?.bpm ? `${latest.bpm}` : "--"}
                                    <span className="ml-2 text-lg font-bold text-white/80">BPM</span>
                                </div>
                            </div>
                            <div className={`rounded-full px-3 py-1 text-sm font-bold ${latestStatus.bg} ${latestStatus.tone}`}>
                                {latestStatus.label}
                            </div>
                        </div>

                        <div className="mt-3 text-sm text-white/80">
                            {latestStatus.desc}
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-white/75">
                            <FaRegClock />
                            {latest ? formatMeasuredAt(latest.created_at) : "아직 동기화된 측정값이 없습니다."}
                        </div>
                    </div>
                </section>

                <section className="mt-4 grid grid-cols-3 gap-3">
                    <MetricCard
                        label="평균"
                        value={stats.avg ? `${stats.avg} BPM` : "--"}
                        subText="최근 20분 평균"
                        icon={<FaSignal className="text-emerald-600" />}
                        iconClassName="bg-emerald-100"
                    />
                    <MetricCard
                        label="최저"
                        value={stats.min ? `${stats.min} BPM` : "--"}
                        subText="최근 측정 최저값"
                        icon={<FaHeartbeat className="text-blue-600" />}
                        iconClassName="bg-blue-100"
                    />
                    <MetricCard
                        label="최고"
                        value={stats.max ? `${stats.max} BPM` : "--"}
                        subText="최근 측정 최고값"
                        icon={<FaHeartbeat className="text-rose-600" />}
                        iconClassName="bg-rose-100"
                    />
                </section>

                <section className="mt-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-extrabold text-slate-900">
                                워치 동기화 상태
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                                워치에서 보낸 최신 심박수를 앱이 받아 저장합니다.
                            </div>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                            <FaBluetoothB />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => loadHeartRate(userId, true)}
                        disabled={refreshing || !userId}
                        className="mt-5 h-12 w-full rounded-2xl bg-slate-900 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {refreshing ? "워치에서 다시 가져오는 중..." : "워치 데이터 다시 동기화"}
                    </button>
                </section>

                <section className="mt-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                            <FaHistory />
                        </div>
                        <div>
                            <div className="text-base font-extrabold text-slate-900">
                                최근 심박수 기록
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                                가장 최근에 저장된 심박수 5개
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {logs.length ? (
                            logs.slice(0, 5).map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between rounded-3xl bg-slate-50 px-4 py-4"
                                >
                                    <div className="min-w-0">
                                        <div className="text-lg font-black tracking-tight text-slate-900">
                                            {item.bpm} BPM
                                        </div>
                                        <div className="mt-1 text-sm text-slate-500">
                                            {formatMeasuredAt(item.created_at)}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="rounded-3xl bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                                아직 저장된 심박수 기록이 없습니다.
                                <br />
                                워치에서 심박수를 보내고 다시 동기화를 눌러주세요.
                            </div>
                        )}
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
