import { useEffect, useMemo, useState } from "react";

const DEFAULT_DURATION = 5 * 60;

export default function useVerificationTimer(duration = DEFAULT_DURATION) {
    const [expiresAt, setExpiresAt] = useState(null);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!expiresAt) {
            return undefined;
        }

        const timerId = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(timerId);
    }, [expiresAt]);

    const secondsLeft = useMemo(() => {
        if (!expiresAt) {
            return 0;
        }

        return Math.max(0, Math.ceil((expiresAt - now) / 1000));
    }, [expiresAt, now]);

    const isActive = Boolean(expiresAt) && secondsLeft > 0;
    const isExpired = Boolean(expiresAt) && secondsLeft === 0;

    const formattedTime = useMemo(() => {
        const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
        const seconds = String(secondsLeft % 60).padStart(2, "0");
        return `${minutes}:${seconds}`;
    }, [secondsLeft]);

    const start = () => {
        setNow(Date.now());
        setExpiresAt(Date.now() + duration * 1000);
    };

    const reset = () => {
        setExpiresAt(null);
        setNow(Date.now());
    };

    return {
        formattedTime,
        isActive,
        isExpired,
        secondsLeft,
        start,
        reset,
    };
}
