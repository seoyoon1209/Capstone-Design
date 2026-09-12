import React from "react";
import { useNavigate } from "react-router-dom";
import { FaExclamationTriangle, FaHome } from "react-icons/fa";

export default function NotFound() {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
            <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-amber-100 text-4xl text-amber-500 shadow-sm">
                <FaExclamationTriangle />
            </div>

            <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
                404
            </h1>
            <p className="mt-4 text-lg font-bold text-slate-600">
                페이지를 찾을 수 없습니다
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-500">
                요청하신 페이지가 삭제되었거나,<br />
                잘못된 경로로 접근하신 것 같아요.
            </p>

            <button
                onClick={() => navigate("/", { replace: true })}
                className="mt-10 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 active:scale-95"
            >
                <FaHome className="text-lg" />
                홈으로 돌아가기
            </button>

            <p className="mt-12 text-xs font-medium text-slate-400">
                © 2026 금연해듀오. All rights reserved.
            </p>
        </div>
    );
}
