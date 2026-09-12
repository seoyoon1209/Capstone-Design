import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        PhoneConnectivityManager.shared.activate()
        print("✅ [AppDelegate] PhoneConnectivityManager 활성화")

        // JS(WatchBridge) → Swift 로그인 알림 수신 → Watch로 전달
        NotificationCenter.default.addObserver(
            forName: .watchUserLogin,
            object: nil,
            queue: .main
        ) { notification in
            print("🔔 [AppDelegate] watchUserLogin 알림 수신")
            guard
                let info     = notification.userInfo,
                let userId   = info["userId"]      as? String, !userId.isEmpty,
                let userName = info["userName"]    as? String,
                let loginId  = info["userLoginId"] as? String
            else {
                print("❌ [AppDelegate] userInfo 파싱 실패")
                return
            }
            print("✅ [AppDelegate] 전달 → userId=\(userId), userName=\(userName)")

            UserDefaults.standard.set(userId,   forKey: "watch_user_id")
            UserDefaults.standard.set(userName, forKey: "watch_user_name")
            UserDefaults.standard.set(loginId,  forKey: "watch_user_login_id")

            PhoneConnectivityManager.shared.sendUserInfoToWatch(
                userId:      userId,
                userName:    userName,
                userLoginId: loginId
            )
        }

        // 서버에 userId 없을 때 → WebView에 로그아웃 JS 실행
        NotificationCenter.default.addObserver(
            forName: .watchNeedsRelogin,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            print("🔄 [AppDelegate] stale userId 감지 — WebView 로그아웃 처리")
            guard
                let vc      = self?.window?.rootViewController as? CAPBridgeViewController,
                let webView = vc.bridge?.webView
            else { return }
            // localStorage 유저 정보 삭제 → React 앱이 로그인 화면으로 이동
            webView.evaluateJavaScript("localStorage.removeItem('user'); window.location.reload();") { _, _ in
                print("✅ [AppDelegate] localStorage 초기화 완료 — 재로그인 필요")
            }
        }

        // 위기 알림 수신 → Watch로 즉시 전달
        NotificationCenter.default.addObserver(
            forName: .watchCrisisAlert,
            object: nil,
            queue: .main
        ) { notification in
            guard
                let info       = notification.userInfo,
                let userName   = info["userName"]   as? String,
                let savedMoney = info["savedMoney"] as? Int
            else { return }
            PhoneConnectivityManager.shared.sendCrisisAlertToWatch(
                userName:   userName,
                savedMoney: savedMoney
            )
        }

        return true
    }

    // 앱 활성화 시 localStorage → Watch 자동 동기화 (WebView 로딩 완료 대기)
    func applicationDidBecomeActive(_ application: UIApplication) {
        syncUserToWatch(retryCount: 0)
    }

    // MARK: - localStorage → Watch 동기화 (최대 10회 재시도, 1초 간격)

    private func syncUserToWatch(retryCount: Int) {
        let maxRetry = 10

        guard
            let vc      = window?.rootViewController as? CAPBridgeViewController,
            let webView = vc.bridge?.webView
        else {
            // 브릿지가 아직 준비 안 됨 → 재시도
            if retryCount < maxRetry {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    self.syncUserToWatch(retryCount: retryCount + 1)
                }
            } else {
                print("⚠️ [AppDelegate] WebView 접근 불가 — 재시도 초과")
            }
            return
        }

        // WebView가 아직 로딩 중이면 대기
        if webView.isLoading {
            if retryCount < maxRetry {
                print("⏳ [AppDelegate] WebView 로딩 중 — \(retryCount + 1)회 재시도 대기")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    self.syncUserToWatch(retryCount: retryCount + 1)
                }
            } else {
                print("⚠️ [AppDelegate] WebView 로딩 대기 초과")
            }
            return
        }

        webView.evaluateJavaScript("(function(){ try { return localStorage.getItem('user'); } catch(e) { return null; } })()") { result, error in
            if let error {
                // SecurityError 등 → 아직 페이지가 불안정, 재시도
                print("⚠️ [AppDelegate] JS 평가 실패 (\(retryCount + 1)회): \(error.localizedDescription)")
                if retryCount < maxRetry {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        self.syncUserToWatch(retryCount: retryCount + 1)
                    }
                }
                return
            }

            guard
                let jsonString = result as? String, !jsonString.isEmpty,
                let data       = jsonString.data(using: .utf8),
                let json       = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let userId     = json["user_id"]       as? String, !userId.isEmpty,
                let userName   = json["user_name"]     as? String,
                let loginId    = json["user_login_id"] as? String
            else {
                print("ℹ️ [AppDelegate] localStorage에 유저 없음 (미로그인)")
                return
            }

            print("✅ [AppDelegate] localStorage 유저 발견 → userId=\(userId), userName=\(userName)")

            UserDefaults.standard.set(userId,   forKey: "watch_user_id")
            UserDefaults.standard.set(userName, forKey: "watch_user_name")
            UserDefaults.standard.set(loginId,  forKey: "watch_user_login_id")

            PhoneConnectivityManager.shared.sendUserInfoToWatch(
                userId:      userId,
                userName:    userName,
                userLoginId: loginId
            )
        }
    }

    // MARK: - Capacitor 필수 메서드

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication,
                     open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application, continue: userActivity, restorationHandler: restorationHandler
        )
    }
}
