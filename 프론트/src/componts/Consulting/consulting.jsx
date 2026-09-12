import React, { useEffect, useState } from "react";
import axios from "src/api/axios";
import {
    HiOutlineExclamationTriangle,
    HiOutlineSparkles,
    HiOutlineArrowPath,
    HiOutlineCheckCircle,
} from "react-icons/hi2";
import AppLoadingScreen from "src/componts/common/AppLoadingScreen";

function getFailureStyle(percent) {
    // percent = 금연 실패(재흡연) 가능성(%). 낮을수록 긍정적. 모델 베이스라인이 ~50%라 46~54%는 중립으로 둔다.
    if (percent <= 45) return { text: "비교적 안정적인 상태예요", ring: "border-emerald-200", bg: "bg-emerald-50", textColor: "text-emerald-600", subText: "금연 유지 흐름이 괜찮아요." };
    if (percent <= 55) return { text: "지표가 뚜렷하지 않아요", ring: "border-slate-200", bg: "bg-slate-50", textColor: "text-slate-600", subText: "현재 정보로는 실패 가능성이 평균 수준이에요." };
    if (percent <= 69) return { text: "조금 더 관리가 필요해요", ring: "border-amber-200", bg: "bg-amber-50", textColor: "text-amber-600", subText: "흡연 욕구가 다시 강해질 수 있어요." };
    return { text: "주의가 필요한 상태예요", ring: "border-rose-200", bg: "bg-rose-50", textColor: "text-rose-600", subText: "재흡연 가능성이 비교적 높게 보여요." };
}

function ConsultingBlock({ icon, title, text, color = "blue" }) {
    const colorMap = {
        blue: { wrap: "bg-blue-50", iconBox: "bg-white", iconColor: "text-blue-600" },
        emerald: { wrap: "bg-emerald-50", iconBox: "bg-white", iconColor: "text-emerald-600" },
        violet: { wrap: "bg-violet-50", iconBox: "bg-white", iconColor: "text-violet-600" },
    };
    const style = colorMap[color];
    return (
        <div className={`rounded-2xl p-4 ${style.wrap}`}>
            <div className="flex items-start gap-4">
                <div className={`mt-1 rounded-xl p-2 shadow-sm ${style.iconBox}`}><div className={style.iconColor}>{icon}</div></div>
                <div>
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
                </div>
            </div>
        </div>
    );
}

function getStoredUser() {
    try {
        const saved = localStorage.getItem("user");
        if (!saved) return null;
        return JSON.parse(saved);
    } catch {
        localStorage.removeItem("user");
        return null;
    }
}

function getUserId(user) {
    return user?.user_id || user?.userId || null;
}

export default function AiConsulting() {
    const [failurePercent, setFailurePercent] = useState(50);
    const [gptAdvice, setGptAdvice] = useState({ analysis: "", warning: "", strategy: "" });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [insufficient, setInsufficient] = useState(false);

    const parseGptResponse = (rawText) => {
        const safeText = typeof rawText === "string" ? rawText : "";
        const analysis = safeText.match(/\[분석\](.*?)(?=\[|$)/s)?.[1]?.trim() || "분석 데이터를 불러오는 중입니다.";
        const warning = safeText.match(/\[주의\](.*?)(?=\[|$)/s)?.[1]?.trim() || "유혹의 순간을 주의하세요.";
        const strategy = safeText.match(/\[전략\](.*?)(?=\[|$)/s)?.[1]?.trim() || "오늘도 금연 화이팅!";
        return { analysis, warning, strategy };
    };

    const loadSessionOrAnalyze = async (forceNew = false) => {
        setLoading(true);
        setError(null);
        setInsufficient(false);
        try {
            const user = getStoredUser();
            const userId = getUserId(user);

            if (!userId) {
                setError("로그인 정보가 없습니다. 다시 로그인해주세요.");
                return;
            }

            // 강제 분석이 아니면 기존 세션 먼저 조회
            if (!forceNew) {
                const sessionRes = await axios.get(`/api/gpt/session/${userId}`);
                if (sessionRes.data) {
                    // 저장된 risk_percent 는 '실패 위험도(%)' → 실패 가능성 그대로 표시
                    setFailurePercent(sessionRes.data.risk_percent ?? 0);
                    setGptAdvice(parseGptResponse(sessionRes.data.answer));
                    setLoading(false);
                    return;
                }
            }

            // 기존 데이터가 없거나 강제 분석인 경우 새로 분석 실행
            const aiRes = await axios.post("/api/ai/predict", { user_id: userId });

            // 프로필 정보가 부족하면 가짜 위험도 대신 입력 안내를 보여준다.
            if (aiRes.data.data_sufficient === false || aiRes.data.result == null) {
                setInsufficient(true);
                setLoading(false);
                return;
            }

            // result 는 '실패(재흡연) 확률'. 화면에는 실패 가능성 그대로 보여준다.
            const failureScore = Math.round(aiRes.data.result * 100);
            const risks = aiRes.data.top_risks || [];
            setFailurePercent(failureScore);

            // GPT/세션 저장은 기존대로 '실패 위험도(failureScore)' 기준을 유지한다.
            const riskInfo = risks.length > 0 ? `특히 ${risks.join(", ")} 요인이 위험해.` : "";
            const gptRes = await axios.post("/api/gpt/chat", {
                user_id: userId,
                message: `나의 금연 실패 위험도는 현재 ${failureScore}%야. ${riskInfo} 이 지표들을 바탕으로 나의 '현재 상태 분석', '주의해야 할 순간', '실천 전략'을 각각 한 문장씩 친절하게 조언해줘. 각 항목을 [분석], [주의], [전략] 태그로 구분해서 써줘.`
            });

            setGptAdvice(parseGptResponse(gptRes.data.answer));

        } catch (err) {
            console.error("분석 에러:", err);
            const detail = err?.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSessionOrAnalyze();
    }, []);

    if (loading) {
        return (
            <AppLoadingScreen
                title="맞춤 컨설팅을 불러오고 있어요"
                description="AI가 분석 결과와 상담 내용을 준비하고 있습니다."
            />
        );
    }

    const risk = getFailureStyle(failurePercent);

    return (
        <div className="min-h-screen bg-white flex justify-center">
            <div className="w-full max-w-md min-h-screen px-6 pt-10 pb-8">
                <div className="mt-2">
                    <p className="text-sm font-semibold text-blue-600">AI 맞춤 분석</p>
                    <h1 className="mt-2 text-3xl font-extrabold leading-tight text-slate-900">금연 컨설팅</h1>
                    {error && <p className="mt-3 text-sm text-red-500 font-medium">{error}</p>}
                </div>

                {insufficient ? (
                    <div className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-6">
                        <div className="flex items-start gap-4">
                            <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm">
                                <HiOutlineExclamationTriangle className="text-blue-600" size={24} />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">아직 분석할 정보가 부족해요</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    프로필(나이·성별·키·몸무게)과 건강 습관 정보를 입력하면
                                    더 정확한 금연 실패 가능성을 분석해 드릴 수 있어요.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                <>
                <div className={`mt-8 rounded-3xl border p-6 ${risk.ring} ${risk.bg}`}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-500">현재 금연 실패 가능성</p>
                            <div className="mt-3 flex items-end gap-2">
                                <span className={`text-5xl font-extrabold ${risk.textColor}`}>{failurePercent}%</span>
                            </div>
                            <p className={`mt-3 text-sm font-semibold ${risk.textColor}`}>{risk.text}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{risk.subText}</p>
                        </div>
                        <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm"><HiOutlineExclamationTriangle className={risk.textColor} size={24} /></div>
                    </div>
                </div>

                <div className="mt-8">
                    <div className="flex items-center gap-2">
                        <HiOutlineSparkles className="text-blue-600" size={20} />
                        <h2 className="text-lg font-bold text-slate-900">AI 전문 상담사 조언</h2>
                    </div>
                    <div className="mt-4 space-y-4">
                        <ConsultingBlock color="blue" icon={<HiOutlineSparkles size={20} />} title="현재 상태 분석" text={gptAdvice.analysis} />
                        <ConsultingBlock color="violet" icon={<HiOutlineArrowPath size={20} />} title="주의해야 할 순간" text={gptAdvice.warning} />
                        <ConsultingBlock color="emerald" icon={<HiOutlineCheckCircle size={20} />} title="나를 위한 전략" text={gptAdvice.strategy} />
                    </div>
                </div>
                </>
                )}

                <div className="mt-8">
                    <button type="button" onClick={() => loadSessionOrAnalyze(true)} className="h-14 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]">
                        AI 컨설팅 다시 받기
                    </button>
                </div>
            </div>
        </div>
    );
}
