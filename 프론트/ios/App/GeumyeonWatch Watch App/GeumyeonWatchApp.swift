import SwiftUI

@main
struct geumyeonhaeduo2026_Watch_AppApp: App {
    init() {
        WatchConnectivityManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
