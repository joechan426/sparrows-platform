//
//  SparrowsAPI.swift
//  Sparrow App
//
//  API client for Sparrows backend (member, calendar events, event registrations).
//

import Foundation

// MARK: - Base URL
// API base URL is injected per build configuration (see `Sparrow App` target → Build Settings →
// `INFOPLIST_KEY_SparrowsAPIBaseURL` → appears as `SparrowsAPIBaseURL` in the generated Info.plist):
//   • Debug   → http://127.0.0.1:3000  (run `pnpm dev` in admin-panel/apps/web)
//   • Release → https://sparrowsweb.netlify.app
//
// Override anytime: Target → Info → Custom iOS Target Properties → SparrowsAPIBaseURL
// (e.g. http://192.168.x.x:3000 on a physical device hitting your Mac over Wi‑Fi).
enum SparrowsAPI {
    static var baseURL: String {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SparrowsAPIBaseURL") as? String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
            }
        }
        #if DEBUG
        return "http://127.0.0.1:3000"
        #else
        return "https://sparrowsweb.netlify.app"
        #endif
    }

    static var apiBase: String { "\(baseURL)/api" }

    /// Shared JSON POST/GET with clearer errors than a bare decode failure.
    static func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            let msg: String
            if let urlErr = error as? URLError {
                msg = urlErr.localizedDescription
            } else {
                msg = error.localizedDescription
            }
            throw SparrowsAPIError.transport(
                "Cannot reach \(baseURL). \(msg) On a real iPhone, set SparrowsAPIBaseURL to your computer’s IP (e.g. http://192.168.x.x:3000)."
            )
        }
        guard let http = response as? HTTPURLResponse else {
            throw SparrowsAPIError.transport("Invalid response from server.")
        }
        return (data, http)
    }
}

// MARK: - DTOs
struct APIMember: Codable {
    let id: String
    var preferredName: String
    var email: String
}

struct APICalendarEvent: Codable {
    let id: String
    let title: String
    let startAt: String
    let endAt: String
    let description: String?
    let location: String?
    let sportType: String
    let eventType: String
    let registrationOpen: Bool
    let capacity: Int?
    /// Count of APPROVED registrations (from list/detail API).
    let approvedCount: Int?
    /// Count of WAITING_LIST registrations.
    let waitlistedCount: Int?
    /// Count of PENDING registrations.
    let pendingCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, startAt, endAt, description, location, sportType, eventType, registrationOpen, capacity, approvedCount, waitlistedCount, pendingCount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        startAt = try c.decode(String.self, forKey: .startAt)
        endAt = try c.decode(String.self, forKey: .endAt)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        location = try c.decodeIfPresent(String.self, forKey: .location)
        sportType = try c.decodeIfPresent(String.self, forKey: .sportType) ?? "VOLLEYBALL"
        eventType = try c.decodeIfPresent(String.self, forKey: .eventType) ?? "NORMAL_EVENT"
        registrationOpen = try c.decodeIfPresent(Bool.self, forKey: .registrationOpen) ?? false
        capacity = try c.decodeIfPresent(Int.self, forKey: .capacity)
        approvedCount = try c.decodeIfPresent(Int.self, forKey: .approvedCount)
        waitlistedCount = try c.decodeIfPresent(Int.self, forKey: .waitlistedCount)
        pendingCount = try c.decodeIfPresent(Int.self, forKey: .pendingCount)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(startAt, forKey: .startAt)
        try c.encode(endAt, forKey: .endAt)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encode(sportType, forKey: .sportType)
        try c.encode(eventType, forKey: .eventType)
        try c.encode(registrationOpen, forKey: .registrationOpen)
        try c.encodeIfPresent(capacity, forKey: .capacity)
        try c.encodeIfPresent(approvedCount, forKey: .approvedCount)
        try c.encodeIfPresent(waitlistedCount, forKey: .waitlistedCount)
        try c.encodeIfPresent(pendingCount, forKey: .pendingCount)
    }
}

/// Same JSON shape as GET /api/google-calendar-ics (sparrowsweb).
struct GoogleICSEvent: Codable {
    let id: String
    let title: String
    let startAt: String
    let endAt: String
    let location: String?
    let description: String?
    let sportType: String
    let eventType: String
    let registrationOpen: Bool
}

struct APIMemberRegistration: Codable {
    let id: String
    let status: String
    let teamName: String?
    let createdAt: String
    let event: APICalendarEvent?
}

struct APIAnnouncement: Codable, Identifiable {
    let id: String
    let message: String
    let createdAt: String
    let createdByAdminId: String?
    let createdByUserName: String?
}

// MARK: - Errors
enum SparrowsAPIError: Error, LocalizedError {
    case invalidURL
    case httpStatus(Int, String?)
    case decode
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .transport(let msg): return msg
        case .httpStatus(let code, let msg): return msg ?? "HTTP \(code)"
        case .decode: return "Could not read server data."
        case .invalidURL: return "Invalid URL."
        }
    }
}

// MARK: - Member API
enum MemberAPI {
    static func create(preferredName: String, email: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/members")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["preferredName": preferredName, "email": email])

        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode

        if code == 201 {
            return try JSONDecoder().decode(APIMember.self, from: data)
        }
        if code == 409 {
            struct ConflictBody: Decodable { let id: String? }
            if let body = try? JSONDecoder().decode(ConflictBody.self, from: data), let existingId = body.id {
                return try await get(id: existingId)
            }
            throw SparrowsAPIError.httpStatus(409, "Member with this email already exists.")
        }
        let message = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, message ?? "Create member failed")
    }

    static func get(id: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/members/\(id)")!
        var req = URLRequest(url: url)
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 { throw SparrowsAPIError.httpStatus(code, nil) }
        return try JSONDecoder().decode(APIMember.self, from: data)
    }

    static func update(id: String, preferredName: String?, email: String?) async throws -> APIMember {
        var body: [String: String] = [:]
        if let n = preferredName { body["preferredName"] = n }
        if let e = email { body["email"] = e }
        guard !body.isEmpty else { return try await get(id: id) }

        let url = URL(string: "\(SparrowsAPI.apiBase)/members/\(id)")!
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)

        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
            throw SparrowsAPIError.httpStatus(code, msg)
        }
        return try JSONDecoder().decode(APIMember.self, from: data)
    }

    static func registrations(memberId: String) async throws -> [APIMemberRegistration] {
        let url = URL(string: "\(SparrowsAPI.apiBase)/members/\(memberId)/registrations")!
        var req = URLRequest(url: url)
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 { throw SparrowsAPIError.httpStatus(code, nil) }
        return try JSONDecoder().decode([APIMemberRegistration].self, from: data)
    }
}

// MARK: - Auth API (register / login / Apple / Google)
enum AuthAPI {
    static func register(preferredName: String, email: String, password: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/auth/register")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode([
            "preferredName": preferredName,
            "email": email.lowercased(),
            "password": password,
        ])
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code == 201 {
            do {
                return try JSONDecoder().decode(APIMember.self, from: data)
            } catch {
                throw SparrowsAPIError.decode
            }
        }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Register failed")
    }

    static func login(email: String, password: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/auth/login")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode([
            "email": email.lowercased(),
            "password": password,
        ])
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code == 200 {
            do {
                return try JSONDecoder().decode(APIMember.self, from: data)
            } catch {
                throw SparrowsAPIError.decode
            }
        }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Login failed")
    }

    static func loginWithGoogle(idToken: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/auth/google")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["idToken": idToken])
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code == 200 || code == 201 { return try JSONDecoder().decode(APIMember.self, from: data) }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Google sign-in failed")
    }

    static func changePassword(memberId: String, currentPassword: String, newPassword: String) async throws {
        let url = URL(string: "\(SparrowsAPI.apiBase)/auth/change-password")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode([
            "memberId": memberId,
            "currentPassword": currentPassword,
            "newPassword": newPassword,
        ])
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code == 200 { return }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Change password failed")
    }
}

// MARK: - Calendar Events API
enum CalendarEventsAPI {
    struct CheckoutResponse: Decodable {
        let url: String
        let registrationId: String?
    }

    /// Same events + ids as sparrowsweb `fetch("/api/google-calendar-ics")`.
    static func listGoogleCalendarICS() async throws -> [GoogleICSEvent] {
        let url = URL(string: "\(SparrowsAPI.apiBase)/google-calendar-ics")!
        var req = URLRequest(url: url)
        let (data, res) = try await SparrowsAPI.data(for: req)
        guard res.statusCode == 200 else {
            throw SparrowsAPIError.httpStatus(res.statusCode, nil)
        }
        return try JSONDecoder().decode([GoogleICSEvent].self, from: data)
    }

    static func list() async throws -> [APICalendarEvent] {
        let url = URL(string: "\(SparrowsAPI.apiBase)/calendar-events?_start=0&_end=500")!
        var req = URLRequest(url: url)
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 { throw SparrowsAPIError.httpStatus(code, nil) }
        do {
            return try JSONDecoder().decode([APICalendarEvent].self, from: data)
        } catch {
            throw SparrowsAPIError.decode
        }
    }

    static func get(id: String) async throws -> APICalendarEvent {
        let url = URL(string: "\(SparrowsAPI.apiBase)/calendar-events/\(id)")!
        var req = URLRequest(url: url)
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 { throw SparrowsAPIError.httpStatus(code, nil) }
        return try JSONDecoder().decode(APICalendarEvent.self, from: data)
    }

    static func register(eventId: String, preferredName: String, email: String, teamName: String?) async throws {
        let url = URL(string: "\(SparrowsAPI.apiBase)/calendar-events/\(eventId)/registrations")!
        var body: [String: Any] = ["preferredName": preferredName, "email": email]
        if let t = teamName, !t.isEmpty { body["teamName"] = t }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code == 201 { return }
        if code == 409 { throw SparrowsAPIError.httpStatus(409, "You are already registered for this event.") }
        let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["message"]
        throw SparrowsAPIError.httpStatus(code, message ?? "Registration failed")
    }

    static func checkout(
        eventId: String,
        provider: String,
        preferredName: String,
        email: String,
        teamName: String?,
        appReturn: Bool
    ) async throws -> CheckoutResponse {
        let url = URL(string: "\(SparrowsAPI.apiBase)/calendar-events/\(eventId)/checkout")!
        var body: [String: Any] = [
            "provider": provider,
            "preferredName": preferredName,
            "email": email,
            "appReturn": appReturn,
        ]
        if let t = teamName, !t.isEmpty { body["teamName"] = t }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["message"]
            throw SparrowsAPIError.httpStatus(code, message ?? "Checkout failed")
        }

        return try JSONDecoder().decode(CheckoutResponse.self, from: data)
    }
}

// MARK: - Announcements API
enum AnnouncementsAPI {
    static func list(start: Int, end: Int) async throws -> (items: [APIAnnouncement], total: Int) {
        let safeStart = max(0, start)
        let safeEnd = max(safeStart + 1, end)
        let url = URL(string: "\(SparrowsAPI.apiBase)/announcements?_start=\(safeStart)&_end=\(safeEnd)")!
        var req = URLRequest(url: url)
        let (data, res) = try await SparrowsAPI.data(for: req)
        let code = res.statusCode
        if code != 200 { throw SparrowsAPIError.httpStatus(code, nil) }
        let items = try JSONDecoder().decode([APIAnnouncement].self, from: data)
        let total = Int(res.value(forHTTPHeaderField: "X-Total-Count") ?? "") ?? items.count
        return (items, total)
    }
}
