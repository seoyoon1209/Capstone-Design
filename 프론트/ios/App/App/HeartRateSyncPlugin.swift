import Capacitor

// JS: registerPlugin("HeartRateSync")
// - getLatestHeartRate()         → Watch에서 마지막으로 받은 심박수 반환
// - addListener("heartRateUpdate") → 새 심박수 도착 시 실시간 push 이벤트

@objc(HeartRateSyncPlugin)
public class HeartRateSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier      = "HeartRateSyncPlugin"
    public let jsName          = "HeartRateSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLatestHeartRate", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onHeartRateReceived(_:)),
            name: .heartRateReceived,
            object: nil
        )
        print("✅ [HeartRateSyncPlugin] 로드 완료 — heartRateReceived 리스너 등록")
    }

    // MARK: - JS → Swift: 최신 심박수 조회 (pull)

    @objc func getLatestHeartRate(_ call: CAPPluginCall) {
        let bpm        = UserDefaults.standard.double(forKey: "watch_latest_bpm")
        let measuredAt = UserDefaults.standard.string(forKey: "watch_latest_measured_at") ?? ""

        guard bpm > 0, !measuredAt.isEmpty else {
            print("ℹ️ [HeartRateSyncPlugin] 아직 수신된 심박수 없음")
            call.resolve([:])
            return
        }

        print("📤 [HeartRateSyncPlugin] getLatestHeartRate → \(Int(bpm)) BPM / \(measuredAt)")
        call.resolve([
            "bpm":        bpm,
            "measuredAt": measuredAt,
            "source":     "watch"
        ])
    }

    // MARK: - Swift → JS: 새 심박수 도착 시 push (event)

    @objc private func onHeartRateReceived(_ notification: Notification) {
        guard
            let info       = notification.userInfo,
            let bpm        = info["bpm"]        as? Double,
            let measuredAt = info["measuredAt"] as? String
        else { return }

        print("📡 [HeartRateSyncPlugin] heartRateUpdate 이벤트 발송 — \(Int(bpm)) BPM")
        notifyListeners("heartRateUpdate", data: [
            "bpm":        bpm,
            "measuredAt": measuredAt,
            "source":     "watch"
        ])
    }
}
