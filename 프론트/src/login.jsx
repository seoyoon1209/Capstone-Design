import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "src/api/axios";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import { HiOutlineChevronLeft } from "react-icons/hi";
import FindId from "src/view/login_membership/findId.jsx";
import FindPw from "src/view/login_membership/findPw.jsx";

export default function Login() {
    const [user_login_id, setUserLoginId] = useState("");
    const [user_password, setUserPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const navigate = useNavigate();

    const [isIdOpen, setIsIdOpen] = useState(false);
    const [isPwOpen, setIsPwOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("user");
        if (saved) {
            try {
                JSON.parse(saved);
                navigate("/day", { replace: true });
            } catch {
                localStorage.removeItem("user");
            }
        }
    }, [navigate]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setErr("");

        if (!user_login_id.trim() || !user_password.trim()) {
            setErr("아이디와 비밀번호를 입력해주세요.");
            return;
        }

        try {
            setLoading(true);

            const res = await axios.post("/api/userlogin/", {
                user_login_id,
                user_password,
            });

            localStorage.setItem("user", JSON.stringify(res.data.user));
            navigate("/day", { replace: true });
        } catch (e2) {
            const msg = e2?.response?.data?.detail ?? "로그인에 실패했습니다.";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex justify-center">
            <div className="w-full max-w-md min-h-screen bg-white flex flex-col">
                {/* 상단 앱 바 */}
                <header className="flex items-center justify-between px-5 pt-5 pb-4">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 transition"
                    >
                        <HiOutlineChevronLeft className="text-slate-700" size={22} />
                    </button>

                    <h1 className="text-base font-semibold text-slate-900">로그인</h1>

                    <div className="w-10" />
                </header>

                {/* 본문 */}
                <main className="flex-1 px-6 pt-6 pb-8 flex flex-col">
                    {/* 브랜딩 */}
                    <div className="mt-4 mb-10">
                        {/*<div className="inline-flex items-center justify-center rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">*/}
                        {/*    금연해듀오*/}
                        {/*</div>*/}

                        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 leading-snug">
                            함께하는 금연
                            <br />
                            금연해듀오
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-slate-500">
                            아이디와 비밀번호를 입력하고
                            <br />
                            서비스를 이용해보세요.
                        </p>
                    </div>

                    {/* 에러 */}
                    {err && (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {err}
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="flex flex-col gap-4">
                        {/* 아이디 */}
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                                아이디
                            </label>
                            <input
                                value={user_login_id}
                                onChange={(e) => setUserLoginId(e.target.value)}
                                placeholder="아이디를 입력해주세요"
                                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
                            />
                        </div>

                        {/* 비밀번호 */}
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                                비밀번호
                            </label>
                            <div className="relative">
                                <input
                                    type={showPw ? "text" : "password"}
                                    value={user_password}
                                    onChange={(e) => setUserPassword(e.target.value)}
                                    placeholder="비밀번호를 입력해주세요"
                                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw((v) => !v)}
                                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                                    aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                                >
                                    {showPw ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* 로그인 버튼 */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-3 h-14 w-full rounded-2xl bg-blue-600 text-[15px] font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {loading && (
                                <AiOutlineLoading3Quarters className="animate-spin" />
                            )}
                            로그인
                        </button>
                    </form>

                    {/* 하단 액션 */}
                    <div className="mt-6 flex items-center justify-center gap-3 text-sm">
                        <button
                            type="button"
                            className="font-medium text-slate-500 transition hover:text-blue-600"
                            onClick={() => setIsIdOpen(true)}
                        >
                            아이디 찾기
                        </button>

                        <span className="text-slate-300">•</span>

                        <button
                            type="button"
                            className="font-medium text-slate-500 transition hover:text-blue-600"
                            onClick={() => setIsPwOpen(true)}
                        >
                            비밀번호 찾기
                        </button>
                    </div>

                    {/* 회원가입 유도 */}
                    <div className="mt-auto pt-8">
                        <button
                            type="button"
                            onClick={() => navigate("/membership")}
                            className="w-full rounded-2xl border border-slate-200 bg-white py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            처음이신가요? 회원가입
                        </button>
                    </div>
                </main>

                <FindId isOpen={isIdOpen} onClose={() => setIsIdOpen(false)} />
                <FindPw isOpen={isPwOpen} onClose={() => setIsPwOpen(false)} />
            </div>
        </div>
    );
}