import SwiftUI

struct ContentView: View {
    @StateObject private var healthManager = HealthManager()
    @StateObject private var connectivity  = WatchConnectivityManager.shared
    @StateObject private var smokingVM     = SmokingDayViewModel()
    @StateObject private var motionManager = MotionCollector()

    var body: some View {
        if connectivity.userId.isEmpty {
            WaitingLoginView(connectivity: connectivity)
        } else {
            MainTabView(
                healthManager: healthManager,
                smokingVM:     smokingVM,
                connectivity:  connectivity,
                motionManager: motionManager
            )
            .task {
                await smokingVM.load(userId: connectivity.userId)
                healthManager.requestAuthorization()
                connectivity.requestNotificationPermission()

                // HRV 급상승 → 자동 수집 연결
                healthManager.onHRVSpike = { [weak connectivity, weak motionManager] rmssd in
                    guard !(motionManager?.isRecording ?? false) else { return }
                    connectivity?.handleHRVSpike(rmssd: rmssd)
                }
            }
            .onChange(of: connectivity.userId) { _, newId in
                Task { await smokingVM.load(userId: newId) }
            }
            // 흡연 감지 알림 시트
            .sheet(isPresented: $connectivity.smokingAlertActive) {
                SmokingAlertView(
                    isSmoking:      connectivity.lastIsSmoking ?? true,
                    confidence:     connectivity.smokingConfidence,
                    rawLabel:       connectivity.lastRawLabel,
                    correctedLabel: connectivity.lastCorrectedLabel,
                    windowCount:    connectivity.sessionWindowCount,
                    onDismiss:      { connectivity.smokingAlertActive = false }
                )
            }
            // HRV 자동 수집 동의 알림
            .sheet(isPresented: $connectivity.showHRVConsentAlert) {
                HRVConsentView(
                    rmssd: connectivity.pendingHRVRmssd,
                    onAllow: {
                        connectivity.showHRVConsentAlert = false
                        motionManager.startRecording(mode: .auto)
                        healthManager.startSession()
                        motionManager.onWindowFlush = { [weak healthManager] in
                            healthManager?.flushHeartRateWindow()
                        }
                    },
                    onDeny: { connectivity.showHRVConsentAlert = false }
                )
            }
        }
    }
}

// MARK: - 로그인 대기 화면

private struct WaitingLoginView: View {
    @ObservedObject var connectivity: WatchConnectivityManager
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "iphone.and.arrow.forward").font(.title2).foregroundStyle(.blue)
            Text("금연해듀오").font(.headline).fontWeight(.bold)
            Text("iPhone 앱에서\n먼저 로그인하세요")
                .font(.caption2).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button { connectivity.requestUserInfo() } label: {
                Label("로그인 정보 가져오기", systemImage: "arrow.down.circle.fill").font(.caption)
            }
            .buttonStyle(.bordered).tint(.blue)

            if !connectivity.loginStatus.isEmpty {
                Text(connectivity.loginStatus)
                    .font(.system(size: 9)).foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
    }
}

// MARK: - 메인 탭뷰

private struct MainTabView: View {
    @ObservedObject var healthManager: HealthManager
    @ObservedObject var smokingVM:     SmokingDayViewModel
    @ObservedObject var connectivity:  WatchConnectivityManager
    @ObservedObject var motionManager: MotionCollector

    var body: some View {
        TabView {
            QuitDayTab(vm: smokingVM, userName: connectivity.userName)
            HeartRateTab(healthManager: healthManager)
            SavingsTab(vm: smokingVM)
            MotionTab(motionManager: motionManager,
                      healthManager: healthManager,
                      connectivity:  connectivity)
        }
        .tabViewStyle(.page)
    }
}

// MARK: - Tab 1: 금연 현황

private struct QuitDayTab: View {
    @ObservedObject var vm: SmokingDayViewModel
    let userName: String
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                HStack {
                    Image(systemName: "lungs.fill").foregroundStyle(.blue)
                    Text(userName.isEmpty ? "금연 현황" : "\(userName)님")
                        .font(.caption).fontWeight(.semibold)
                }
                if vm.isLoading { ProgressView().padding(.top, 4) }
                else if let err = vm.errorMessage {
                    Text(err).font(.caption2).foregroundStyle(.red).multilineTextAlignment(.center)
                } else {
                    VStack(spacing: 2) {
                        Text("D+\(vm.quitDays)").font(.title2).fontWeight(.black).foregroundStyle(.blue)
                        Text("금연 \(vm.quitDays)일째").font(.caption2).foregroundStyle(.secondary)
                    }
                    Divider()
                    VStack(spacing: 2) {
                        Text("\(vm.recoveryScore)%").font(.title3).fontWeight(.bold).foregroundStyle(.green)
                        Text("신체 회복 점수").font(.caption2).foregroundStyle(.secondary)
                    }
                    ProgressView(value: Double(vm.recoveryScore), total: 100).tint(.green).padding(.horizontal, 4)
                    if !vm.startDate.isEmpty {
                        Text("시작: \(vm.startDate)").font(.system(size: 9)).foregroundStyle(.tertiary)
                    }
                }
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
        }
    }
}

// MARK: - Tab 2: 심박수

private struct HeartRateTab: View {
    @ObservedObject var healthManager: HealthManager
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.fill").font(.title2).foregroundStyle(.red)
            if let bpm = healthManager.currentBPM {
                Text("\(Int(bpm))")
                    .font(.system(size: 44, weight: .black, design: .rounded)).foregroundStyle(.red)
                Text("BPM").font(.caption).foregroundStyle(.secondary)
                // HRV 표시
                if healthManager.currentRMSSD > 0 {
                    Text("HRV \(Int(healthManager.currentRMSSD))ms")
                        .font(.system(size: 10)).foregroundStyle(.purple)
                }
            } else {
                Text("측정 중...").font(.caption).foregroundStyle(.secondary)
                if !healthManager.authorized {
                    Button { healthManager.requestAuthorization() } label: {
                        Text("권한 허용").font(.caption2)
                    }.buttonStyle(.bordered).tint(.red)
                }
            }
        }
        .padding()
    }
}

// MARK: - Tab 3: 절약 금액

private struct SavingsTab: View {
    @ObservedObject var vm: SmokingDayViewModel
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "wonsign.circle.fill").font(.title2).foregroundStyle(.yellow)
            if vm.isLoading { ProgressView() }
            else {
                Text("\(vm.savedMoney.formatted())원")
                    .font(.title3).fontWeight(.black).foregroundStyle(.yellow)
                    .minimumScaleFactor(0.6).lineLimit(1)
                Text("절약한 금액").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

// MARK: - Tab 4: 모션 수집

private struct MotionTab: View {
    @ObservedObject var motionManager: MotionCollector
    @ObservedObject var healthManager: HealthManager
    @ObservedObject var connectivity:  WatchConnectivityManager

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {

                // ── 아이콘 + 모드 표시
                HStack(spacing: 6) {
                    Image(systemName: motionManager.isRecording ? "waveform.circle.fill" : "waveform.circle")
                        .font(.title2)
                        .foregroundStyle(motionManager.isRecording
                                         ? (motionManager.collectionMode == .auto ? .purple : .red)
                                         : .blue)
                        .symbolEffect(.pulse, isActive: motionManager.isRecording)
                    if motionManager.isRecording {
                        Text(motionManager.collectionMode == .auto ? "자동 수집" : "수동 수집")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(motionManager.collectionMode == .auto ? .purple : .red)
                    }
                }

                // ── 타이머
                if motionManager.isRecording {
                    Text(motionManager.remainingFormatted)
                        .font(.system(size: 28, weight: .black, design: .monospaced))
                        .foregroundStyle(motionManager.remainingSeconds <= 60 ? .red : .primary)
                    Text("윈도우 \(motionManager.windowCount) / \(motionManager.sessionDuration / motionManager.windowDuration)")
                        .font(.system(size: 10)).foregroundStyle(.secondary)
                }

                // ── 상태 메시지
                Text(motionManager.statusMessage)
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)

                // ── 실시간 센서값
                if motionManager.isRecording {
                    VStack(spacing: 4) {
                        Text("가속도 (g)").font(.system(size: 9)).foregroundStyle(.tertiary)
                        HStack(spacing: 8) {
                            SensorValueView(label: "X", value: motionManager.currentAX, color: .red)
                            SensorValueView(label: "Y", value: motionManager.currentAY, color: .green)
                            SensorValueView(label: "Z", value: motionManager.currentAZ, color: .blue)
                        }
                        Text("자이로 (deg/s)").font(.system(size: 9)).foregroundStyle(.tertiary)
                        HStack(spacing: 8) {
                            SensorValueView(label: "X", value: motionManager.currentGX, color: .orange)
                            SensorValueView(label: "Y", value: motionManager.currentGY, color: .purple)
                            SensorValueView(label: "Z", value: motionManager.currentGZ, color: .cyan)
                        }
                    }
                    .padding(8).background(.ultraThinMaterial).cornerRadius(8)
                }

                // ── AI 예측 결과 카드
                if let isSmoking = connectivity.lastIsSmoking {
                    VStack(spacing: 4) {
                        HStack(spacing: 6) {
                            Image(systemName: isSmoking ? "exclamationmark.triangle.fill" : "checkmark.seal.fill")
                                .foregroundStyle(isSmoking ? .orange : .green).font(.caption)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(isSmoking ? "흡연 감지" : "비흡연")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(isSmoking ? .orange : .green)
                                Text("확신도 \(Int(connectivity.lastConfidence * 100))%  ·  윈도우 \(connectivity.sessionWindowCount)개")
                                    .font(.system(size: 9)).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        // HLSDA 보정 표시
                        if !connectivity.lastRawLabel.isEmpty {
                            HStack(spacing: 4) {
                                Text("Layer1: \(connectivity.lastRawLabel)")
                                    .font(.system(size: 8)).foregroundStyle(.tertiary)
                                Image(systemName: "arrow.right").font(.system(size: 7)).foregroundStyle(.tertiary)
                                Text("HLSDA: \(connectivity.lastCorrectedLabel)")
                                    .font(.system(size: 8))
                                    .foregroundStyle(connectivity.lastRawLabel != connectivity.lastCorrectedLabel ? Color.orange : Color.secondary)
                            }
                        }
                    }
                    .padding(8)
                    .background(isSmoking ? Color.orange.opacity(0.15) : Color.green.opacity(0.15))
                    .cornerRadius(8)
                }

                // ── 수집 완료 후 "모델에 입력" 버튼 (수동 수집만)
                if motionManager.pendingManualInput && !motionManager.isRecording {
                    Button {
                        // 가장 최근 수집 데이터를 다시 서버로 전송 요청
                        connectivity.requestReanalyze(userId: connectivity.userId)
                        motionManager.pendingManualInput = false
                        motionManager.statusMessage = "분석 요청 전송됨..."
                        print("🔁 [MotionTab] 수동 재분석 요청 전송")
                    } label: {
                        Label("최근 데이터 모델 입력", systemImage: "brain.head.profile")
                            .font(.caption)
                    }
                    .buttonStyle(.borderedProminent).tint(.indigo)
                }

                // ── 시작 / 중지 버튼
                Button {
                    if motionManager.isRecording {
                        motionManager.stopRecording()
                        healthManager.stopSession()
                        connectivity.notifySessionEnd(userId: connectivity.userId)
                    } else {
                        connectivity.resetMotionResult()
                        motionManager.startRecording(mode: .manual)
                        healthManager.startSession()
                        motionManager.onWindowFlush = { [weak healthManager] in
                            healthManager?.flushHeartRateWindow()
                        }
                    }
                } label: {
                    Label(
                        motionManager.isRecording ? "중지" : "5분 수집 시작",
                        systemImage: motionManager.isRecording ? "stop.fill" : "play.fill"
                    )
                    .font(.caption)
                }
                .buttonStyle(.borderedProminent)
                .tint(motionManager.isRecording ? .red : .green)
                .disabled(motionManager.isRecording && motionManager.collectionMode == .auto)
            }
            .padding()
        }
    }
}

// MARK: - 센서값 표시

private struct SensorValueView: View {
    let label: String; let value: Double; let color: Color
    var body: some View {
        VStack(spacing: 1) {
            Text(label).font(.system(size: 8)).foregroundStyle(color)
            Text(String(format: "%.2f", value))
                .font(.system(size: 9, weight: .semibold, design: .monospaced)).foregroundStyle(.primary)
        }
    }
}

// MARK: - 흡연 감지 알림 뷰

private struct SmokingAlertView: View {
    let isSmoking:      Bool
    let confidence:     Double
    let rawLabel:       String
    let correctedLabel: String
    let windowCount:    Int
    let onDismiss:      () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: isSmoking ? "exclamationmark.triangle.fill" : "checkmark.seal.fill")
                    .font(.title)
                    .foregroundStyle(isSmoking ? .orange : .green)

                Text(isSmoking ? "흡연 감지!" : "비흡연")
                    .font(.headline).fontWeight(.bold)

                Text("확신도 \(Int(confidence * 100))%")
                    .font(.caption).foregroundStyle(isSmoking ? .orange : .green)

                if !rawLabel.isEmpty {
                    VStack(spacing: 2) {
                        Text("AI 분석 결과").font(.system(size: 9)).foregroundStyle(.tertiary)
                        HStack(spacing: 4) {
                            Text("Layer1: \(rawLabel)").font(.system(size: 9))
                            Image(systemName: "arrow.right").font(.system(size: 8))
                            Text("HLSDA: \(correctedLabel)")
                                .font(.system(size: 9))
                                .foregroundStyle(rawLabel != correctedLabel ? .orange : .primary)
                        }
                        Text("윈도우 \(windowCount)개 기반").font(.system(size: 8)).foregroundStyle(.tertiary)
                    }
                    .padding(6).background(.ultraThinMaterial).cornerRadius(6)
                }

                Button("확인") { onDismiss() }
                    .buttonStyle(.borderedProminent)
                    .tint(isSmoking ? .orange : .green)
                    .font(.caption)
            }
            .padding()
        }
    }
}

// MARK: - HRV 자동 수집 동의 뷰

private struct HRVConsentView: View {
    let rmssd:   Double
    let onAllow: () -> Void
    let onDeny:  () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "waveform.path.ecg").font(.title2).foregroundStyle(.purple)
            Text("심박변이도 급감").font(.headline).fontWeight(.bold)
            Text("RMSSD \(Int(rmssd))ms\n흡연 가능성이 감지됐습니다.\n5분 자동 수집을 시작할까요?")
                .font(.caption2).multilineTextAlignment(.center).foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Button("거부") { onDeny() }
                    .buttonStyle(.bordered).tint(.gray).font(.caption)
                Button("허용") { onAllow() }
                    .buttonStyle(.borderedProminent).tint(.purple).font(.caption)
            }
        }
        .padding()
    }
}

// =====================================================================
// MARK: - Xcode Canvas 프리뷰 (모든 화면 미리보기)
//   Canvas 우측 상단 프리뷰 목록에서 화면별로 선택해 확인 가능
// =====================================================================

/// 프리뷰용 더미 데이터로 채운 매니저들
@MainActor
private enum PreviewMock {
    static func smokingVM() -> SmokingDayViewModel {
        let vm = SmokingDayViewModel()
        vm.quitDays      = 23
        vm.recoveryScore = 64
        vm.savedMoney    = 103_500
        vm.startDate     = "2026-05-17"
        return vm
    }

    static func health(bpm: Double = 78, rmssd: Double = 42) -> HealthManager {
        let hm = HealthManager()
        hm.currentBPM   = bpm
        hm.authorized   = true
        hm.currentRMSSD = rmssd
        return hm
    }

    /// 센서를 켜지 않고(=크래시 없이) "수집 중" 상태만 흉내 낸 MotionCollector.
    /// startRecording()은 실제 CoreMotion/화면유지 세션을 써서 Canvas에서 크래시하므로
    /// @Published 상태값만 직접 세팅해 UI를 재현한다.
    static func motion(recording: Bool, auto: Bool = false, done: Bool = false) -> MotionCollector {
        let m = MotionCollector()
        m.isRecording      = recording
        m.collectionMode   = auto ? .auto : .manual
        m.remainingSeconds = recording ? 218 : 300        // 03:38 남은 모습
        m.windowCount      = recording ? 3 : (done ? 10 : 0)
        m.statusMessage    = recording ? (auto ? "자동 수집 중..." : "윈도우 3/10")
                                        : (done ? "수집 완료 — 아래에서 결과 확인" : "대기 중")
        m.pendingManualInput = done
        // 실시간 센서값(중력 포함 m/s² · rad/s) 예시
        m.currentAX = -5.97; m.currentAY = -6.71; m.currentAZ = 2.55
        m.currentGX = 0.14;  m.currentGY = -0.05; m.currentGZ = 1.12
        return m
    }

    /// 로그인된 상태 + 흡연 결과가 들어온 connectivity
    static func connectivity(isSmoking: Bool? = nil) -> WatchConnectivityManager {
        let c = WatchConnectivityManager.shared
        c.userId   = "preview-user"
        c.userName = "홍길동"
        c.quitDays = 23
        if let s = isSmoking {
            c.lastIsSmoking      = s
            c.lastConfidence     = s ? 0.82 : 0.13
            c.lastRawLabel       = s ? "smoke" : "non_smoke"
            c.lastCorrectedLabel = s ? "smoke" : "non_smoke"
            c.sessionWindowCount = 10
            c.smokingConfidence  = s ? 0.82 : 0.13
        }
        return c
    }
}

// ── 1. 로그인 대기 화면
#Preview("1. 로그인 대기") {
    WaitingLoginView(connectivity: WatchConnectivityManager.shared)
}

// ── 2. 메인 탭 전체 (스와이프로 4개 탭 확인)
#Preview("2. 메인 탭 전체") {
    MainTabView(
        healthManager: PreviewMock.health(),
        smokingVM:     PreviewMock.smokingVM(),
        connectivity:  PreviewMock.connectivity(),
        motionManager: MotionCollector()
    )
}

// ── 3. 탭별 개별 화면
#Preview("3-1. 금연 현황") {
    QuitDayTab(vm: PreviewMock.smokingVM(), userName: "홍길동")
}

#Preview("3-2. 심박/HRV") {
    HeartRateTab(healthManager: PreviewMock.health(bpm: 86, rmssd: 55))
}

#Preview("3-3. 절약 금액") {
    SavingsTab(vm: PreviewMock.smokingVM())
}

#Preview("3-4. 모션 수집(대기)") {
    MotionTab(
        motionManager: PreviewMock.motion(recording: false),
        healthManager: PreviewMock.health(),
        connectivity:  PreviewMock.connectivity()
    )
}

#Preview("3-4. 모션 수집(수집중-수동)") {
    MotionTab(
        motionManager: PreviewMock.motion(recording: true),
        healthManager: PreviewMock.health(),
        connectivity:  PreviewMock.connectivity()
    )
}

#Preview("3-4. 모션 수집(자동 수집중)") {
    MotionTab(
        motionManager: PreviewMock.motion(recording: true, auto: true),
        healthManager: PreviewMock.health(),
        connectivity:  PreviewMock.connectivity()
    )
}

#Preview("3-4. 모션 수집(완료+결과)") {
    MotionTab(
        motionManager: PreviewMock.motion(recording: false, done: true),
        healthManager: PreviewMock.health(),
        connectivity:  PreviewMock.connectivity(isSmoking: true)
    )
}

// ── 4. 흡연 감지 알림 시트
#Preview("4-1. 흡연 감지 알림") {
    SmokingAlertView(
        isSmoking: true, confidence: 0.82,
        rawLabel: "non_smoke", correctedLabel: "smoke",   // HLSDA 보정된 케이스
        windowCount: 10, onDismiss: {}
    )
}

#Preview("4-2. 비흡연 결과") {
    SmokingAlertView(
        isSmoking: false, confidence: 0.13,
        rawLabel: "non_smoke", correctedLabel: "non_smoke",
        windowCount: 10, onDismiss: {}
    )
}

// ── 5. HRV 자동 수집 동의 알림
#Preview("5. HRV 동의 알림") {
    HRVConsentView(rmssd: 88, onAllow: {}, onDeny: {})
}

// ── 6. 전체 앱 (로그인된 진입 상태)
#Preview("6. 전체 앱(로그인됨)") {
    _ = PreviewMock.connectivity()   // 싱글턴에 로그인 상태 주입
    return ContentView()
}
