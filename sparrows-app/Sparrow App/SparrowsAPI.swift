//
//  SparrowsAPI.swift
//  Sparrow App
//
//  API client for Sparrows backend (member, calendar events, event registrations).
//

import Foundation

// MARK: - Base URL
// API is served by the Next.js "web" app (admin-panel/apps/web) on port 3000.
// Run from admin-panel: pnpm dev (or pnpm --filter web dev for API only).
// For simulator: http://127.0.0.1:3000. For physical device: your machine's LAN IP, e.g. http://192.168.1.100:3000
enum SparrowsAPI {
    static var baseURL: String = "http://127.0.0.1:3000"
    static var apiBase: String { "\(baseURL)/api" }
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
}

struct APIMemberRegistration: Codable {
    let id: String
    let status: String
    let teamName: String?
    let createdAt: String
    let event: APICalendarEvent?
}

// MARK: - Errors
enum SparrowsAPIError: Error {
    case invalidURL
    case httpStatus(Int, String?)
    case decode
}

// MARK: - Member API
enum MemberAPI {
    static func create(preferredName: String, email: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/members")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["preferredName": preferredName, "email": email])

        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0

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
        let (data, res) = try await URLSession.shared.data(from: url)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
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

        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code != 200 {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
            throw SparrowsAPIError.httpStatus(code, msg)
        }
        return try JSONDecoder().decode(APIMember.self, from: data)
    }

    static func registrations(memberId: String) async throws -> [APIMemberRegistration] {
        let url = URL(string: "\(SparrowsAPI.apiBase)/members/\(memberId)/registrations")!
        let (data, res) = try await URLSession.shared.data(from: url)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
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
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code == 201 { return try JSONDecoder().decode(APIMember.self, from: data) }
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
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code == 200 { return try JSONDecoder().decode(APIMember.self, from: data) }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Login failed")
    }

    static func loginWithApple(identityToken: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/auth/apple")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["identityToken": identityToken])
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code == 200 || code == 201 { return try JSONDecoder().decode(APIMember.self, from: data) }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Apple sign-in failed")
    }

    static func loginWithGoogle(idToken: String) async throws -> APIMember {
        let url = URL(string: "\(SparrowsAPI.apiBase)/auth/google")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["idToken": idToken])
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
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
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code == 200 { return }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
        throw SparrowsAPIError.httpStatus(code, msg ?? "Change password failed")
    }
}

// MARK: - Calendar Events API
enum CalendarEventsAPI {
    static func list() async throws -> [APICalendarEvent] {
        let url = URL(string: "\(SparrowsAPI.apiBase)/calendar-events?_start=0&_end=500")!
        let (data, res) = try await URLSession.shared.data(from: url)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code != 200 { throw SparrowsAPIError.httpStatus(code, nil) }
        return try JSONDecoder().decode([APICalendarEvent].self, from: data)
    }

    static func get(id: String) async throws -> APICalendarEvent {
        let url = URL(string: "\(SparrowsAPI.apiBase)/calendar-events/\(id)")!
        let (data, res) = try await URLSession.shared.data(from: url)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
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

        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code == 201 { return }
        if code == 409 { throw SparrowsAPIError.httpStatus(409, "You are already registered for this event.") }
        let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["message"]
        throw SparrowsAPIError.httpStatus(code, message ?? "Registration failed")
    }
}
