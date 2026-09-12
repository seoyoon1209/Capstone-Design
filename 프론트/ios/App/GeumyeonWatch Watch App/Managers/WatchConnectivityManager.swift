import Foundation
import WatchConnectivity
import Combine
import UserNotifications

class WatchConnectivityManager: NSObject, ObservableObject {
    static let shared = WatchConnectivityManager()

    @Published var userId:    String = ""
    @Published var userName:  String = ""
    @Published var quitDays:  Int?   = nil

    // 로그인 정보 요청 상태(대기 화면 피드백용)
    @Published var loginStatus: String = ""

    // 모션 결과
    @Published var smokingAlertActive: Bool   = false
    @Published var smokingConfidence:  Double = 0.0
    @Published var lastIsSmoking:      Bool?  = nil
    @Published var lastConfidence:     Double = 0.0
    @Published var lastRawLabel:       String = ""
    @Published var lastCorrectedLabel: String = ""
    @Published var sessionWindowCount: Int    = 0

    // HRV 자동 수집 동의 요청
    @Published var showHRVConsentAlert: Bool   = false
    @Published var pendingHRVRmssd:     Double = 0.0

    private override init() { super.init() }

    // MARK: - WCSession 시작

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - iPhone에 로그인 정보 재요청

    func requestUserInfo() {
        // 1) 이미 받아둔 applicationContext가 있으면 그것으로 즉시 적용
        let ctx = WCSession.default.receivedApplicationContext
        if let uid = ctx["user_id"] as? String, !uid.isEmpty {
            print("✅ [Watch] 저장된 applicationContext에서 로그인 복원")
            applyContext(ctx)
            return
        }

        // 2) 세션이 아직 활성화 안 됐으면 안내
        guard WCSession.default.activationState == .activated else {
            DispatchQueue.main.async { self.loginStatus = "연결 준비 중… 잠시 후 다시 시도하세요" }
            print("⚠️ [Watch] WCSession 미활성화 — requestUserInfo 보류")
            return
        }

        // 3) iPhone이 닿으면 즉시 요청(응답으로 직접 수신)
        if WCSession.default.isReachable {
            DispatchQueue.main.async { self.loginStatus = "iPhone에서 정보 가져오는 중…" }
            print("📤 [Watch] requestUserInfo 전송(reachable)")
            WCSession.default.sendMessage(
                ["type": "requestUserInfo"],
                replyHandler: { [weak self] reply in
                    print("📨 [Watch] requestUserInfo 응답 수신")
                    self?.applyContext(reply)
                    DispatchQueue.main.async { self?.loginStatus = "" }
                },
                errorHandler: { [weak self] err in
                    print("❌ [Watch] requestUserInfo 실패: \(err.localizedDescription)")
                    DispatchQueue.main.async {
                        self?.loginStatus = "가져오기 실패 — iPhone 앱을 열고 다시 시도하세요"
                    }
                }
            )
        } else {
            // 4) iPhone 미연결 — 큐로 요청 남기고 안내
            DispatchQueue.main.async {
                self.loginStatus = "iPhone 앱을 먼저 열어주세요"
            }
            print("⚠️ [Watch] iPhone 미연결 — transferUserInfo로 요청 큐잉")
            WCSession.default.transferUserInfo(["type": "requestUserInfo"])
        }
    }

    // MARK: - Watch → iPhone: 심박수 배치 전송

    func sendHeartRateBatch(readings: [(bpm: Double, measuredAt: Date)]) {
        guard WCSession.default.activationState == .activated, !readings.isEmpty else { return }
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
        let arr: [[String: Any]] = readings.map {
            ["bpm": $0.bpm, "measured_at": formatter.string(from: $0.measuredAt), "source": "watch"]
        }
        WCSession.default.transferUserInfo(["type": "heartRateBatch", "readings": arr])
        print("💓 [Watch] HR 배치 전송 — \(readings.count)개")
    }

    // MARK: - 알림 권한 요청 + 카테고리 등록

    func requestNotificationPermission() {
        let allowAction = UNNotificationAction(
            identifier: "HRV_ALLOW", title: "허용", options: .foreground
        )
        let denyAction = UNNotificationAction(
            identifier: "HRV_DENY", title: "거부", options: []
        )
        let hrvCategory = UNNotificationCategory(
            identifier: "HRV_SPIKE",
            actions: [allowAction, denyAction],
            intentIdentifiers: []
        )
        let openCategory = UNNotificationCategory(
            identifier: "OPEN_IPHONE",
            actions: [],
            intentIdentifiers: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([hrvCategory, openCategory])
        // 앱이 켜져 있을 때(포그라운드)도 알림 배너가 뜨도록 delegate 등록
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            print("📣 [Watch] 알림 권한 \(granted ? "허용" : "거부")")
        }
    }

    // MARK: - 흡연 감지 알림

    func resetMotionResult() {
        lastIsSmoking = nil; lastConfidence = 0.0
        lastRawLabel = ""; lastCorrectedLabel = ""
        sessionWindowCount = 0
    }

    /// 분석 결과 알림 — 흡연/비흡연 모두 발송
    private func triggerResultNotification(isSmoking: Bool, confidence: Double, windowCount: Int) {
        let content = UNMutableNotificationContent()
        if isSmoking {
            content.title = "🚬 흡연 감지"
            content.body  = "모션 분석 결과 흡연이 감지됐습니다. (흡연 비율 \(Int(confidence * 100))%) 금연을 유지해보세요!"
        } else {
            content.title = "✅ 분석 완료 — 흡연 아님"
            content.body  = "최근 수집 \(windowCount)개 구간 분석 결과 흡연이 감지되지 않았습니다. 잘하고 있어요!"
        }
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(
                identifier: "motionResult-\(Date().timeIntervalSince1970)",
                content: content, trigger: nil
            )
        )
        print("📣 [Watch] 결과 알림 등록 — \(isSmoking ? "흡연" : "비흡연")")
    }

    // MARK: - HRV 급상승 수신 → 인앱 동의 또는 알림

    func handleHRVSpike(rmssd: Double) {
        print("🚨 [Watch] HRV 급상승 수신 — RMSSD=\(String(format:"%.1f",rmssd))ms")
        DispatchQueue.main.async {
            self.pendingHRVRmssd    = rmssd
            self.showHRVConsentAlert = true
        }
        // iPhone에도 HRV 스파이크 전달 (iPhone 알림용)
        let msg: [String: Any] = [
            "type":  "hrvSpike",
            "rmssd": rmssd
        ]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(msg, replyHandler: nil) { _ in
                WCSession.default.transferUserInfo(msg)
            }
        } else {
            WCSession.default.transferUserInfo(msg)
        }
    }

    // MARK: - 수동 재분석 요청 (iPhone에 신호)

    func requestReanalyze(userId: String) {
        let msg: [String: Any] = ["type": "reanalyzeRequest", "user_id": userId]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(msg, replyHandler: nil, errorHandler: nil)
        } else {
            WCSession.default.transferUserInfo(msg)
        }
        print("🔁 [Watch] 수동 재분석 요청 전송 → iPhone")
    }

    // MARK: - 세션 리셋 (iPhone에 신호)

    func notifySessionEnd(userId: String) {
        let msg: [String: Any] = ["type": "sessionEnd", "user_id": userId]
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(msg, replyHandler: nil, errorHandler: nil)
        } else {
            WCSession.default.transferUserInfo(msg)
        }
        print("🗑️ [Watch] 세션 종료 신호 전송 → iPhone이 HLSDA 캐시 리셋")
    }

    // MARK: - 수신 처리

    private func handleIncoming(_ payload: [String: Any]) {
        guard let type = payload["type"] as? String else { applyContext(payload); return }
        switch type {
        case "motionResult":
            let isSmoking   = payload["is_smoking"]           as? Bool   ?? false
            let confidence  = payload["confidence"]           as? Double ?? 0.0
            let raw         = payload["raw_label"]            as? String ?? ""
            let corrected   = payload["corrected_label"]      as? String ?? ""
            let winCount    = payload["session_window_count"] as? Int    ?? 0
            print("🤖 [Watch] motionResult — is_smoking=\(isSmoking), conf=\(String(format:"%.1f%%",confidence*100)), raw=\(raw)→corrected=\(corrected), windows=\(winCount)")
            applyMotionResult(isSmoking: isSmoking, confidence: confidence,
                              raw: raw, corrected: corrected, windowCount: winCount)

        case "smokingAlert":
            let confidence = payload["confidence"] as? Double ?? 0.0
            applyMotionResult(isSmoking: true, confidence: confidence,
                              raw: "smoke", corrected: "smoke", windowCount: 0)

        default:
            applyContext(payload)
        }
    }

    private func applyMotionResult(isSmoking: Bool, confidence: Double,
                                   raw: String, corrected: String, windowCount: Int) {
        DispatchQueue.main.async {
            self.lastIsSmoking      = isSmoking
            self.lastConfidence     = confidence
            self.lastRawLabel       = raw
            self.lastCorrectedLabel = corrected
            self.sessionWindowCount = windowCount
            if isSmoking {
                self.smokingConfidence  = confidence
                self.smokingAlertActive = true
                print("🚨 [Watch] 흡연 감지 → 알림 시트 표시")
            } else {
                print("✅ [Watch] 비흡연 결과 → MotionTab 업데이트")
            }
        }
        // 흡연/비흡연 모두 결과 알림 발송
        triggerResultNotification(isSmoking: isSmoking, confidence: confidence, windowCount: windowCount)
    }

    private func applyContext(_ context: [String: Any]) {
        DispatchQueue.main.async {
            if let uid  = context["user_id"]   as? String, !uid.isEmpty,
               let name = context["user_name"] as? String {
                self.userId = uid; self.userName = name
                print("✅ [Watch] 유저 수신 — userId=\(uid)")
            }
            if let days = context["quit_days"] as? Int {
                self.quitDays = days
                print("✅ [Watch] quitDays=\(days)일")
            }
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        print("[Watch] WCSession 활성화 완료")
        applyContext(session.receivedApplicationContext)
    }

    func session(_ session: WCSession,
                 didReceiveApplicationContext applicationContext: [String: Any]) {
        applyContext(applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        print("📨 [Watch] sendMessage — type: \(message["type"] ?? "-")")
        handleIncoming(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        print("📨 [Watch] userInfo — type: \(userInfo["type"] ?? "-")")
        handleIncoming(userInfo)
    }
}

// MARK: - UNUserNotificationCenterDelegate (포그라운드 알림 표시)

extension WatchConnectivityManager: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler:
                                    @escaping (UNNotificationPresentationOptions) -> Void) {
        // 앱이 켜져 있어도 배너 + 소리로 알림 표시
        completionHandler([.banner, .sound, .list])
    }
}
