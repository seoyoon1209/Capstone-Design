import Capacitor

// JS: registerPlugin("QuitDaySync")
// - syncQuitDays({ quitDays: number }) → Watch로 금연 일수 전송

@objc(QuitDaySyncPlugin)
public class QuitDaySyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier     = "QuitDaySyncPlugin"
    public let jsName         = "QuitDaySync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncQuitDays", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - JS → Swift → Watch: 금연 일수 동기화

    @objc func syncQuitDays(_ call: CAPPluginCall) {
        guard let quitDays = call.getInt("quitDays") else {
            call.reject("quitDays 필드가 필요합니다.")
            return
        }

        print("📡 [QuitDaySyncPlugin] Watch로 quitDays 전송 — \(quitDays)일")
        PhoneConnectivityManager.shared.sendQuitDaysToWatch(quitDays: quitDays)
        call.resolve()
    }
}
