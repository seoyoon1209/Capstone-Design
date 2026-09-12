import Foundation
import Combine

@MainActor
class SmokingDayViewModel: ObservableObject {
    @Published var quitDays: Int        = 0
    @Published var recoveryScore: Int   = 0
    @Published var savedMoney: Int      = 0
    @Published var startDate: String    = ""
    @Published var isLoading: Bool      = false
    @Published var errorMessage: String? = nil

    func load(userId: String) async {
        guard !userId.isEmpty else { return }
        isLoading    = true
        errorMessage = nil

        do {
            let info = try await APIService.shared.fetchSmokingDay(userId: userId)

            if let raw = info.start_date {
                startDate     = String(raw.prefix(10))
                let days      = calcQuitDays(from: startDate)
                quitDays      = days
                recoveryScore = min(100, Int(Double(days) / 360.0 * 100))

                let cigsPerDay = info.baseline_cigs_per_day   ?? 20
                let pack       = info.cigs_per_pack            ?? 20
                let price      = info.baseline_price_per_pack  ?? 4500
                let perCig     = Double(price) / Double(pack)
                savedMoney     = Int(Double(cigsPerDay * days) * perCig)
            }
        } catch let error as NSError {
            // 서버가 반환한 한국어 메시지 우선 사용
            errorMessage = error.localizedDescription
            print("[SmokingDayViewModel] \(error.localizedDescription)")
        } catch {
            errorMessage = "데이터를 불러올 수 없습니다."
            print("[SmokingDayViewModel] \(error.localizedDescription)")
        }

        isLoading = false
    }

    private func calcQuitDays(from dateString: String) -> Int {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        guard let start = fmt.date(from: dateString) else { return 0 }
        let cal    = Calendar.current
        let today  = cal.startOfDay(for: Date())
        let startD = cal.startOfDay(for: start)
        return max(0, (cal.dateComponents([.day], from: startD, to: today).day ?? 0) + 1)
    }
}
