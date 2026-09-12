import React, { useState, useMemo } from "react";
import { FaCoins, FaHeartbeat, FaChevronDown, FaSmoking, FaCalendarAlt, FaSave } from "react-icons/fa";

export default function SavingsCalculator({ 
    quitDays, 
    baselineCigsPerDay, 
    setBaselineCigsPerDay, 
    baselinePricePerPack, 
    setBaselinePricePerPack,
    startDate,
    setStartDate,
    onSave,
    saving
}) {
    const [isOpen, setIsOpen] = useState(false);

    const savingsInfo = useMemo(() => {
        const cigsPerDay = Number(baselineCigsPerDay) || 0;
        const pricePerPack = Number(baselinePricePerPack) || 4500;
        
        const totalCigs = quitDays * cigsPerDay;
        const totalMoney = Math.floor(totalCigs * (pricePerPack / 20));
        const totalLifeMinutes = totalCigs * 11;

        return {
            money: totalMoney.toLocaleString(),
            lifeDays: Math.floor(totalLifeMinutes / (60 * 24)),
            lifeHours: Math.floor((totalLifeMinutes % (60 * 24)) / 60),
            cigs: totalCigs.toLocaleString(),
        };
    }, [quitDays, baselineCigsPerDay, baselinePricePerPack]);

    return (
        <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all">
            {/* 헤더 부분 */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
                        <FaCoins className="text-xl" />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">나의 금연 자산</div>
                        <div className="text-2xl font-black text-slate-900">{savingsInfo.money}원 절약</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-xs font-bold">{isOpen ? "닫기" : "수정하기"}</span>
                    <FaChevronDown className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </div>
            </button>

            {/* 펼쳐지는 부분 */}
            {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/30 p-5 space-y-6">
                    {/* 실시간 계산 결과 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 text-rose-500 mb-1">
                                <FaHeartbeat className="text-xs" />
                                <span className="text-[10px] font-black uppercase">연장된 수명</span>
                            </div>
                            <div className="text-lg font-black text-slate-900">
                                {savingsInfo.lifeDays}일 {savingsInfo.lifeHours}시간
                            </div>
                        </div>
                        <div className="rounded-2xl bg-white p-4 border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 text-blue-500 mb-1">
                                <FaSmoking className="text-xs" />
                                <span className="text-[10px] font-black uppercase">참은 개비</span>
                            </div>
                            <div className="text-lg font-black text-slate-900">
                                {savingsInfo.cigs}개비
                            </div>
                        </div>
                    </div>

                    {/* 수정 입력 필드 */}
                    <div className="space-y-4 rounded-2xl bg-white p-4 border border-slate-100 shadow-inner">
                        <div className="text-xs font-black text-slate-400 uppercase mb-2 flex items-center gap-1">
                            <FaCalendarAlt className="text-[10px]" /> 흡연 정보 수정
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 ml-1">하루 흡연량 (개비)</label>
                                <input 
                                    type="number" 
                                    value={baselineCigsPerDay}
                                    onChange={(e) => setBaselineCigsPerDay(e.target.value)}
                                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 ml-1">담배 1갑 가격 (원)</label>
                                <input 
                                    type="number" 
                                    value={baselinePricePerPack}
                                    onChange={(e) => setBaselinePricePerPack(e.target.value)}
                                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 ml-1">금연 시작일</label>
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>

                        <button 
                            onClick={onSave}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-black transition-all disabled:opacity-30"
                        >
                            <FaSave className="text-xs" />
                            {saving ? "저장 중..." : "정보 수정 완료"}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
