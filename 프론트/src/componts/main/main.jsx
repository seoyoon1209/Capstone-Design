import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    HiOutlineHeart,
    HiOutlineShieldCheck,
    HiOutlineSparkles,
} from "react-icons/hi2";

function AnimatedTitle() {
    const [show, setShow] = useState([false, false, false]);

    useEffect(() => {
        const timers = [
            setTimeout(() => {
                setShow((prev) => [true, prev[1], prev[2]]);
            }, 150),
            setTimeout(() => {
                setShow((prev) => [prev[0], true, prev[2]]);
            }, 450),
            setTimeout(() => {
                setShow((prev) => [prev[0], prev[1], true]);
            }, 750),
        ];

        return () => timers.forEach(clearTimeout);
    }, []);

    return (
        <h1 className="mt-3 text-4xl font-extrabold leading-tight text-slate-900">
            <span
                className={`block transition-all duration-1000 ${
                    show[0] ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
            >
                가장 가까운
            </span>

            <span
                className={`block transition-all duration-1000 ${
                    show[1] ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
            >
                금연 파트너
            </span>

            <span
                className={`block transition-all duration-1000 text-blue-600 ${
                    show[2] ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
            >
                금연해듀오
            </span>
        </h1>
    );
}

export default function Welcome() {
    const navigate = useNavigate();

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

    return (
        <div className="min-h-screen bg-white flex justify-center">
            <div className="w-full max-w-md min-h-screen flex flex-col px-6 pt-10 pb-8">
                {/* 메인 문구 */}
                <div className="mt-10">
                    <AnimatedTitle />
                    <p className="mt-4 text-base leading-7 text-slate-500">
                        금연 상담, 기록 관리, 건강한 습관 형성을
                        <br />
                        쉽고 편하게 시작해보세요.
                    </p>
                </div>

                {/* 소개 카드 */}
                <div className="mt-10 space-y-4">
                    <div className="flex items-start gap-4 rounded-2xl bg-slate-50 p-4">
                        <div className="mt-1 rounded-xl bg-white p-2 shadow-sm">
                            <HiOutlineHeart className="text-rose-500" size={22} />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-900">건강한 습관 만들기</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                                작은 실천부터 차근차근 이어갈 수 있도록 도와드려요.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 rounded-2xl bg-slate-50 p-4">
                        <div className="mt-1 rounded-xl bg-white p-2 shadow-sm">
                            <HiOutlineShieldCheck className="text-emerald-500" size={22} />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-900">간편한 이용</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                                로그인 후 필요한 기능을 빠르게 사용할 수 있어요.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 rounded-2xl bg-slate-50 p-4">
                        <div className="mt-1 rounded-xl bg-white p-2 shadow-sm">
                            <HiOutlineSparkles className="text-blue-500" size={22} />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-900">ai 금연 컨설팅</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                                사용자님들 개개인에 맞춰서 금연 컨선팅 해줘요.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 하단 버튼 */}
                <div className="mt-auto pt-10 space-y-3">
                    <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className="h-14 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
                    >
                        로그인
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate("/membership")}
                        className="h-14 w-full rounded-2xl border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        회원가입
                    </button>
                </div>

                <p className="mt-6 text-center text-xs leading-5 text-slate-400">
                    건강한 변화를 위한 첫 걸음을 함께 시작해보세요.
                </p>
            </div>
        </div>
    );
}