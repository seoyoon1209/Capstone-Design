import React, { useState } from "react";
import axios from "src/api/axios";
import useVerificationTimer from "./useVerificationTimer";

export default function FindPw({ isOpen, onClose }) {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        name: "",
        email: "",
        code: "",
        newPw: "",
        confirmPw: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const { formattedTime, isActive, isExpired, start, reset } = useVerificationTimer();

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    // 인증번호 발송
    const handleSendCode = async () => {
        if (!form.name.trim() || !form.email.trim()) {
            setError("이름과 이메일을 모두 입력해주세요.");
            return;
        }
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const res = await axios.post("/api/test/send-verification", { email: form.email });
            if (res.data.ok) {
                setCodeSent(true);
                setForm((prev) => ({ ...prev, code: "" }));
                start();
                setSuccess(res.data.message || "인증번호가 발송되었습니다!");
            }
        } catch (err) {
            setError(err.response?.data?.detail || "인증번호 발송에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    //  인증번호 입력
    const handleVerifyCode = async () => {
        if (!form.code.trim()) {
            setError("인증번호를 입력해주세요.");
            return;
        }
        if (isExpired) {
            setError("인증번호가 만료되었습니다. 다시 발송해주세요.");
            return;
        }
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const res = await axios.post("/api/test/verify", { 
                email: form.email,
                code: form.code
            });
            if (res.data.ok) {
                reset();
                setStep(2); // 비밀번호 재설정 단계로 이동
                setSuccess("인증에 성공했습니다. 새 비밀번호를 입력해주세요.");
            }
        } catch (err) {
            setError(err.response?.data?.detail || "인증번호가 일치하지 않거나 만료되었습니다.");
        } finally {
            setLoading(false);
        }
    };

    //  비밀번호 재설정
    const handleResetPw = async () => {
        if (!form.newPw || !form.confirmPw) {
            setError("비밀번호를 모두 입력해주세요.");
            return;
        }
        if (form.newPw !== form.confirmPw) {
            setError("비밀번호가 일치하지 않습니다.");
            return;
        }
        if (form.newPw.length < 8) {
            setError("비밀번호는 8자 이상이어야 합니다.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const res = await axios.post("/api/test/reset-pw", {
                name: form.name,
                email: form.email,
                new_password: form.newPw
            });

            if (res.data.ok) {
                alert("비밀번호가 성공적으로 변경되었습니다.");
                handleClose();
            }
        } catch (err) {
            setError(err.response?.data?.detail || "비밀번호 변경에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setForm({ name: "", email: "", code: "", newPw: "", confirmPw: "" });
        setStep(1);
        setError("");
        setSuccess("");
        setCodeSent(false);
        reset();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[90%] max-w-[420px] rounded-2xl bg-white p-7 shadow-2xl animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-extrabold text-slate-900 mb-6">
                    {step === 1 ? "비밀번호 찾기" : "새 비밀번호 설정"}
                </h2>

                <div className="space-y-5">
                    {/* 이메일 인증 */}
                    {step === 1 && (
                        <>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">이름</label>
                                <input
                                    name="name"
                                    value={form.name}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-slate-200 py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-slate-50" 
                                    placeholder="가입하신 이름을 입력하세요"
                                    disabled={codeSent && isActive}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">이메일</label>
                                <div className="flex gap-2">
                                    <input
                                        name="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        className="flex-1 rounded-xl border border-slate-200 py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-slate-50" 
                                        placeholder="가입하신 이메일을 입력하세요"
                                        disabled={codeSent && isActive}
                                    />
                                    <button
                                        onClick={handleSendCode}
                                        disabled={loading || (codeSent && isActive)}
                                        className="whitespace-nowrap rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                                    >
                                        {loading ? "전송 중" : codeSent && isActive ? "발송됨" : codeSent ? "다시 발송" : "인증번호 발송"}
                                    </button>
                                </div>
                                {codeSent && (
                                    <p className={`mt-2 ml-1 text-xs ${isExpired ? "text-red-500" : "text-blue-600"}`}>
                                        {isExpired
                                            ? "인증번호가 만료되었습니다. 다시 발송해주세요."
                                            : `인증번호 만료까지 ${formattedTime}`}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">인증번호</label>
                                <div className="flex gap-2">
                                    <input
                                        name="code"
                                        value={form.code}
                                        onChange={handleChange}
                                        className="flex-1 rounded-xl border border-slate-200 py-3 px-4 outline-none focus:ring-2 focus:ring-green-500 transition-all disabled:opacity-50" 
                                        placeholder="6자리 번호 입력"
                                        disabled={!codeSent || isExpired}
                                    />
                                    <button
                                        onClick={handleVerifyCode}
                                        disabled={loading || !codeSent || isExpired}
                                        className="bg-green-500 hover:bg-green-600 text-white px-5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                                    >
                                        확인
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* 비밀번호 재설정 */}
                    {step === 2 && (
                        <div className="animate-in slide-in-from-top-2 duration-300 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-blue-600 mb-1.5 ml-1">새 비밀번호</label>
                                <input
                                    type="password"
                                    name="newPw"
                                    value={form.newPw}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-blue-200 py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                                    placeholder="8자 이상 입력"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-blue-600 mb-1.5 ml-1">비밀번호 확인</label>
                                <input
                                    type="password"
                                    name="confirmPw"
                                    value={form.confirmPw}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-blue-200 py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                                    placeholder="비밀번호 재입력"
                                />
                            </div>
                        </div>
                    )}

                    {/* 에러 및 성공 메시지 */}
                    {error && <p className="text-xs text-red-500 ml-1">{error}</p>}
                    {success && <p className="text-xs text-green-600 ml-1">{success}</p>}
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button
                        onClick={handleClose}
                        className="rounded-xl border border-slate-300 bg-white px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        닫기
                    </button>
                    {step === 2 && (
                        <button
                            onClick={handleResetPw}
                            disabled={loading}
                            className="rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition-all"
                        >
                            {loading ? "처리 중..." : "변경하기"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
