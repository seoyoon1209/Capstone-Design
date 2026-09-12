import CoreMotion
import WatchConnectivity
import WatchKit
import Foundation
import Combine
import UserNotifications

// 수집 트리거 모드
enum CollectionMode {
    case manual   // 사용자 버튼 클릭
    case auto     // HRV 급상승 자동 트리거
}

class MotionCollector: NSObject, ObservableObject {
    private let motion = CMMotionManager()

    // 화면 유지
    private var extendedSession: WKExtendedRuntimeSession?

    // MARK: - 설정
    let sessionDuration = 300
    let windowDuration  = 30

    // MARK: - Published 상태
    @Published var isRecording:      Bool   = false
    @Published var remainingSeconds: Int    = 300
    @Published var windowCount:      Int    = 0
    @Published var statusMessage:    String = "대기 중"
    @Published var collectionMode:   CollectionMode = .manual

    // 수동 수집 완료 후 "모델에 입력" 대기 상태
    @Published var pendingManualInput: Bool = false

    // 실시간 센서값
    @Published var currentAX: Double = 0
    @Published var currentAY: Double = 0
    @Published var currentAZ: Double = 0
    @Published var currentGX: Double = 0
    @Published var currentGY: Double = 0
    @Published var currentGZ: Double = 0

    // MARK: - 내부 상태
    private var axisBuffers: [[Double]] = Array(repeating: [], count: 6)
    private var windowStart = Date()
    private var windowTimer: Timer?
    private var sessionTimer: Timer?

    var onWindowFlush: (() -> Void)?

    // MARK: - 시작 (수동)

    func startRecording(mode: CollectionMode = .manual) {
        // 이미 수집 중이면 중복 시작 금지 (타이머가 겹쳐 5분이 빨리 줄고 재분석이 여러 번 나가는 문제 방지)
        guard !isRecording else {
            print("⚠️ [MotionCollector] 이미 수집 중 — 중복 시작 무시")
            return
        }
        guard motion.isDeviceMotionAvailable else {
            statusMessage = "모션 센서 없음"
            print("❌ [MotionCollector] 모션 센서 사용 불가")
            return
        }
        // 잔여 타이머가 있으면 정리(안전장치)
        windowTimer?.invalidate(); sessionTimer?.invalidate()
        windowTimer = nil; sessionTimer = nil

        collectionMode    = mode
        axisBuffers       = Array(repeating: [], count: 6)
        windowCount       = 0
        remainingSeconds  = sessionDuration
        windowStart       = Date()
        isRecording       = true
        pendingManualInput = false
        statusMessage     = mode == .auto ? "자동 수집 중..." : "수집 중..."

        startExtendedSession()
        let modeStr = mode == .auto ? "자동(HRV)" : "수동"
        print("▶️  [MotionCollector] 5분 세션 시작 (\(modeStr)) — 50Hz, 30초 윈도우")

        motion.deviceMotionUpdateInterval = 1.0 / 50.0
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, error in
            guard let self, let data else { return }
            // 학습 데이터(Android 스마트워치) 단위에 맞춘다:
            //  · 가속도 = 중력 포함 m/s²  (userAcceleration + gravity, 단위 g → ×9.81)
            //  · 자이로 = rad/s         (rotationRate 그대로, 변환 X)
            let G = 9.81
            let ax = (data.userAcceleration.x + data.gravity.x) * G
            let ay = (data.userAcceleration.y + data.gravity.y) * G
            let az = (data.userAcceleration.z + data.gravity.z) * G
            let gx = data.rotationRate.x
            let gy = data.rotationRate.y
            let gz = data.rotationRate.z
            self.axisBuffers[0].append(ax)
            self.axisBuffers[1].append(ay)
            self.axisBuffers[2].append(az)
            self.axisBuffers[3].append(gx)
            self.axisBuffers[4].append(gy)
            self.axisBuffers[5].append(gz)
            self.currentAX = ax; self.currentAY = ay; self.currentAZ = az
            self.currentGX = gx; self.currentGY = gy; self.currentGZ = gz
        }

        windowTimer = Timer.scheduledTimer(
            withTimeInterval: TimeInterval(windowDuration), repeats: true
        ) { [weak self] _ in self?.flushWindow() }

        sessionTimer = Timer.scheduledTimer(
            withTimeInterval: 1.0, repeats: true
        ) { [weak self] _ in
            guard let self else { return }
            remainingSeconds -= 1
            if remainingSeconds <= 0 { stopRecording() }
        }
    }

    // MARK: - 화면 유지

    private func startExtendedSession() {
        extendedSession?.invalidate()
        extendedSession = WKExtendedRuntimeSession()
        extendedSession?.delegate = self
        extendedSession?.start()
        print("🔆 [MotionCollector] WKExtendedRuntimeSession 시작 — 화면 유지")
    }

    private func stopExtendedSession() {
        extendedSession?.invalidate()
        extendedSession = nil
        print("🔅 [MotionCollector] WKExtendedRuntimeSession 종료")
    }

    // MARK: - 통계 계산

    private func computeStats(_ values: [Double]) -> (max: Double, min: Double, skewness: Double, kurtosis: Double) {
        guard values.count > 1 else { return (values.first ?? 0, values.first ?? 0, 0, 0) }
        let n    = Double(values.count)
        let maxV = values.max()!
        let minV = values.min()!
        let mean = values.reduce(0, +) / n
        let variance = values.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / n
        let std  = variance > 0 ? variance.squareRoot() : 0
        guard std > 1e-10 else { return (maxV, minV, 0, 0) }
        let skewness = values.map { pow(($0 - mean) / std, 3) }.reduce(0, +) / n
        let kurtosis = values.map { pow(($0 - mean) / std, 4) }.reduce(0, +) / n - 3
        return (maxV, minV, skewness, kurtosis)
    }

    // MARK: - 30초 윈도우 flush

    func flushWindow() {
        guard !axisBuffers[0].isEmpty else { return }
        let measuredAt  = Date()
        let buffers     = axisBuffers
        let sampleCount = buffers[0].count
        axisBuffers = Array(repeating: [], count: 6)
        windowStart = measuredAt
        windowCount += 1

        let sAX = computeStats(buffers[0]); let sAY = computeStats(buffers[1])
        let sAZ = computeStats(buffers[2]); let sGX = computeStats(buffers[3])
        let sGY = computeStats(buffers[4]); let sGZ = computeStats(buffers[5])

        let total = sessionDuration / windowDuration
        print("─────────────────────────────────────────────")
        print("📊 [MotionCollector] 윈도우 \(windowCount)/\(total)  샘플=\(sampleCount)")

        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")

        let payload: [String: Any] = [
            "type": "motionWindow",
            "measured_at": formatter.string(from: measuredAt),
            "sample_count": sampleCount,
            "collection_mode": collectionMode == .auto ? "auto" : "manual",
            "accel_x_max": sAX.max, "accel_x_min": sAX.min,
            "accel_x_skewness": sAX.skewness, "accel_x_kurtosis": sAX.kurtosis,
            "accel_y_max": sAY.max, "accel_y_min": sAY.min,
            "accel_y_skewness": sAY.skewness, "accel_y_kurtosis": sAY.kurtosis,
            "accel_z_max": sAZ.max, "accel_z_min": sAZ.min,
            "accel_z_skewness": sAZ.skewness, "accel_z_kurtosis": sAZ.kurtosis,
            "gyro_x_max": sGX.max, "gyro_x_min": sGX.min,
            "gyro_x_skewness": sGX.skewness, "gyro_x_kurtosis": sGX.kurtosis,
            "gyro_y_max": sGY.max, "gyro_y_min": sGY.min,
            "gyro_y_skewness": sGY.skewness, "gyro_y_kurtosis": sGY.kurtosis,
            "gyro_z_max": sGZ.max, "gyro_z_min": sGZ.min,
            "gyro_z_skewness": sGZ.skewness, "gyro_z_kurtosis": sGZ.kurtosis,
        ]

        // 전송 경로 판단 및 알림
        let isReachable = WCSession.default.isReachable
        print("   📡 [MotionCollector] iPhone 연결: \(isReachable ? "직접 전송" : "큐 저장")")

        WCSession.default.transferUserInfo(payload)
        statusMessage = "윈도우 \(windowCount)/\(total)"
        print("   ✅ [MotionCollector] 윈도우 \(windowCount)/\(total) 전송 완료")

        if !isReachable && windowCount == 1 {
            // 첫 윈도우에서 연결 안 됐을 때 한 번만 알림
            postTransmissionNotification(viaWC: false)
        }
        print("─────────────────────────────────────────────")
        onWindowFlush?()
    }

    // MARK: - 종료

    func stopRecording() {
        // 이미 종료됐으면 중복 종료/재분석 방지
        guard isRecording else {
            print("⚠️ [MotionCollector] 이미 종료됨 — 중복 종료 무시")
            return
        }
        windowTimer?.invalidate()
        sessionTimer?.invalidate()
        windowTimer = nil; sessionTimer = nil
        motion.stopDeviceMotionUpdates()
        isRecording = false
        stopExtendedSession()

        print("⏹  [MotionCollector] 세션 종료 — 윈도우 \(windowCount)개")

        // 마지막 버퍼가 남아 있으면 마지막 윈도우로 전송
        if !axisBuffers[0].isEmpty { flushWindow() }

        DispatchQueue.main.async {
            self.statusMessage = "수집 완료 — 모델 분석 중..."
            // 자동 분석과 별개로 수동 재분석 버튼도 노출 (다시 분석하고 싶을 때)
            self.pendingManualInput = true
        }
        postCollectionCompleteNotification()

        // ── 수집 종료 → 저장된 윈도우들을 한 행씩 모델에 넣어 일괄 분석
        //    마지막 윈도우가 iPhone→서버 DB에 저장될 시간을 준 뒤 재분석 요청.
        let userId = WatchConnectivityManager.shared.userId
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            guard !userId.isEmpty else {
                print("⚠️ [MotionCollector] userId 없음 — 재분석 요청 생략")
                return
            }
            print("🔁 [MotionCollector] 수집 종료 → 자동 재분석 요청")
            WatchConnectivityManager.shared.requestReanalyze(userId: userId)
        }
    }

    // MARK: - 전송 상태 알림

    private func postTransmissionNotification(viaWC: Bool) {
        let content = UNMutableNotificationContent()
        if viaWC {
            content.title = "📤 iPhone으로 전송 완료"
            content.body  = "수집 데이터가 iPhone을 통해 서버로 전송됐습니다."
        } else {
            content.title = "📭 iPhone 연결 안됨"
            content.body  = "데이터가 큐에 저장됐습니다. iPhone 앱을 잠시 열어주세요."
            content.categoryIdentifier = "OPEN_IPHONE"
        }
        content.sound = .default
        let req = UNNotificationRequest(
            identifier: "tx-\(Date().timeIntervalSince1970)",
            content: content, trigger: nil
        )
        UNUserNotificationCenter.current().add(req)
        print("   📣 [MotionCollector] 전송 상태 알림 등록 (\(viaWC ? "직접전송" : "큐저장"))")
    }

    private func postCollectionCompleteNotification() {
        let content = UNMutableNotificationContent()
        content.title = "✅ 5분 수집 완료"
        content.body  = "워치 앱에서 결과를 확인하거나 모델에 입력할 수 있습니다."
        content.sound = .default
        let req = UNNotificationRequest(
            identifier: "collection-done-\(Date().timeIntervalSince1970)",
            content: content, trigger: nil
        )
        UNUserNotificationCenter.current().add(req)
    }

    // MARK: - 남은 시간 포맷

    var remainingFormatted: String {
        String(format: "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    private func fmt(_ v: Double) -> String { String(format: "%.4f", v) }
}

// MARK: - WKExtendedRuntimeSessionDelegate

extension MotionCollector: WKExtendedRuntimeSessionDelegate {
    func extendedRuntimeSessionDidStart(_ s: WKExtendedRuntimeSession) {
        print("🔆 [MotionCollector] 화면 유지 세션 시작 ✅")
    }
    func extendedRuntimeSessionWillExpire(_ s: WKExtendedRuntimeSession) {
        // 곧 만료됨 — 무효화 콜백(didInvalidateWith)에서 재시작 처리
        print("⏳ [MotionCollector] 화면 유지 세션 곧 만료")
    }
    func extendedRuntimeSession(
        _ s: WKExtendedRuntimeSession,
        didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
        error: Error?
    ) {
        let r: String
        switch reason {
        case .none:              r = "정상"
        case .error:             r = "오류(\(error?.localizedDescription ?? "-"))"
        case .expired:           r = "만료"
        case .sessionInProgress: r = "세션 중복"
        default:                 r = "알 수 없음"
        }
        print("🔅 [MotionCollector] 화면 유지 세션 무효화: \(r)")
        // 수집 중인데 세션이 끊겼으면 재시작 (중간에 자동 중단 방지)
        if isRecording {
            print("♻️ [MotionCollector] 수집 중 세션 끊김 → 재시작")
            DispatchQueue.main.async { [weak self] in self?.startExtendedSession() }
        }
    }
}
