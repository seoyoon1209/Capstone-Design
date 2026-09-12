import { Capacitor, registerPlugin } from "@capacitor/core";
import axios from "src/api/axios";

const HeartRateSync = registerPlugin("HeartRateSync");
const LAST_SYNC_KEY = "watch.heartRate.lastSynced";

export async function getLatestHeartRateFromWatch() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
        return null;
    }

    try {
        const result = await HeartRateSync.getLatestHeartRate();
        if (!result?.bpm || !result?.measuredAt) {
            return null;
        }

        return {
            bpm: Number(result.bpm),
            measured_at: result.measuredAt,
            source: result.source || "watch",
        };
    } catch (error) {
        console.error("Failed to get heart rate from watch", error);
        return null;
    }
}

export async function syncHeartRateToServer(userId) {
    if (!userId) return null;

    // 워치에서 최신 심박수를 읽고, 값이 없으면 서버 요청 없이 종료한다.
    const latest = await getLatestHeartRateFromWatch();
    if (!latest?.measured_at) {
        return null;
    }

    const syncKey = `${LAST_SYNC_KEY}:${userId}`;
    const lastSyncedAt = localStorage.getItem(syncKey);

    // 마지막으로 보낸 측정 시각과 같으면 중복 저장을 막기 위해 전송하지 않는다.
    if (lastSyncedAt === latest.measured_at) {
        return null;
    }

    try {
        // 워치에서 읽은 심박수를 백엔드 로그 API에 저장한다.
        const response = await axios.post("/api/UserHeart/log", {
            user_id: userId,
            bpm: latest.bpm,
            measured_at: latest.measured_at,
            source: latest.source,
        });

        localStorage.setItem(syncKey, latest.measured_at);
        return response.data;
    } catch (error) {
        console.error("Failed to sync heart rate to backend", error);
        return null;
    }
}
