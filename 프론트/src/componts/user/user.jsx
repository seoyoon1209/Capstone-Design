import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaUserCircle,
    FaPhoneAlt,
    FaIdCard,
    FaChevronRight,
    FaSignOutAlt,
    FaShieldAlt,
    FaInfoCircle,
    FaTimes,
    FaUserEdit,
    FaUserFriends
} from "react-icons/fa";

export default function User() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [showPrivacy, setShowPrivacy] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("user");
        if (!saved) {
            navigate("/", { replace: true });
            return;
        }

        try {
            setUser(JSON.parse(saved));
        } catch {
            localStorage.removeItem("user");
            navigate("/", { replace: true });
        }
    }, [navigate]);

    const onLogout = () => {
        localStorage.removeItem("user");
        navigate("/", { replace: true });
    };

    if (!user) return null;

    return (
        <div className="min-h-screen px-4 pt-20 pb-10">
            <div className="mx-auto max-w-md space-y-4">
                {/* 프로필 헤더 */}
                <div className="overflow-hidden rounded-3xl bg-white border border-slate-200">
                    <div className="bg-blue-600 px-6 py-8 text-white">
                        <div className="flex items-center gap-4">
                            <FaUserCircle className="text-6xl opacity-95" />
                            <div className="flex-1">
                                <p className="text-sm text-white/80">MY PAGE</p>
                                <h1 className="text-2xl font-bold">
                                    {user.user_name || "사용자"}
                                </h1>
                                <p className="mt-1 text-sm text-white/90">
                                    {user.user_login_id || "로그인 정보 없음"}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate("/user/correction")}
                                className="rounded-full bg-white/20 p-3 hover:bg-white/30 transition"
                            >
                                <FaUserEdit className="text-lg" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 내 정보 카드 (정보 표시 전용 — 수정은 아래 버튼으로) */}
                <div className="w-full rounded-3xl bg-white border border-slate-200 p-5 text-left shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">내 정보</p>
                            <p className="mt-1 text-sm text-slate-500">
                                전화번호 · 이메일
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-3 text-slate-700">
                            <FaPhoneAlt className="text-emerald-500 shrink-0" />
                            <span className="text-sm">{user.user_phone || "전화번호 없음"}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                            <FaIdCard className="text-indigo-500 shrink-0" />
                            <span className="text-sm truncate">{user.user_login_id || user.user_email || "이메일 없음"}</span>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate("/user/basic"); }}
                            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100"
                        >
                            <div>
                                <p className="text-sm font-semibold text-slate-900">기본 정보 수정</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    전화번호, 이메일
                                </p>
                            </div>
                            <FaChevronRight className="shrink-0 text-slate-400" />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); navigate("/user/correction"); }}
                            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100"
                        >
                            <div>
                                <p className="text-sm font-semibold text-slate-900">세부 정보 수정</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    금연 습관, 음주, 운동 정보
                                </p>
                            </div>
                            <FaChevronRight className="shrink-0 text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* 금연 서포터 카드 */}
                <div
                    onClick={() => navigate("/user/supporter")}
                    className="w-full rounded-3xl bg-white border border-slate-200 p-5 text-left hover:-translate-y-0.5 transition cursor-pointer"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-blue-600">
                                <FaUserFriends className="text-lg" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">금연 서포터</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    금연 위기 시 응원 문자 받을 지인 등록
                                </p>
                            </div>
                        </div>
                        <FaChevronRight className="text-slate-400" />
                    </div>
                </div>

                {/* 앱 설정 카드 */}
                <div className="overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm">
                    <div className="p-5 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-900">앱 설정 및 정보</p>
                    </div>
                    
                    <button
                        onClick={() => setShowPrivacy(true)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
                    >
                        <div className="flex items-center gap-3">
                            <FaShieldAlt className="text-blue-500" />
                            <span className="text-sm font-medium text-slate-700">개인정보 처리방침</span>
                        </div>
                        <FaChevronRight className="text-slate-400 text-xs" />
                    </button>

                    <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-3">
                            <FaInfoCircle className="text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">앱 버전</span>
                        </div>
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">v1.0.0</span>
                    </div>
                </div>

                {/* 로그아웃 */}
                <button
                    onClick={onLogout}
                    className="w-full rounded-2xl bg-red-50 border border-red-200 px-4 py-4 shadow-sm flex items-center justify-center gap-2 font-semibold text-red-600 hover:bg-red-100 transition"
                >
                    <FaSignOutAlt />
                    로그아웃
                </button>
            </div>

            {/* 개인정보 처리방침 모달 */}
            {showPrivacy && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800">개인정보 처리방침</h2>
                            <button 
                                onClick={() => setShowPrivacy(false)}
                                className="p-2 hover:bg-slate-200 rounded-full transition"
                            >
                                <FaTimes className="text-slate-500" />
                            </button>
                        </div>
                        <div className="p-6 h-[60vh] overflow-y-auto text-xs text-slate-600 leading-relaxed">
                            <div className="space-y-4">
                                <div>
                                    <p className="font-bold text-sm text-slate-800 mb-2">[1. 수집하는 개인정보 항목]</p>
                                    <ul className="list-disc ml-4 space-y-1">
                                        <li>가입 시: 성명, 이메일, 비밀번호, 휴대폰 번호, 출생연도, 성별</li>
                                        <li>서비스 이용 시: 맞춤 서비스 제공을 위한 흡연 데이터(흡연량, 금연 시도 횟수 등), 음주 데이터, 신체 정보(키, 몸무게), 소득 및 스트레스 인지 정보</li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-bold text-sm text-slate-800 mb-2">[2. 개인정보의 수집 및 이용 목적]</p>
                                    <ul className="list-disc ml-4 space-y-1">
                                        <li>회원 관리: 서비스 이용에 따른 본인 확인, 개인 식별, 부정 이용 방지, 가입 의사 확인, 민원 처리, 고지사항 전달</li>
                                        <li>서비스 제공: 금연 계획 수립 및 맞춤형 건강 분석 리포트 제공, 보건소 등 공공 서비스 연계 안내</li>
                                        <li>신규 서비스 개발 및 마케팅: 신규 서비스 개발 및 특화, 이벤트 등 광고성 정보 전달, 접속 빈도 파악 및 통계 분석</li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-bold text-sm text-slate-800 mb-2">[3. 개인정보의 보유 및 이용 기간]</p>
                                    <ul className="list-disc ml-4 space-y-1">
                                        <li>이용자의 개인정보는 원칙적으로 회원 탈퇴 시까지 보관하며, 목적이 달성된 후에는 지체 없이 파기합니다.</li>
                                        <li>단, 관계 법령(전자상거래법 등)에 의하여 보존할 필요가 있는 경우 해당 기간까지 보관합니다.</li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-bold text-sm text-slate-800 mb-2">[4. 동의 거부 권리 및 불이익]</p>
                                    <p>귀하는 개인정보 수집 및 이용에 대해 동의를 거부할 권리가 있습니다. 단, 필수 항목에 대한 동의를 거부하실 경우 회원 가입 및 서비스 이용이 제한될 수 있습니다.</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100">
                            <button
                                onClick={() => setShowPrivacy(false)}
                                className="w-full py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
