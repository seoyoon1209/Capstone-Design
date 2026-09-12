import React from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

const Loading = ({ message = "데이터를 불러오고 있습니다" }) => {
    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
            <AiOutlineLoading3Quarters className="animate-spin text-blue-600 mb-4" size={40} />
            <p className="text-lg font-bold text-slate-900">{message}</p>
        </div>
    );
};

export default Loading;
