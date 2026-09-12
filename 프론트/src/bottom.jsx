import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {FaRegCalendarAlt, FaHeartbeat, FaMapMarkerAlt, FaRegComments, FaUserCircle,
} from "react-icons/fa";
import { syncHeartRateToServer } from "src/native/heartRateSync";

export default function Bottom() {
    const navigate = useNavigate();
    const location = useLocation();

    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem("user");
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch {
            localStorage.removeItem("user");
            return null;
        }
    });

    useEffect(() => {
        if (!user) navigate("/login", { replace: true });
    }, [user, navigate]);

    useEffect(() => {
        const userId = user?.user_id || user?.userId;
        if (!userId) return;

        syncHeartRateToServer(userId);

        const intervalId = window.setInterval(() => {
            syncHeartRateToServer(userId);
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, [user]);

    if (!user) {
        return (
            <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
                이동 중...
            </div>
        );
    }

    const tabs = [
        { label: "금연일수", icon: <FaRegCalendarAlt />, path: "/day" },
        { label: "회복", icon: <FaHeartbeat />, path: "/recovery" },
        { label: "보건소", icon: <FaMapMarkerAlt />, path: "/bogunso" },
        { label: "금연컨설팅", icon: <FaRegComments />, path: "/consulting" },
        { label: "프로필", icon: <FaUserCircle />, path: "/user" },
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            {/* 실제 화면 */}
            <main className="mx-auto w-full max-w-md min-h-screen bg-white pb-24">
                <Outlet />
            </main>

            {/* 하단 탭바 */}
            <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 backdrop-blur">
                <div className="grid grid-cols-5">
                    {tabs.map((tab) => {
                        const active =
                            location.pathname === tab.path ||
                            location.pathname.startsWith(tab.path + "/");

                        return (
                            <button
                                key={tab.path}
                                type="button"
                                onClick={() => navigate(tab.path)}
                                className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-semibold transition ${
                                    active ? "text-blue-600" : "text-slate-400"
                                }`}
                            >
                                <span className="text-lg">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
