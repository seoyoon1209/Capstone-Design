import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "src/api/axios";
import {
    FaArrowLeft,
    FaUser,
    FaPhoneAlt,
    FaRulerVertical,
    FaWeight,
    FaVenusMars,
    FaBirthdayCake,
    FaSave,
    FaEnvelope,
    FaCheckCircle,
} from "react-icons/fa";

export default function UserBasic() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        user_name: "",
        birth_year: "",
        user_gender: "",
        user_phone: "",
        user_address: "",
        user_height: "",
        user_weight: "",
        user_email: "",
    });

    const [originalEmail, setOriginalEmail] = useState("");
    const [emailVerified, setEmailVerified] = useState(true);
    const [emailLoading, setEmailVerifiedLoading] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("user");

        if (!saved) {
            navigate("/", { replace: true });
            return;
        }

        const fetchInfo = async () => {
            try {
                const user = JSON.parse(saved);
                const res = await axios.get(`/api/membership/extra/${user.user_id}`);
                const d = res.data;

                if (d) {
                    setForm({
                        user_name: user.user_name || "",
                        birth_year: d.birth_year || "",
                        user_gender: d.gender === "M" ? "남성" : d.gender === "F" ? "여성" : "",
                        user_phone: user.user_phone || "",
                        user_address: d.user_address || "",
                        user_height: d.height_cm || "",
                        user_weight: d.weight_kg || "",
                        user_email: user.user_email || "",
                    });
                    setOriginalEmail(user.user_email || "");
                }
            } catch (error) {
                console.error("데이터 로드 실패:", error);
                const user = JSON.parse(saved);
                setForm(prev => ({ ...prev, user_name: user.user_name, user_phone: user.user_phone, user_email: user.user_email }));
                setOriginalEmail(user.user_email || "");
            }
        };

        fetchInfo();
    }, [navigate]);

    const handleEmailVerify = async () => {
        setEmailVerifiedLoading(true);
        try {
            await axios.post("/api/email/send-verification", { email: form.user_email });
            const code = prompt("이메일로 발송된 인증코드를 입력하세요.");
            if (code) {
                await axios.post("/api/email/verify", { email: form.user_email, code });
                setEmailVerified(true);
                setOriginalEmail(form.user_email);
                alert("이메일 인증이 완료되었습니다.");
            }
        } catch (e) {
            alert(e?.response?.data?.detail || "인증에 실패했습니다.");
        } finally {
            setEmailVerifiedLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === "user_email") {
            setEmailVerified(value === originalEmail);
        }

        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setLoading(true);

        try {
            const saved = localStorage.getItem("user");
            const user = JSON.parse(saved);

            const payload = {
                user_id: user.user_id,
                user_name: form.user_name,
                user_email: form.user_email,
                birth_year: Number(form.birth_year),
                user_gender: form.user_gender,
                user_phone: form.user_phone,
                user_address: form.user_address,
                user_height: form.user_height === "" ? null : Number(form.user_height),
                user_weight: form.user_weight === "" ? null : Number(form.user_weight),
            };

            await axios.post("/api/user_information/update", payload);

            // 임시로 localStorage 반영
            const updatedUser = { ...user, ...form };
            localStorage.setItem("user", JSON.stringify(updatedUser));

            alert("기본 정보가 수정되었습니다.");
            navigate("/user");
        } catch (error) {
            console.error("회원 기본 정보 수정 실패:", error);
            alert("수정 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleWithdraw = async () => {
        if (!window.confirm("정말로 탈퇴하시겠습니까? 모든 정보가 삭제되며 복구할 수 없습니다.")) {
            return;
        }

        try {
            const saved = localStorage.getItem("user");
            const user = JSON.parse(saved);
            
            await axios.delete(`/api/user_delete/${user.user_id}`);
            
            alert("탈퇴 처리가 완료되었습니다. 이용해 주셔서 감사합니다.");
            localStorage.removeItem("user");
            navigate("/", { replace: true });
        } catch (error) {
            console.error("탈퇴 실패:", error);
            alert("탈퇴 처리 중 오류가 발생했습니다.");
        }
    };

    const inputClass =
        "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

    const labelClass = "mb-2 block text-sm font-semibold text-slate-700";

    return (
        <div className="min-h-screen px-4 pt-20 pb-10 bg-slate-50">
            <div className="mx-auto max-w-md">
                {/* 상단 헤더 */}
                <div className="mb-4 flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                    >
                        <FaArrowLeft />
                    </button>

                    <div>
                        <h1 className="text-xl font-bold text-slate-900">기본 정보 수정</h1>
                        <p className="text-sm text-slate-500">
                            회원 기본 정보를 수정할 수 있어요
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
                        <div className="mb-5">
                            <h2 className="text-base font-bold text-slate-900">회원 정보</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                이름, 출생연도, 성별, 연락처, 이메일 정보를 수정하세요
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* 이름 */}
                            <div>
                                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    <FaUser className="text-blue-500" />
                    이름
                  </span>
                                </label>
                                <input
                                    type="text"
                                    name="user_name"
                                    value={form.user_name}
                                    onChange={handleChange}
                                    placeholder="이름을 입력하세요"
                                    className={inputClass}
                                />
                            </div>

                            {/* 이메일 */}
                            <div>
                                <label className={labelClass}>
                                    <span className="flex items-center gap-2">
                                        <FaEnvelope className="text-indigo-500" />
                                        이메일 (아이디)
                                    </span>
                                </label>
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="email"
                                        name="user_email"
                                        value={form.user_email}
                                        onChange={handleChange}
                                        placeholder="example@email.com"
                                        className={inputClass}
                                    />
                                    {!emailVerified && (
                                        <button
                                            type="button"
                                            onClick={handleEmailVerify}
                                            disabled={emailLoading}
                                            className="w-full rounded-xl bg-indigo-50 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition"
                                        >
                                            {emailLoading ? "발송 중..." : "이메일 변경 인증하기"}
                                        </button>
                                    )}
                                    {emailVerified && form.user_email !== "" && (
                                        <div className="flex items-center gap-1.5 pl-1 text-[10px] font-bold text-emerald-600">
                                            <FaCheckCircle />
                                            인증됨
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 출생연도 */}
                            <div>
                                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    <FaBirthdayCake className="text-pink-500" />
                    출생연도
                  </span>
                                </label>
                                <input
                                    type="number"
                                    name="birth_year"
                                    value={form.birth_year}
                                    onChange={handleChange}
                                    placeholder="예) 1995"
                                    className={inputClass}
                                />
                            </div>

                            {/* 성별 */}
                            <div>
                                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    <FaVenusMars className="text-violet-500" />
                    성별
                  </span>
                                </label>
                                <select
                                    name="user_gender"
                                    value={form.user_gender}
                                    onChange={handleChange}
                                    className={inputClass}
                                >
                                    <option value="">성별을 선택하세요</option>
                                    <option value="남성">남성</option>
                                    <option value="여성">여성</option>
                                </select>
                            </div>

                            {/* 전화번호 */}
                            <div>
                                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    <FaPhoneAlt className="text-emerald-500" />
                    전화번호
                  </span>
                                </label>
                                <input
                                    type="text"
                                    name="user_phone"
                                    value={form.user_phone}
                                    onChange={handleChange}
                                    placeholder="010-0000-0000"
                                    className={inputClass}
                                />
                            </div>

                            {/* 키 */}
                            <div>
                                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    <FaRulerVertical className="text-cyan-500" />
                    키 (cm)
                  </span>
                                </label>
                                <input
                                    type="number"
                                    name="user_height"
                                    value={form.user_height}
                                    onChange={handleChange}
                                    placeholder="키를 입력하세요"
                                    className={inputClass}
                                />
                            </div>

                            {/* 몸무게 */}
                            <div>
                                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    <FaWeight className="text-amber-500" />
                    몸무게 (kg)
                  </span>
                                </label>
                                <input
                                    type="number"
                                    name="user_weight"
                                    value={form.user_weight}
                                    onChange={handleChange}
                                    placeholder="몸무게를 입력하세요"
                                    className={inputClass}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 저장 버튼 */}
                    <button
                        type="submit"
                        disabled={loading || !emailVerified}
                        className="w-full rounded-2xl bg-blue-600 px-4 py-4 shadow-sm flex items-center justify-center gap-2 font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60"
                    >
                        <FaSave />
                        {loading ? "저장 중..." : "기본 정보 저장"}
                    </button>

                    <div className="pt-6 border-t border-slate-100 mt-6 text-center">
                        <button
                            type="button"
                            onClick={handleWithdraw}
                            className="text-sm font-semibold text-slate-400 hover:text-red-500 transition underline underline-offset-4"
                        >
                            회원 탈퇴하기
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
