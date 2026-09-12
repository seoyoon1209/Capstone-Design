import { useState } from "react";
import axios from "src/api/axios";
import { FaUser, FaPhone, FaLock, FaCheckCircle } from "react-icons/fa";
const errMsg = (e) =>
    e?.response?.data?.detail || e?.message || "요청에 실패했습니다.";

export default function Step2Basic({ email, emailToken, onPrev, onNext }) {
    const [name, setName] = useState("");
    const [birthYear, setBirthYear] = useState("");
    const [gender, setGender] = useState("F"); // 스샷처럼 여성 기본
    const [phone, setPhone] = useState("");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [isAgreed, setIsAgreed] = useState(false);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (pw !== pw2) return alert("비밀번호가 일치하지 않습니다.");
        if (String(pw).length < 8) return alert("비밀번호는 8자 이상으로 입력해주세요.");
        if (birthYear.length !== 4) return alert("출생연도를 4자리로 입력해주세요 (예: 1995)");
        if (!isAgreed) return alert("개인정보 처리방침에 동의해주세요.");

        setLoading(true);
        try {
            const res = await axios.post("/api/membership/register", {
                email,
                email_token: emailToken || email,
                name,
                birth_year: Number(birthYear),
                gender,
                phone,
                password: pw,
                login_id: email,
            });
            onNext(res.data.user_id, gender, Number(birthYear));
        } catch (e) {
            alert(errMsg(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-extrabold text-slate-900">기본 정보(필수)</h1>
            <p className="mt-2 text-slate-600">
                필수 정보를 입력하면 맞춤형 금연 계획을 더 정확히 제공할 수 있어요.
            </p>

            <div className="mt-6 space-y-5">
                {/* 이름 ... (중략) ... */}
                {/* (기존 입력 필드들 유지) */}
                
                {/* 이름 */}
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">이름 (필수)</div>
                    <div className="relative">
                        <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="홍길동"
                        />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">올바른 형식으로 입력하세요.</div>
                </div>

                {/* 출생연도 */}
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">출생연도 (필수)</div>
                    <input
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={birthYear}
                        onChange={(e) => setBirthYear(e.target.value)}
                        placeholder="예) 1995"
                        type="number"
                    />
                    <div className="text-xs text-slate-500 mt-1">출생연도 4자리를 입력해주세요.</div>
                </div>

                {/* 성별 */}
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">성별 (필수)</div>
                    <div className="grid grid-cols-2 rounded-xl border border-slate-200 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setGender("M")}
                            className={`py-3 font-semibold ${gender === "M"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-50 text-slate-700"
                                }`}
                        >
                            남성
                        </button>
                        <button
                            type="button"
                            onClick={() => setGender("F")}
                            className={`py-3 font-semibold ${gender === "F"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-50 text-slate-700"
                                }`}
                        >
                            여성
                        </button>
                    </div>
                </div>

                {/* 휴대폰 */}
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">휴대폰 번호 (필수)</div>
                    <div className="relative">
                        <FaPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="010-1234-5678"
                        />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">휴대폰 번호를 정확히 입력해주세요.</div>
                </div>

                {/* 이메일 */}
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">이메일 (필수)</div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-3 text-slate-600"
                            value={email}
                            disabled
                        />
                        <div className="sm:w-[230px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                            <FaCheckCircle className="text-blue-600" />
                            이메일 인증 완료
                        </div>
                    </div>
                </div>

                {/* 비밀번호 */}
                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">비밀번호 (필수)</div>
                    <div className="relative">
                        <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            placeholder="8자 이상"
                            type="password"
                        />
                    </div>
                </div>

                <div>
                    <div className="text-sm font-medium text-slate-700 mb-2">비밀번호 확인 (필수)</div>
                    <div className="relative">
                        <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={pw2}
                            onChange={(e) => setPw2(e.target.value)}
                            placeholder="다시 입력"
                            type="password"
                        />
                    </div>
                </div>

                {/* 개인정보 처리방침 동의 */}
                <div className="pt-2">
                    <div className="text-sm font-medium text-slate-700 mb-2">개인정보 수집 및 이용 동의 (필수)</div>
                    <div className="w-full h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed mb-3">
                        <div className="space-y-3">
                            <div>
                                <p className="font-bold text-slate-800">[1. 수집하는 개인정보 항목]</p>
                                <ul className="list-disc ml-4 mt-1 space-y-1">
                                    <li>가입 시: 성명, 이메일, 비밀번호, 휴대폰 번호, 출생연도, 성별</li>
                                    <li>서비스 이용 시: 맞춤 서비스 제공을 위한 흡연 데이터(흡연량, 금연 시도 횟수 등), 음주 데이터, 신체 정보(키, 몸무게), 소득 및 스트레스 인지 정보</li>
                                </ul>
                            </div>

                            <div>
                                <p className="font-bold text-slate-800">[2. 개인정보의 수집 및 이용 목적]</p>
                                <ul className="list-disc ml-4 mt-1 space-y-1">
                                    <li>회원 관리: 서비스 이용에 따른 본인 확인, 개인 식별, 부정 이용 방지, 가입 의사 확인, 민원 처리, 고지사항 전달</li>
                                    <li>서비스 제공: 금연 계획 수립 및 맞춤형 건강 분석 리포트 제공, 보건소 등 공공 서비스 연계 안내</li>
                                    <li>신규 서비스 개발 및 마케팅: 신규 서비스 개발 및 특화, 이벤트 등 광고성 정보 전달, 접속 빈도 파악 및 통계 분석</li>
                                </ul>
                            </div>

                            <div>
                                <p className="font-bold text-slate-800">[3. 개인정보의 보유 및 이용 기간]</p>
                                <ul className="list-disc ml-4 mt-1 space-y-1">
                                    <li>이용자의 개인정보는 원칙적으로 회원 탈퇴 시까지 보관하며, 목적이 달성된 후에는 지체 없이 파기합니다.</li>
                                    <li>단, 관계 법령(전자상거래법 등)에 의하여 보존할 필요가 있는 경우 해당 기간까지 보관합니다.</li>
                                </ul>
                            </div>

                            <div>
                                <p className="font-bold text-slate-800">[4. 동의 거부 권리 및 불이익]</p>
                                <p className="mt-1">귀하는 개인정보 수집 및 이용에 대해 동의를 거부할 권리가 있습니다. 단, 필수 항목에 대한 동의를 거부하실 경우 회원 가입 및 서비스 이용이 제한될 수 있습니다.</p>
                            </div>
                        </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={isAgreed}
                            onChange={(e) => setIsAgreed(e.target.checked)}
                        />
                        <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                            개인정보 수집 및 이용에 동의합니다. (필수)
                        </span>
                    </label>
                </div>

                {/* 버튼 */}
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onPrev}
                        className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        이전
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!name || birthYear.length !== 4 || !phone || !pw || !pw2 || !isAgreed || loading}
                        className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        다음
                    </button>
                </div>
            </div>
        </div>
    );
}