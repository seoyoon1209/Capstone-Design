import React from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

export default function AppLoadingScreen({
    title = "정보를 불러오고 있어요",
    description = "",
    overlay = false,
}) {
    const wrapperClassName = overlay
        ? "absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-white/70 p-6 text-center"
        : "min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center";

    return (
        <div className={wrapperClassName}>
            <AiOutlineLoading3Quarters className="mb-4 animate-spin text-blue-600" size={40} />
            <p className="text-lg font-bold text-slate-900">{title}</p>
            {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
        </div>
    );
}
