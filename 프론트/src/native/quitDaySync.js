import { Capacitor, registerPlugin } from "@capacitor/core";

const QuitDaySync = registerPlugin("QuitDaySync");

export async function syncQuitDaysToWatch(quitDays) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
        return;
    }

    try {
        await QuitDaySync.syncQuitDays({ quitDays });
    } catch (error) {
        console.error("Failed to sync quit days to watch", error);
    }
}
