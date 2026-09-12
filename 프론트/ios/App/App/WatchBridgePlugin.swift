import Capacitor

// 웹(JS) → Swift → WatchConnectivity 브리지 플러그인
// JS에서 WatchBridge.notifyLogin() 호출 → AppDelegate의 watchUserLogin 옵저버 트리거

@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchBridgePlugin"
    public let jsName     = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "notifyLogin",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyCrisis", returnType: CAPPluginReturnPromise)
    ]

    @objc func notifyLogin(_ call: CAPPluginCall) {
        guard
            let userId      = call.getString("userId"),
            let userName    = call.getString("userName"),
            let userLoginId = call.getString("userLoginId")
        else {
            call.reject("userId, userName, userLoginId 필드가 필요합니다.")
            return
        }
        NotificationCenter.default.post(
            name: .watchUserLogin,
            object: nil,
            userInfo: ["userId": userId, "userName": userName, "userLoginId": userLoginId]
        )
        call.resolve()
    }

    @objc func notifyCrisis(_ call: CAPPluginCall) {
        guard
            let userName   = call.getString("userName"),
            let savedMoney = call.getInt("savedMoney")
        else {
            call.reject("userName, savedMoney 필드가 필요합니다.")
            return
        }
        NotificationCenter.default.post(
            name: .watchCrisisAlert,
            object: nil,
            userInfo: ["userName": userName, "savedMoney": savedMoney]
        )
        call.resolve()
    }
}
