import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "src/api/axios";
import { FaArrowLeft, FaPhoneAlt, FaSave, FaUserFriends, FaPaperPlane } from "react-icons/fa";

const errMsg = (e) =>
    e?.response?.data?.detail || e?.message || "요청에 실패했습니다.";

export default function Supporter() {
    const navigate = useNavigate();
    const [supporterName, setSupporterName] = useState("");
    const [supporterPhone, setSupporterPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingInit, setLoadingInit] = useState(false);
    const [saved, setSaved] = useState(false);
    const [sending, setSending] = useState(false);

    const sendSms = async () => {
        if (!resolvedUserId) return alert("로그인 정보가 없습니다.");
        setSending(true);
        try {
            await axios.post("/api/sms/send", { user_id: resolvedUserId });
            alert("문자 발송 완료!");
        } catch (e) {
            alert(errMsg(e));
        } finally {
            setSending(false);
        }
    };

    const resolvedUserId = (() => {
        try {
            const u = JSON.parse(localStorage.getItem("user") || "null");
            return u?.user_id || u?.userId || null;
        } catch {
            return null;
        }
    })();

    // 기존 저장된 서포터 정보 불러오기
    useEffect(() => {
        if (!resolvedUserId) return;
        setLoadingInit(true);
        axios.get(`/api/sms/supporter/${resolvedUserId}`)
            .then((res) => {
                setSupporterName(res.data?.supporter_name || "");
                setSupporterPhone(res.data?.supporter_phone || "");
            })
            .catch(() => {}) // 없으면 그냥 빈 상태
            .finally(() => setLoadingInit(false));
    }, [resolvedUserId]);

    const submit = async () => {
        if (!supporterPhone.trim()) {
            alert("전화번호를 입력해주세요.");
            return;
        }
        if (!resolvedUserId) {
            alert("로그인 정보가 없습니다.");
            return;
        }

        setLoading(true);
        try {
            await axios.post("/api/sms/supporter", {
                user_id: resolvedUserId,
                supporter_name: supporterName,
                supporter_phone: supporterPhone,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            alert(errMsg(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen px-4 pt-20 pb-10">
            <div className="mx-auto max-w-md space-y-4">

                {/* 헤더 */}
                <div className="mb-4 flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                    >
                        <FaArrowLeft />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">금연 서포터</h1>
                        <p className="text-sm text-slate-500">응원해줄 지인의 연락처를 등록해요</p>
                    </div>
                </div>

                {/* 안내 배너 */}
                <div className="overflow-hidden rounded-3xl bg-blue-600 p-6 text-white">
                    <div className="flex items-center gap-3 mb-3">
                        <FaUserFriends className="text-2xl text-white/90" />
                        <p className="text-lg font-bold">금연 서포터란?</p>
                    </div>
                    <p className="text-sm leading-6 text-white/90">
                        금연이 힘들어질 때 응원 문자를 보내드릴 지인을 등록하세요.
                        위기 상황에서 서포터에게 알림 문자가 발송됩니다.
                    </p>
                </div>

                {/* 입력 폼 */}
                <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-5">

                    {/* 서포터 이름 */}
                    <div>
                        <label className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700">
                            서포터 이름 <span className="text-slate-400 font-normal">(선택)</span>
                        </label>
                        <div className="relative">
                            <FaUserFriends className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                                value={supporterName}
                                onChange={(e) => setSupporterName(e.target.value)}
                                placeholder="예: 엄마, 친구 김철수"
                                disabled={false}
                            />
                        </div>
                    </div>

                    {/* 서포터 전화번호 */}
                    <div>
                        <label className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700">
                            전화번호 <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <FaPhoneAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                                value={supporterPhone}
                                onChange={(e) => setSupporterPhone(e.target.value)}
                                placeholder="010-1234-5678"
                                type="tel"
                                disabled={false}
                            />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                            금연 위기 상황 감지 시 이 번호로 문자가 발송됩니다.
                        </p>
                    </div>

                    {/* 안내 문구 */}
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-700 leading-relaxed">
                        ⚠️ 등록 전 반드시 해당 지인에게 동의를 구해주세요.<br />
                        서포터의 개인정보는 문자 발송 목적으로만 사용됩니다.
                    </div>
                </div>

                {/* 버튼 영역 */}
                <div className="sticky bottom-4">
                    <div className="rounded-3xl border border-slate-200 bg-white/95 p-3 backdrop-blur space-y-2">
                        <button
                            type="button"
                            onClick={submit}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-4 text-base font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <FaSave />
                            {saved ? "저장 완료! ✓" : loading ? "저장 중..." : "서포터 저장하기"}
                        </button>
                        {/* 임시 테스트 버튼 */}
                        <button
                            type="button"
                            onClick={sendSms}
                            disabled={sending}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-4 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <FaPaperPlane />
                            {sending ? "발송 중..." : " 테스트 문자 보내기"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
