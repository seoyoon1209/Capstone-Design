import { useState } from "react";
import axios from "src/api/axios";
import { FaEnvelope, FaKey } from "react-icons/fa";
import useVerificationTimer from "./useVerificationTimer";

const errMsg = (e) =>
    e?.response?.data?.detail || e?.message || "요청에 실패했습니다.";

export default function Step1Email({ email, setEmail, onVerified }) {
    const [code, setCode] = useState("");
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const { formattedTime, isActive, isExpired, start, reset } = useVerificationTimer();

    const sendCode = async () => {
        setLoading(true);
        try {
            await axios.post("/api/email/send-verification", { email });
            setSent(true);
            setCode("");
            start();
            alert("인증번호 전송 완료");
        } catch (e) {
            alert(errMsg(e));
        } finally {
            setLoading(false);
        }
    };
    //이메일 인증 안될떄 확인
// } catch (e) {
//     console.warn("이메일 인증 실패, 임시로 다음 단계 진행:", e);
//     onVerified("TEMP_BYPASS_TOKEN");
// } finally {
//     setLoading(false);
// }
// };


const verify = async () => {
        if (isExpired) {
            alert("인증번호가 만료되었습니다. 다시 요청해주세요.");
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post("/api/email/verify", {
                email,
                code,
            });
            reset();
            onVerified(res.data.token);
        } catch (e) {
            alert(errMsg(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-extrabold text-slate-900">이메일 인증</h1>
            <p className="mt-2 text-slate-600">이메일로 본인 확인 후 다음 단계로 진행합니다.</p>

            <div className="mt-6 space-y-5">
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">이메일(필수)</div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="name@univ.ac.kr"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={sendCode}
                            disabled={!email || loading || (sent && isActive)}
                            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed sm:w-[170px]"
                        >
                            {loading ? "전송 중..." : sent && isActive ? "발송됨" : sent ? "다시 받기" : "인증번호 보내기"}
                        </button>
                    </div>
                    {sent && (
                        <p className={`mt-2 text-sm ${isExpired ? "text-rose-500" : "text-blue-600"}`}>
                            {isExpired
                                ? "인증번호가 만료되었습니다. 다시 요청해주세요."
                                : `인증번호 만료까지 ${formattedTime}`}
                        </p>
                    )}
                </div>

                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">인증번호</div>
                    <div className="relative">
                        <FaKey className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                            placeholder="인증번호를 입력하세요."
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            disabled={!sent || isExpired}
                        />
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => window.history.back()}
                    >
                        취소
                    </button>

                    <button
                        type="button"
                        onClick={verify}
                        disabled={!sent || !code || loading || isExpired}
                        className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        다음
                    </button>
                </div>

                <p className="text-xs text-slate-500 text-center">
                    인증 메일이 보이지 않으면 스팸함을 확인하세요.
                    <br />
                    입력한 이메일은 계정 생성 및 안내 목적에만 사용됩니다.
                </p>
            </div>
        </div>
    );
}
