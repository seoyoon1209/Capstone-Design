import React, { useState } from "react";
import axios from "src/api/axios";

export default function FindId({ isOpen, onClose }) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [foundId, setFoundId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const handleFindId = async () => {
        if (!name.trim() || !phone.trim()) {
            setError("이름과 전화번호를 모두 입력하세요.");
            return;
        }

        setLoading(true);
        setError("");
        setFoundId("");

        try {
            const { data } = await axios.post("/api/test/find-id", {
                name: name.trim(),
                phone: phone.trim(),
            });

            if (!data.user_login_id) {
                setError("일치하는 정보가 없습니다.");
                return;
            }

            setFoundId(data.user_login_id);
        } catch (err) {
            if (err.response?.status === 404) {
                setError("일치하는 정보가 없습니다.");
            } else {
                setError("서버 오류가 발생했습니다.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setName("");
        setPhone("");
        setFoundId("");
        setError("");
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[90%] max-w-[420px] rounded-2xl bg-white p-7 shadow-2xl animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-extrabold text-slate-900 mb-8">아이디 찾기</h2>

                {!foundId ? (
                    <div className="space-y-6">
                        {/* 이름 */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-slate-800 ml-1">이름</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 py-3.5 px-4 text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                placeholder="가입하신 이름을 입력하세요"
                            />
                        </div>

                        {/* 전화번호 */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-slate-800 ml-1">전화번호</label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 py-3.5 px-4 text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                placeholder="숫자만 입력하세요"
                            />
                        </div>

                        {/* 에러 */}
                        {error && <p className="text-sm text-red-500 ml-1">{error}</p>}
                    </div>
                ) : (
                    <div className="py-10 text-center animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-sm text-slate-500 mb-3">
                            찾으시는 아이디는 다음과 같습니다.
                        </p>
                        <div className="text-xl font-black text-blue-600 bg-blue-50 py-5 rounded-xl border border-blue-100">
                            {foundId}
                        </div>
                    </div>
                )}

                <div className="mt-10 flex justify-end gap-3">
                    <button
                        onClick={handleClose}
                        className="rounded-xl border border-slate-300 bg-white px-7 py-2.5 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        닫기
                    </button>

                    {!foundId && (
                        <button
                            onClick={handleFindId}
                            disabled={loading}
                            className="rounded-xl bg-blue-500 px-7 py-2.5 font-bold text-white shadow-md shadow-blue-100 hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? "찾는 중..." : "아이디 찾기"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}