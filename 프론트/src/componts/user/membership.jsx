import { useMemo, useState } from "react";
import {useNavigate} from "react-router-dom";
import Step1Email from "src/view/login_membership/step1.jsx";
import Step2Basic from "src/view/login_membership/step2.jsx";
import Step3Extra from "src/view/login_membership/step3.jsx";


export default function Membership() {
    const [step, setStep] = useState(1);

    const [email, setEmail] = useState("");
    const [emailToken, setEmailToken] = useState("");
    const [userId, setUserId] = useState("");
    const [gender, setGender] = useState("");
    const [birthYear, setBirthYear] = useState("");
    const navigate = useNavigate();

    const progress = useMemo(() => (step / 3) * 100, [step]);

    return (

        <div className="min-h-screen flex items-center justify-center px-3 py-2">
            <div className="w-full max-w-[560px]">
                <div className="flex items-center justify-between text-sm text-slate-600 mb-3">
                    <span className="font-semibold text-slate-800">회원가입 {step}/3</span>
                    <span className="hidden sm:inline">금연해듀오</span>
                </div>

                <div className="h-2 rounded-full bg-slate-200 overflow-hidden mb-6">
                    <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="rounded-2xl bg-white border border-slate-200">
                    <div className="px-6 pt-6 flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="text-slate-700 font-semibold">금연해듀오</div>
                            </div>
                        </div>

                    </div>

                    <div className="p-6">
                        {step === 1 && (
                            <Step1Email
                                email={email}
                                setEmail={setEmail}
                                onVerified={(token) => {
                                    setEmailToken(token);
                                    setStep(2);
                                }}
                            />
                        )}
                        {step === 2 && (
                            <Step2Basic
                                email={email}
                                emailToken={emailToken}
                                onPrev={() => setStep(1)}
                                onNext={(createdUserId, g, by) => {
                                    setUserId(createdUserId);
                                    setGender(g);
                                    setBirthYear(by);
                                    setStep(3);
                                }}
                            />
                        )}
                        {step === 3 && (
                            <Step3Extra
                                userId={userId}
                                gender={gender}
                                birthYear={birthYear}
                                onPrev={() => setStep(2)}
                                onSkip={() => alert("가입 완료(추가정보 생략)!")}
                                onDone={() => alert("가입 완료!")}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
