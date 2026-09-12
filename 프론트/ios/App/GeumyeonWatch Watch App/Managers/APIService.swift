import Foundation

// MARK: - 응답 모델

struct SmokingDayResponse: Decodable {
    let start_date: String?
    let baseline_cigs_per_day: Int?
    let baseline_price_per_pack: Int?
    let cigs_per_pack: Int?
}

struct UserInfo: Decodable {
    let user_id: String
    let user_name: String
    let user_login_id: String
}

// MARK: - APIService

final class APIService {
    static let shared = APIService()
    private init() {}

    private let baseURL = "https://u7lpt81uee.onrender.com"

    // MARK: - GET /api/SmokingDay/{userId}

    func fetchSmokingDay(userId: String) async throws -> SmokingDayResponse {
        guard !userId.isEmpty,
              let url = URL(string: "\(baseURL)/api/SmokingDay/\(userId)")
        else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if http.statusCode == 404 || http.statusCode == 400 {
            // 서버 detail 메시지 파싱 시도
            if let json   = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let detail = json["detail"] as? String {
                throw NSError(domain: "APIService", code: http.statusCode,
                              userInfo: [NSLocalizedDescriptionKey: detail])
            }
            throw URLError(.badServerResponse)
        }
        guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(SmokingDayResponse.self, from: data)
    }

    // MARK: - POST /api/UserHeart/{userId}

    func postHeartRate(userId: String, bpm: Double, timestamp: Date) async {
        guard !userId.isEmpty,
              let url = URL(string: "\(baseURL)/api/UserHeart/\(userId)")
        else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        let formatter = ISO8601DateFormatter()
        guard let body = try? JSONSerialization.data(withJSONObject: [
            "user_id":     userId,
            "bpm":         Int(bpm),
            "measured_at": formatter.string(from: timestamp)
        ]) else { return }
        request.httpBody = body

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse {
                print("✅ [APIService] 심박수 전송 완료 — \(Int(bpm)) BPM / \(http.statusCode)")
            }
        } catch {
            print("❌ [APIService] 심박수 전송 실패: \(error.localizedDescription)")
        }
    }
}
