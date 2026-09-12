import Foundation
import WatchConnectivity
import UserNotifications

class PhoneConnectivityManager: NSObject {
    static let shared = PhoneConnectivityManager()

    private let baseURL = "https://u7lpt81uee.onrender.com"

    private override init() { super.init() }

    // MARK: - WCSession 시작

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - iPhone → Watch: 로그인 정보 전송

    func sendUserInfoToWatch(userId: String, userName: String, userLoginId: String) {
        guard WCSession.default.activationState == .activated else {
            print("❌ WCSession 미활성화")
            return
        }
        print("📡 WCSession 상태 — paired: \(WCSession.default.isPaired), watchInstalled: \(WCSession.default.isWatchAppInstalled)")

        let context: [String: Any] = [
            "user_id":       userId,
            "user_name":     userName,
            "user_login_id": userLoginId
        ]
        do {
            try WCSession.default.updateApplicationContext(context)
            print("✅ applicationContext 업데이트 — userId: \(userId)")
        } catch {
            print("❌ applicationContext 업데이트 실패: \(error.localizedDescription)")
        }
    }

    // MARK: - iPhone → Watch: 위기 알림

    func sendCrisisAlertToWatch(userName: String, savedMoney: Int) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isReachable else { return }
        WCSession.default.sendMessage([
            "type":       "crisisAlert",
            "userName":   userName,
            "savedMoney": savedMoney
        ], replyHandler: nil)
    }
}

// MARK: - WCSessionDelegate

extension PhoneConnectivityManager: WCSessionDelegate {

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        if let error {
            print("❌ iPhone WCSession 활성화 실패: \(error.localizedDescription)")
            return
        }
        print("✅ iPhone WCSession 활성화 완료")

        // 활성화 직후 저장된 유저 정보 자동 재전송
        let userId   = UserDefaults.standard.string(forKey: "watch_user_id")      ?? ""
        let userName = UserDefaults.standard.string(forKey: "watch_user_name")    ?? ""
        let loginId  = UserDefaults.standard.string(forKey: "watch_user_login_id") ?? ""
        guard !userId.isEmpty else {
            print("ℹ️ 저장된 유저 없음 — 로그인 후 자동 전송됩니다")
            return
        }
        print("🔄 WCSession 활성화 후 자동 재전송 — userId: \(userId)")
        sendUserInfoToWatch(userId: userId, userName: userName, userLoginId: loginId)
    }

    // MARK: Watch → iPhone: sendMessage 수신 (로그인 정보 재요청 전용)

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        switch type {
        case "requestUserInfo":
            let userId   = UserDefaults.standard.string(forKey: "watch_user_id")       ?? ""
            let userName = UserDefaults.standard.string(forKey: "watch_user_name")     ?? ""
            let loginId  = UserDefaults.standard.string(forKey: "watch_user_login_id") ?? ""
            guard !userId.isEmpty else { return }
            session.sendMessage(
                ["user_id": userId, "user_name": userName, "user_login_id": loginId],
                replyHandler: nil
            ) { _ in self.sendUserInfoToWatch(userId: userId, userName: userName, userLoginId: loginId) }
        case "hrvSpike":          handleHRVSpike(message)
        case "sessionEnd":        handleSessionEnd(message)
        case "reanalyzeRequest":  handleReanalyzeRequest(message)
        default: break
        }
    }

    func session(_ session: WCSession,
                 didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        // 워치가 replyHandler로 로그인 정보를 요청하면 즉시 응답으로 돌려준다
        if (message["type"] as? String) == "requestUserInfo" {
            let userId   = UserDefaults.standard.string(forKey: "watch_user_id")       ?? ""
            let userName = UserDefaults.standard.string(forKey: "watch_user_name")     ?? ""
            let loginId  = UserDefaults.standard.string(forKey: "watch_user_login_id") ?? ""
            print("📤 [iPhone] requestUserInfo 응답 — userId=\(userId.isEmpty ? "(없음)" : userId)")
            replyHandler([
                "user_id":       userId,
                "user_name":     userName,
                "user_login_id": loginId
            ])
            // applicationContext에도 저장(영속) — 다음엔 워치가 즉시 복원
            if !userId.isEmpty {
                sendUserInfoToWatch(userId: userId, userName: userName, userLoginId: loginId)
            }
            return
        }
        replyHandler(["ok": true])
    }

    // MARK: Watch → iPhone: transferUserInfo 수신 (모션 윈도우 / HR 배치)

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let type = userInfo["type"] as? String else { return }
        switch type {
        case "requestUserInfo":   handleUserInfoRequest()
        case "motionWindow":      handleMotionWindow(userInfo)
        case "heartRateBatch":   handleHeartRateBatch(userInfo)
        case "hrvSpike":          handleHRVSpike(userInfo)
        case "sessionEnd":        handleSessionEnd(userInfo)
        case "reanalyzeRequest":  handleReanalyzeRequest(userInfo)
        default:
            print("⚠️ [iPhone] 알 수 없는 userInfo type: \(type)")
        }
    }

    // MARK: - Watch의 로그인 정보 요청(큐) 처리 → applicationContext로 응답

    private func handleUserInfoRequest() {
        let userId   = UserDefaults.standard.string(forKey: "watch_user_id")       ?? ""
        let userName = UserDefaults.standard.string(forKey: "watch_user_name")     ?? ""
        let loginId  = UserDefaults.standard.string(forKey: "watch_user_login_id") ?? ""
        guard !userId.isEmpty else {
            print("ℹ️ [iPhone] requestUserInfo(큐) — 저장된 로그인 없음")
            return
        }
        print("📤 [iPhone] requestUserInfo(큐) 응답 → applicationContext 전송")
        sendUserInfoToWatch(userId: userId, userName: userName, userLoginId: loginId)
    }

    // MARK: - iPhone → Watch: 금연 일수 전송

    func sendQuitDaysToWatch(quitDays: Int) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isPaired,
              WCSession.default.isWatchAppInstalled else {
            print("❌ [Phone] Watch 연결 안됨 — quitDays 전송 불가")
            return
        }
        do {
            try WCSession.default.updateApplicationContext(["quit_days": quitDays])
            print("✅ [Phone] quitDays 전송 완료 — \(quitDays)일")
        } catch {
            print("❌ [Phone] quitDays 전송 실패: \(error.localizedDescription)")
        }
    }

    // MARK: - 모션 윈도우 수신 처리 (24 피처)
    // Watch → iPhone → API 전달
    // payload 키명 = DB 컬럼명(watch_motion_features)

    private func handleMotionWindow(_ info: [String: Any]) {
        print("═══════════════════════════════════════════════════")
        print("📨 [iPhone] motionWindow 수신")

        // ── 유저 확인
        let userId = UserDefaults.standard.string(forKey: "watch_user_id") ?? ""
        guard !userId.isEmpty else {
            print("   ⚠️ [iPhone] 유저 미로그인 — 전송 불가")
            return
        }
        print("   user_id     : \(userId)")

        // ── 기본 필드 파싱
        guard let measuredAt  = info["measured_at"]  as? String,
              let sampleCount = info["sample_count"] as? Int else {
            print("   ❌ [iPhone] 기본 필드 파싱 실패 — keys: \(Array(info.keys))")
            return
        }
        print("   measured_at : \(measuredAt)")
        print("   sample_count: \(sampleCount)")

        // ── 24 피처 파싱 (6축 × 4통계, skewness/kurtosis)
        let axes  = ["accel_x", "accel_y", "accel_z", "gyro_x", "gyro_y", "gyro_z"]
        let stats = ["max", "min", "skewness", "kurtosis"]

        var body: [String: Any] = [
            "user_id":      userId,
            "measured_at":  measuredAt,
            "sample_count": sampleCount
        ]

        var missingKeys: [String] = []
        for axis in axes {
            for stat in stats {
                let key = "\(axis)_\(stat)"
                if let val = info[key] as? Double {
                    body[key] = val
                } else {
                    missingKeys.append(key)
                }
            }
        }

        if !missingKeys.isEmpty {
            print("   ⚠️ [iPhone] 누락 피처 (0 대체): \(missingKeys)")
            for key in missingKeys { body[key] = 0.0 }
        } else {
            print("   ✅ [iPhone] 24개 피처 모두 파싱 완료")
        }

        // ── API 전송
        print("   📤 [iPhone] POST /api/motion/window 전송 중...")
        postJSON(to: "\(baseURL)/api/motion/window", body: body) { statusCode, responseBody in
            // 실시간 예측은 하지 않는다. (윈도우는 DB 저장만)
            // 흡연 판정은 수집 종료 시 reanalyzeRequest → handleSmokingPrediction 에서 일괄 수행.
            if (200..<300).contains(statusCode) {
                print("   ✅ [iPhone] 윈도우 저장 성공 — HTTP \(statusCode) (예측은 수집 종료 시)")
            } else {
                print("   ❌ [iPhone] 윈도우 저장 실패 — HTTP \(statusCode)")
                print("      응답: \(responseBody)")
            }
            print("═══════════════════════════════════════════════════")
        }
    }

    // MARK: - 흡연 감지 결과 처리 → Watch 알림

    private func handleSmokingPrediction(responseBody: String) {
        // 서버 응답 전체 출력 (디버깅용)
        print("   📄 [iPhone] 서버 응답 전체: \(responseBody)")

        guard
            let data      = responseBody.data(using: .utf8),
            let json      = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            print("   ❌ [iPhone] 응답 JSON 파싱 실패 — responseBody=\(responseBody)")
            return
        }

        // is_smoking 필드가 없으면 서버 미배포 상태
        guard let isSmoking = json["is_smoking"] as? Bool else {
            print("   ❌ [iPhone] 응답에 is_smoking 없음 — 서버 재배포 필요")
            print("      응답 keys: \(Array(json.keys))")
            return
        }

        let confidence = json["smoking_confidence"] as? Double ?? 0.0
        let icon       = isSmoking ? "🚬" : "✅"
        print("   \(icon) [iPhone] AI 결과 — is_smoking=\(isSmoking), confidence=\(String(format: "%.1f%%", confidence * 100))")

        // ── 결과를 항상 Watch로 전송 (흡연·비흡연 모두)
        guard WCSession.default.activationState == .activated else {
            print("   ❌ [iPhone] WCSession 미활성화 — Watch 전송 불가")
            return
        }

        let message: [String: Any] = [
            "type":                 "motionResult",   // 항상 전송되는 결과 타입
            "is_smoking":           isSmoking,
            "confidence":           confidence,
            "raw_label":            json["raw_label"]            as? String ?? "",
            "corrected_label":      json["corrected_label"]      as? String ?? "",
            "session_window_count": json["session_window_count"] as? Int    ?? 0
        ]

        if WCSession.default.isReachable {
            print("   📡 [iPhone] Watch로 motionResult sendMessage 전송 (is_smoking=\(isSmoking))")
            WCSession.default.sendMessage(message, replyHandler: nil) { error in
                print("   ⚠️ [iPhone] sendMessage 실패(\(error.localizedDescription)) — transferUserInfo로 재시도")
                WCSession.default.transferUserInfo(message)
            }
        } else {
            print("   📡 [iPhone] Watch 미연결 — motionResult transferUserInfo 전송")
            WCSession.default.transferUserInfo(message)
        }
    }

    // MARK: - 심박수 배치 수신 처리

    private func handleHeartRateBatch(_ info: [String: Any]) {
        let userId = UserDefaults.standard.string(forKey: "watch_user_id") ?? ""
        guard !userId.isEmpty else {
            print("⚠️ [iPhone] HR 배치 스킵 — userId 없음 (로그인 필요)")
            return
        }
        guard let readings = info["readings"] as? [[String: Any]], !readings.isEmpty else {
            print("⚠️ [iPhone] HR 배치 스킵 — readings 없음")
            return
        }

        // 최신 BPM → UserDefaults 캐시 갱신 (React 앱 실시간 표시용)
        if let latestReading = readings.last,
           let bpm = latestReading["bpm"] as? Double,
           let measuredAt = latestReading["measured_at"] as? String {
            UserDefaults.standard.set(bpm,        forKey: "watch_latest_bpm")
            UserDefaults.standard.set(measuredAt, forKey: "watch_latest_measured_at")
            NotificationCenter.default.post(
                name: .heartRateReceived,
                object: nil,
                userInfo: ["bpm": bpm, "measuredAt": measuredAt]
            )
        }

        let body: [String: Any] = ["user_id": userId, "readings": readings]
        print("📤 [iPhone] HR 배치 전송 시도 — \(readings.count)개 readings, userId: \(userId)")

        postJSON(to: "\(baseURL)/api/UserHeart/batch", body: body) { statusCode, responseBody in
            if (200..<300).contains(statusCode) {
                print("✅ [iPhone] HR 배치 전송 성공 — \(readings.count)개 / HTTP \(statusCode)")
            } else {
                print("❌ [iPhone] HR 배치 전송 실패 — HTTP \(statusCode) / 응답: \(responseBody)")
            }
        }
    }

    // MARK: - HRV 급상승 수신 → iPhone 로컬 알림

    private func handleHRVSpike(_ info: [String: Any]) {
        let rmssd = info["rmssd"] as? Double ?? 0.0
        print("🫀 [iPhone] HRV 급상승 수신 — RMSSD=\(String(format:"%.1f",rmssd))ms → 로컬 알림")
        postLocalNotification(
            id:    "hrv-iphone-\(Date().timeIntervalSince1970)",
            title: "🫀 워치에서 심박변이도 급상승",
            body:  "RMSSD \(Int(rmssd))ms — 흡연 가능성 감지. 워치에서 자동 수집을 허용하거나, 앱에서 확인하세요."
        )
    }

    // MARK: - 세션 종료 → HLSDA 캐시 리셋 API 호출

    private func handleSessionEnd(_ info: [String: Any]) {
        let userId = info["user_id"] as? String
                  ?? UserDefaults.standard.string(forKey: "watch_user_id") ?? ""
        guard !userId.isEmpty,
              let url = URL(string: "\(baseURL)/api/motion/\(userId)/session") else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.timeoutInterval = 15
        URLSession.shared.dataTask(with: req) { _, response, _ in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("🗑️ [iPhone] HLSDA 세션 캐시 리셋 — HTTP \(code)")
        }.resume()
    }

    // MARK: - 재분석 요청 → 최근 세션 데이터로 서버 재예측

    private func handleReanalyzeRequest(_ info: [String: Any]) {
        let userId = info["user_id"] as? String
                  ?? UserDefaults.standard.string(forKey: "watch_user_id") ?? ""
        guard !userId.isEmpty,
              let url = URL(string: "\(baseURL)/api/motion/\(userId)/reanalyze") else { return }

        print("🔁 [iPhone] 재분석 요청 → GET \(url)")
        var req = URLRequest(url: url)
        req.timeoutInterval = 30
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            guard let data, let body = String(data: data, encoding: .utf8) else { return }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("🔁 [iPhone] 재분석 응답 — HTTP \(code): \(body)")
            self?.handleSmokingPrediction(responseBody: body)
        }.resume()
    }

    // MARK: - iPhone 로컬 알림 헬퍼

    private func postLocalNotification(id: String, title: String, body: String) {
        let content       = UNMutableNotificationContent()
        content.title     = title
        content.body      = body
        content.sound     = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: id, content: content, trigger: nil)
        )
    }

    // MARK: - 공통 JSON POST 헬퍼

    private func postJSON(to urlString: String,
                          body: [String: Any],
                          completion: @escaping (Int, String) -> Void) {
        guard let url  = URL(string: urlString),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: url)
        request.httpMethod  = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        request.httpBody = data

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                print("❌ [iPhone] 네트워크 오류 \(urlString): \(error.localizedDescription)")
                return
            }
            let bodyStr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "(없음)"
            if let http = response as? HTTPURLResponse {
                completion(http.statusCode, bodyStr)
            }
        }.resume()
    }

}

// MARK: - Notification 이름

extension Notification.Name {
    static let watchUserLogin    = Notification.Name("watchUserLogin")
    static let watchCrisisAlert  = Notification.Name("watchCrisisAlert")
    static let heartRateReceived = Notification.Name("heartRateReceived")
    static let watchNeedsRelogin = Notification.Name("watchNeedsRelogin")
}
