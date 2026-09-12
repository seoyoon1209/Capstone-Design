import Foundation
import HealthKit
import Combine
import UserNotifications

class HealthManager: ObservableObject {
    private let store = HKHealthStore()

    @Published var currentBPM:      Double? = nil
    @Published var authorized:      Bool    = false
    @Published var currentRMSSD:    Double  = 0     // 현재 심박변이도 (ms)
    @Published var hrvSpikeActive:  Bool    = false // HRV 급상승 감지 여부

    // 세션 HR 버퍼 (30초 윈도우 배치용)
    private var hrBuffer: [(bpm: Double, measuredAt: Date)] = []
    private var sessionActive = false

    // HRV 모니터링 버퍼 (10초 간격 계산용)
    private var bpmHistory: [(bpm: Double, time: Date)] = []
    private var baselineRMSSD: Double = 0
    private var hrvTimer: Timer?
    private let HRV_HISTORY_MAX  = 20   // 최대 20개 BPM 유지
    private let HRV_SPIKE_RATIO  = 1.8  // baseline 대비 1.8배 이상 → 급상승
    private let HRV_MIN_BASELINE = 10.0 // 기저 RMSSD 최솟값 (ms)

    /// HRV 급상승 감지 시 호출 (MotionCollector에 연결)
    var onHRVSpike: ((Double) -> Void)?

    // MARK: - HealthKit 권한 요청

    func requestAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let heartRateType = HKQuantityType(.heartRate)
        store.requestAuthorization(toShare: [], read: [heartRateType]) { [weak self] success, error in
            DispatchQueue.main.async {
                self?.authorized = success
                if success {
                    self?.startHeartRateQuery()
                    self?.startHRVMonitoring()
                    print("✅ [HealthManager] HealthKit 권한 허용 — HR 쿼리 + HRV 모니터링 시작")
                } else if let error {
                    print("❌ [HealthKit] 권한 실패: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - 세션 시작/종료 (수동 수집용)

    func startSession() {
        hrBuffer.removeAll()
        sessionActive = true
        print("💓 [HealthManager] HR 세션 시작")
        if authorized { startHeartRateQuery() }
    }

    func stopSession() {
        sessionActive = false
        flushHeartRateWindow()
        print("💓 [HealthManager] HR 세션 종료")
    }

    /// MotionCollector의 30초 윈도우 flush 시 호출
    func flushHeartRateWindow() {
        guard !hrBuffer.isEmpty else { return }
        let readings = hrBuffer
        hrBuffer.removeAll()
        WatchConnectivityManager.shared.sendHeartRateBatch(readings: readings)
        print("💓 [HealthManager] HR 배치 전송 — \(readings.count)개")
    }

    // MARK: - 실시간 심박수 쿼리

    private func startHeartRateQuery() {
        let heartRateType = HKQuantityType(.heartRate)
        let predicate     = HKQuery.predicateForSamples(withStart: Date(), end: nil)

        let q = HKAnchoredObjectQuery(
            type:      heartRateType,
            predicate: predicate,
            anchor:    nil,
            limit:     HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, _, _ in self?.processSamples(samples) }

        q.updateHandler = { [weak self] _, samples, _, _, _ in
            self?.processSamples(samples)
        }
        store.execute(q)
    }

    private func processSamples(_ samples: [HKSample]?) {
        guard let samples = samples as? [HKQuantitySample],
              let latest  = samples.last else { return }

        let bpm = latest.quantity.doubleValue(for: .init(from: "count/min"))
        DispatchQueue.main.async { self.currentBPM = bpm }

        // HRV 버퍼에 추가
        bpmHistory.append((bpm: bpm, time: latest.endDate))
        if bpmHistory.count > HRV_HISTORY_MAX { bpmHistory.removeFirst() }

        // 세션 중에만 HR 버퍼에 추가
        if sessionActive {
            hrBuffer.append((bpm: bpm, measuredAt: latest.endDate))
        }
    }

    // MARK: - HRV 모니터링 (10초 간격, RMSSD)

    func startHRVMonitoring() {
        hrvTimer?.invalidate()
        print("🫀 [HealthManager] HRV 모니터링 시작 (10초 간격 RMSSD)")
        hrvTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            self?.evaluateHRV()
        }
    }

    func stopHRVMonitoring() {
        hrvTimer?.invalidate()
        hrvTimer = nil
        print("🫀 [HealthManager] HRV 모니터링 중지")
    }

    private func evaluateHRV() {
        guard bpmHistory.count >= 3 else { return }

        let rmssd = computeRMSSD(bpmHistory.map { $0.bpm })
        DispatchQueue.main.async { self.currentRMSSD = rmssd }
        print("🫀 [HRV] RMSSD=\(String(format:"%.1f",rmssd))ms  baseline=\(String(format:"%.1f",baselineRMSSD))ms  BPM이력=\(bpmHistory.count)개")

        // 기저값 초기화 (처음 3회)
        if baselineRMSSD < HRV_MIN_BASELINE {
            baselineRMSSD = max(rmssd, HRV_MIN_BASELINE)
            print("   🫀 [HRV] 기저 RMSSD 초기화 → \(String(format:"%.1f",baselineRMSSD))ms")
            return
        }

        // 기저값 점진적 업데이트 (EMA α=0.2)
        baselineRMSSD = 0.8 * baselineRMSSD + 0.2 * rmssd

        // 급상승 판정
        let spikeThreshold = baselineRMSSD * HRV_SPIKE_RATIO
        if rmssd > spikeThreshold {
            print("   🚨 [HRV] 급상승 감지! RMSSD=\(String(format:"%.1f",rmssd))ms > threshold=\(String(format:"%.1f",spikeThreshold))ms")
            handleHRVSpike(rmssd: rmssd)
        }
    }

    // MARK: - HRV 급상승 처리

    private var lastSpikeTime: Date = .distantPast
    private let SPIKE_COOLDOWN: TimeInterval = 300   // 5분 쿨다운

    private func handleHRVSpike(rmssd: Double) {
        let now = Date()
        guard now.timeIntervalSince(lastSpikeTime) > SPIKE_COOLDOWN else {
            print("   ⏸️ [HRV] 쿨다운 중 — 스킵")
            return
        }
        lastSpikeTime = now

        DispatchQueue.main.async {
            self.hrvSpikeActive = true
        }
        onHRVSpike?(rmssd)

        // Watch 로컬 알림 (앱이 백그라운드일 때)
        postHRVSpikeNotification(rmssd: rmssd)
    }

    private func postHRVSpikeNotification(rmssd: Double) {
        let content = UNMutableNotificationContent()
        content.title    = "🫀 심박변이도 급상승"
        content.body     = "흡연 가능성이 감지됐습니다. 자동 수집을 시작할까요?"
        content.sound    = .default
        content.categoryIdentifier = "HRV_SPIKE"

        let request = UNNotificationRequest(
            identifier: "hrv-spike-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
        print("   📣 [HRV] Watch 알림 등록 완료")
    }

    // MARK: - RMSSD 계산 (BPM → RR 간격 변환 후 연속 차이 제곱 평균의 제곱근)

    private func computeRMSSD(_ bpms: [Double]) -> Double {
        guard bpms.count >= 2 else { return 0 }
        // RR interval (ms) = 60000 / BPM
        let rr = bpms.map { 60_000.0 / $0 }
        let diffs = zip(rr, rr.dropFirst()).map { ($1 - $0) * ($1 - $0) }
        let meanSq = diffs.reduce(0, +) / Double(diffs.count)
        return meanSq.squareRoot()
    }
}
