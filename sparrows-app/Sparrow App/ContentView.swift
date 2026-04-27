//
//  ContentView.swift
//  Sparrow App
//
//  Created by Joe on 7/2/2026.
//

import SwiftUI
import WebKit
import Combine
import UIKit
import SafariServices
import UserNotifications
#if canImport(StripePaymentSheet)
import StripePaymentSheet
#endif

@MainActor
private final class SparrowsNewsPreloader: ObservableObject {
    @Published private(set) var cachedItems: [SparrowsNewsItem] = []
    @Published private(set) var didAttemptLoad = false
    @Published private(set) var loadFailed = false

    func preloadIfNeeded(force: Bool = false) async {
        if didAttemptLoad && !force { return }
        didAttemptLoad = true
        do {
            let items = try await SparrowsNewsService.fetchLatest(limit: 3)
            cachedItems = items
            loadFailed = items.isEmpty
        } catch {
            loadFailed = true
        }
    }

    func updateCache(with items: [SparrowsNewsItem], loadFailed: Bool) {
        didAttemptLoad = true
        if !items.isEmpty {
            cachedItems = items
            self.loadFailed = false
        } else {
            self.loadFailed = loadFailed
        }
    }
}

@MainActor
private final class SparrowsShopPreloader: ObservableObject {
    @Published private(set) var cachedItems: [SparrowsShopProduct] = []
    @Published private(set) var didAttemptLoad = false
    @Published private(set) var loadFailed = false

    func preloadIfNeeded(force: Bool = false) async {
        if didAttemptLoad && !force { return }
        didAttemptLoad = true
        let firstPage = await SparrowsShopService.fetchPage(page: 1, limit: 15)
        let shuffledItems = firstPage.items.shuffled()
        cachedItems = shuffledItems
        loadFailed = shuffledItems.isEmpty

        if !shuffledItems.isEmpty {
            let urls = shuffledItems.map(\.url)
            Task.detached(priority: .utility) {
                await ShopRemoteImageLoader.warmup(productURLs: urls, limit: 15)
            }
        }
    }

    func updateCache(with items: [SparrowsShopProduct], loadFailed: Bool) {
        didAttemptLoad = true
        if !items.isEmpty {
            cachedItems = items
            self.loadFailed = false
            let urls = items.map(\.url)
            Task.detached(priority: .utility) {
                await ShopRemoteImageLoader.warmup(productURLs: urls, limit: 15)
            }
        } else {
            self.loadFailed = loadFailed
        }
    }
}

@MainActor
final class MemberProfileStore: ObservableObject {
    private let defaults = UserDefaults.standard
    private let memberIdKey = "sparrows.memberId"
    private let preferredNameKey = "sparrows.preferredName"
    private let emailKey = "sparrows.email"
    private let creditCentsKey = "sparrows.creditCents"

    @Published var memberId: String?
    @Published var preferredName: String
    @Published var email: String
    @Published var creditCents: Int
    @Published var saveError: String?
    @Published var isSaving = false
    @Published var authError: String?
    @Published var isAuthLoading = false

    var hasProfile: Bool { memberId != nil }

    init() {
        self.memberId = defaults.string(forKey: memberIdKey)
        self.preferredName = defaults.string(forKey: preferredNameKey) ?? ""
        self.email = defaults.string(forKey: emailKey) ?? ""
        self.creditCents = defaults.integer(forKey: creditCentsKey)
    }

    private func persist() {
        defaults.set(memberId, forKey: memberIdKey)
        defaults.set(preferredName, forKey: preferredNameKey)
        defaults.set(email, forKey: emailKey)
        defaults.set(creditCents, forKey: creditCentsKey)
    }

    private func setMember(_ member: APIMember) {
        memberId = member.id
        preferredName = member.preferredName
        email = member.email
        creditCents = member.creditCents ?? 0
        persist()
    }

    func register(preferredName: String, email: String, password: String) async {
        let name = preferredName.trimmingCharacters(in: .whitespacesAndNewlines)
        let em = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let pw = password
        guard !name.isEmpty, !em.isEmpty, !pw.isEmpty else {
            authError = "Name, email and password are required."
            return
        }
        guard pw.count >= 6 else {
            authError = "Password must be at least 6 characters."
            return
        }
        isAuthLoading = true
        authError = nil
        defer { isAuthLoading = false }
        do {
            let member = try await AuthAPI.register(preferredName: name, email: em, password: pw)
            setMember(member)
        } catch let err as SparrowsAPIError {
            switch err {
            case .transport(let msg):
                authError = msg
            case .decode:
                authError = err.localizedDescription
            case .httpStatus(409, _):
                authError = "This email is already registered. Use Login instead."
            case .httpStatus(_, let msg):
                authError = msg ?? "Registration failed."
            default:
                authError = err.localizedDescription
            }
        } catch {
            authError = error.localizedDescription
        }
    }

    func login(email: String, password: String) async {
        let em = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !em.isEmpty, !password.isEmpty else {
            authError = "Email and password are required."
            return
        }
        isAuthLoading = true
        authError = nil
        defer { isAuthLoading = false }
        do {
            let member = try await AuthAPI.login(email: em, password: password)
            setMember(member)
        } catch let err as SparrowsAPIError {
            switch err {
            case .transport(let msg):
                authError = msg
            case .decode:
                authError = err.localizedDescription
            case .httpStatus(401, _):
                authError = "Invalid email or password."
            case .httpStatus(_, let msg):
                authError = msg ?? "Login failed."
            default:
                authError = err.localizedDescription
            }
        } catch {
            authError = error.localizedDescription
        }
    }

    func loginWithGoogle(idToken: String) async {
        isAuthLoading = true
        authError = nil
        defer { isAuthLoading = false }
        do {
            let member = try await AuthAPI.loginWithGoogle(idToken: idToken)
            setMember(member)
        } catch let err as SparrowsAPIError {
            if case .httpStatus(_, let msg) = err { authError = msg }
            else { authError = "Google sign-in failed." }
        } catch {
            authError = "Google sign-in failed."
        }
    }

    func logout() {
        memberId = nil
        preferredName = ""
        email = ""
        creditCents = 0
        saveError = nil
        authError = nil
        persist()
    }

    func clearSaveError() {
        saveError = nil
    }

    func saveProfile(preferredName: String, email: String) async {
        let trimmedName = preferredName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !trimmedEmail.isEmpty else {
            saveError = "Name and email are required."
            return
        }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            if let id = memberId {
                let updated = try await MemberAPI.update(id: id, preferredName: trimmedName, email: trimmedEmail)
                self.memberId = updated.id
                self.preferredName = updated.preferredName
                self.email = updated.email
                persist()
            } else {
                let member = try await MemberAPI.create(preferredName: trimmedName, email: trimmedEmail)
                setMember(member)
            }
        } catch let err as SparrowsAPIError {
            switch err {
            case .transport(let msg):
                saveError = msg
            case .decode:
                saveError = err.localizedDescription
            case .httpStatus(409, _):
                saveError = "This email is already registered. Try logging in instead."
            case .httpStatus(let code, let msg):
                saveError = msg ?? "Request failed (\(code))."
            default:
                saveError = err.localizedDescription
            }
        } catch {
            saveError = error.localizedDescription
        }
    }

    /// Update display name only (PATCH preferredName).
    func updatePreferredName(_ newName: String) async {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let id = memberId else { return }
        guard !trimmed.isEmpty else {
            saveError = "Name is required."
            return
        }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            let updated = try await MemberAPI.update(id: id, preferredName: trimmed, email: nil)
            preferredName = updated.preferredName
            persist()
        } catch let err as SparrowsAPIError {
            switch err {
            case .transport(let msg):
                saveError = msg
            case .decode:
                saveError = err.localizedDescription
            case .httpStatus(_, let msg):
                saveError = msg ?? "Update failed."
            default:
                saveError = err.localizedDescription
            }
        } catch {
            saveError = error.localizedDescription
        }
    }

    func changePassword(currentPassword: String, newPassword: String) async {
        guard let id = memberId else { return }
        guard newPassword.count >= 6 else {
            saveError = "New password must be at least 6 characters."
            return
        }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await AuthAPI.changePassword(memberId: id, currentPassword: currentPassword, newPassword: newPassword)
        } catch let err as SparrowsAPIError {
            if case .httpStatus(401, _) = err { saveError = "Current password is incorrect." }
            else if case .httpStatus(_, let msg) = err { saveError = msg ?? "Change password failed." }
            else if case .transport = err { saveError = err.localizedDescription }
            else if case .decode = err { saveError = err.localizedDescription }
            else { saveError = err.localizedDescription }
        } catch {
            saveError = error.localizedDescription
        }
    }

    func deleteAccount() async -> Bool {
        guard let id = memberId else { return false }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await AuthAPI.deleteAccount(memberId: id)
            logout()
            return true
        } catch let err as SparrowsAPIError {
            if case .httpStatus(_, let msg) = err {
                saveError = msg ?? "Account deletion failed."
            } else {
                saveError = err.localizedDescription
            }
        } catch {
            saveError = error.localizedDescription
        }
        return false
    }

    func loadFromBackendIfNeeded() async {
        guard let id = memberId else { return }
        do {
            let member = try await MemberAPI.get(id: id)
            if member.email != email {
                logout()
                return
            }
            preferredName = member.preferredName
            email = member.email
            creditCents = member.creditCents ?? 0
            persist()
        } catch { }
    }
}

struct ContentView: View {
    private let announcementsSeenAtKey = "sparrows.announcements.seenAt"
    private let lastNotifiedAnnouncementIdKey = "sparrows.announcements.lastNotifiedId"
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab: AppTab = .calendar
    @State private var webViewPreloader = WebViewPreloader()
    @StateObject private var calendarViewModel = SportsCalendarViewModel()
    @StateObject private var memberStore = MemberProfileStore()
    @State private var showTabLabels = true
    @State private var tabTransitionDirection: Int = 1
    @State private var tabIsAtTop: [AppTab: Bool] = Dictionary(
        uniqueKeysWithValues: AppTab.allCases.map { ($0, true) }
    )
    @State private var autoHideLabelsTask: Task<Void, Never>?
    @State private var shopScrollToTopToken = 0
    @State private var shopRefreshToken = 0
    @State private var calendarScrollToTopToken = 0
    @State private var myProfileScrollToTopToken = 0
    @State private var myProfileRefreshToken = 0
    @State private var myProfileShowAccount = false
    @State private var myProfileShowScheduledEvents = true
    @State private var myProfileShowHistory = false
    @State private var myProfileShowAnnouncements = false
    @State private var myProfileShowScoreboard = false
    @State private var myProfileScoreboardFullscreen = false
    @State private var announcementsUnreadCount = 0
    @State private var browserPopupURL: URL?
    @State private var checkoutSafariURL: URL?
    @State private var inAppBrowserCache = InAppBrowserCache()
    @StateObject private var newsPreloader = SparrowsNewsPreloader()
    @StateObject private var shopPreloader = SparrowsShopPreloader()

    private var announcementsSeenAt: Date {
        let stored = UserDefaults.standard.string(forKey: announcementsSeenAtKey) ?? ""
        if stored.isEmpty { return .distantPast }
        return parseAnnouncementISO8601(stored)
    }

    /// Parses API/stored ISO-8601 timestamps (with or without fractional seconds).
    private func parseAnnouncementISO8601(_ raw: String) -> Date {
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFrac.date(from: raw) { return d }
        let basic = ISO8601DateFormatter()
        basic.formatOptions = [.withInternetDateTime]
        return basic.date(from: raw) ?? .distantPast
    }

    private func requestAnnouncementNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    private func showAnnouncementNotification(message: String) {
        let content = UNMutableNotificationContent()
        content.title = "New announcement"
        let maxLen = 200
        let body = message.count > maxLen ? String(message.prefix(maxLen)) + "…" : message
        content.body = body
        content.sound = .default
        content.userInfo = ["sparrowsNotificationType": "announcement"]
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 0.15, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func markAnnouncementsSeenNow() {
        let now = ISO8601DateFormatter().string(from: Date())
        UserDefaults.standard.set(now, forKey: announcementsSeenAtKey)
        announcementsUnreadCount = 0
    }

    private func refreshAnnouncementUnreadCount() async {
        guard memberStore.memberId != nil else {
            await MainActor.run { announcementsUnreadCount = 0 }
            return
        }
        do {
            let latest = try await AnnouncementsAPI.list(start: 0, end: 50).items
            let seenAt = announcementsSeenAt
            let unread = latest.filter { item in
                parseAnnouncementISO8601(item.createdAt) > seenAt
            }.count

            if let newest = latest.first, unread > 0 {
                let lastNotified = UserDefaults.standard.string(forKey: lastNotifiedAnnouncementIdKey)
                if lastNotified != newest.id {
                    UserDefaults.standard.set(newest.id, forKey: lastNotifiedAnnouncementIdKey)
                    showAnnouncementNotification(message: newest.message)
                }
            }
            await MainActor.run {
                announcementsUnreadCount = unread
            }
        } catch { }
    }

    var body: some View {
        ZStack {
            Color.white
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 20)
                        .onEnded(handleHorizontalSwipe)
                )
            currentPage
        }
        .animation(.easeInOut(duration: 0.22), value: selectedTab)
            .preferredColorScheme(.light)
            .safeAreaInset(edge: .bottom) {
                if !myProfileScoreboardFullscreen {
                    BottomTabBar(
                        selectedTab: $selectedTab,
                        showLabels: showTabLabels,
                        announcementsUnreadCount: announcementsUnreadCount,
                        onSelect: selectTab,
                        onReselect: handleReselect
                    )
                }
            }
            .task {
                AppOrientation.lockPortrait()
                webViewPreloader.preloadAllTabs()
                Task {
                    await newsPreloader.preloadIfNeeded()
                }
                Task {
                    await shopPreloader.preloadIfNeeded()
                }
                await calendarViewModel.loadEventsIfNeeded()
                requestAnnouncementNotificationPermission()
                await refreshAnnouncementUnreadCount()
                applyLabelVisibilityRule(userActivity: false)
            }
            .task(id: memberStore.memberId) {
                await refreshAnnouncementUnreadCount()
            }
            .onChange(of: scenePhase) { newPhase in
                if newPhase == .active {
                    Task { await refreshAnnouncementUnreadCount() }
                }
            }
            .onReceive(Timer.publish(every: 12, tolerance: 3, on: .main, in: .common).autoconnect()) { _ in
                Task { await refreshAnnouncementUnreadCount() }
            }
            .onOpenURL { url in
                // Web payment return pages may deep-link back into the app.
                guard url.scheme?.lowercased() == "sparrows-app" else { return }
                guard url.host?.lowercased() == "profile" else { return }

                checkoutSafariURL = nil
                if selectedTab != .myProfile {
                    withAnimation(.easeInOut(duration: 0.22)) {
                        selectedTab = .myProfile
                    }
                }
                myProfileRefreshToken += 1
            }
            .onReceive(NotificationCenter.default.publisher(for: .sparrowsOpenAnnouncements)) { _ in
                if selectedTab != .myProfile {
                    withAnimation(.easeInOut(duration: 0.22)) {
                        selectedTab = .myProfile
                    }
                }
                myProfileShowAnnouncements = true
                myProfileRefreshToken += 1
            }
            .onChange(of: myProfileScoreboardFullscreen) { isFullscreen in
                if isFullscreen {
                    AppOrientation.allowScoreboardRotation()
                } else {
                    AppOrientation.lockPortrait()
                }
            }
            .onChange(of: myProfileShowScoreboard) { isExpanded in
                guard selectedTab == .myProfile else { return }
                if isExpanded {
                    // Allow user to rotate into landscape when scoreboard section is expanded.
                    AppOrientation.allowScoreboardRotation()
                } else {
                    myProfileScoreboardFullscreen = false
                    AppOrientation.lockPortrait()
                }
            }
            .onChange(of: selectedTab) { tab in
                if tab == .myProfile, myProfileShowScoreboard {
                    AppOrientation.allowScoreboardRotation()
                } else if tab != .myProfile {
                    AppOrientation.lockPortrait()
                }
            }
    }

    private func handleReselect(_ tab: AppTab) {
        guard tab == selectedTab else { return }

        if tabIsAtTop[tab] != true {
            scrollToTop(tab)
            return
        }

        switch tab {
        case .calendar:
            Task {
                await calendarViewModel.resetAndRefresh()
            }
        case .liveVideos:
            webViewPreloader.loadInitialPage(for: .liveVideos)
        case .shop:
            shopRefreshToken += 1
        case .ongoingTournament:
            browserPopupURL = nil
            inAppBrowserCache.clear()
            webViewPreloader.clearCachedWebView(for: .ongoingTournament)
            webViewPreloader.loadInitialPage(for: .ongoingTournament)
        case .myProfile:
            myProfileRefreshToken += 1
        }
    }

    private func selectTab(_ tab: AppTab) {
        guard tab != selectedTab else { return }
        if tab != .myProfile {
            myProfileScoreboardFullscreen = false
        }
        tabTransitionDirection = transitionDirection(from: selectedTab, to: tab)
        withAnimation(.easeInOut(duration: 0.22)) {
            selectedTab = tab
        }
        if tab == .myProfile {
            Task { await refreshAnnouncementUnreadCount() }
        }
        applyLabelVisibilityRule(userActivity: false)
    }

    private func handleHorizontalSwipe(_ value: DragGesture.Value) {
        let horizontal = value.translation.width
        let vertical = value.translation.height

        guard abs(horizontal) > 70, abs(horizontal) > abs(vertical) else { return }

        let tabs = AppTab.allCases
        guard let currentIndex = tabs.firstIndex(of: selectedTab) else { return }

        if horizontal < 0, currentIndex < tabs.count - 1 {
            selectTab(tabs[currentIndex + 1])
        } else if horizontal > 0, currentIndex > 0 {
            selectTab(tabs[currentIndex - 1])
        }
    }

    private func transitionDirection(from oldTab: AppTab, to newTab: AppTab) -> Int {
        let tabs = AppTab.allCases
        guard
            let oldIndex = tabs.firstIndex(of: oldTab),
            let newIndex = tabs.firstIndex(of: newTab)
        else { return 1 }
        return newIndex >= oldIndex ? 1 : -1
    }

    private func handleTopStateChange(for tab: AppTab, isAtTop: Bool, userActivity: Bool) {
        tabIsAtTop[tab] = isAtTop
        guard tab == selectedTab else { return }
        applyLabelVisibilityRule(userActivity: userActivity)
    }

    private func applyLabelVisibilityRule(userActivity _: Bool) {
        let atTop = tabIsAtTop[selectedTab] ?? true

        if atTop {
            withAnimation(.easeInOut(duration: 0.18)) {
                showTabLabels = true
            }
            scheduleAutoHideLabels()
        } else {
            autoHideLabelsTask?.cancel()
            withAnimation(.easeInOut(duration: 0.18)) {
                showTabLabels = false
            }
        }
    }

    private func scheduleAutoHideLabels() {
        autoHideLabelsTask?.cancel()
        let currentTab = selectedTab

        autoHideLabelsTask = Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard selectedTab == currentTab, tabIsAtTop[currentTab] == true else { return }
                withAnimation(.easeInOut(duration: 0.18)) {
                    showTabLabels = false
                }
            }
        }
    }

    private func scrollToTop(_ tab: AppTab) {
        switch tab {
        case .calendar:
            calendarScrollToTopToken += 1
        case .myProfile:
            myProfileScrollToTopToken += 1
        case .liveVideos:
            webViewPreloader.scrollToTop(tab: .liveVideos)
        case .shop:
            shopScrollToTopToken += 1
        case .ongoingTournament:
            webViewPreloader.scrollToTop(tab: .ongoingTournament)
        }
    }

    @ViewBuilder
    private var currentPage: some View {
        Group {
            switch selectedTab {
            case .shop:
                ShopProductsView(
                    scrollToTopToken: shopScrollToTopToken,
                    refreshToken: shopRefreshToken,
                    preloadedItems: shopPreloader.cachedItems,
                    didAttemptInitialLoad: shopPreloader.didAttemptLoad,
                    onOpenProduct: { url in
                        browserPopupURL = url
                    },
                    onCacheUpdate: { items, loadFailed in
                        shopPreloader.updateCache(with: items, loadFailed: loadFailed)
                    },
                    onScrollStateChange: { isAtTop, userActivity in
                        handleTopStateChange(for: .shop, isAtTop: isAtTop, userActivity: userActivity)
                    }
                )
            case .liveVideos:
                webPageWithBackButton(
                    tab: .liveVideos,
                    urlString: "https://www.youtube.com/@SparrowsVolleyball/videos",
                    onPullToRefresh: {
                        webViewPreloader.webView(for: .liveVideos, urlString: "https://www.youtube.com/@SparrowsVolleyball/videos").reload()
                    }
                )
            case .calendar:
                SportsCalendarView(
                    viewModel: calendarViewModel,
                    memberStore: memberStore,
                    scrollToTopToken: calendarScrollToTopToken,
                    onOpenCheckout: { url in
                        openCheckout(url)
                    },
                    onScrollStateChange: { isAtTop, userActivity in
                        handleTopStateChange(for: .calendar, isAtTop: isAtTop, userActivity: userActivity)
                    }
                )
            case .ongoingTournament:
                WebPageView(
                    webView: webViewPreloader.webView(
                        for: .ongoingTournament,
                        urlString: "https://joechan426.github.io/sparrowsvolleyball/"
                    ),
                    onOpenInAppBrowser: { url in
                        browserPopupURL = url
                    },
                    onPullToRefresh: {
                        webViewPreloader.webView(for: .ongoingTournament, urlString: "https://joechan426.github.io/sparrowsvolleyball/").reload()
                    },
                    onScrollStateChange: { isAtTop, userActivity in
                        handleTopStateChange(for: .ongoingTournament, isAtTop: isAtTop, userActivity: userActivity)
                    }
                )
            case .myProfile:
                MyProfileView(
                    scrollToTopToken: myProfileScrollToTopToken,
                    refreshToken: myProfileRefreshToken,
                    newsPreloader: newsPreloader,
                    memberStore: memberStore,
                    showAccount: $myProfileShowAccount,
                    showScheduledEvents: $myProfileShowScheduledEvents,
                    showHistory: $myProfileShowHistory,
                    showAnnouncements: $myProfileShowAnnouncements,
                    showScoreboard: $myProfileShowScoreboard,
                    announcementsUnreadCount: $announcementsUnreadCount,
                    onAnnouncementsSeen: {
                        markAnnouncementsSeenNow()
                    },
                    onScoreboardFullscreenChange: { isFullscreen in
                        myProfileScoreboardFullscreen = isFullscreen
                    },
                    onScrollStateChange: { isAtTop, userActivity in
                        handleTopStateChange(for: .myProfile, isAtTop: isAtTop, userActivity: userActivity)
                    }
                )
            }
        }
        .transition(
            tabTransitionDirection >= 0
                ? .asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading))
                : .asymmetric(insertion: .move(edge: .leading), removal: .move(edge: .trailing))
        )
        .sheet(item: $browserPopupURL.asBrowserSheetItem()) { item in
            InAppTemporaryBrowser(
                url: item.url,
                cache: inAppBrowserCache,
                onClose: { browserPopupURL = nil }
            )
        }
        .sheet(item: $checkoutSafariURL.asCheckoutSafariSheetItem()) { item in
            CheckoutSafariView(
                url: item.url,
                onDismiss: { checkoutSafariURL = nil }
            )
        }
    }

    /// Keep checkout fully in-app (SFSafariViewController).
    private func openCheckout(_ url: URL) {
        checkoutSafariURL = url
    }

    private func webPageWithBackButton(tab: AppTab, urlString: String, onPullToRefresh: (() -> Void)? = nil) -> some View {
        ZStack(alignment: .bottomLeading) {
            WebPageView(
                webView: webViewPreloader.webView(
                    for: tab,
                    urlString: urlString
                ),
                interceptYouTubeSubscribeToApp: tab == .liveVideos,
                onPullToRefresh: onPullToRefresh,
                onScrollStateChange: { isAtTop, userActivity in
                    handleTopStateChange(for: tab, isAtTop: isAtTop, userActivity: userActivity)
                }
            )

            Button {
                webViewPreloader.goBackWithAnimation(tab: tab)
            } label: {
                Image(systemName: "arrow.uturn.backward.circle.fill")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.black)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.white.opacity(0.92)))
                    .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 1))
                    .shadow(color: Color.black.opacity(0.16), radius: 5, x: 0, y: 2)
            }
            .padding(.leading, 14)
            .padding(.bottom, 12)
        }
    }

}

private enum AppTab: CaseIterable {
    case shop
    case liveVideos
    case calendar
    case ongoingTournament
    case myProfile

    var title: String {
        switch self {
        case .shop:
            return "Shop"
        case .liveVideos:
            return "Videos"
        case .calendar:
            return "Calendar"
        case .ongoingTournament:
            return "Ongoing Tournament"
        case .myProfile:
            return "My Profile"
        }
    }

    var logoAssetName: String? {
        switch self {
        case .myProfile:
            return "SparrowsLogo"
        default:
            return nil
        }
    }

    func systemIcon(isSelected: Bool) -> String {
        switch self {
        case .shop:
            return isSelected ? "cart.fill" : "cart"
        case .liveVideos:
            return isSelected ? "play.tv.fill" : "play.tv"
        case .calendar:
            return isSelected ? "calendar.circle.fill" : "calendar"
        case .ongoingTournament:
            return isSelected ? "trophy.fill" : "trophy"
        case .myProfile:
            return "person.circle"
        }
    }
}

private struct BottomTabBar: View {
    @Binding var selectedTab: AppTab
    let showLabels: Bool
    let announcementsUnreadCount: Int
    let onSelect: (AppTab) -> Void
    let onReselect: (AppTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                let isSelected = selectedTab == tab
                Button {
                    if isSelected {
                        onReselect(tab)
                    } else {
                        onSelect(tab)
                    }
                } label: {
                    VStack(spacing: showLabels ? 4 : 0) {
                        ZStack(alignment: .topTrailing) {
                            if let logoAssetName = tab.logoAssetName {
                                Image(logoAssetName)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 20, height: 20)
                                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                            } else {
                                Image(systemName: tab.systemIcon(isSelected: isSelected))
                                    .font(.system(size: 17, weight: .semibold))
                            }
                            if tab == .myProfile, announcementsUnreadCount > 0 {
                                Text("\(announcementsUnreadCount)")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(Capsule().fill(Color.red))
                                    .offset(x: 10, y: -8)
                            }
                        }
                        if showLabels {
                            Text(tab.title)
                                .font(.caption2)
                                .foregroundStyle(Color.black)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }
                    .foregroundStyle(isSelected ? Color.black : Color.black.opacity(0.65))
                    .fontWeight(isSelected ? .semibold : .regular)
                    .frame(maxWidth: .infinity, minHeight: showLabels ? 42 : 30)
                    .padding(.vertical, showLabels ? 1 : 0)
                    .background {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.black.opacity(0.08))
                            .opacity(isSelected ? 1 : 0)
                    }
                    .contentShape(Rectangle())
                    .animation(.easeInOut(duration: 0.15), value: isSelected)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, showLabels ? 3 : 1)
        .padding(.bottom, 1)
        .background(Color.white)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color(uiColor: .separator))
                .frame(height: 0.5)
        }
        .animation(.easeInOut(duration: 0.18), value: showLabels)
    }
}

private struct ComingSoonView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "clock.badge.exclamationmark.fill")
                .font(.system(size: 46))
                .foregroundStyle(.tint)
            Text("Coming Soon")
                .font(.title2)
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }
}

private struct ShopProductsView: View {
    let scrollToTopToken: Int
    let refreshToken: Int
    let preloadedItems: [SparrowsShopProduct]
    let didAttemptInitialLoad: Bool
    let onOpenProduct: (URL) -> Void
    let onCacheUpdate: ([SparrowsShopProduct], Bool) -> Void
    let onScrollStateChange: (Bool, Bool) -> Void

    @State private var products: [SparrowsShopProduct] = []
    @State private var leftColumnProducts: [SparrowsShopProduct] = []
    @State private var rightColumnProducts: [SparrowsShopProduct] = []
    @State private var displayedCount = 15
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var didInitialize = false

    private var canLoadMore: Bool {
        displayedCount < products.count
    }

    private let shopHorizontalPadding: CGFloat = 8
    private let shopColumnSpacing: CGFloat = 8

    var body: some View {
        GeometryReader { rootGeo in
            shopContent(
                contentWidth: max(rootGeo.size.width - (shopHorizontalPadding * 2), 0),
                cardWidth: max(
                    (max(rootGeo.size.width - (shopHorizontalPadding * 2), 0) - shopColumnSpacing) / 2,
                    0
                )
            )
        }
    }

    private func shopContent(contentWidth: CGFloat, cardWidth: CGFloat) -> some View {
        AnyView(
            ScrollViewReader { proxy in
                ScrollView {
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: ShopOffsetPreferenceKey.self,
                                value: geo.frame(in: .named("shopScroll")).minY
                            )
                    }
                    .frame(height: 0)
                    .id("shop-top-anchor")

                    VStack(alignment: .leading, spacing: 8) {
                        shopHeader(contentWidth: contentWidth)
                        shopStateSection(contentWidth: contentWidth, cardWidth: cardWidth)
                    }
                    .frame(width: contentWidth, alignment: .leading)
                    .padding(.horizontal, shopHorizontalPadding)
                    .padding(.top, 8)
                    .padding(.bottom, 118)
                }
                .coordinateSpace(name: "shopScroll")
                .refreshable {
                    await loadProducts(forceReload: true)
                }
                .onPreferenceChange(ShopOffsetPreferenceKey.self) { offset in
                    onScrollStateChange(offset >= -0.05, true)
                }
                .onAppear {
                    onScrollStateChange(true, false)
                    guard !didInitialize else { return }
                    didInitialize = true
                    if !preloadedItems.isEmpty {
                        products = preloadedItems
                        displayedCount = min(15, products.count)
                        distributeProducts(Array(products.prefix(displayedCount)))
                        loadFailed = false
                        isLoading = false
                    } else if didAttemptInitialLoad {
                        isLoading = false
                        loadFailed = true
                    }
                }
                .task {
                    guard products.isEmpty else { return }
                    guard preloadedItems.isEmpty else { return }
                    await loadProducts(forceReload: false)
                }
                .onChange(of: refreshToken) { _ in
                    Task { await loadProducts(forceReload: true) }
                }
                .onChange(of: preloadedItems) { items in
                    guard products.isEmpty, !items.isEmpty else { return }
                    products = items
                    displayedCount = min(15, items.count)
                    distributeProducts(Array(items.prefix(displayedCount)))
                    loadFailed = false
                    isLoading = false
                }
                .onChange(of: scrollToTopToken) { _ in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        proxy.scrollTo("shop-top-anchor", anchor: .top)
                    }
                }
            }
        )
    }

    private func shopHeader(contentWidth: CGFloat) -> some View {
        Text("Sparrows Shop")
            .font(.title2.weight(.bold))
            .foregroundStyle(Color.black)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .frame(width: contentWidth, alignment: .leading)
    }

    private func shopStateSection(contentWidth: CGFloat, cardWidth: CGFloat) -> AnyView {
        if isLoading {
            return AnyView(
                ProgressView("Loading products...")
                    .frame(width: contentWidth, alignment: .center)
                    .padding(.top, 32)
            )
        } else if loadFailed || products.isEmpty {
            return AnyView(shopErrorView(contentWidth: contentWidth))
        } else {
            return AnyView(shopLoadedView(contentWidth: contentWidth, cardWidth: cardWidth))
        }
    }

    private func shopErrorView(contentWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Unable to load products right now.")
                .font(.headline)
                .foregroundStyle(Color.black)

            Text("Please try again in a moment.")
                .font(.subheadline)
                .foregroundStyle(Color.black.opacity(0.75))

            Button("Reload") {
                Task { await loadProducts(forceReload: true) }
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.055, green: 0.267, blue: 0.239))
        }
        .frame(width: contentWidth, alignment: .leading)
        .padding(.top, 16)
    }

    private func shopLoadedView(contentWidth: CGFloat, cardWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            shopProductsGrid(contentWidth: contentWidth, cardWidth: cardWidth)

            if canLoadMore {
                shopLoadMoreButton(contentWidth: contentWidth)
            }

            shopViewAllButton(contentWidth: contentWidth)
        }
    }

    private func shopProductsGrid(contentWidth: CGFloat, cardWidth: CGFloat) -> some View {
        HStack(alignment: .top, spacing: shopColumnSpacing) {
            VStack(spacing: 8) {
                ForEach(leftColumnProducts) { product in
                    ShopProductCard(product: product) {
                        onOpenProduct(product.url)
                    }
                    .frame(width: cardWidth, alignment: .topLeading)
                }
            }
            .frame(width: cardWidth, alignment: .topLeading)

            VStack(spacing: 8) {
                ForEach(rightColumnProducts) { product in
                    ShopProductCard(product: product) {
                        onOpenProduct(product.url)
                    }
                    .frame(width: cardWidth, alignment: .topLeading)
                }
            }
            .frame(width: cardWidth, alignment: .topLeading)
        }
        .frame(width: contentWidth, alignment: .leading)
    }

    private func shopLoadMoreButton(contentWidth: CGFloat) -> some View {
        Button {
            loadMore()
        } label: {
            Text("Load 5 more")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.black)
                )
        }
        .buttonStyle(.plain)
        .frame(width: contentWidth, alignment: .leading)
        .padding(.top, 2)
    }

    private func shopViewAllButton(contentWidth: CGFloat) -> some View {
        Button {
            if let url = URL(string: "https://sparrowsvolleyball.com.au/shop") {
                onOpenProduct(url)
            }
        } label: {
            Text("View all products")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color(red: 0.055, green: 0.267, blue: 0.239))
                )
        }
        .buttonStyle(.plain)
        .frame(width: contentWidth, alignment: .leading)
        .padding(.top, 4)
    }

    @MainActor
    private func loadProducts(forceReload: Bool = false) async {
        if forceReload {
            products = []
            leftColumnProducts = []
            rightColumnProducts = []
            displayedCount = 15
        }
        isLoading = true
        loadFailed = false

        let firstPage = await SparrowsShopService.fetchPage(page: 1, limit: 15)
        let firstItems = firstPage.items.shuffled()
        products = firstItems
        displayedCount = min(15, firstItems.count)
        distributeProducts(Array(firstItems.prefix(displayedCount)))
        loadFailed = firstItems.isEmpty
        onCacheUpdate(firstItems, firstItems.isEmpty)
        isLoading = false
    }

    private func loadMore() {
        guard canLoadMore else { return }
        displayedCount = min(displayedCount + 5, products.count)
        distributeProducts(Array(products.prefix(displayedCount)))
    }

    private func distributeProducts(_ items: [SparrowsShopProduct]) {
        var left: [SparrowsShopProduct] = []
        var right: [SparrowsShopProduct] = []

        for product in items {
            let preferLeft = abs(product.id.hashValue) % 2 == 0
            if abs(left.count - right.count) >= 2 {
                if left.count < right.count {
                    left.append(product)
                } else {
                    right.append(product)
                }
            } else if preferLeft {
                left.append(product)
            } else {
                right.append(product)
            }
        }

        leftColumnProducts = left
        rightColumnProducts = right
    }
}

private struct ShopProductCard: View {
    let product: SparrowsShopProduct
    let onTap: () -> Void

    private var imageHeight: CGFloat {
        // Deterministic "random" heights to keep layout stable across reloads.
        let buckets: [CGFloat] = [148, 168, 188, 204]
        let index = abs(product.id.hashValue) % buckets.count
        return buckets[index]
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 4) {
                ZStack {
                    Color.white
                    ShopRemoteImageView(productPageURL: product.url)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(height: imageHeight)
                .frame(maxWidth: .infinity)
                .clipped()

                Text(product.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.black)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !product.salePriceText.isEmpty && !product.originalPriceText.isEmpty {
                    HStack(spacing: 6) {
                        Text(product.originalPriceText)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(Color(red: 0.055, green: 0.267, blue: 0.239))
                            .strikethrough(true, color: .red)

                        Text(product.salePriceText)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(Color.red)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else if !product.priceText.isEmpty {
                    Text(product.priceText)
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Color(red: 0.055, green: 0.267, blue: 0.239))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if !product.stockText.isEmpty {
                    Text(product.stockText)
                        .font(.caption)
                        .foregroundStyle(Color.black.opacity(0.72))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if !product.optionsText.isEmpty {
                    Text(product.optionsText)
                        .font(.caption2)
                        .foregroundStyle(Color.black.opacity(0.66))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .clipped()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct ShopRemoteImageView: View {
    let productPageURL: URL
    @StateObject private var loader = ShopRemoteImageLoader()

    var body: some View {
        Group {
            if let image = loader.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            } else if loader.hasFailed {
                Rectangle().fill(Color.white)
            } else {
                ZStack {
                    Rectangle().fill(Color.white)
                    ProgressView()
                }
            }
        }
        .task(id: productPageURL.absoluteString) {
            await loader.load(productURL: productPageURL)
        }
    }
}

private final class ShopRemoteImageLoader: ObservableObject {
    @Published var image: UIImage?
    @Published var hasFailed = false

    private static let cache = NSCache<NSURL, UIImage>()
    private static let imageURLCache = NSCache<NSURL, NSURL>()

    func load(productURL: URL) async {
        await MainActor.run {
            self.image = nil
            self.hasFailed = false
        }

        if let cachedImageNSURL = Self.imageURLCache.object(forKey: productURL as NSURL) {
            let cachedImageURL = cachedImageNSURL as URL
            if let cachedImage = await fetchImage(at: cachedImageURL) {
                await MainActor.run {
                    self.image = cachedImage
                }
                return
            }
        }

        if let fallbackImageURL = await fetchFallbackImageURL(from: productURL) {
            Self.imageURLCache.setObject(fallbackImageURL as NSURL, forKey: productURL as NSURL)
            if let fallbackImage = await fetchImage(at: fallbackImageURL) {
                await MainActor.run {
                    self.image = fallbackImage
                }
                return
            }
        }

        await MainActor.run {
            self.hasFailed = true
        }
    }

    static func warmup(productURLs: [URL], limit: Int = 15) async {
        let urls = Array(productURLs.prefix(max(1, limit)))
        guard !urls.isEmpty else { return }

        await withTaskGroup(of: Void.self) { group in
            for productURL in urls {
                group.addTask {
                    let helper = ShopRemoteImageLoader()
                    if let cachedImageNSURL = imageURLCache.object(forKey: productURL as NSURL) {
                        let cachedImageURL = cachedImageNSURL as URL
                        _ = await helper.fetchImage(at: cachedImageURL)
                        return
                    }

                    if let fallbackImageURL = await helper.fetchFallbackImageURL(from: productURL) {
                        imageURLCache.setObject(fallbackImageURL as NSURL, forKey: productURL as NSURL)
                        _ = await helper.fetchImage(at: fallbackImageURL)
                    }
                }
            }
        }
    }

    private func fetchImage(at url: URL) async -> UIImage? {
        let nsURL = url as NSURL
        if let cached = Self.cache.object(forKey: nsURL) {
            return cached
        }

        do {
            let request = buildRequest(url: url, referer: "https://sparrowsvolleyball.com.au/shop")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard
                let http = response as? HTTPURLResponse,
                (200...299).contains(http.statusCode),
                let uiImage = UIImage(data: data)
            else {
                return nil
            }

            Self.cache.setObject(uiImage, forKey: nsURL)
            return uiImage
        } catch {
            return nil
        }
    }

    private func fetchFallbackImageURL(from productURL: URL) async -> URL? {
        do {
            let request = buildRequest(url: productURL, referer: "https://sparrowsvolleyball.com.au/shop")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard
                let http = response as? HTTPURLResponse,
                (200...299).contains(http.statusCode),
                let html = String(data: data, encoding: .utf8)
            else {
                return nil
            }

            if let og = extractMetaContent(html: html, property: "og:image"),
               let resolved = normalizedImageURL(og) {
                return resolved
            }
            if let tw = extractMetaContent(html: html, property: "twitter:image"),
               let resolved = normalizedImageURL(tw) {
                return resolved
            }
            if let src = extractFirstImageSrc(html: html),
               let resolved = normalizedImageURL(src) {
                return resolved
            }
            return nil
        } catch {
            return nil
        }
    }

    private func buildRequest(url: URL, referer: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = 18
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        request.setValue(referer, forHTTPHeaderField: "Referer")
        return request
    }

    private func extractMetaContent(html: String, property: String) -> String? {
        let pattern = "<meta[^>]+(?:property|name)=[\"']\(NSRegularExpression.escapedPattern(for: property))[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns = html as NSString
        let range = NSRange(location: 0, length: ns.length)
        guard let match = regex.firstMatch(in: html, options: [], range: range), match.numberOfRanges >= 2 else { return nil }
        return ns.substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func extractFirstImageSrc(html: String) -> String? {
        let pattern = "<img[^>]+src=[\"']([^\"']+)[\"'][^>]*>"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns = html as NSString
        let range = NSRange(location: 0, length: ns.length)
        guard let match = regex.firstMatch(in: html, options: [], range: range), match.numberOfRanges >= 2 else { return nil }
        return ns.substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalizedImageURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.hasPrefix("data:") else { return nil }
        if trimmed.hasPrefix("https://") {
            return URL(string: trimmed)
        }
        if trimmed.hasPrefix("http://") {
            return URL(string: "https://" + trimmed.dropFirst("http://".count))
        }
        if trimmed.hasPrefix("//") {
            return URL(string: "https:\(trimmed)")
        }
        if trimmed.hasPrefix("/") {
            return URL(string: "https://sparrowsvolleyball.com.au\(trimmed)")
        }
        return URL(string: "https://sparrowsvolleyball.com.au/\(trimmed)")
    }
}

private struct ShopOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct SparrowsShopProduct: Identifiable, Equatable {
    let id: String
    let title: String
    let url: URL
    let imageURL: URL?
    let priceText: String
    let originalPriceText: String
    let salePriceText: String
    let stockText: String
    let optionsText: String
}

private enum SparrowsShopService {
    @MainActor
    static func fetchPage(page: Int, limit: Int = 40) async -> ShopPageScrapeResult {
        let safePage = max(1, page)
        let safeLimit = max(1, limit)
        let scraper = BackgroundShopWebViewScraper()
        let urlString: String
        if safePage == 1 {
            urlString = "https://sparrowsvolleyball.com.au/shop"
        } else {
            urlString = "https://sparrowsvolleyball.com.au/shop/ols/products?page=\(safePage)"
        }
        let url = URL(string: urlString)!
        return await scraper.scrapePage(url: url, limit: safeLimit)
    }
}

@MainActor
private final class BackgroundShopWebViewScraper: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<ShopPageScrapeResult, Never>?
    private var webView: WKWebView?
    private var timeoutWorkItem: DispatchWorkItem?
    private var resolved = false
    private var limit: Int = 200
    private let maxScrapeAttempts = 35
    private let scrapeRetryDelay: TimeInterval = 0.25

    func scrapePage(url: URL, limit: Int) async -> ShopPageScrapeResult {
        self.limit = max(1, limit)
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            self.resolved = false

            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            configuration.defaultWebpagePreferences.preferredContentMode = .mobile
            let webView = WKWebView(frame: .zero, configuration: configuration)
            self.webView = webView
            webView.navigationDelegate = self

            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12
            request.setValue(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                forHTTPHeaderField: "User-Agent"
            )
            webView.load(request)

            let timeout = DispatchWorkItem { [weak self] in
                self?.finish(with: ShopPageScrapeResult(items: [], totalPages: 1))
            }
            timeoutWorkItem = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        scrapeFromWebView(webView, attempt: 0)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(with: ShopPageScrapeResult(items: [], totalPages: 1))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(with: ShopPageScrapeResult(items: [], totalPages: 1))
    }

    private func scrapeFromWebView(_ webView: WKWebView, attempt: Int) {
        guard !resolved else { return }

        let script = """
        (function() {
          const LIMIT = \(limit);
          const clean = (v) => (v || '').replace(/\\s+/g, ' ').trim();
          const abs = (u) => {
            if (!u) return '';
            if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) return u;
            if (u.startsWith('//')) return 'https:' + u;
            if (u.startsWith('/')) return 'https://sparrowsvolleyball.com.au' + u;
            return 'https://sparrowsvolleyball.com.au/' + u;
          };
          const parseBackgroundUrl = (value) => {
            if (!value || value === 'none') return '';
            const match = value.match(/url\\((['\\"]?)(.*?)\\1\\)/i);
            return match ? abs(match[2]) : '';
          };
          const classBackgroundMap = (() => {
            const map = {};
            const addRule = (selectorText, bgValue) => {
              const bg = parseBackgroundUrl(bgValue);
              if (!bg) return;
              const matches = selectorText.match(/\\.([A-Za-z0-9_-]+)/g) || [];
              for (const m of matches) {
                const cls = m.slice(1);
                if (!map[cls]) map[cls] = bg;
              }
            };
            for (const sheet of Array.from(document.styleSheets || [])) {
              let rules = [];
              try { rules = Array.from(sheet.cssRules || []); } catch (e) { continue; }
              for (const rule of rules) {
                if (!rule || !rule.style || !rule.selectorText) continue;
                const bg = rule.style.backgroundImage || rule.style.getPropertyValue('background-image');
                if (!bg || bg === 'none') continue;
                addRule(rule.selectorText, bg);
              }
            }
            return map;
          })();
          const getImage = (card) => {
            const bg = card.querySelector('[data-aid^="PRODUCT_IMAGE_RENDERED_"][role="img"]');
            if (bg) {
              const styleUrl = parseBackgroundUrl(window.getComputedStyle(bg).backgroundImage);
              if (styleUrl) return styleUrl;
              const inlineUrl = parseBackgroundUrl(bg.style ? bg.style.backgroundImage : '');
              if (inlineUrl) return inlineUrl;
              for (const cls of Array.from(bg.classList || [])) {
                if (classBackgroundMap[cls]) return classBackgroundMap[cls];
              }
            }
            const img = card.querySelector('img');
            if (!img) return '';
            return abs(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '');
          };
          const toPrices = (card) => {
            const normalNode = card.querySelector('[data-aid^="PRODUCT_PRICE_RENDERED_"]');
            const saleNode = card.querySelector('[data-aid^="PRODUCT_SALE_PRICE_RENDERED_"]');
            const normal = clean(normalNode ? (normalNode.innerText || normalNode.textContent || '') : '');
            const sale = clean(saleNode ? (saleNode.innerText || saleNode.textContent || '') : '');
            if (normal || sale) return { normal, sale, display: sale || normal };
            const txt = clean(card.innerText || card.textContent || '');
            const prices = txt.match(/(?:A\\$|\\$)\\s?\\d[\\d,.]*/gi) || [];
            if (prices.length > 1) {
              return { normal: clean(prices[0]), sale: clean(prices[1]), display: clean(prices[1]) };
            }
            const one = prices.length ? clean(prices[0]) : '';
            return { normal: one, sale: '', display: one };
          };
          const colorCount = (card) => {
            const colors = card.querySelector('[data-aid^="PRODUCT_COLOR_SWATCHES_RENDERED_"]');
            if (!colors) return 0;
            const candidates = Array.from(colors.querySelectorAll('[data-ux="Block"]'));
            const swatches = candidates.filter(n => {
              const s = window.getComputedStyle(n);
              const radius = parseFloat(s.borderRadius || '0');
              return n.clientWidth <= 20 && n.clientHeight <= 20 && radius >= 8;
            });
            if (swatches.length > 0) return swatches.length;
            return Math.max(0, colors.querySelectorAll('[data-ux="Block"] > [data-ux="Block"]').length - 1);
          };

          const cards = [];
          const seen = new Set();
          const list = document.querySelector('[data-aid="PRODUCT_LIST_RENDERED"]');
          const blocks = list
            ? Array.from(list.querySelectorAll('[productid]'))
            : Array.from(document.querySelectorAll('[productid]'));

          for (const block of blocks) {
            const linkNode = block.querySelector('a[href][data-aid^="PRODUCT_NAME_RENDERED_"]') || block.querySelector('a[href]');
            if (!linkNode) continue;

            const href = abs(linkNode.getAttribute('href') || linkNode.href || '');
            if (!href || seen.has(href)) continue;

            const titleNode = block.querySelector('[data-aid^="PRODUCT_CARD_NAME_RENDERED_"]');
            const title = clean(titleNode ? (titleNode.innerText || titleNode.textContent || '') : '');
            if (!title) continue;

            const prices = toPrices(block);
            const stockNode = block.querySelector('[data-aid^="PRODUCT_FOOTER_RENDERED_"]');
            const stock = clean(stockNode ? (stockNode.innerText || stockNode.textContent || '') : '');
            const colors = colorCount(block);
            const image = getImage(block);
            const options = colors > 0 ? ('Color options: ' + colors) : (stock.toLowerCase() === 'more options' ? 'More options available' : '');

            cards.push({
              href,
              title,
              image,
              price: prices.display,
              originalPrice: prices.normal,
              salePrice: prices.sale,
              stock,
              options
            });
            seen.add(href);
          }

          const pageNodes = Array.from(document.querySelectorAll('[data-aid^="PAGINATION_PAGE_NUMBER_"]'));
          const pageNums = pageNodes
            .map(n => parseInt(clean(n.innerText || n.textContent || ''), 10))
            .filter(n => !isNaN(n) && n > 0);
          const totalPages = pageNums.length ? Math.max.apply(null, pageNums) : 1;

          return JSON.stringify({
            items: cards.slice(0, LIMIT),
            totalPages: totalPages
          });
        })();
        """

        webView.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self else { return }
            let pageResult = self.parseJSResult(result)
            if !pageResult.items.isEmpty {
                self.finish(with: pageResult)
                return
            }

            if attempt >= self.maxScrapeAttempts {
                self.finish(with: ShopPageScrapeResult(items: [], totalPages: 1))
                return
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + self.scrapeRetryDelay) { [weak self, weak webView] in
                guard let self, let webView else { return }
                self.scrapeFromWebView(webView, attempt: attempt + 1)
            }
        }
    }

    private func parseJSResult(_ result: Any?) -> ShopPageScrapeResult {
        let payload: [String: Any]
        if let jsonString = result as? String,
           let data = jsonString.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            payload = json
        } else if let direct = result as? [String: Any] {
            payload = direct
        } else {
            return ShopPageScrapeResult(items: [], totalPages: 1)
        }

        let rows = payload["items"] as? [[String: Any]] ?? []
        let totalPages = max(1, payload["totalPages"] as? Int ?? 1)

        var products: [SparrowsShopProduct] = []
        var seen = Set<String>()

        for row in rows {
            let href = (row["href"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (row["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !href.isEmpty, !title.isEmpty, let url = normalizedURL(href) else { continue }

            let id = url.absoluteString
            guard !seen.contains(id) else { continue }

            let imageURL = normalizedURL((row["image"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
            let priceText = (row["price"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let originalPriceText = (row["originalPrice"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let salePriceText = (row["salePrice"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let stockText = (row["stock"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let optionsText = (row["options"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

            products.append(
                SparrowsShopProduct(
                    id: id,
                    title: title,
                    url: url,
                    imageURL: imageURL,
                    priceText: priceText,
                    originalPriceText: originalPriceText,
                    salePriceText: salePriceText,
                    stockText: stockText,
                    optionsText: optionsText
                )
            )
            seen.insert(id)
            if products.count >= limit {
                break
            }
        }

        return ShopPageScrapeResult(items: products, totalPages: totalPages)
    }

    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("data:") {
            return nil
        }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            if trimmed.hasPrefix("http://") {
                let secure = "https://" + trimmed.dropFirst("http://".count)
                return URL(string: secure)
            }
            return URL(string: trimmed)
        }
        if trimmed.hasPrefix("//") {
            return URL(string: "https:\(trimmed)")
        }
        if trimmed.hasPrefix("/") {
            return URL(string: "https://sparrowsvolleyball.com.au\(trimmed)")
        }
        return URL(string: "https://sparrowsvolleyball.com.au/\(trimmed)")
    }

    private func finish(with result: ShopPageScrapeResult) {
        guard !resolved else { return }
        resolved = true
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        webView?.navigationDelegate = nil
        webView?.stopLoading()
        webView = nil
        continuation?.resume(returning: result)
        continuation = nil
    }
}

private struct ShopPageScrapeResult {
    let items: [SparrowsShopProduct]
    let totalPages: Int
}

/// Shared status pill styling (Pending=dark gray, Approved=green, Waiting list=orange, Rejected=red)
/// Matches sparrowsweb: only Neon-backed events (not `ics-…` placeholders) use in-app registration.
private func isRegisterableDatabaseCalendarEvent(_ event: CalendarEvent) -> Bool {
    !event.id.hasPrefix("ics-")
}

/// #7a5f06 — deep yellow–brown for approved/capacity pill (matches sparrowsweb).
private let kCalendarCapacityHintFill = Color(red: 122 / 255, green: 95 / 255, blue: 6 / 255)

/// Right column under Register / status: unlimited shows green "N Joined"; capped events show approved/capacity on a dark yellow rounded rect.
private struct CalendarEventParticipantHintView: View {
    let event: CalendarEvent

    private var capacityPair: (approved: Int, cap: Int)? {
        guard isRegisterableDatabaseCalendarEvent(event),
              let cap = event.capacity, cap > 0
        else { return nil }
        return ((event.approvedCount ?? 0), cap)
    }

    var body: some View {
        Group {
            if let pair = capacityPair {
                Text("\(pair.approved) / \(pair.cap)")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(kCalendarCapacityHintFill)
                    )
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            } else if isRegisterableDatabaseCalendarEvent(event) {
                let approved = event.approvedCount ?? 0
                if approved > 0 {
                    Text("\(approved) Joined")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color(red: 0.11, green: 0.37, blue: 0.13))
                        .multilineTextAlignment(.center)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
            }
        }
    }
}

private struct CalendarQueueHintView: View {
    let waitlisted: Int
    let requested: Int

    var body: some View {
        HStack(spacing: 0) {
            if waitlisted > 0 {
                Text("\(waitlisted) Waitlisted")
                    .foregroundStyle(Color.orange)
                    .fontWeight(.semibold)
            }
            if waitlisted > 0, requested > 0 {
                Text(" \u{00B7} ")
                    .foregroundStyle(.secondary)
            }
            if requested > 0 {
                Text("\(requested) Requested")
                    .foregroundStyle(Color(white: 0.25))
                    .fontWeight(.semibold)
            }
        }
        .font(.caption2)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }
}

private enum RegistrationStatusStyle {
    static func color(_ status: String) -> Color {
        switch status.uppercased() {
        case "PENDING": return Color(white: 0.25)
        case "APPROVED": return Color(red: 0.2, green: 0.65, blue: 0.35)
        case "WAITING_LIST": return Color(red: 0.95, green: 0.55, blue: 0.15)
        case "REJECTED": return Color(red: 0.85, green: 0.2, blue: 0.2)
        default: return Color(white: 0.4)
        }
    }
    static func displayText(_ status: String) -> String {
        switch status.uppercased() {
        case "WAITING_LIST": return "Waiting list"
        default: return status.capitalized
        }
    }
}

private struct MySparrowsHistoryPage: View {
    @ObservedObject var memberStore: MemberProfileStore
    let registrations: [APIMemberRegistration]
    let registrationsLoaded: Bool

    var body: some View {
        ScrollView {
            MyScheduledEventsContent(
                memberStore: memberStore,
                registrations: registrations,
                registrationsLoaded: registrationsLoaded,
                isUpcoming: false
            )
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .navigationTitle("My Sparrows History")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct MyAnnouncementsPage: View {
    let onViewed: () -> Void
    @State private var items: [APIAnnouncement] = []
    @State private var totalCount = 0
    @State private var isLoading = false
    @State private var errorText: String?

    private let pageSize = 10

    var body: some View {
        List {
            if let newest = items.first {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(newest.message)
                            .font(.body)
                        Text(sydneyDateTime(newest.createdAt))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                } header: {
                    Text("Latest Announcement")
                }
            }

            Section {
                if items.isEmpty && !isLoading && errorText == nil {
                    Text("No announcements yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.message)
                                .font(.body)
                            Text(sydneyDateTime(item.createdAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
                if let errorText {
                    Text(errorText)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                Button {
                    Task { await loadMore() }
                } label: {
                    Text(canLoadMore ? (isLoading ? "Loading..." : "Load More") : "No more records")
                        .frame(maxWidth: .infinity)
                }
                .disabled(isLoading || !canLoadMore)
            } header: {
                Text("Announcements History")
            }
        }
        .navigationTitle("Announcements")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            onViewed()
            await reload()
        }
    }

    private var canLoadMore: Bool {
        items.count < totalCount
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        do {
            let result = try await AnnouncementsAPI.list(start: 0, end: pageSize)
            items = result.items
            totalCount = result.total
        } catch {
            errorText = "Failed to load announcements."
        }
        isLoading = false
    }

    private func loadMore() async {
        guard canLoadMore else { return }
        isLoading = true
        errorText = nil
        do {
            let result = try await AnnouncementsAPI.list(start: items.count, end: items.count + pageSize)
            items.append(contentsOf: result.items)
            totalCount = result.total
        } catch {
            errorText = "Failed to load announcements."
        }
        isLoading = false
    }

    private func sydneyDateTime(_ raw: String) -> String {
        let iso = ISO8601DateFormatter()
        let date = iso.date(from: raw) ?? Date()
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_AU_POSIX")
        f.timeZone = TimeZone(identifier: "Australia/Sydney")
        f.dateFormat = "d MMM yyyy, h:mm a"
        return f.string(from: date)
    }
}

private struct MyScheduledEventsContent: View {
    @ObservedObject var memberStore: MemberProfileStore
    let registrations: [APIMemberRegistration]
    let registrationsLoaded: Bool
    let isUpcoming: Bool

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let fallbackFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private var filtered: [APIMemberRegistration] {
        let now = Date()
        return registrations.filter { reg in
            guard let event = reg.event else { return false }
            let end = Self.isoFormatter.date(from: event.endAt) ?? Self.fallbackFormatter.date(from: event.endAt)
            guard let endDate = end else { return false }
            return isUpcoming ? endDate >= now : endDate < now
        }
        .sorted { r1, r2 in
            let e1 = r1.event, e2 = r2.event
            guard let d1 = e1.flatMap({ Self.isoFormatter.date(from: $0.startAt) ?? Self.fallbackFormatter.date(from: $0.startAt) }),
                  let d2 = e2.flatMap({ Self.isoFormatter.date(from: $0.startAt) ?? Self.fallbackFormatter.date(from: $0.startAt) }) else { return false }
            return isUpcoming ? d1 < d2 : d1 > d2
        }
    }

    private var creditBannerText: String? {
        guard isUpcoming else { return nil }
        let cents = max(memberStore.creditCents, 0)
        guard cents > 0 else { return nil }
        return String(format: "Credit: AUD $%.2f", Double(cents) / 100)
    }

    var body: some View {
        Group {
            if !memberStore.hasProfile {
                Text("Complete your profile above to see your events.")
                    .font(.subheadline)
                    .foregroundStyle(Color.black.opacity(0.75))
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if !registrationsLoaded {
                Text("Loading...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if filtered.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    if let creditText = creditBannerText {
                        Text(creditText)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Text(isUpcoming ? "No upcoming events." : "No past events.")
                        .font(.subheadline)
                        .foregroundStyle(Color.black.opacity(0.75))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                VStack(alignment: .center, spacing: 10) {
                    if let creditText = creditBannerText {
                        Text(creditText)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(filtered, id: \.id) { reg in
                        registrationRow(reg)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func registrationRow(_ reg: APIMemberRegistration) -> some View {
        let event = reg.event
        let title = event?.title ?? "Event"
        let startStr = event?.startAt ?? ""
        let startDate = Self.isoFormatter.date(from: startStr) ?? Self.fallbackFormatter.date(from: startStr)
        let location = event?.location?.isEmpty == false ? event!.location! : nil
        let sportType = event?.sportType

        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.semibold)
            if let d = startDate {
                Text(Self.formatDate(d) + (isUpcoming ? " · " + Self.formatTime(d) : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if isUpcoming, let loc = location {
                Text(loc)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack(alignment: .center, spacing: 8) {
                Text(RegistrationStatusStyle.displayText(reg.status))
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(RegistrationStatusStyle.color(reg.status)))
                if let team = reg.teamName, !team.isEmpty {
                    Text("Team: \(team)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if !isUpcoming, let sport = sportType, !sport.isEmpty {
                Text("Sport: \(sport)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(uiColor: .secondarySystemBackground)))
    }

    private static func formatDate(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f.string(from: d)
    }
    private static func formatTime(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        return f.string(from: d)
    }
}

private struct MyAccountContent: View {
    @ObservedObject var memberStore: MemberProfileStore
    @Binding var profileNameInput: String
    @Binding var profileEmailInput: String
    @Binding var authPassword: String
    @Binding var authIsLogin: Bool
    var onForgotPassword: (() -> Void)? = nil
    @State private var showChangePasswordSheet = false
    @State private var showEditPreferredNameSheet = false

    var body: some View {
        if memberStore.hasProfile {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Name")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(memberStore.preferredName)
                            .font(.body)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Edit") {
                        memberStore.clearSaveError()
                        showEditPreferredNameSheet = true
                    }
                    .buttonStyle(.bordered)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Email")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(memberStore.email)
                        .font(.body)
                }
                HStack(alignment: .center, spacing: 12) {
                    Button("Change password") {
                        memberStore.clearSaveError()
                        showChangePasswordSheet = true
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                    Button("Log out") {
                        memberStore.logout()
                        authPassword = ""
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .frame(maxWidth: .infinity)
                }
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .sheet(isPresented: $showChangePasswordSheet) {
                ChangePasswordSheet(memberStore: memberStore, onDismiss: { showChangePasswordSheet = false })
            }
            .sheet(isPresented: $showEditPreferredNameSheet) {
                EditPreferredNameSheet(memberStore: memberStore, onDismiss: { showEditPreferredNameSheet = false })
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Mode", selection: $authIsLogin) {
                    Text("Login").tag(true)
                    Text("Register").tag(false)
                }
                .pickerStyle(.segmented)

                if !authIsLogin {
                    TextField("Preferred name", text: $profileNameInput)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.name)
                }
                TextField("Email", text: $profileEmailInput)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                SecureField("Password", text: $authPassword)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(authIsLogin ? .password : .newPassword)

                if let err = memberStore.authError {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                if authIsLogin {
                    Button("Log in") {
                        Task { await memberStore.login(email: profileEmailInput, password: authPassword) }
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .disabled(memberStore.isAuthLoading)
                } else {
                    Button("Register") {
                        Task { await memberStore.register(preferredName: profileNameInput, email: profileEmailInput, password: authPassword) }
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .disabled(memberStore.isAuthLoading)
                }

                if let onForgot = onForgotPassword {
                    Button("Forgot your password? Tell us") {
                        onForgot()
                    }
                    .font(.caption)
                    .foregroundStyle(Color(red: 0.055, green: 0.267, blue: 0.239))
                    .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct EditPreferredNameSheet: View {
    @ObservedObject var memberStore: MemberProfileStore
    var onDismiss: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var nameInput = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Preferred name")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Preferred name", text: $nameInput)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.name)
                    if let err = memberStore.saveError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    Button {
                        Task {
                            await memberStore.updatePreferredName(nameInput)
                            if memberStore.saveError == nil {
                                onDismiss()
                                dismiss()
                            }
                        }
                    } label: {
                        Text(memberStore.isSaving ? "Saving…" : "Save")
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(memberStore.isSaving || nameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Edit name")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") {
                        onDismiss()
                        dismiss()
                    }
                }
            }
            .onAppear {
                memberStore.clearSaveError()
                nameInput = memberStore.preferredName
            }
        }
    }
}

private struct ChangePasswordSheet: View {
    @ObservedObject var memberStore: MemberProfileStore
    var onDismiss: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("You are about to change your password...make sure you'll remember.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 4)

                    SecureField("Current password", text: $currentPassword)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.password)
                    SecureField("New password", text: $newPassword)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.newPassword)
                    SecureField("Confirm new password", text: $confirmPassword)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.newPassword)
                    if let err = memberStore.saveError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    Button {
                        guard newPassword == confirmPassword else {
                            memberStore.saveError = "New passwords do not match."
                            return
                        }
                        Task {
                            await memberStore.changePassword(currentPassword: currentPassword, newPassword: newPassword)
                            if memberStore.saveError == nil {
                                onDismiss()
                                dismiss()
                            }
                        }
                    } label: {
                        Text("Change password")
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(memberStore.isSaving || currentPassword.isEmpty || newPassword.isEmpty || confirmPassword.isEmpty)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Change password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") {
                        onDismiss()
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct MyProfileView: View {
    let scrollToTopToken: Int
    let refreshToken: Int
    @ObservedObject var newsPreloader: SparrowsNewsPreloader
    @ObservedObject var memberStore: MemberProfileStore
    @Binding var showAccount: Bool
    @Binding var showScheduledEvents: Bool
    @Binding var showHistory: Bool
    @Binding var showAnnouncements: Bool
    @Binding var showScoreboard: Bool
    @Binding var announcementsUnreadCount: Int
    let onAnnouncementsSeen: () -> Void
    let onScoreboardFullscreenChange: (Bool) -> Void
    let onScrollStateChange: (Bool, Bool) -> Void
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedNewsItem: MyProfileNewsArticleItem?
    @State private var showMoreNews = false
    @State private var team1Name = ""
    @State private var team2Name = ""
    @State private var team1Score = 0
    @State private var team2Score = 0
    @State private var team1Sets = 0
    @State private var team2Sets = 0
    @State private var setNumber = 1
    @State private var setHistory: [String] = []
    @State private var profileNameInput = ""
    @State private var profileEmailInput = ""
    @State private var authPassword = ""
    @State private var authIsLogin = true
    @State private var registrations: [APIMemberRegistration] = []
    @State private var registrationsLoaded = false
    @State private var registrationsSectionId = UUID()
    @State private var showDeleteAccountSheet = false
    @State private var showDeleteAccountFinalConfirm = false

    var body: some View {
        GeometryReader { rootGeo in
            let isLandscape = rootGeo.size.width > rootGeo.size.height
            let isScoreboardFullscreen = showScoreboard && isLandscape

            Group {
                if isScoreboardFullscreen {
                    ScoreboardLandscapeView(
                        team1Name: $team1Name,
                        team2Name: $team2Name,
                        team1Score: $team1Score,
                        team2Score: $team2Score,
                        team1Sets: $team1Sets,
                        team2Sets: $team2Sets,
                        setHistory: $setHistory,
                        onAddPoint: addPoint,
                        onRemovePoint: removePoint,
                        onReset: resetScores,
                        onSwitchSides: switchSides
                    )
                    .ignoresSafeArea()
                } else {
                    NavigationStack {
                    ZStack(alignment: .bottom) {
                        NavigationLink(isActive: $showAnnouncements) {
                            MyAnnouncementsPage(onViewed: onAnnouncementsSeen)
                        } label: {
                            EmptyView()
                        }
                        .hidden()
                        ScrollViewReader { proxy in
                            ScrollView {
                                GeometryReader { geo in
                                    Color.clear
                                        .preference(
                                            key: MyProfileOffsetPreferenceKey.self,
                                            value: geo.frame(in: .named("myProfileScroll")).minY
                                        )
                                }
                                .frame(height: 0)
                                .id("my-profile-top-anchor")

                                VStack(alignment: .leading, spacing: 12) {
                                    HStack(spacing: 10) {
                                        ZStack(alignment: .topTrailing) {
                                            Image("SparrowsLogo")
                                                .resizable()
                                                .scaledToFill()
                                                .frame(width: 36, height: 36)
                                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                            if announcementsUnreadCount > 0 {
                                                Text("\(announcementsUnreadCount)")
                                                    .font(.caption2)
                                                    .fontWeight(.bold)
                                                    .foregroundStyle(.white)
                                                    .padding(.horizontal, 5)
                                                    .padding(.vertical, 1)
                                                    .background(Capsule().fill(Color.red))
                                                    .offset(x: 10, y: -8)
                                            }
                                        }

                                        Text(memberStore.hasProfile && !memberStore.preferredName.isEmpty ? "Hello \(memberStore.preferredName)" : "My Profile")
                                            .font(.title3)
                                            .fontWeight(.semibold)
                                            .foregroundStyle(Color.black)

                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 2)
                                    .padding(.bottom, 2)

                                    Rectangle()
                                        .fill(Color.gray.opacity(0.35))
                                        .frame(height: 4)
                                        .padding(.horizontal, 2)
                                        .padding(.bottom, 2)

                                    profileSectionCard(
                                        title: "My account",
                                        isExpanded: $showAccount
                                    ) {
                                        MyAccountContent(
                                            memberStore: memberStore,
                                            profileNameInput: $profileNameInput,
                                            profileEmailInput: $profileEmailInput,
                                            authPassword: $authPassword,
                                            authIsLogin: $authIsLogin,
                                            onForgotPassword: { openInstagramContact() }
                                        )
                                        .padding(.top, 4)
                                        .onAppear {
                                            if profileNameInput.isEmpty { profileNameInput = memberStore.preferredName }
                                            if profileEmailInput.isEmpty { profileEmailInput = memberStore.email }
                                        }
                                        .onChange(of: memberStore.preferredName) { v in if profileNameInput != v { profileNameInput = v } }
                                        .onChange(of: memberStore.email) { v in if profileEmailInput != v { profileEmailInput = v } }
                                    }

                                    sectionDivider

                                    profileSectionCard(
                                        title: "My Next Sparrows Events",
                                        isExpanded: $showScheduledEvents
                                    ) {
                                        MyScheduledEventsContent(
                                            memberStore: memberStore,
                                            registrations: registrations,
                                            registrationsLoaded: registrationsLoaded,
                                            isUpcoming: true
                                        )
                                        .id(registrationsSectionId)
                                        .padding(.top, 4)
                                    }

                                    sectionDivider

                                    NavigationLink {
                                        MySparrowsHistoryPage(
                                            memberStore: memberStore,
                                            registrations: registrations,
                                            registrationsLoaded: registrationsLoaded
                                        )
                                    } label: {
                                        HStack {
                                            Text("My Sparrows History")
                                                .font(.headline)
                                                .foregroundStyle(Color.black)
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.body.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 10)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)

                                    sectionDivider

                                    Button {
                                        showAnnouncements = true
                                    } label: {
                                        HStack {
                                            Text("Announcements")
                                                .font(.headline)
                                                .foregroundStyle(Color.black)
                                            Spacer()
                                            if announcementsUnreadCount > 0 {
                                                Text("\(announcementsUnreadCount)")
                                                    .font(.caption2)
                                                    .fontWeight(.bold)
                                                    .foregroundStyle(.white)
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(Capsule().fill(Color.red))
                                            }
                                            Image(systemName: "chevron.right")
                                                .font(.body.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 10)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)

                                    Rectangle()
                                        .fill(Color.gray.opacity(0.35))
                                        .frame(height: 4)
                                        .padding(.horizontal, 2)
                                        .padding(.bottom, 2)

                                    Text("Sparrows Tools")
                                        .font(.headline)
                                        .fontWeight(.semibold)
                                        .foregroundStyle(Color.black)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.top, 2)
                                        .padding(.bottom, 2)

                                    profileSectionCard(
                                        title: "Scoreboard",
                                        isExpanded: $showScoreboard
                                    ) {
                                        Text("Rotate your phone to landscape to use the Scoreboard.")
                                            .font(.subheadline)
                                            .foregroundStyle(Color.black.opacity(0.75))
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(.top, 4)
                                    }

                                    sectionDivider

                                    newsSection

                                    sectionDivider

                                    if memberStore.hasProfile {
                                        deleteAccountButton

                                        sectionDivider
                                    }

                                    contactUsBar
                                }
                                .padding(.horizontal, 12)
                                .padding(.top, 12)
                                .padding(.bottom, 32)
                            }
                            .coordinateSpace(name: "myProfileScroll")
                            .onPreferenceChange(MyProfileOffsetPreferenceKey.self) { offset in
                                onScrollStateChange(offset >= -0.05, true)
                            }
                            .refreshable {
                                if let id = memberStore.memberId {
                                    do {
                                        let newRegistrations = try await MemberAPI.registrations(memberId: id)
                                        await MainActor.run {
                                            registrations = newRegistrations
                                            registrationsLoaded = true
                                            registrationsSectionId = UUID()
                                        }
                                    } catch {
                                        await MainActor.run {
                                            registrations = []
                                            registrationsLoaded = true
                                            registrationsSectionId = UUID()
                                        }
                                    }
                                }
                            }
                            .onChange(of: scrollToTopToken) { _ in
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    proxy.scrollTo("my-profile-top-anchor", anchor: .top)
                                }
                            }
                            .onChange(of: refreshToken) { _ in
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    proxy.scrollTo("my-profile-top-anchor", anchor: .top)
                                }
                                if memberStore.memberId != nil {
                                    Task {
                                        guard let id = memberStore.memberId else { return }
                                        registrations = (try? await MemberAPI.registrations(memberId: id)) ?? registrations
                                    }
                                }
                            }
                            .onAppear {
                                onScrollStateChange(true, false)
                                if profileNameInput.isEmpty { profileNameInput = memberStore.preferredName }
                                if profileEmailInput.isEmpty { profileEmailInput = memberStore.email }
                            }
                            .task {
                                await memberStore.loadFromBackendIfNeeded()
                            }
                            .task(id: memberStore.memberId) {
                                guard let id = memberStore.memberId else {
                                    registrations = []
                                    registrationsLoaded = true
                                    return
                                }
                                do {
                                    registrations = try await MemberAPI.registrations(memberId: id)
                                    registrationsLoaded = true
                                } catch {
                                    registrations = []
                                    registrationsLoaded = true
                                }
                            }
                            .onReceive(Timer.publish(every: 15, tolerance: 3, on: .main, in: .common).autoconnect()) { _ in
                                guard scenePhase == .active else { return }
                                guard let id = memberStore.memberId else { return }
                                Task {
                                    guard let fresh = try? await MemberAPI.registrations(memberId: id) else { return }
                                    await MainActor.run {
                                        registrations = fresh
                                        registrationsLoaded = true
                                        registrationsSectionId = UUID()
                                    }
                                }
                            }
                            .sheet(item: $selectedNewsItem) { item in
                                InAppNewsDetailView(title: item.title, url: item.url)
                            }
                            .sheet(isPresented: $showMoreNews) {
                                MoreNewsSheetView(url: URL(string: "https://sparrowsvolleyball.com.au/news")!)
                            }
                            .sheet(isPresented: $showDeleteAccountSheet) {
                                NavigationStack {
                                    ScrollView {
                                        VStack(alignment: .leading, spacing: 12) {
                                            Text("Delete your account?")
                                                .font(.title3.weight(.semibold))
                                            Text("This action cannot be undone. You will not be able to sign in the same way again, and you must register again.")
                                                .font(.subheadline)
                                                .foregroundStyle(.secondary)
                                            Text("The following data will be deleted:")
                                                .font(.subheadline.weight(.semibold))
                                            VStack(alignment: .leading, spacing: 6) {
                                                Text("• Email address")
                                                Text("• Password")
                                                Text("• My Next Sparrows Events data")
                                                Text("• My Sparrows History data")
                                            }
                                            .font(.subheadline)
                                            .foregroundStyle(Color.black.opacity(0.85))

                                            if memberStore.creditCents > 0 {
                                                Text("Warning: deleting this account will forfeit your remaining credit balance.")
                                                    .font(.subheadline)
                                                    .fontWeight(.semibold)
                                                    .foregroundStyle(.red)
                                            }

                                            if let err = memberStore.saveError {
                                                Text(err)
                                                    .font(.caption)
                                                    .foregroundStyle(.red)
                                            }

                                            HStack(spacing: 10) {
                                                Button("Cancel") {
                                                    showDeleteAccountSheet = false
                                                }
                                                .buttonStyle(.bordered)
                                                .frame(maxWidth: .infinity)

                                                Button("Continue") {
                                                    showDeleteAccountFinalConfirm = true
                                                }
                                                .buttonStyle(.borderedProminent)
                                                .tint(.red)
                                                .frame(maxWidth: .infinity)
                                                .disabled(memberStore.isSaving)
                                            }
                                            .padding(.top, 4)
                                        }
                                        .padding(16)
                                    }
                                    .navigationTitle("Delete account")
                                    .navigationBarTitleDisplayMode(.inline)
                                    .toolbar {
                                        ToolbarItem(placement: .topBarTrailing) {
                                            Button("Close") { showDeleteAccountSheet = false }
                                        }
                                    }
                                }
                            }
                            .alert("Delete account permanently?", isPresented: $showDeleteAccountFinalConfirm) {
                                Button("Cancel", role: .cancel) {}
                                Button("Delete", role: .destructive) {
                                    Task {
                                        let ok = await memberStore.deleteAccount()
                                        if ok {
                                            authPassword = ""
                                            profileNameInput = ""
                                            profileEmailInput = ""
                                            registrations = []
                                            registrationsLoaded = true
                                            showDeleteAccountSheet = false
                                        }
                                    }
                                }
                            } message: {
                                Text("This action cannot be undone.")
                            }
                        }
                    }
                    }
                }
            }
            .onAppear {
                onScoreboardFullscreenChange(isScoreboardFullscreen)
                if !memberStore.hasProfile {
                    showAccount = true
                }
            }
            .onChange(of: isScoreboardFullscreen) { value in
                onScoreboardFullscreenChange(value)
            }
        }
    }

    @ViewBuilder
    private func profileSectionCard<Content: View>(
        title: String,
        isExpanded: Binding<Bool>,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            DisclosureGroup(isExpanded: isExpanded) {
                content()
            } label: {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.black)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, isExpanded.wrappedValue ? 4 : 2)
    }

    private func profileInfoRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(Color.black)
            Text(value)
                .font(.subheadline)
                .foregroundStyle(Color.black.opacity(0.75))
        }
    }

    private var newsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sparrows News")
                .font(.headline)
                .foregroundStyle(Color.black)

            MyProfileNewsPreviewSection(
                refreshToken: refreshToken,
                preloadedItems: newsPreloader.cachedItems
            ) { item in
                selectedNewsItem = item
            } onCacheUpdate: { items, failed in
                newsPreloader.updateCache(with: items, loadFailed: failed)
            }
            .frame(height: 320)

            Button {
                showMoreNews = true
            } label: {
                Text("More News")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.black)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(red: 0.055, green: 0.267, blue: 0.239).opacity(0.055))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(red: 0.055, green: 0.267, blue: 0.239).opacity(0.18), lineWidth: 1)
        )
        .shadow(
            color: Color.black.opacity(0.12),
            radius: 7,
            x: 0,
            y: 3
        )
    }

    private var deleteAccountButton: some View {
        Button {
            memberStore.clearSaveError()
            showDeleteAccountSheet = true
        } label: {
            Text("Delete my account")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.red)
                )
        }
        .buttonStyle(.plain)
    }

    private func openInstagramContact() {
        let appProfileURL = URL(string: "instagram://user?username=sparrowsvolleyball")!
        let webMessageURL = URL(string: "https://ig.me/m/sparrowsvolleyball")!
        let webProfileURL = URL(string: "https://www.instagram.com/sparrowsvolleyball/")!

        // Try message entry first; if it can't open, fallback to account profile.
        openURL(webMessageURL) { accepted in
            if !accepted {
                openURL(appProfileURL) { appAccepted in
                    if !appAccepted {
                        openURL(webProfileURL)
                    }
                }
            }
        }
    }

    private func openPickleballInstagramContact() {
        let appProfileURL = URL(string: "instagram://user?username=sparrowspickleball")!
        let webMessageURL = URL(string: "https://ig.me/m/sparrowspickleball")!
        let webProfileURL = URL(string: "https://www.instagram.com/sparrowspickleball/")!

        openURL(webMessageURL) { accepted in
            if !accepted {
                openURL(appProfileURL) { appAccepted in
                    if !appAccepted {
                        openURL(webProfileURL)
                    }
                }
            }
        }
    }

    private var contactUsBar: some View {
        VStack(spacing: 4) {
            Text("Contact Us")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.black)

            HStack(spacing: 20) {
                Button {
                    openInstagramContact()
                } label: {
                    VStack(spacing: 2) {
                        ContactLogoIcon(
                            assetName: "ContactUsVolleyballLogo",
                            fallbackSymbols: ["figure.volleyball", "volleyball.fill", "sportscourt.fill"],
                            accentColor: Color(red: 0.055, green: 0.267, blue: 0.239)
                        )
                        Text("Volleyball")
                            .font(.caption2)
                            .foregroundStyle(Color.black.opacity(0.85))
                            .multilineTextAlignment(.center)
                    }
                }
                .buttonStyle(.plain)

                Button {
                    openPickleballInstagramContact()
                } label: {
                    VStack(spacing: 2) {
                        ContactLogoIcon(
                            assetName: "ContactUsPickleballLogo",
                            fallbackSymbols: ["tennis.racket.circle.fill", "tennis.racket", "figure.tennis", "sportscourt"],
                            accentColor: Color(red: 0.749, green: 0.855, blue: 0.643)
                        )
                        Text("Pickleball/ Tennis")
                            .font(.caption2)
                            .foregroundStyle(Color.black.opacity(0.85))
                            .multilineTextAlignment(.center)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
        .padding(.bottom, 2)
        .background(Color.white.opacity(0.95))
    }

    private var sectionDivider: some View {
        Rectangle()
            .fill(Color.black.opacity(0.10))
            .frame(height: 1)
            .padding(.horizontal, 4)
    }

    private func addPoint(for team: Int) {
        if team == 1 {
            team1Score += 1
            if team1Score >= 25 && (team1Score - team2Score) >= 2 {
                recordSetWinner(winnerTeam: 1)
                team1Sets += 1
                team1Score = 0
                team2Score = 0
                setNumber += 1
            }
        } else {
            team2Score += 1
            if team2Score >= 25 && (team2Score - team1Score) >= 2 {
                recordSetWinner(winnerTeam: 2)
                team2Sets += 1
                team1Score = 0
                team2Score = 0
                setNumber += 1
            }
        }
    }

    private func removePoint(for team: Int) {
        if team == 1 {
            team1Score = max(0, team1Score - 1)
        } else {
            team2Score = max(0, team2Score - 1)
        }
    }

    private func resetScores() {
        team1Score = 0
        team2Score = 0
        team1Sets = 0
        team2Sets = 0
        setNumber = 1
        setHistory = []
    }

    private func switchSides() {
        swap(&team1Name, &team2Name)
        swap(&team1Score, &team2Score)
        swap(&team1Sets, &team2Sets)
    }

    private func recordSetWinner(winnerTeam: Int) {
        let t1 = team1Name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Team 1" : team1Name
        let t2 = team2Name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Team 2" : team2Name
        let winner = winnerTeam == 1 ? t1 : t2
        let line = "\(winner) won Set \(setNumber) (\(team1Score)-\(team2Score))"
        setHistory.append(line)
    }
}

private struct SportLogoIcon: View {
    let symbolCandidates: [String]
    let accentColor: Color

    private var resolvedSymbol: String {
        for name in symbolCandidates where UIImage(systemName: name) != nil {
            return name
        }
        return "circle.fill"
    }

    var body: some View {
        Image(systemName: resolvedSymbol)
            .resizable()
            .scaledToFit()
            .frame(width: 30, height: 30)
            .foregroundStyle(accentColor)
            .frame(width: 36, height: 36)
            .background(
                Circle().fill(accentColor.opacity(0.12))
            )
    }
}

private struct ContactLogoIcon: View {
    let assetName: String
    let fallbackSymbols: [String]
    let accentColor: Color

    var body: some View {
        if let uiImage = UIImage(named: assetName) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
        } else {
            SportLogoIcon(symbolCandidates: fallbackSymbols, accentColor: accentColor)
        }
    }
}

private struct MyProfileOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct ScoreboardLandscapeView: View {
    @Binding var team1Name: String
    @Binding var team2Name: String
    @Binding var team1Score: Int
    @Binding var team2Score: Int
    @Binding var team1Sets: Int
    @Binding var team2Sets: Int
    @Binding var setHistory: [String]
    let onAddPoint: (Int) -> Void
    let onRemovePoint: (Int) -> Void
    let onReset: () -> Void
    let onSwitchSides: () -> Void
    @State private var showRematchConfirm = false
    @State private var isEditingTeam1Name = false
    @State private var isEditingTeam2Name = false
    @FocusState private var focusedTeamField: Int?
    private let darkGreen = Color(red: 0.055, green: 0.267, blue: 0.239)
    private let lightGreen = Color(red: 0.749, green: 0.855, blue: 0.643)

    var body: some View {
        ZStack {
            Color(red: 0.96, green: 0.96, blue: 0.96).ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: true) {
                VStack(spacing: 10) {
                    Text("Volleyball Scoreboard")
                        .font(.system(size: 24, weight: .heavy))
                        .foregroundStyle(darkGreen)
                        .padding(.top, 6)

                    VStack(spacing: 10) {
                        HStack(spacing: 10) {
                            teamColumn(
                                isTeamOne: true
                            )
                            teamColumn(
                                isTeamOne: false
                            )
                        }

                        Text("Sets: \(team1Sets) - \(team2Sets)")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(.black.opacity(0.85))

                        HStack(spacing: 10) {
                            Button {
                                onSwitchSides()
                                isEditingTeam1Name = false
                                isEditingTeam2Name = false
                                focusedTeamField = nil
                            } label: {
                                Text("Switch Sides")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, minHeight: 46)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .fill(darkGreen)
                                    )
                            }
                            .buttonStyle(.plain)

                            Button {
                                showRematchConfirm = true
                            } label: {
                                Text("Reset Scores")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundStyle(.black)
                                    .frame(maxWidth: .infinity, minHeight: 46)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .fill(Color(red: 0.886, green: 0.886, blue: 0.886))
                                    )
                            }
                            .buttonStyle(.plain)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Set History")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.black.opacity(0.9))

                            if setHistory.isEmpty {
                                Text("No sets completed yet")
                                    .font(.system(size: 14, weight: .regular))
                                    .foregroundStyle(.black.opacity(0.65))
                            } else {
                                VStack(alignment: .leading, spacing: 4) {
                                    ForEach(Array(setHistory.enumerated()), id: \.offset) { _, item in
                                        Text(item)
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundStyle(.black.opacity(0.82))
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color(red: 0.98, green: 0.98, blue: 0.98))
                        )
                    }
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.black.opacity(0.06), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 4)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
            .onTapGesture {
                isEditingTeam1Name = false
                isEditingTeam2Name = false
                focusedTeamField = nil
            }
        }
        .alert("Reset scoreboard?", isPresented: $showRematchConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Reset", role: .destructive) {
                isEditingTeam1Name = false
                isEditingTeam2Name = false
                focusedTeamField = nil
                onReset()
            }
        } message: {
            Text("This will reset score, sets and set history to zero.")
        }
    }

    @ViewBuilder
    private func teamColumn(
        isTeamOne: Bool
    ) -> some View {
        let isLeft = isTeamOne
        let name = isLeft ? team1Name : team2Name
        let score = isLeft ? team1Score : team2Score
        let panelForeground: Color = isLeft ? .white : .black
        let placeholderName = isLeft ? "Team 1 Name" : "Team 2 Name"
        let displayName = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? (isLeft ? "Team 1" : "Team 2")
            : name
        let isEditing = isLeft ? isEditingTeam1Name : isEditingTeam2Name
        VStack(spacing: 10) {
            if isEditing {
                TextField(placeholderName, text: isTeamOne ? $team1Name : $team2Name)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .background(Color.white.opacity(isLeft ? 0.95 : 1))
                    .foregroundStyle(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .focused($focusedTeamField, equals: isLeft ? 1 : 2)
                    .onSubmit {
                        if isLeft {
                            isEditingTeam1Name = false
                        } else {
                            isEditingTeam2Name = false
                        }
                        focusedTeamField = nil
                    }
            } else {
                Button {
                    if isLeft {
                        isEditingTeam1Name = true
                        focusedTeamField = 1
                    } else {
                        isEditingTeam2Name = true
                        focusedTeamField = 2
                    }
                } label: {
                    Text(displayName)
                        .font(.system(size: 18, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(panelForeground)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(isLeft ? darkGreen : lightGreen)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            Text("\(score)")
                .font(.system(size: 120, weight: .black))
                .lineLimit(1)
                .minimumScaleFactor(0.35)
                .foregroundStyle(panelForeground)

            HStack(spacing: 8) {
                scoreboardActionButton(
                    title: "+1",
                    background: darkGreen,
                    foreground: .white
                ) {
                    onAddPoint(isTeamOne ? 1 : 2)
                }

                scoreboardActionButton(
                    title: "-1",
                    background: Color(red: 0.2, green: 0.2, blue: 0.2),
                    foreground: .white
                ) {
                    onRemovePoint(isTeamOne ? 1 : 2)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isLeft ? darkGreen : lightGreen)
        )
    }

    private func scoreboardActionButton(
        title: String,
        background: Color,
        foreground: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(foreground)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(background)
                )
        }
        .buttonStyle(.plain)
    }
}

private struct MyProfileNewsArticleItem: Identifiable, Equatable {
    let id: String
    let title: String
    let url: URL
}

private struct MyProfileNewsPreviewSection: View {
    let refreshToken: Int
    let preloadedItems: [SparrowsNewsItem]
    let onSelect: (MyProfileNewsArticleItem) -> Void
    let onCacheUpdate: ([SparrowsNewsItem], Bool) -> Void
    @State private var newsItems: [SparrowsNewsItem] = []
    @State private var isLoading = false
    @State private var loadFailed = false

    var body: some View {
        Group {
            if isLoading && newsItems.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if loadFailed && newsItems.isEmpty {
                Text("Unable to load latest news right now.")
                    .font(.subheadline)
                    .foregroundStyle(Color.black.opacity(0.7))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(newsItems) { item in
                            Button {
                                onSelect(
                                    MyProfileNewsArticleItem(
                                        id: item.link.absoluteString,
                                        title: item.title,
                                        url: item.link
                                    )
                                )
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.dateText)
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(Color.black.opacity(0.55))
                                        .frame(maxWidth: .infinity, alignment: .leading)

                                    Text(item.categoriesText)
                                        .font(.caption)
                                        .italic()
                                        .foregroundStyle(Color(red: 0.055, green: 0.267, blue: 0.239))
                                        .frame(maxWidth: .infinity, alignment: .leading)

                                    Text(item.title)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(Color.black)
                                        .frame(maxWidth: .infinity, alignment: .leading)

                                    if !item.summaryText.isEmpty {
                                        Text(item.summaryText)
                                            .font(.caption)
                                            .foregroundStyle(Color.black.opacity(0.75))
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }

                                    Text("Continue Reading")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(Color(red: 0.055, green: 0.267, blue: 0.239))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            if item.id != newsItems.last?.id {
                                Rectangle()
                                    .fill(Color.black.opacity(0.08))
                                    .frame(height: 1)
                            }
                        }
                    }
                }
            }
        }
        .task {
            if newsItems.isEmpty, !preloadedItems.isEmpty {
                newsItems = preloadedItems
                loadFailed = false
                return
            }
            guard newsItems.isEmpty else { return }
            await loadNews()
        }
        .onChange(of: refreshToken) { _ in
            Task { await loadNews() }
        }
        .onChange(of: preloadedItems) { items in
            guard newsItems.isEmpty, !items.isEmpty else { return }
            newsItems = items
            loadFailed = false
        }
    }

    @MainActor
    private func loadNews() async {
        isLoading = true
        loadFailed = false
        do {
            let feedItems = try await SparrowsNewsService.fetchLatest(limit: 3)
            newsItems = feedItems
            loadFailed = feedItems.isEmpty
            onCacheUpdate(feedItems, feedItems.isEmpty)
        } catch {
            loadFailed = true
            onCacheUpdate([], true)
        }
        isLoading = false
    }
}

private struct SparrowsNewsItem: Identifiable, Equatable {
    let id: String
    let title: String
    let link: URL
    let dateText: String
    let categoriesText: String
    let summaryText: String
}

private enum SparrowsNewsService {
    static func fetchLatest(limit: Int) async throws -> [SparrowsNewsItem] {
        let items = await fetchFromBackgroundWebView(limit: limit)
        return Array(items.prefix(limit))
    }

    @MainActor
    private static func fetchFromBackgroundWebView(limit: Int) async -> [SparrowsNewsItem] {
        await BackgroundNewsWebViewScraper().scrape(limit: limit)
    }

    private static func formatISODate(_ raw: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = iso.date(from: raw)
        if date == nil {
            iso.formatOptions = [.withInternetDateTime]
            date = iso.date(from: raw)
        }
        guard let finalDate = date else { return raw }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_AU")
        formatter.dateFormat = "d MMMM yyyy"
        return formatter.string(from: finalDate)
    }

    private static func decodeHTML(_ raw: String) -> String {
        guard let data = raw.data(using: .utf8) else { return raw }
        if let attributed = try? NSAttributedString(
            data: data,
            options: [
                .documentType: NSAttributedString.DocumentType.html,
                .characterEncoding: String.Encoding.utf8.rawValue
            ],
            documentAttributes: nil
        ) {
            return attributed.string
        }
        return raw
    }

    private static func stripHTML(_ html: String) -> String {
        html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
    }

    private static func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            return URL(string: trimmed)
        }
        if trimmed.hasPrefix("/") {
            return URL(string: "https://sparrowsvolleyball.com.au\(trimmed)")
        }
        return URL(string: "https://sparrowsvolleyball.com.au/\(trimmed)")
    }

    private static func sanitizeSummaryText(_ raw: String) -> String {
        var value = raw
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\t", with: " ")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = value.range(of: "The post ", options: .caseInsensitive) {
            value = String(value[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        value = value.replacingOccurrences(of: "Continue reading", with: "", options: .caseInsensitive)
        if value.count > 160 {
            value = String(value.prefix(160)).trimmingCharacters(in: .whitespacesAndNewlines) + "..."
        }
        return value
    }
}

@MainActor
private final class BackgroundNewsWebViewScraper: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<[SparrowsNewsItem], Never>?
    private var webView: WKWebView?
    private var resolved = false
    private var timeoutWorkItem: DispatchWorkItem?
    private var limit: Int = 3
    private let maxScrapeAttempts = 40
    private let scrapeRetryDelay: TimeInterval = 0.4

    func scrape(limit: Int) async -> [SparrowsNewsItem] {
        self.limit = max(1, limit)
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            self.resolved = false

            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            configuration.defaultWebpagePreferences.preferredContentMode = .mobile
            let webView = WKWebView(frame: .zero, configuration: configuration)
            self.webView = webView
            webView.navigationDelegate = self

            var request = URLRequest(url: URL(string: "https://sparrowsvolleyball.com.au/news")!)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            request.setValue(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                forHTTPHeaderField: "User-Agent"
            )
            webView.load(request)

            let timeout = DispatchWorkItem { [weak self] in
                self?.finish(with: [])
            }
            timeoutWorkItem = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        scrapeFromWebView(webView, attempt: 0)
    }

    private func scrapeFromWebView(_ webView: WKWebView, attempt: Int) {
        guard !resolved else { return }

        let script = """
        (function() {
          const LIMIT = \(limit);
          const clean = (v) => (v || '').replace(/\\s+/g, ' ').trim();
          const strip = (v) => clean((v || '').replace(/<[^>]*>/g, ' '));
          const abs = (u) => {
            if (!u) return '';
            if (u.startsWith('http://') || u.startsWith('https://')) return u;
            if (u.startsWith('/')) return 'https://sparrowsvolleyball.com.au' + u;
            return 'https://sparrowsvolleyball.com.au/' + u;
          };
          const cards = [];
          const seen = new Set();
          const feedGroups = Array.from(document.querySelectorAll('[data-aid^=\"RSS_FEED_RENDERED_\"]'));

          for (const group of feedGroups) {
            const linkNode = group.closest('a[href][data-ux=\"Link\"]') || group.closest('a[href]') || group.parentElement?.closest?.('a[href]');
            if (!linkNode) continue;

            const href = abs(linkNode.getAttribute('href') || linkNode.href || '');
            if (!href || seen.has(href)) continue;

            const titleNode = group.querySelector('[data-ux=\"HeadingProduct\"], h4');
            const title = strip(titleNode ? (titleNode.innerText || titleNode.textContent || '') : '');
            if (!title || title.length < 4) continue;

            const dateNode = group.querySelector('[data-aid=\"RSS_FEED_POST_DATE_RENDERED\"]');
            const categoriesNode = group.querySelector('[data-aid=\"RSS_FEED_POST_CATEGORIES_RENDERED\"]');
            const summaryNode = group.querySelector('[data-aid=\"RSS_FEED_POST_CONTENT_RENDERED\"], p[data-ux=\"Text\"], p');

            const dateText = strip(dateNode ? (dateNode.innerText || dateNode.textContent || '') : '');
            const categoriesText = strip(categoriesNode ? (categoriesNode.innerText || categoriesNode.textContent || '') : '');
            const summaryText = strip(summaryNode ? (summaryNode.innerText || summaryNode.textContent || '') : '');

            cards.push({
              href,
              title,
              dateText,
              categoriesText,
              summaryText
            });
            seen.add(href);
            if (cards.length >= LIMIT) break;
          }

          return JSON.stringify(cards.slice(0, LIMIT));
        })();
        """

        webView.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self else { return }
            let items = self.parseJSResult(result)
            if !items.isEmpty {
                self.finish(with: items)
                return
            }

            if attempt >= self.maxScrapeAttempts {
                self.finish(with: [])
                return
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + self.scrapeRetryDelay) { [weak self, weak webView] in
                guard let self, let webView else { return }
                self.scrapeFromWebView(webView, attempt: attempt + 1)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(with: [])
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(with: [])
    }

    private func parseJSResult(_ result: Any?) -> [SparrowsNewsItem] {
        let rows: [[String: Any]]
        if let jsonString = result as? String,
           let data = jsonString.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            rows = json
        } else if let directRows = result as? [[String: Any]] {
            rows = directRows
        } else {
            return []
        }
        var items: [SparrowsNewsItem] = []
        var seen = Set<String>()

        for row in rows {
            let href = (row["href"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (row["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !href.isEmpty, !title.isEmpty else { continue }
            guard let url = normalizedURL(href) else { continue }
            let id = url.absoluteString
            guard !seen.contains(id) else { continue }

            let dateText = (row["dateText"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let categoriesText = (row["categoriesText"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            var summaryText = (row["summaryText"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            summaryText = summaryText.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)

            items.append(
                SparrowsNewsItem(
                    id: id,
                    title: title,
                    link: url,
                    dateText: dateText,
                    categoriesText: categoriesText,
                    summaryText: summaryText
                )
            )
            seen.insert(id)
            if items.count >= limit {
                break
            }
        }
        return items
    }

    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            return URL(string: trimmed)
        }
        if trimmed.hasPrefix("/") {
            return URL(string: "https://sparrowsvolleyball.com.au\(trimmed)")
        }
        return URL(string: "https://sparrowsvolleyball.com.au/\(trimmed)")
    }

    private func finish(with items: [SparrowsNewsItem]) {
        guard !resolved else { return }
        resolved = true
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        webView?.navigationDelegate = nil
        webView?.stopLoading()
        webView = nil
        continuation?.resume(returning: items)
        continuation = nil
    }
}

private final class SparrowsNewsFeedParser: NSObject, XMLParserDelegate {
    private var items: [SparrowsNewsItem] = []
    private var currentElement = ""
    private var currentTitle = ""
    private var currentLink = ""
    private var currentDate = ""
    private var currentDescription = ""
    private var currentCategories: [String] = []
    private var currentCategory = ""
    private var insideItem = false

    static func parse(data: Data) -> [SparrowsNewsItem] {
        let parserDelegate = SparrowsNewsFeedParser()
        let parser = XMLParser(data: data)
        parser.delegate = parserDelegate
        parser.parse()
        return parserDelegate.items
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName _: String?, attributes _: [String: String] = [:]) {
        currentElement = elementName.lowercased()
        if currentElement == "item" {
            insideItem = true
            currentTitle = ""
            currentLink = ""
            currentDate = ""
            currentDescription = ""
            currentCategories = []
            currentCategory = ""
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard insideItem else { return }
        switch currentElement {
        case "title":
            currentTitle += string
        case "link":
            currentLink += string
        case "pubdate":
            currentDate += string
        case "description":
            currentDescription += string
        case "category":
            currentCategory += string
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName _: String?) {
        let element = elementName.lowercased()
        if element == "category", insideItem {
            let cleanCategory = cleanText(currentCategory)
            if !cleanCategory.isEmpty {
                currentCategories.append(cleanCategory)
            }
            currentCategory = ""
        }

        if element == "item" {
            insideItem = false
            let cleanTitle = cleanText(currentTitle)
            let cleanLink = cleanText(currentLink)
            guard
                let url = URL(string: cleanLink),
                !cleanTitle.isEmpty
            else { return }

            let cleanCategories = currentCategories
                .map(cleanText(_:))
                .filter { !$0.isEmpty }
                .joined(separator: ", ")
            let summary = sanitizeSummary(cleanText(stripHTML(currentDescription)))
            let item = SparrowsNewsItem(
                id: cleanLink,
                title: cleanTitle,
                link: url,
                dateText: formattedDate(cleanText(currentDate)),
                categoriesText: cleanCategories,
                summaryText: summary
            )
            items.append(item)
        }
        currentElement = ""
    }

    private func cleanText(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&#8217;", with: "'")
            .replacingOccurrences(of: "&#8211;", with: "-")
            .replacingOccurrences(of: "&#8220;", with: "\"")
            .replacingOccurrences(of: "&#8221;", with: "\"")
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\t", with: " ")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func stripHTML(_ html: String) -> String {
        html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
    }

    private func formattedDate(_ raw: String) -> String {
        guard !raw.isEmpty else { return "" }
        let input = DateFormatter()
        input.locale = Locale(identifier: "en_US_POSIX")
        input.dateFormat = "EEE, d MMM yyyy HH:mm:ss Z"
        if let date = input.date(from: raw) {
            let output = DateFormatter()
            output.locale = Locale(identifier: "en_AU")
            output.dateFormat = "d MMMM yyyy"
            return output.string(from: date)
        }
        return raw
    }

    private func sanitizeSummary(_ raw: String) -> String {
        var value = raw
        if let range = value.range(of: "The post ", options: .caseInsensitive) {
            value = String(value[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        value = value.replacingOccurrences(of: "Continue reading", with: "", options: .caseInsensitive)
        if value.count > 160 {
            value = String(value.prefix(160)).trimmingCharacters(in: .whitespacesAndNewlines) + "..."
        }
        return value
    }
}
private struct MoreNewsSheetView: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            InAppNewsPostWebView(url: url)
                .navigationTitle("Sparrows News")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title3)
                        }
                    }
                }
        }
    }
}

private struct InAppNewsDetailView: View {
    let title: String
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            InAppNewsPostWebView(url: url)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Close") {
                            dismiss()
                        }
                    }
                }
        }
    }
}

private struct InAppNewsPostWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero)
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }
}

private struct WebPageView: View {
    let webView: WKWebView
    var onOpenInAppBrowser: ((URL) -> Void)? = nil
    var interceptYouTubeSubscribeToApp: Bool = false
    var onPullToRefresh: (() -> Void)? = nil
    let onScrollStateChange: (Bool, Bool) -> Void

    var body: some View {
        WebView(
            webView: webView,
            onOpenInAppBrowser: onOpenInAppBrowser,
            interceptYouTubeSubscribeToApp: interceptYouTubeSubscribeToApp,
            onPullToRefresh: onPullToRefresh,
            onScrollStateChange: onScrollStateChange
        )
    }
}

private struct WebView: UIViewRepresentable {
    let webView: WKWebView
    var onOpenInAppBrowser: ((URL) -> Void)? = nil
    let interceptYouTubeSubscribeToApp: Bool
    var onPullToRefresh: (() -> Void)? = nil
    let onScrollStateChange: (Bool, Bool) -> Void

    func makeUIView(context: Context) -> WKWebView {
        webView.scrollView.delegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        context.coordinator.reportTopState(of: webView.scrollView, userActivity: false)
        context.coordinator.applyYouTubeBottomBarHidingIfNeeded(on: webView)
        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(context.coordinator, action: #selector(Coordinator.userDidPullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl
        context.coordinator.refreshControl = refreshControl
        context.coordinator.onPullToRefresh = onPullToRefresh
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.scrollView.delegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        context.coordinator.reportTopState(of: webView.scrollView, userActivity: false)
        context.coordinator.applyYouTubeBottomBarHidingIfNeeded(on: webView)
        context.coordinator.onPullToRefresh = onPullToRefresh
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onOpenInAppBrowser: onOpenInAppBrowser,
            interceptYouTubeSubscribeToApp: interceptYouTubeSubscribeToApp,
            onScrollStateChange: onScrollStateChange
        )
    }

    final class Coordinator: NSObject, UIScrollViewDelegate, WKUIDelegate, WKNavigationDelegate {
        private let onOpenInAppBrowser: ((URL) -> Void)?
        private let interceptYouTubeSubscribeToApp: Bool
        private let onScrollStateChange: (Bool, Bool) -> Void
        weak var refreshControl: UIRefreshControl?
        var onPullToRefresh: (() -> Void)?

        init(
            onOpenInAppBrowser: ((URL) -> Void)?,
            interceptYouTubeSubscribeToApp: Bool,
            onScrollStateChange: @escaping (Bool, Bool) -> Void
        ) {
            self.onOpenInAppBrowser = onOpenInAppBrowser
            self.interceptYouTubeSubscribeToApp = interceptYouTubeSubscribeToApp
            self.onScrollStateChange = onScrollStateChange
        }

        @objc func userDidPullToRefresh() {
            onPullToRefresh?()
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                onOpenInAppBrowser?(url)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if interceptYouTubeSubscribeToApp, let url = navigationAction.request.url {
                if isSparrowsOpenInAppURL(url) || isYouTubeSubscribeAction(url) || isYouTubeSubscribeLoginFlow(url) {
                    openSparrowsVideosInYouTubeApp()
                    decisionHandler(.cancel)
                    return
                }
            }

            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                onOpenInAppBrowser?(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            applyYouTubeBottomBarHidingIfNeeded(on: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            applyYouTubeBottomBarHidingIfNeeded(on: webView)
            refreshControl?.endRefreshing()
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            reportTopState(of: scrollView, userActivity: true)
        }

        func reportTopState(of scrollView: UIScrollView, userActivity: Bool) {
            let topEdge = -scrollView.adjustedContentInset.top
            let isAtTop = scrollView.contentOffset.y <= topEdge + 1
            onScrollStateChange(isAtTop, userActivity)
        }

        func applyYouTubeBottomBarHidingIfNeeded(on webView: WKWebView) {
            guard let host = webView.url?.host?.lowercased(), host.contains("youtube.com") else { return }

            // Best-effort hide of YouTube mobile bottom navigation tabs (Home/Shorts/You etc.).
            let script = """
            (function() {
              if (window.__sparrowsHideYoutubeBottomNavInstalled) return;
              window.__sparrowsHideYoutubeBottomNavInstalled = true;

              var style = document.createElement('style');
              style.id = 'sparrows-hide-youtube-bottom-nav';
              style.textContent = `
                ytm-pivot-bar-renderer,
                .pivot-bar-renderer,
                [class*="pivot-bar"],
                [id*="pivot-bar"],
                [class*="bottom-nav"],
                [id*="bottom-nav"],
                [class*="tab-bar"],
                [id*="tab-bar"] {
                  display: none !important;
                  visibility: hidden !important;
                  height: 0 !important;
                  min-height: 0 !important;
                  max-height: 0 !important;
                }
              `;
              document.head.appendChild(style);

              function hideByText() {
                var candidates = Array.from(document.querySelectorAll('a, button, div, span'));
                var labels = ['home', 'shorts', 'you', 'subscriptions', 'library'];
                for (var i = 0; i < candidates.length; i++) {
                  var node = candidates[i];
                  var text = (node.innerText || node.textContent || '').trim().toLowerCase();
                  if (!text) continue;
                  for (var j = 0; j < labels.length; j++) {
                    if (text === labels[j]) {
                      var bar = node.closest('ytm-pivot-bar-renderer, [class*="pivot"], [class*="tab-bar"], nav, footer');
                      if (bar) {
                        bar.style.display = 'none';
                        bar.style.visibility = 'hidden';
                        bar.style.height = '0';
                        bar.style.maxHeight = '0';
                      }
                    }
                  }
                }
              }

              hideByText();
              setInterval(hideByText, 700);

              function installSubscribeInterceptor() {
                if (window.__sparrowsSubscribeInterceptorInstalled) return;
                window.__sparrowsSubscribeInterceptorInstalled = true;

                var labels = ['subscribe', 'subscribed', '訂閱', '已訂閱'];
                function shouldIntercept(node) {
                  if (!node) return false;
                  var txt = ((node.innerText || node.textContent || '') + ' ' + (node.getAttribute('aria-label') || '')).toLowerCase();
                  if (!txt) return false;
                  for (var i = 0; i < labels.length; i++) {
                    if (txt.indexOf(labels[i]) !== -1) return true;
                  }
                  return false;
                }

                document.addEventListener('click', function(ev) {
                  var node = ev.target;
                  if (!node || !node.closest) return;
                  var candidate = node.closest('button, a, ytm-subscribe-button-renderer, ytd-subscribe-button-renderer');
                  if (!candidate) return;
                  if (!shouldIntercept(candidate)) return;
                  ev.preventDefault();
                  ev.stopPropagation();
                  ev.stopImmediatePropagation();
                  window.location.href = 'sparrows-youtube://open-videos';
                }, true);
              }

              installSubscribeInterceptor();
            })();
            """

            webView.evaluateJavaScript(script, completionHandler: nil)
        }

        private func isYouTubeSubscribeAction(_ url: URL) -> Bool {
            let host = (url.host ?? "").lowercased()
            guard host.contains("youtube.com") else { return false }
            let absolute = url.absoluteString.lowercased()
            let path = url.path.lowercased()
            return absolute.contains("sub_confirmation=1")
                || path.contains("/subscribe")
                || path.contains("/subscription")
        }

        private func isYouTubeSubscribeLoginFlow(_ url: URL) -> Bool {
            let host = (url.host ?? "").lowercased()
            guard host.contains("accounts.google.com") || host.contains("youtube.com") else { return false }
            let absolute = url.absoluteString.lowercased()
            return absolute.contains("service=youtube")
                || absolute.contains("continue=https%3a%2f%2fwww.youtube.com")
                || absolute.contains("/signin")
                || absolute.contains("signin")
        }

        private func isSparrowsOpenInAppURL(_ url: URL) -> Bool {
            url.scheme?.lowercased() == "sparrows-youtube" && url.host?.lowercased() == "open-videos"
        }

        private func openSparrowsVideosInYouTubeApp() {
            let appURL = URL(string: "youtube://www.youtube.com/@SparrowsVolleyball/videos")!
            let webURL = URL(string: "https://www.youtube.com/@SparrowsVolleyball/videos")!

            if UIApplication.shared.canOpenURL(appURL) {
                UIApplication.shared.open(appURL, options: [:], completionHandler: nil)
            } else {
                UIApplication.shared.open(webURL, options: [:], completionHandler: nil)
            }
        }
    }
}

private struct InAppTemporaryBrowser: View {
    let url: URL
    let cache: InAppBrowserCache
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            WebBrowserContainer(
                webView: cache.webView(for: url),
                fallbackURL: url,
                cache: cache
            )
                .navigationTitle("Browser")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Close") {
                            cache.captureState(for: url)
                            onClose()
                        }
                    }
                }
        }
    }
}

private struct WebBrowserContainer: UIViewRepresentable {
    let webView: WKWebView
    let fallbackURL: URL
    let cache: InAppBrowserCache

    func makeUIView(context: Context) -> WKWebView {
        webView.navigationDelegate = context.coordinator
        webView.scrollView.pinchGestureRecognizer?.isEnabled = true
        if webView.url == nil {
            webView.load(URLRequest(url: fallbackURL))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.navigationDelegate = context.coordinator
        uiView.scrollView.pinchGestureRecognizer?.isEnabled = true
        if uiView.url == nil {
            uiView.load(URLRequest(url: fallbackURL))
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(cache: cache, url: fallbackURL)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let cache: InAppBrowserCache
        private let url: URL

        init(cache: InAppBrowserCache, url: URL) {
            self.cache = cache
            self.url = url
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Force pages that disable zoom to allow pinch zoom in this temporary browser.
            let script = """
            (function() {
              var meta = document.querySelector('meta[name="viewport"]');
              var content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
              if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                document.head.appendChild(meta);
              }
              meta.setAttribute('content', content);
            })();
            """
            webView.evaluateJavaScript(script) { _, _ in
                self.cache.restoreStateIfNeeded(for: self.url, on: webView)
            }
        }
    }
}

private struct BrowserSheetItem: Identifiable {
    let id: String
    let url: URL
}

private extension Binding where Value == URL? {
    func asBrowserSheetItem() -> Binding<BrowserSheetItem?> {
        Binding<BrowserSheetItem?>(
            get: { wrappedValue.map { BrowserSheetItem(id: $0.absoluteString, url: $0) } },
            set: { newValue in
                wrappedValue = newValue?.url
            }
        )
    }
}

private struct CheckoutSafariSheetItem: Identifiable {
    let id: String
    let url: URL
}

private extension Binding where Value == URL? {
    func asCheckoutSafariSheetItem() -> Binding<CheckoutSafariSheetItem?> {
        Binding<CheckoutSafariSheetItem?>(
            get: { wrappedValue.map { CheckoutSafariSheetItem(id: $0.absoluteString, url: $0) } },
            set: { newValue in
                wrappedValue = newValue?.url
            }
        )
    }
}

private struct CheckoutSafariView: UIViewControllerRepresentable {
    let url: URL
    let onDismiss: () -> Void

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let safari = SFSafariViewController(url: url)
        safari.delegate = context.coordinator
        return safari
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onDismiss: onDismiss)
    }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        private let onDismiss: () -> Void

        init(onDismiss: @escaping () -> Void) {
            self.onDismiss = onDismiss
        }

        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            onDismiss()
        }
    }
}

@MainActor
private final class InAppBrowserCache {
    private struct BrowserViewState {
        let x: Double
        let y: Double
        let scale: Double
    }

    private var cachedWebViews: [String: WKWebView] = [:]
    private var savedStates: [String: BrowserViewState] = [:]
    private var pendingRestoreKeys: Set<String> = []

    func webView(for url: URL) -> WKWebView {
        let key = url.absoluteString
        if let existing = cachedWebViews[key] {
            return existing
        }

        let browser = WKWebView(frame: .zero)
        browser.allowsBackForwardNavigationGestures = true
        if savedStates[key] != nil {
            pendingRestoreKeys.insert(key)
        }
        browser.load(URLRequest(url: url))
        cachedWebViews[key] = browser
        return browser
    }

    func captureState(for url: URL) {
        let key = url.absoluteString
        guard let webView = cachedWebViews[key] else { return }

        let fallbackX = Double(webView.scrollView.contentOffset.x)
        let fallbackY = Double(webView.scrollView.contentOffset.y)
        let fallbackScale = Double(max(1.0, min(webView.scrollView.zoomScale, 5.0)))
        savedStates[key] = BrowserViewState(x: fallbackX, y: fallbackY, scale: fallbackScale)

        let script = """
        (function() {
          var x = window.scrollX || 0;
          var y = window.scrollY || 0;
          var scale = (window.visualViewport && window.visualViewport.scale) ? window.visualViewport.scale : 1;
          return JSON.stringify({x:x, y:y, scale:scale});
        })();
        """

        webView.evaluateJavaScript(script) { result, _ in
            guard
                let json = result as? String,
                let data = json.data(using: .utf8),
                let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let x = dict["x"] as? Double,
                let y = dict["y"] as? Double,
                let scale = dict["scale"] as? Double
            else { return }

            self.savedStates[key] = BrowserViewState(x: x, y: y, scale: scale)
        }
    }

    func restoreStateIfNeeded(for url: URL, on webView: WKWebView) {
        let key = url.absoluteString
        guard pendingRestoreKeys.contains(key) else { return }
        guard let state = savedStates[key] else { return }
        pendingRestoreKeys.remove(key)

        let safeScale = max(1.0, min(state.scale, 5.0))
        let script = """
        (function() {
          var scale = \(safeScale);
          var meta = document.querySelector('meta[name="viewport"]');
          var content = 'width=device-width, initial-scale=' + scale + ', minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
          if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            document.head.appendChild(meta);
          }
          meta.setAttribute('content', content);
          document.body.style.zoom = 1;
          document.documentElement.style.zoom = 1;
          window.scrollTo(\(state.x), \(state.y));
        })();
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func clear() {
        cachedWebViews.removeAll()
        savedStates.removeAll()
        pendingRestoreKeys.removeAll()
        URLCache.shared.removeAllCachedResponses()
    }
}

@MainActor
private final class WebViewPreloader {
    private var webViews: [AppTab: WKWebView] = [:]
    private var loadedTabs = Set<AppTab>()
    private var urlByTab: [AppTab: URL] = [:]
    private var keyedWebViews: [String: WKWebView] = [:]
    private var loadedKeys = Set<String>()
    private var urlByKey: [String: URL] = [:]

    func preloadAllTabs() {
        _ = webView(for: .liveVideos, urlString: "https://www.youtube.com/@SparrowsVolleyball/videos")
        _ = webView(for: .ongoingTournament, urlString: "https://joechan426.github.io/sparrowsvolleyball/")
    }

    func webView(for tab: AppTab, urlString: String) -> WKWebView {
        if let url = URL(string: urlString) {
            urlByTab[tab] = url
        }

        if let existing = webViews[tab] {
            preload(tab: tab, urlString: urlString)
            return existing
        }

        let webView = WKWebView(frame: .zero)
        webView.allowsBackForwardNavigationGestures = true
        webViews[tab] = webView
        preload(tab: tab, urlString: urlString)
        return webView
    }

    private func preload(tab: AppTab, urlString: String) {
        guard !loadedTabs.contains(tab) else { return }
        guard let url = URL(string: urlString) else { return }

        let webView = webViews[tab] ?? {
            let created = WKWebView(frame: .zero)
            created.allowsBackForwardNavigationGestures = true
            webViews[tab] = created
            return created
        }()

        loadedTabs.insert(tab)
        webView.load(URLRequest(url: url))
    }

    func loadInitialPage(for tab: AppTab) {
        guard let url = urlByTab[tab] else { return }

        if let webView = webViews[tab] {
            webView.load(URLRequest(url: url))
            return
        }

        _ = webView(for: tab, urlString: url.absoluteString)
    }

    func clearCachedWebView(for tab: AppTab) {
        webViews[tab] = nil
        loadedTabs.remove(tab)
    }

    func goBackWithAnimation(tab: AppTab) {
        guard let webView = webViews[tab], webView.canGoBack else { return }
        let snapshotConfig = WKSnapshotConfiguration()
        snapshotConfig.rect = webView.bounds

        webView.takeSnapshot(with: snapshotConfig) { image, _ in
            guard let image else {
                webView.goBack()
                return
            }

            let overlay = UIImageView(image: image)
            overlay.frame = webView.bounds
            overlay.contentMode = .scaleToFill
            overlay.isUserInteractionEnabled = false
            webView.addSubview(overlay)

            webView.goBack()

            UIView.animate(withDuration: 0.28, delay: 0, options: [.curveEaseInOut], animations: {
                overlay.transform = CGAffineTransform(translationX: webView.bounds.width, y: 0)
            }, completion: { _ in
                overlay.removeFromSuperview()
            })
        }
    }

    func scrollToTop(tab: AppTab) {
        guard let webView = webViews[tab] else { return }
        let topY = -webView.scrollView.adjustedContentInset.top
        webView.scrollView.setContentOffset(CGPoint(x: 0, y: topY), animated: true)
    }

    func webView(forKey key: String, urlString: String) -> WKWebView {
        if let url = URL(string: urlString) {
            urlByKey[key] = url
        }

        if let existing = keyedWebViews[key] {
            preload(key: key, urlString: urlString)
            return existing
        }

        let webView = WKWebView(frame: .zero)
        webView.allowsBackForwardNavigationGestures = true
        keyedWebViews[key] = webView
        preload(key: key, urlString: urlString)
        return webView
    }

    func loadInitialPage(forKey key: String, urlString: String) {
        if let url = URL(string: urlString) {
            urlByKey[key] = url
        }
        guard let url = urlByKey[key] else { return }

        if let webView = keyedWebViews[key] {
            webView.load(URLRequest(url: url))
            return
        }

        _ = webView(forKey: key, urlString: url.absoluteString)
    }

    func scrollToTop(forKey key: String) {
        guard let webView = keyedWebViews[key] else { return }
        let topY = -webView.scrollView.adjustedContentInset.top
        webView.scrollView.setContentOffset(CGPoint(x: 0, y: topY), animated: true)
    }

    func goBack(forKey key: String) {
        guard let webView = keyedWebViews[key], webView.canGoBack else { return }
        webView.goBack()
    }

    private func preload(key: String, urlString: String) {
        guard !loadedKeys.contains(key) else { return }
        guard let url = URL(string: urlString) else { return }

        let webView = keyedWebViews[key] ?? {
            let created = WKWebView(frame: .zero)
            created.allowsBackForwardNavigationGestures = true
            keyedWebViews[key] = created
            return created
        }()

        loadedKeys.insert(key)
        webView.load(URLRequest(url: url))
    }
}

/// Calendar list row: time only — centered, saturated dark blue with white outline ring.
private struct CalendarEventTimeLabel: View {
    let text: String
    var lineLimit: Int = 2
    /// Smaller fonts fit the narrow grid time column; default matches the cup / multi-line row.
    var font: Font = .title2
    var minimumScaleFactor: CGFloat = 0.75
    private static let outlineOffsets: [(CGFloat, CGFloat)] = {
        var o: [(CGFloat, CGFloat)] = []
        for r: CGFloat in [1, 2] {
            o.append(contentsOf: [
                (-r, -r), (0, -r), (r, -r),
                (-r, 0), (r, 0),
                (-r, r), (0, r), (r, r),
            ])
        }
        return o
    }()
    /// #0a3482 — must read clearly as blue (not black) in light mode.
    private static let fillColor = Color(red: 10 / 255, green: 52 / 255, blue: 130 / 255)

    var body: some View {
        ZStack {
            ForEach(0..<Self.outlineOffsets.count, id: \.self) { i in
                let o = Self.outlineOffsets[i]
                Text(text)
                    .font(font)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(lineLimit)
                    .minimumScaleFactor(minimumScaleFactor)
                    .frame(maxWidth: .infinity)
                    .offset(x: o.0, y: o.1)
            }
            Text(text)
                .font(font)
                .fontWeight(.bold)
                .foregroundColor(Self.fillColor)
                .multilineTextAlignment(.center)
                .lineLimit(lineLimit)
                .minimumScaleFactor(minimumScaleFactor)
                .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
        .compositingGroup()
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Largest single-line font size (rounded bold) so `text` fits in `maxWidth`; aligns with `CalendarEventTimeLabel` scaling.
private func fittedRoundedBoldTimeFontSize(
    for text: String,
    maxWidth: CGFloat,
    maxSize: CGFloat = 28,
    minSize: CGFloat = 10
) -> CGFloat {
    guard maxWidth > 1, !text.isEmpty else { return min(minSize, maxSize) }
    var size = maxSize
    let floor = minSize
    while size >= floor {
        let base = UIFont.systemFont(ofSize: size, weight: .bold)
        let desc = base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor
        let font = UIFont(descriptor: desc, size: size)
        let w = (text as NSString).size(withAttributes: [.font: font]).width
        if w <= maxWidth {
            return size
        }
        size -= 0.5
    }
    return floor
}

private struct SportsCalendarView: View {
    @ObservedObject var viewModel: SportsCalendarViewModel
    @ObservedObject var memberStore: MemberProfileStore
    let scrollToTopToken: Int
    let onOpenCheckout: (URL) -> Void
    let onScrollStateChange: (Bool, Bool) -> Void
    @Environment(\.scenePhase) private var scenePhase

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)
    @State private var showMonthPicker = false
    @State private var pickerYear = Calendar.current.component(.year, from: Date())
    @State private var pickerMonth = Calendar.current.component(.month, from: Date())
    @State private var monthTransitionDirection = 1
    @State private var monthDragOffset: CGFloat = 0
    @State private var monthContainerWidth: CGFloat = 1
    @State private var registerEvent: CalendarEvent?
    @State private var eventInfoEvent: CalendarEvent?
    @State private var calendarRegistrations: [APIMemberRegistration] = []
    /// Optimistic Pending pill right after successful register (until registrations refresh).
    @State private var optimisticPendingEventIds: Set<String> = []
    private let todayHighlightColor = Color.orange
    private let selectedDateHighlightColor = Color(red: 0.0, green: 0.45, blue: 0.2)
    private let minimumListSectionHeight: CGFloat = 156

    /// Split list area height: **50%** normal events, **50%** “What happens NEXT” (of space below the `listMidGap`). Uses measured height so no gap above the tab bar.
    private static func splitCalendarListHeights(available: CGFloat, listMidGap: CGFloat, minimumNormal: CGFloat) -> (CGFloat, CGFloat) {
        let a = max(0, available)
        guard a > listMidGap + 1 else {
            return (max(0, a - listMidGap), 0)
        }
        let inner = a - listMidGap
        let minSpecial: CGFloat = 88

        var normal = floor(inner * 0.5)
        var special = inner - normal
        if normal < minimumNormal {
            normal = minimumNormal
            special = inner - normal
        }
        if special < minSpecial {
            special = minSpecial
            normal = max(0, inner - special)
            if normal < minimumNormal {
                normal = minimumNormal
                special = max(minSpecial, inner - normal)
            }
        }
        return (normal, special)
    }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 4) {
                sportFilters
                monthHeader
                weekdayHeader
                monthGrid
                    .padding(.top, 6)
                    .padding(.bottom, 6)
                calendarColorLegend

                GeometryReader { listGeo in
                    let listMidGap: CGFloat = 6
                    let h = listGeo.size.height
                    let (normalH, specialH) = Self.splitCalendarListHeights(
                        available: h,
                        listMidGap: listMidGap,
                        minimumNormal: minimumListSectionHeight
                    )
                    eventsList(normalHeight: normalH, specialHeight: specialH)
                        .frame(width: listGeo.size.width, height: h, alignment: .top)
                }
                .frame(maxHeight: .infinity)
            }
            .padding(.horizontal, 12)
            .padding(.top, 0)
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            .background(.background)
            .task {
                await viewModel.loadEventsIfNeeded()
                await memberStore.loadFromBackendIfNeeded()
            }
            .task(id: memberStore.memberId) {
                guard let id = memberStore.memberId else {
                    calendarRegistrations = []
                    viewModel.setRegistrationStatusSnapshot(from: [], markLoaded: true)
                    return
                }
                do {
                    let fresh = try await MemberAPI.registrations(memberId: id)
                    calendarRegistrations = fresh
                    viewModel.setRegistrationStatusSnapshot(from: fresh, markLoaded: true)
                } catch {
                    calendarRegistrations = []
                    viewModel.setRegistrationStatusSnapshot(from: [], markLoaded: true)
                }
            }
            .sheet(item: $registerEvent) { event in
                RegisterEventSheet(
                    event: event,
                    memberStore: memberStore,
                    dateTimeText: viewModel.eventDateTimeDetailText(for: event),
                    descriptionText: viewModel.fullDescription(for: event),
                    onOpenCheckout: onOpenCheckout,
                    onRegistered: { eventId in
                        optimisticPendingEventIds.insert(eventId)
                        viewModel.setOptimisticPending(eventId: eventId)
                    },
                    registrationActionsAllowed: true,
                    onDismiss: {
                        Task {
                            await viewModel.refresh()
                            if let id = memberStore.memberId {
                                if let fresh = try? await MemberAPI.registrations(memberId: id) {
                                    calendarRegistrations = fresh
                                    viewModel.setRegistrationStatusSnapshot(from: fresh, markLoaded: true)
                                }
                            }
                        }
                    }
                )
            }
            .sheet(item: $eventInfoEvent) { event in
                RegisterEventSheet(
                    event: event,
                    memberStore: memberStore,
                    dateTimeText: viewModel.eventDateTimeDetailText(for: event),
                    descriptionText: viewModel.fullDescription(for: event),
                    onOpenCheckout: onOpenCheckout,
                    onRegistered: { eventId in
                        optimisticPendingEventIds.insert(eventId)
                        viewModel.setOptimisticPending(eventId: eventId)
                    },
                    registrationActionsAllowed: (event.registrationOpen == true) && isRegisterableDatabaseCalendarEvent(event),
                    onDismiss: {
                        Task {
                            await viewModel.refresh()
                            if let id = memberStore.memberId {
                                if let fresh = try? await MemberAPI.registrations(memberId: id) {
                                    calendarRegistrations = fresh
                                    viewModel.setRegistrationStatusSnapshot(from: fresh, markLoaded: true)
                                }
                            }
                        }
                    }
                )
            }
            .onReceive(Timer.publish(every: 15, tolerance: 3, on: .main, in: .common).autoconnect()) { _ in
                guard scenePhase == .active else { return }
                Task {
                    if let id = memberStore.memberId {
                        if let fresh = try? await MemberAPI.registrations(memberId: id) {
                            await MainActor.run {
                                calendarRegistrations = fresh
                                viewModel.setRegistrationStatusSnapshot(from: fresh, markLoaded: true)
                                let idsWithRegistration = Set(fresh.compactMap { $0.event?.id })
                                optimisticPendingEventIds.subtract(idsWithRegistration)
                            }
                        }
                    }
                }
            }
            .onReceive(Timer.publish(every: 30, tolerance: 5, on: .main, in: .common).autoconnect()) { _ in
                guard scenePhase == .active else { return }
                Task { await viewModel.refresh() }
            }
        }
    }

    private var monthHeader: some View {
        HStack {
            Button {
                changeMonth(by: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.headline)
            }

            Spacer()

            Button {
                pickerYear = viewModel.currentYear
                pickerMonth = viewModel.currentMonthNumber
                showMonthPicker = true
            } label: {
                HStack(spacing: 4) {
                    Text(viewModel.monthTitle)
                        .font(.headline)
                    Image(systemName: "chevron.down")
                        .font(.caption)
                }
                .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                changeMonth(by: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.headline)
            }
        }
        .foregroundStyle(.primary)
        .sheet(isPresented: $showMonthPicker) {
            monthPickerSheet
        }
    }

    private var monthPickerSheet: some View {
        let today = Date()
        let todayYear = Calendar.current.component(.year, from: today)
        let todayMonth = Calendar.current.component(.month, from: today)

        return NavigationStack {
            VStack(spacing: 16) {
                HStack {
                    Button {
                        pickerYear -= 1
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    Text(verbatim: String(pickerYear))
                        .font(.system(size: 34, weight: .bold, design: .rounded))

                    Spacer()

                    Button {
                        pickerYear += 1
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.horizontal, 8)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                    ForEach(Array(viewModel.monthNames.enumerated()), id: \.offset) { index, name in
                        let monthValue = index + 1
                        let isSelectedMonth = monthValue == pickerMonth
                        let isTodayMonth = pickerYear == todayYear && monthValue == todayMonth
                        Button {
                            let current = viewModel.currentMonthNumber
                            monthTransitionDirection = monthValue >= current ? 1 : -1
                            pickerMonth = monthValue
                            withAnimation(.easeInOut(duration: 0.22)) {
                                viewModel.jumpToMonth(year: pickerYear, month: pickerMonth)
                            }
                            showMonthPicker = false
                        } label: {
                            Text(String(name.prefix(3)))
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(isSelectedMonth ? Color.accentColor.opacity(0.2) : Color(uiColor: .secondarySystemBackground))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(isSelectedMonth ? Color.accentColor : Color.clear, lineWidth: 1.2)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(isTodayMonth ? Color.orange : Color.clear, lineWidth: 3)
                                )
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.primary)
                    }
                }

                Button("Go to Today") {
                    let currentMonthValue = viewModel.currentMonthNumber
                    let todayMonthValue = Calendar.current.component(.month, from: Date())
                    monthTransitionDirection = todayMonthValue >= currentMonthValue ? 1 : -1
                    withAnimation(.easeInOut(duration: 0.22)) {
                        viewModel.goToToday()
                    }
                    showMonthPicker = false
                }
                .buttonStyle(.borderedProminent)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .navigationTitle("Select Month")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        showMonthPicker = false
                    }
                }
            }
        }
    }

    private var sportFilters: some View {
        HStack(spacing: 10) {
            ForEach(SportFilter.allCases, id: \.self) { filter in
                Button {
                    viewModel.selectedFilter = filter
                } label: {
                    VStack(spacing: 4) {
                        if let logoAssetName = filter.calendarLogoAssetName,
                           UIImage(named: logoAssetName) != nil {
                            Image(logoAssetName)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 24, height: 24)
                        } else {
                            Image(systemName: filter.icon)
                                .font(.system(size: 20, weight: .semibold))
                        }
                        Text(filter.title)
                            .font(.caption2)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(viewModel.selectedFilter == filter ? Color.accentColor.opacity(0.15) : Color(uiColor: .secondarySystemBackground))
                    )
                }
                .buttonStyle(.plain)
                .foregroundStyle(viewModel.selectedFilter == filter ? Color.accentColor : Color.primary)
            }
        }
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var weekdayHeader: some View {
        LazyVGrid(columns: columns, spacing: 6) {
            ForEach(viewModel.weekdaySymbols, id: \.self) { symbol in
                Text(symbol)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var monthGrid: some View {
        GeometryReader { proxy in
            let width = max(proxy.size.width, 1)
            let prevMonth = viewModel.monthByAdding(-1)
            let nextMonth = viewModel.monthByAdding(1)

            HStack(spacing: 0) {
                monthGridContent(for: prevMonth)
                    .frame(width: width)
                monthGridContent(for: viewModel.currentMonth)
                    .frame(width: width)
                monthGridContent(for: nextMonth)
                    .frame(width: width)
            }
            .offset(x: -width + monthDragOffset)
            .clipped()
            .onAppear {
                monthContainerWidth = width
            }
            .onChange(of: proxy.size.width) { newWidth in
                monthContainerWidth = max(newWidth, 1)
            }
            .highPriorityGesture(
                DragGesture(minimumDistance: 10)
                    .onChanged { value in
                        let horizontal = value.translation.width
                        let vertical = value.translation.height
                        guard abs(horizontal) > abs(vertical) else { return }
                        monthDragOffset = max(min(horizontal, width), -width)
                    }
                    .onEnded { value in
                        finalizeMonthSwipe(value: value)
                    }
            )
        }
        .frame(height: 296)
    }

    private var calendarColorLegend: some View {
        HStack(alignment: .center, spacing: 12) {
            HStack(alignment: .center, spacing: 6) {
                Rectangle()
                    .fill(todayHighlightColor)
                    .frame(width: 9, height: 9)
                    .cornerRadius(2)
                Text("= Today")
                    .font(.caption2)
                    .foregroundStyle(Color.black.opacity(0.65))
            }

            HStack(alignment: .center, spacing: 6) {
                Rectangle()
                    .fill(selectedDateHighlightColor)
                    .frame(width: 9, height: 9)
                    .cornerRadius(2)
                Text("= Selected date")
                    .font(.caption2)
                    .foregroundStyle(Color.black.opacity(0.65))
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, 0)
        .padding(.bottom, 2)
    }

    @ViewBuilder
    private func monthGridContent(for month: Date) -> some View {
        LazyVGrid(columns: columns, spacing: 6) {
            ForEach(Array(viewModel.daysInMonthGrid(for: month).enumerated()), id: \.offset) { _, day in
                if let day {
                    let eventCount = viewModel.filteredEventCount(on: day)
                    let hasEvents = eventCount > 0
                    let isSelected = viewModel.isSelected(day)
                    let isToday = viewModel.isToday(day)

                    Button {
                        viewModel.selectDate(day)
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            VStack(spacing: 3) {
                                Text(viewModel.dayNumber(for: day))
                                    .font(.subheadline)
                                    .fontWeight(hasEvents ? .bold : .regular)
                                    .foregroundStyle((hasEvents || isSelected || isToday) ? Color.white : Color.primary)

                                Circle()
                                    .fill(hasEvents ? Color.white.opacity(0.9) : Color.clear)
                                    .frame(width: 5, height: 5)
                            }
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .padding(.vertical, 2)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(Color.clear)
                                    .background(
                                        Group {
                                            if isToday && isSelected {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(
                                                        LinearGradient(
                                                            colors: [todayHighlightColor, selectedDateHighlightColor],
                                                            startPoint: .leading,
                                                            endPoint: .trailing
                                                        )
                                                    )
                                            } else if isSelected {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(selectedDateHighlightColor)
                                            } else if isToday {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(todayHighlightColor)
                                            } else if hasEvents {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(Color.accentColor.opacity(0.75))
                                            } else {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(Color(uiColor: .secondarySystemBackground))
                                            }
                                        }
                                    )
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(
                                        (hasEvents && !isToday && !isSelected) ? Color.accentColor.opacity(0.9) : Color.clear,
                                        lineWidth: (hasEvents && !isToday && !isSelected) ? 1.2 : 0
                                    )
                            }

                            if hasEvents {
                                Text("\(eventCount)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(Color.white)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(Color.black.opacity(0.55)))
                                    .padding(.top, 2)
                                    .padding(.trailing, 2)
                            }
                        }
                        .overlay {
                            Group {
                                if isToday && isSelected {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(
                                            LinearGradient(
                                                colors: [todayHighlightColor, selectedDateHighlightColor],
                                                startPoint: .leading,
                                                endPoint: .trailing
                                            ),
                                            lineWidth: 3
                                        )
                                        .padding(0.5)
                                } else if isSelected {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(selectedDateHighlightColor, lineWidth: 3)
                                        .padding(0.5)
                                } else if isToday {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(todayHighlightColor, lineWidth: 3)
                                        .padding(0.5)
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                } else {
                    Color.clear
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .padding(.vertical, 2)
                }
            }
        }
    }

    private func calendarRowMetaSubtitle(for event: CalendarEvent, includeLocation: Bool) -> String {
        var parts: [String] = []
        if let sport = event.sportType, !sport.isEmpty { parts.append(sport) }
        parts.append("Registration \((event.registrationOpen ?? false) ? "Open" : "Closed")")
        if includeLocation, let loc = event.location, !loc.isEmpty { parts.append(loc) }
        return parts.joined(separator: " · ")
    }

    private func eventsList(normalHeight: CGFloat, specialHeight: CGFloat) -> some View {
        VStack(spacing: 6) {
            generalEventsSection(height: normalHeight)
            whatHappensNextSection(height: specialHeight)
        }
        .padding(.bottom, 0)
        .frame(maxWidth: .infinity)
    }

    private func generalEventsSection(height: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Events on \(viewModel.selectedDateTitle)")
                .font(.headline)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)

            ScrollViewReader { proxy in
                ScrollView {
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: VerticalOffsetPreferenceKey.self,
                                value: geo.frame(in: .named("calendarListScroll")).minY
                            )
                    }
                    .frame(height: 0)
                    .id("calendar-top-anchor")

                    LazyVStack(alignment: .leading, spacing: 8) {
                        if viewModel.filteredEventsForSelectedDate.isEmpty {
                            Text("No matching events on \(viewModel.selectedDateTitle).")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, 4)
                        } else {
                            ForEach(viewModel.filteredEventsForSelectedDate) { event in
                                let myRegistration = calendarRegistrations.first(where: { $0.event?.id == event.id })
                                let optimisticPending = optimisticPendingEventIds.contains(event.id)
                                let cachedStatus = viewModel.registrationStatusByEventId[event.id]
                                let effectiveStatus: String? = myRegistration?.status ?? (optimisticPending ? "PENDING" : cachedStatus)
                                let shouldHoldStatusUI = memberStore.hasProfile && !viewModel.registrationStatusLoaded
                                Grid(horizontalSpacing: 8, verticalSpacing: 6) {
                                    GridRow(alignment: .center) {
                                        Button {
                                            eventInfoEvent = event
                                        } label: {
                                            VStack(spacing: 2) {
                                                Spacer(minLength: 0)
                                                CalendarEventTimeLabel(
                                                    text: viewModel.eventStartTimeOnlyText(for: event),
                                                    lineLimit: 1,
                                                    font: .headline,
                                                    minimumScaleFactor: 0.6
                                                )
                                                Spacer(minLength: 0)
                                            }
                                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                                        }
                                        .buttonStyle(.plain)
                                        .gridCellColumns(2)

                                        Button {
                                            eventInfoEvent = event
                                        } label: {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(event.title)
                                                    .font(.subheadline)
                                                    .fontWeight(.semibold)
                                                    .multilineTextAlignment(.leading)
                                                    .lineLimit(4)
                                                    .fixedSize(horizontal: false, vertical: true)
                                                Text(calendarRowMetaSubtitle(for: event, includeLocation: false))
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                                    .lineLimit(3)
                                                    .fixedSize(horizontal: false, vertical: true)
                                                if (event.waitlistedCount ?? 0) > 0 || (event.pendingCount ?? 0) > 0 {
                                                    CalendarQueueHintView(
                                                        waitlisted: event.waitlistedCount ?? 0,
                                                        requested: event.pendingCount ?? 0
                                                    )
                                                    .padding(.top, 2)
                                                }
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                        }
                                        .buttonStyle(.plain)
                                        .gridCellColumns(8)

                                        Group {
                                            if shouldHoldStatusUI {
                                                ProgressView()
                                                    .frame(minWidth: 88, minHeight: 36)
                                            } else if let status = effectiveStatus {
                                                VStack(spacing: 6) {
                                                    Text(RegistrationStatusStyle.displayText(status))
                                                        .font(.caption)
                                                        .fontWeight(.medium)
                                                        .foregroundStyle(.white)
                                                        .padding(.horizontal, 10)
                                                        .padding(.vertical, 4)
                                                        .background(Capsule().fill(RegistrationStatusStyle.color(status)))
                                                        .frame(minWidth: 88, minHeight: 36)
                                                    CalendarEventParticipantHintView(event: event)
                                                }
                                                .frame(maxWidth: .infinity)
                                            } else if isRegisterableDatabaseCalendarEvent(event) {
                                                VStack(spacing: 6) {
                                                    Button("Register") {
                                                        registerEvent = event
                                                    }
                                                    .buttonStyle(.borderedProminent)
                                                    .font(.subheadline.bold())
                                                    .frame(minWidth: 88, minHeight: 36)
                                                    .disabled((event.registrationOpen ?? false) == false)
                                                    CalendarEventParticipantHintView(event: event)
                                                }
                                                .frame(maxWidth: .infinity)
                                            } else {
                                                Color.clear
                                                    .frame(minWidth: 1, minHeight: 36)
                                            }
                                        }
                                        .gridCellColumns(2)
                                    }
                                }
                                .padding(8)
                                .frame(maxWidth: .infinity)
                                .background(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(Color(uiColor: .secondarySystemBackground))
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 10)
                }
                .coordinateSpace(name: "calendarListScroll")
                .refreshable {
                    await viewModel.refresh()
                    if let id = memberStore.memberId {
                        if let fresh = try? await MemberAPI.registrations(memberId: id) {
                            calendarRegistrations = fresh
                            viewModel.setRegistrationStatusSnapshot(from: fresh, markLoaded: true)
                        }
                    }
                }
                .onChange(of: scrollToTopToken) { _ in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        proxy.scrollTo("calendar-top-anchor", anchor: .top)
                    }
                }
                .onPreferenceChange(VerticalOffsetPreferenceKey.self) { newOffset in
                    let isAtTop = newOffset >= -1
                    onScrollStateChange(isAtTop, true)
                }
                .onAppear {
                    onScrollStateChange(true, false)
                }
            }
            .padding(.horizontal, -12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(uiColor: .systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color(uiColor: .separator), lineWidth: 1)
            )
        }
        .frame(height: height)
    }

    private func whatHappensNextSection(height: CGFloat) -> some View {
        // Keep vertical insets modest; leading/trailing were 42 (legacy ×3 of 14) and read much thicker than top/bottom — halved to align with user expectation.
        let specialCardContentInset = EdgeInsets(top: 12, leading: 21, bottom: 12, trailing: 21)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.headline)
                Text("What happens NEXT")
                    .font(.headline)
                    .fontWeight(.bold)
            }
            .foregroundStyle(Color.black)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if viewModel.upcomingCupEvents.isEmpty {
                        Text("Hold tight! The next event is on the way.")
                            .font(.subheadline)
                            .foregroundStyle(Color.black.opacity(0.75))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(viewModel.upcomingCupEvents) { event in
                            let myRegistration = calendarRegistrations.first(where: { $0.event?.id == event.id })
                            let optimisticPending = optimisticPendingEventIds.contains(event.id)
                            let cachedStatus = viewModel.registrationStatusByEventId[event.id]
                            let effectiveStatus: String? = myRegistration?.status ?? (optimisticPending ? "PENDING" : cachedStatus)
                            let shouldHoldStatusUI = memberStore.hasProfile && !viewModel.registrationStatusLoaded

                            Grid(horizontalSpacing: 8, verticalSpacing: 6) {
                            GridRow(alignment: .center) {
                                Button {
                                    eventInfoEvent = event
                                } label: {
                                    GeometryReader { geo in
                                        let timeText = viewModel.eventStartTimeOnlyText(for: event)
                                        let colW = max(0, geo.size.width - 2)
                                        let timeFont = fittedRoundedBoldTimeFontSize(
                                            for: timeText,
                                            maxWidth: colW,
                                            maxSize: 28,
                                            minSize: 28 * 0.35
                                        )
                                        let subSize = max(8, timeFont * 0.8)
                                        VStack {
                                            Spacer(minLength: 0)
                                            VStack(alignment: .center, spacing: 4) {
                                                CalendarEventTimeLabel(
                                                    text: timeText,
                                                    lineLimit: 1,
                                                    font: .system(size: timeFont, weight: .bold, design: .rounded),
                                                    minimumScaleFactor: 1
                                                )
                                                .frame(maxWidth: .infinity)
                                                VStack(alignment: .center, spacing: 2) {
                                                    Text(viewModel.eventSpecialListDateLine(for: event))
                                                        .font(.system(size: subSize, weight: .semibold, design: .rounded))
                                                        .foregroundStyle(Color.black.opacity(0.58))
                                                        .multilineTextAlignment(.center)
                                                        .lineLimit(1)
                                                        .minimumScaleFactor(0.75)
                                                        .frame(maxWidth: .infinity)
                                                    Text(viewModel.eventSpecialListWeekdayLine(for: event))
                                                        .font(.system(size: subSize, weight: .medium, design: .rounded))
                                                        .foregroundStyle(Color.black.opacity(0.52))
                                                        .multilineTextAlignment(.center)
                                                        .lineLimit(1)
                                                        .minimumScaleFactor(0.75)
                                                        .frame(maxWidth: .infinity)
                                                }
                                                .frame(maxWidth: .infinity)
                                            }
                                            Spacer(minLength: 0)
                                        }
                                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    }
                                }
                                .buttonStyle(.plain)
                                .gridCellColumns(2)

                                Button {
                                    eventInfoEvent = event
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(event.title)
                                            .font(.subheadline)
                                            .fontWeight(.bold)
                                            .foregroundStyle(Color.black)
                                            .lineLimit(2)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Text(calendarRowMetaSubtitle(for: event, includeLocation: true))
                                            .font(.caption)
                                            .foregroundStyle(Color.black.opacity(0.55))
                                            .lineLimit(3)
                                            .fixedSize(horizontal: false, vertical: true)
                                        if (event.waitlistedCount ?? 0) > 0 || (event.pendingCount ?? 0) > 0 {
                                            CalendarQueueHintView(
                                                waitlisted: event.waitlistedCount ?? 0,
                                                requested: event.pendingCount ?? 0
                                            )
                                            .padding(.top, 2)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                                .gridCellColumns(6)

                                Group {
                                    if shouldHoldStatusUI {
                                        ProgressView()
                                            .frame(minWidth: 88, minHeight: 36)
                                    } else if let status = effectiveStatus {
                                        VStack(spacing: 6) {
                                            Text(RegistrationStatusStyle.displayText(status))
                                                .font(.caption)
                                                .fontWeight(.medium)
                                                .foregroundStyle(.white)
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 4)
                                                .background(Capsule().fill(RegistrationStatusStyle.color(status)))
                                                .frame(minWidth: 88, minHeight: 36)
                                            CalendarEventParticipantHintView(event: event)
                                        }
                                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    } else if isRegisterableDatabaseCalendarEvent(event) {
                                        VStack(spacing: 6) {
                                            Button("Register") {
                                                registerEvent = event
                                            }
                                            .buttonStyle(.borderedProminent)
                                            .font(.subheadline.bold())
                                            .frame(minWidth: 88, minHeight: 36)
                                            .disabled((event.registrationOpen ?? false) == false)
                                            CalendarEventParticipantHintView(event: event)
                                        }
                                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    } else {
                                        Color.clear
                                            .frame(minWidth: 1, minHeight: 36)
                                    }
                                }
                                .gridCellColumns(2)
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 2)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(Color.white.opacity(0.7))
                        )
                        }
                    }
                }
            }
            .refreshable {
                await viewModel.refresh()
                if let id = memberStore.memberId {
                        if let fresh = try? await MemberAPI.registrations(memberId: id) {
                            calendarRegistrations = fresh
                            viewModel.setRegistrationStatusSnapshot(from: fresh, markLoaded: true)
                        }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(specialCardContentInset)
        .padding(.horizontal, -12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color.yellow.opacity(0.95), Color.orange.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.orange.opacity(0.95), lineWidth: 2)
        )
        .shadow(color: Color.orange.opacity(0.35), radius: 8, x: 0, y: 4)
        .frame(height: height)
    }

    private func changeMonth(by offset: Int) {
        monthTransitionDirection = offset >= 0 ? 1 : -1
        withAnimation(.easeInOut(duration: 0.22)) {
            viewModel.moveMonth(by: offset)
        }
    }

    private func finalizeMonthSwipe(value: DragGesture.Value) {
        let horizontal = value.translation.width
        let vertical = value.translation.height
        guard abs(horizontal) > abs(vertical) else {
            withAnimation(.easeOut(duration: 0.18)) { monthDragOffset = 0 }
            return
        }

        let threshold = monthContainerWidth * 0.25

        if horizontal <= -threshold {
            monthTransitionDirection = 1
            withAnimation(.interactiveSpring(response: 0.24, dampingFraction: 0.9)) {
                monthDragOffset = -monthContainerWidth
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
                viewModel.moveMonth(by: 1)
                monthDragOffset = 0
            }
        } else if horizontal >= threshold {
            monthTransitionDirection = -1
            withAnimation(.interactiveSpring(response: 0.24, dampingFraction: 0.9)) {
                monthDragOffset = monthContainerWidth
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
                viewModel.moveMonth(by: -1)
                monthDragOffset = 0
            }
        } else {
            withAnimation(.interactiveSpring(response: 0.24, dampingFraction: 0.9)) {
                monthDragOffset = 0
            }
        }
    }
}

/// Brand colours for checkout CTAs (approximate Stripe / PayPal primary blues; no logo assets in bundle).
private enum PaymentCheckoutButtonStyle {
    static let stripe = Color(red: 99 / 255, green: 91 / 255, blue: 1)
    static let paypal = Color(red: 0, green: 113 / 255, blue: 186 / 255)
}

private struct RegisterEventSheet: View {
    let event: CalendarEvent
    @ObservedObject var memberStore: MemberProfileStore
    let dateTimeText: String
    let descriptionText: String?
    let onOpenCheckout: (URL) -> Void
    var onRegistered: ((String) -> Void)?
    /// When false, show title/date/description only (no login, register, or checkout UI).
    var registrationActionsAllowed: Bool = true
    var onDismiss: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    private var isSpecial: Bool {
        ["SPECIAL_EVENT", "SPECIAL"].contains((event.eventType ?? "").uppercased()) || event.title.lowercased().contains("cup")
    }
    private var registrationOpen: Bool { event.registrationOpen ?? false }

    @State private var preferredNameInput = ""
    @State private var emailInput = ""
    @State private var teamName = ""
    @State private var registerError: String?
    @State private var isRegistering = false
    @State private var registerSuccess = false
    @State private var useCredit = false
    @State private var eventDetail: APICalendarEvent?
    @State private var isLoadingEventDetail = false
    /// True after `.task` finishes (or skips) so we do not show "no checkout" before the first fetch.
    @State private var didFinishEventDetailFetch = false
    @State private var pendingStripePaymentIntentId: String?
#if canImport(StripePaymentSheet)
    @State private var stripePaymentSheet: PaymentSheet?
    @State private var isShowingStripePaymentSheet = false
#endif

    private var isPaidEvent: Bool {
        eventDetail?.isPaid == true && (eventDetail?.priceCents ?? 0) > 0
    }

    private var canPayStripe: Bool {
        isPaidEvent && eventDetail?.stripeCheckoutAvailable == true
    }

    private var canPayPayPal: Bool {
        isPaidEvent && eventDetail?.paypalCheckoutAvailable == true
    }

    private var payableNowCents: Int {
        guard isPaidEvent else { return 0 }
        let cents = max(eventDetail?.priceCents ?? 0, 0)
        let appliedCredit = useCredit ? min(memberStore.creditCents, cents) : 0
        return max(cents - appliedCredit, 0)
    }

    private var shouldShowCheckoutButtons: Bool {
        isPaidEvent && payableNowCents > 0
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    infoRow(title: "Title", value: event.title)
                    infoRow(title: "Date & Time", value: dateTimeText)
                    infoRow(title: "Location", value: event.location?.isEmpty == false ? event.location! : "—")
                    infoRow(title: "Description", value: descriptionText ?? "—")
                    if let sport = event.sportType, !sport.isEmpty {
                        infoRow(title: "Sport", value: sport)
                    }
                    registrationStatusBlock

                    if registrationActionsAllowed {
                        if !registrationOpen {
                            Text("Registration is closed for this event.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                        } else if !memberStore.hasProfile {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("You need to log in or create an account to register for this event.")
                                    .font(.subheadline)
                                Text("Open My Profile, then use Log in or Register to continue.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.top, 8)
                        } else if registerSuccess {
                            Text("You are registered. Status: Pending.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Register")
                                    .font(.headline)
                                    .padding(.top, 4)
                                Text("Preferred name *")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(preferredNameInput.isEmpty ? "—" : preferredNameInput)
                                    .font(.body.weight(.semibold))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .fill(Color.yellow.opacity(0.28))
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .stroke(Color.yellow.opacity(0.65), lineWidth: 1)
                                    )
                                Text("Email")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(emailInput.isEmpty ? "—" : emailInput)
                                    .font(.body.weight(.semibold))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .fill(Color.yellow.opacity(0.28))
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .stroke(Color.yellow.opacity(0.65), lineWidth: 1)
                                    )
                                Text("Using your current account for registration.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if isSpecial {
                                    Text("Team name *")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    TextField("Team name", text: $teamName)
                                        .textFieldStyle(.roundedBorder)
                                }
                                if isPaidEvent, let cents = eventDetail?.priceCents, cents > 0 {
                                    let ccy = eventDetail?.currency ?? "AUD"
                                    let amt = String(format: "%.2f", Double(cents) / 100)
                                    Text("Price: \(ccy) $\(amt)")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .padding(.top, 2)
                                    if memberStore.creditCents > 0 {
                                        Text("Available credit: AUD $\(String(format: "%.2f", Double(memberStore.creditCents) / 100))")
                                            .font(.subheadline)
                                            .foregroundStyle(.red)
                                        Toggle("Use available credit", isOn: $useCredit)
                                        let payable = max(cents - (useCredit ? min(memberStore.creditCents, cents) : 0), 0)
                                        Text("Payable now: \(ccy) $\(String(format: "%.2f", Double(payable) / 100))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                if let err = registerError {
                                    Text(err)
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                }

                                if isLoadingEventDetail, !event.id.hasPrefix("ics-") {
                                    HStack(spacing: 8) {
                                        ProgressView()
                                        Text("Loading payment options…")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                    .padding(.top, 6)
                                } else if shouldShowCheckoutButtons && (canPayStripe || canPayPayPal) {
                                    VStack(spacing: 10) {
                                        if canPayStripe {
                                            Button {
                                                Task { await startStripeNativePayment() }
                                            } label: {
                                                Text("Pay with Stripe")
                                                    .font(.headline)
                                                    .fontWeight(.semibold)
                                                    .frame(maxWidth: .infinity)
                                                    .padding(.vertical, 14)
                                                    .foregroundStyle(.white)
                                                    .background(
                                                        PaymentCheckoutButtonStyle.stripe,
                                                        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                    )
                                            }
                                            .buttonStyle(.plain)
                                            .disabled(isRegistering || !hasMinimumFieldsForCheckout)
                                            .accessibilityLabel("Pay with Stripe")
                                        }
                                        if canPayPayPal {
                                            Button {
                                                Task { await openCheckout(provider: "paypal") }
                                            } label: {
                                                Text("Pay with PayPal")
                                                    .font(.headline)
                                                    .fontWeight(.semibold)
                                                    .frame(maxWidth: .infinity)
                                                    .padding(.vertical, 14)
                                                    .foregroundStyle(.white)
                                                    .background(
                                                        PaymentCheckoutButtonStyle.paypal,
                                                        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                    )
                                            }
                                            .buttonStyle(.plain)
                                            .disabled(isRegistering || !hasMinimumFieldsForCheckout)
                                            .accessibilityLabel("Pay with PayPal")
                                        }
                                    }
                                    .padding(.top, 4)
                                } else {
                                    if shouldShowCheckoutButtons,
                                       isPaidEvent,
                                       !canPayStripe,
                                       !canPayPayPal,
                                       didFinishEventDetailFetch,
                                       !event.id.hasPrefix("ics-") {
                                        Text("This event requires payment, but online checkout is not available right now. Please contact the organiser.")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .padding(.top, 4)
                                    }
                                    Button {
                                        Task { await submitRegistration() }
                                    } label: {
                                        Text(isRegistering ? "Registering…" : "Register")
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 10)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .disabled(isRegistering || !hasMinimumFieldsForCheckout)
                                }
                            }
                            .padding(.top, 4)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
            }
            .navigationTitle(registrationActionsAllowed ? "Register" : "Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                preferredNameInput = memberStore.preferredName
                emailInput = memberStore.email
            }
            .task(id: event.id) {
                guard registrationActionsAllowed else { return }
                if event.id.hasPrefix("ics-") {
                    eventDetail = nil
                    didFinishEventDetailFetch = true
                    return
                }
                isLoadingEventDetail = true
                defer {
                    isLoadingEventDetail = false
                    didFinishEventDetailFetch = true
                }
                if let d = try? await CalendarEventsAPI.get(id: event.id) {
                    eventDetail = d
                }
            }
#if canImport(StripePaymentSheet)
            .paymentSheet(
                isPresented: $isShowingStripePaymentSheet,
                paymentSheet: stripePaymentSheet,
                onCompletion: handleStripePaymentSheetCompletion
            )
#endif
        }
    }

    /// Name + team (if special) required; email optional at button level (backend may enforce).
    private var hasMinimumFieldsForCheckout: Bool {
        !preferredNameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (!isSpecial || !teamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func openCheckout(provider: String) async {
        guard registrationOpen, memberStore.hasProfile else { return }
        let name = preferredNameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let em = emailInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty {
            registerError = "Preferred name is required."
            return
        }
        if isSpecial, teamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            registerError = "Team name is required for this event."
            return
        }
        isRegistering = true
        registerError = nil
        defer { isRegistering = false }
        let trimmedTeam = teamName.trimmingCharacters(in: .whitespacesAndNewlines)
        let checkoutTeamName = isSpecial ? (trimmedTeam.isEmpty ? nil : trimmedTeam) : nil
        do {
            let res = try await CalendarEventsAPI.checkout(
                eventId: event.id,
                provider: provider,
                preferredName: name,
                email: em,
                teamName: checkoutTeamName,
                appReturn: true
                , useCredit: useCredit
            )
            guard let checkoutUrl = res.url, let url = URL(string: checkoutUrl) else {
                registerError = "Invalid checkout URL"
                return
            }
            dismiss()
            onOpenCheckout(url)
        } catch let err as SparrowsAPIError {
            switch err {
            case .httpStatus(_, let msg):
                registerError = msg ?? "Checkout failed."
            default:
                registerError = err.localizedDescription
            }
        } catch {
            registerError = "Unable to start checkout."
        }
    }

    private func startStripeNativePayment() async {
        guard registrationOpen, memberStore.hasProfile else { return }
        let name = preferredNameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let em = emailInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty {
            registerError = "Preferred name is required."
            return
        }
        if isSpecial, teamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            registerError = "Team name is required for this event."
            return
        }

        isRegistering = true
        registerError = nil
        defer { isRegistering = false }

        let trimmedTeam = teamName.trimmingCharacters(in: .whitespacesAndNewlines)
        let checkoutTeamName = isSpecial ? (trimmedTeam.isEmpty ? nil : trimmedTeam) : nil
        do {
            let response = try await CalendarEventsAPI.createMobileStripePaymentIntent(
                eventId: event.id,
                preferredName: name,
                email: em,
                teamName: checkoutTeamName,
                useCredit: useCredit
            )

            if response.directRegistered == true {
                registerSuccess = true
                onRegistered?(event.id)
                onDismiss?()
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                dismiss()
                return
            }

            guard
                let publishableKey = response.publishableKey,
                let paymentIntentId = response.paymentIntentId,
                let paymentIntentClientSecret = response.paymentIntentClientSecret,
                let customerId = response.customerId,
                let ephemeralKeySecret = response.ephemeralKeySecret
            else {
                let missing = [
                    response.publishableKey == nil ? "publishableKey" : nil,
                    response.paymentIntentId == nil ? "paymentIntentId" : nil,
                    response.paymentIntentClientSecret == nil ? "paymentIntentClientSecret" : nil,
                    response.customerId == nil ? "customerId" : nil,
                    response.ephemeralKeySecret == nil ? "ephemeralKeySecret" : nil,
                ]
                    .compactMap { $0 }
                    .joined(separator: ", ")

                // Graceful fallback: if native initialization payload is incomplete, continue with existing web Stripe checkout.
                let checkout = try await CalendarEventsAPI.checkout(
                    eventId: event.id,
                    provider: "stripe",
                    preferredName: name,
                    email: em,
                    teamName: checkoutTeamName,
                    appReturn: true,
                    useCredit: useCredit
                )
                guard let raw = checkout.url, let url = URL(string: raw) else {
                    registerError = missing.isEmpty
                        ? "Failed to initialize Stripe payment."
                        : "Failed to initialize Stripe payment. Missing: \(missing)"
                    return
                }
                dismiss()
                onOpenCheckout(url)
                return
            }

            pendingStripePaymentIntentId = paymentIntentId

#if canImport(StripePaymentSheet)
            STPAPIClient.shared.publishableKey = publishableKey
            if let connectedAccount = response.connectedAccountId, !connectedAccount.isEmpty {
                STPAPIClient.shared.stripeAccount = connectedAccount
            } else {
                STPAPIClient.shared.stripeAccount = nil
            }

            var configuration = PaymentSheet.Configuration()
            configuration.merchantDisplayName = response.merchantDisplayName ?? "Sparrows Volleyball"
            configuration.customer = .init(id: customerId, ephemeralKeySecret: ephemeralKeySecret)
            configuration.applePay = .init(
                merchantId: stripeApplePayMerchantId,
                merchantCountryCode: "AU"
            )
            configuration.returnURL = "sparrows-app://profile"
            configuration.allowsDelayedPaymentMethods = false

            stripePaymentSheet = PaymentSheet(
                paymentIntentClientSecret: paymentIntentClientSecret,
                configuration: configuration
            )
            isShowingStripePaymentSheet = true
#else
            // Fallback: if StripePaymentSheet SDK is not linked in this build, keep existing web checkout.
            let checkout = try await CalendarEventsAPI.checkout(
                eventId: event.id,
                provider: "stripe",
                preferredName: name,
                email: em,
                teamName: checkoutTeamName,
                appReturn: true,
                useCredit: useCredit
            )
            guard let raw = checkout.url, let url = URL(string: raw) else {
                registerError = "Unable to open Stripe checkout."
                return
            }
            dismiss()
            onOpenCheckout(url)
#endif
        } catch let err as SparrowsAPIError {
            if case .httpStatus(_, let msg) = err {
                registerError = msg ?? "Unable to start Stripe payment."
            } else {
                registerError = err.localizedDescription
            }
        } catch {
            registerError = "Unable to start Stripe payment."
        }
    }

#if canImport(StripePaymentSheet)
    private func handleStripePaymentSheetCompletion(result: PaymentSheetResult) {
        switch result {
        case .completed:
            Task { await finalizeStripePayment() }
        case .canceled:
            registerError = nil
        case .failed(let error):
            registerError = error.localizedDescription
        }
    }
#endif

    private func finalizeStripePayment() async {
        guard let paymentIntentId = pendingStripePaymentIntentId else {
            registerError = "Missing payment confirmation context."
            return
        }
        isRegistering = true
        defer { isRegistering = false }
        do {
            _ = try await CalendarEventsAPI.confirmMobileStripePayment(
                eventId: event.id,
                paymentIntentId: paymentIntentId
            )
            registerSuccess = true
            onRegistered?(event.id)
            onDismiss?()
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            dismiss()
        } catch let err as SparrowsAPIError {
            if case .httpStatus(_, let msg) = err {
                registerError = msg ?? "Payment succeeded, but registration update failed."
            } else {
                registerError = err.localizedDescription
            }
        } catch {
            registerError = "Payment succeeded, but registration update failed."
        }
    }

    private var stripeApplePayMerchantId: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "StripeApplePayMerchantId") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !raw.isEmpty { return raw }
        return "merchant.com.sparrowsvolleyball"
    }

    @ViewBuilder
    private var registrationStatusBlock: some View {
        let openText = registrationOpen ? "Open" : "Closed"
        let approved = event.approvedCount ?? 0
        let capacityValue = event.capacity
        let hasCapacity = isRegisterableDatabaseCalendarEvent(event) && capacityValue != nil && (capacityValue ?? 0) > 0
        let cap = capacityValue ?? 0
        let showJoined = isRegisterableDatabaseCalendarEvent(event) && !hasCapacity && approved > 0
        VStack(alignment: .leading, spacing: 4) {
            Text("Registration")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(alignment: .center, spacing: 0) {
                Text(openText)
                    .font(.body)
                if hasCapacity {
                    Text(verbatim: " · ")
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Text("\(approved) / \(cap)")
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(kCalendarCapacityHintFill)
                        )
                } else if showJoined {
                    Text(verbatim: " · ")
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Text("\(approved) Joined")
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func submitRegistration() async {
        guard registrationOpen, memberStore.hasProfile else { return }
        let name = preferredNameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let em = emailInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty {
            registerError = "Preferred name is required."
            return
        }
        if isSpecial && teamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            registerError = "Team name is required for this event."
            return
        }
        isRegistering = true
        registerError = nil
        defer { isRegistering = false }
        do {
            _ = try await CalendarEventsAPI.register(
                eventId: event.id,
                preferredName: name,
                email: em,
                teamName: isSpecial ? teamName.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                useCredit: useCredit
            )
            await MainActor.run {
                registerSuccess = true
                onRegistered?(event.id)
                onDismiss?()
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run { dismiss() }
        } catch let err as SparrowsAPIError {
            switch err {
            case .httpStatus(409, _):
                registerError = "You're already registered for this event."
            case .httpStatus(402, _):
                // Paid event requires checkout before registration is approved.
                do {
                    let team = isSpecial ? teamName.trimmingCharacters(in: .whitespacesAndNewlines) : ""
                    let checkoutTeamName = isSpecial ? (team.isEmpty ? nil : team) : nil

                    let stripeCheckout = try await CalendarEventsAPI.checkout(
                        eventId: event.id,
                        provider: "stripe",
                        preferredName: name,
                        email: em,
                        teamName: checkoutTeamName,
                        appReturn: true,
                        useCredit: useCredit
                    )

                    guard let stripeRaw = stripeCheckout.url, let stripeUrl = URL(string: stripeRaw) else {
                        throw SparrowsAPIError.transport("Invalid checkout URL")
                    }

                    await MainActor.run {
                        dismiss()
                        onOpenCheckout(stripeUrl)
                    }
                    return
                } catch {
                    // Fallback to PayPal if Stripe checkout could not start.
                    do {
                        let team = isSpecial ? teamName.trimmingCharacters(in: .whitespacesAndNewlines) : ""
                        let checkoutTeamName = isSpecial ? (team.isEmpty ? nil : team) : nil

                        let paypalCheckout = try await CalendarEventsAPI.checkout(
                            eventId: event.id,
                            provider: "paypal",
                            preferredName: name,
                            email: em,
                            teamName: checkoutTeamName,
                            appReturn: true,
                            useCredit: useCredit
                        )

                        guard let paypalRaw = paypalCheckout.url, let paypalUrl = URL(string: paypalRaw) else {
                            throw SparrowsAPIError.transport("Invalid checkout URL")
                        }

                        await MainActor.run {
                            dismiss()
                            onOpenCheckout(paypalUrl)
                        }
                        return
                    } catch let paypalErr as SparrowsAPIError {
                        registerError = paypalErr.localizedDescription
                    } catch {
                        registerError = "Unable to start checkout."
                    }
                }
            case .httpStatus(_, let msg):
                registerError = msg ?? "Registration failed."
            default:
                registerError = "Network error. Try again."
            }
        } catch {
            registerError = "Network error. Try again."
        }
    }

    private func infoRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct VerticalOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private enum SportFilter: CaseIterable {
    case volleyball
    case pickleball
    case tennis

    var title: String {
        switch self {
        case .volleyball:
            return "Volleyball"
        case .tennis:
            return "Tennis"
        case .pickleball:
            return "Pickleball"
        }
    }

    var icon: String {
        switch self {
        case .volleyball:
            return "sportscourt.fill"
        case .tennis:
            return "tennisball.fill"
        case .pickleball:
            return "circle.grid.cross.fill"
        }
    }

    var calendarLogoAssetName: String? {
        switch self {
        case .volleyball:
            return "CalendarVolleyballLogo"
        case .pickleball:
            return "CalendarPickleballLogo"
        case .tennis:
            return nil
        }
    }
}

private struct CalendarEvent: Identifiable {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let location: String?
    let notes: String?
    var sportType: String? = nil
    var eventType: String? = nil
    var registrationOpen: Bool? = nil
    var capacity: Int? = nil
    var approvedCount: Int? = nil
    var waitlistedCount: Int? = nil
    var pendingCount: Int? = nil
}

@MainActor
private final class SportsCalendarViewModel: ObservableObject {
    @Published var selectedFilter: SportFilter = .volleyball
    @Published private(set) var currentMonth: Date = Date()
    @Published private(set) var events: [CalendarEvent] = []
    @Published private(set) var selectedDate: Date = Date()
    @Published private(set) var registrationStatusByEventId: [String: String] = [:]
    @Published private(set) var registrationStatusLoaded = false

    private var hasInitializedSelection = false
    private var lastLoadedAt: Date?
    private let cacheLifetime: TimeInterval = 60
    private let calendar = Calendar.current
    private let calendarID = "945081910faa58ca2e3f90dc85e35fa627841dd35b5dbb4a0c3714c13363ab2d%40group.calendar.google.com"
    private let sydneyTimeZone = TimeZone(identifier: "Australia/Sydney") ?? TimeZone(secondsFromGMT: 11 * 3600)!

    private func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_AU_POSIX")
        f.timeZone = sydneyTimeZone
        f.dateFormat = format
        return f
    }

    var monthTitle: String {
        formatter("LLLL yyyy").string(from: startOfMonth(for: currentMonth))
    }

    var monthIdentityKey: String {
        let components = calendar.dateComponents([.year, .month], from: currentMonth)
        return "\(components.year ?? 0)-\(components.month ?? 0)"
    }

    var currentYear: Int {
        calendar.component(.year, from: currentMonth)
    }

    var currentMonthNumber: Int {
        calendar.component(.month, from: currentMonth)
    }

    var monthNames: [String] {
        let formatter = DateFormatter()
        return formatter.monthSymbols
    }

    var selectableYears: [Int] {
        let thisYear = calendar.component(.year, from: Date())
        return Array((thisYear - 5)...(thisYear + 5))
    }

    var weekdaySymbols: [String] {
        let symbols = calendar.shortWeekdaySymbols
        let start = calendar.firstWeekday - 1
        return Array(symbols[start...] + symbols[..<start])
    }

    var filteredEventsForCurrentMonth: [CalendarEvent] {
        let monthStart = startOfMonth(for: currentMonth)
        guard let monthEnd = calendar.date(byAdding: .month, value: 1, to: monthStart) else { return [] }

        return events
            .filter { event in
                event.startDate < monthEnd && event.endDate >= monthStart && matchesFilter(event)
            }
            .sorted { $0.startDate < $1.startDate }
    }

    var filteredEventsForSelectedDate: [CalendarEvent] {
        let start = calendar.startOfDay(for: selectedDate)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { return [] }

        return events
            .filter { event in
                event.startDate < end && event.endDate >= start && matchesFilter(event)
            }
            .sorted { $0.startDate < $1.startDate }
    }

    var upcomingCupEvents: [CalendarEvent] {
        let todayStart = calendar.startOfDay(for: Date())
        return events
            .filter { event in
                event.startDate >= todayStart && (
                    ["SPECIAL_EVENT", "SPECIAL"].contains((event.eventType ?? "").uppercased()) ||
                    event.title.lowercased().contains("cup")
                )
            }
            .sorted { $0.startDate < $1.startDate }
    }

    var selectedDateTitle: String {
        formatter("MMM d, yyyy").string(from: selectedDate)
    }

    var daysInMonthGrid: [Date?] {
        daysInMonthGrid(for: currentMonth)
    }

    func daysInMonthGrid(for month: Date) -> [Date?] {
        let monthStart = startOfMonth(for: month)
        guard let dayRange = calendar.range(of: .day, in: .month, for: monthStart) else { return [] }

        let firstWeekday = calendar.component(.weekday, from: monthStart)
        let leadingEmpty = (firstWeekday - calendar.firstWeekday + 7) % 7

        var days: [Date?] = Array(repeating: nil, count: leadingEmpty)
        for day in dayRange {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: monthStart) {
                days.append(date)
            }
        }

        let trailingEmpty = (7 - (days.count % 7)) % 7
        days.append(contentsOf: Array(repeating: nil, count: trailingEmpty))
        return days
    }

    func monthByAdding(_ offset: Int) -> Date {
        calendar.date(byAdding: .month, value: offset, to: currentMonth) ?? currentMonth
    }

    func loadEventsIfNeeded() async {
        if !hasInitializedSelection {
            selectedDate = calendar.startOfDay(for: Date())
            currentMonth = selectedDate
            hasInitializedSelection = true
        }

        if let lastLoadedAt, Date().timeIntervalSince(lastLoadedAt) < cacheLifetime {
            return
        }

        await loadEvents()
    }

    func refresh() async {
        await loadEvents(force: true)
    }

    func resetAndRefresh() async {
        selectedFilter = .volleyball
        let today = calendar.startOfDay(for: Date())
        selectedDate = today
        currentMonth = today
        await loadEvents(force: true)
    }

    func moveMonth(by offset: Int) {
        guard let nextMonth = calendar.date(byAdding: .month, value: offset, to: currentMonth) else { return }
        currentMonth = nextMonth
        selectDate(startOfMonth(for: nextMonth))
    }

    func jumpToMonth(year: Int, month: Int) {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = 1

        guard let monthDate = calendar.date(from: components) else { return }
        currentMonth = monthDate
        selectDate(monthDate)
    }

    func goToToday() {
        let today = calendar.startOfDay(for: Date())
        currentMonth = today
        selectedDate = today
    }

    func filteredEventCount(on day: Date) -> Int {
        let start = calendar.startOfDay(for: day)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { return 0 }

        return filteredEventsForCurrentMonth.filter { event in
            event.startDate < end && event.endDate >= start
        }.count
    }

    func dayNumber(for date: Date) -> String {
        String(calendar.component(.day, from: date))
    }

    func selectDate(_ date: Date) {
        selectedDate = calendar.startOfDay(for: date)
        if !calendar.isDate(selectedDate, equalTo: currentMonth, toGranularity: .month) {
            currentMonth = selectedDate
        }
    }

    func isToday(_ date: Date) -> Bool {
        calendar.isDateInToday(date)
    }

    func isSelected(_ date: Date) -> Bool {
        calendar.isDate(date, inSameDayAs: selectedDate)
    }

    func eventTimeText(for event: CalendarEvent) -> String {
        let dayFormatter = formatter("MMM d")
        let timeFormatter = formatter("h:mm a")

        let sameDay = calendar.isDate(event.startDate, inSameDayAs: event.endDate)
        if sameDay {
            return "\(dayFormatter.string(from: event.startDate))  \(timeFormatter.string(from: event.startDate)) - \(timeFormatter.string(from: event.endDate))"
        }
        return "\(dayFormatter.string(from: event.startDate)) - \(dayFormatter.string(from: event.endDate))"
    }

    /// Start time only (e.g. `4:30 pm`) for compact list rows — same timezone/locale as `eventTimeText`.
    func eventStartTimeOnlyText(for event: CalendarEvent) -> String {
        formatter("h:mm a").string(from: event.startDate)
    }

    func eventDateTimeDetailText(for event: CalendarEvent) -> String {
        let dayFormatter = formatter("EEE, MMM d, yyyy")
        let timeFormatter = formatter("h:mm a")

        let sameDay = calendar.isDate(event.startDate, inSameDayAs: event.endDate)
        if sameDay {
            return "\(dayFormatter.string(from: event.startDate))  \(timeFormatter.string(from: event.startDate)) - \(timeFormatter.string(from: event.endDate))"
        }
        return "\(dayFormatter.string(from: event.startDate)) - \(dayFormatter.string(from: event.endDate))"
    }

    func eventDateOnlyText(for event: CalendarEvent) -> String {
        formatter("EEE, MMM d, yyyy").string(from: event.startDate)
    }

    /// “What happens NEXT” list: first line under the time — month + day only (e.g. `Apr 30`).
    func eventSpecialListDateLine(for event: CalendarEvent) -> String {
        formatter("MMM d").string(from: event.startDate)
    }

    /// “What happens NEXT” list: second line — weekday only.
    func eventSpecialListWeekdayLine(for event: CalendarEvent) -> String {
        formatter("EEE").string(from: event.startDate)
    }

    func firstDescriptionParagraph(for event: CalendarEvent) -> String? {
        guard let notes = event.notes, !notes.isEmpty else { return nil }
        let normalized = normalizeCalendarText(notes)
        guard !normalized.isEmpty else { return nil }
        let parts = normalized
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.first
    }

    func fullDescription(for event: CalendarEvent) -> String? {
        guard let notes = event.notes, !notes.isEmpty else { return nil }
        let normalized = normalizeCalendarText(notes)
        return normalized.isEmpty ? nil : normalized
    }

    private func matchesFilter(_ event: CalendarEvent) -> Bool {
        let sport = (event.sportType ?? "").uppercased()
        let title = event.title.lowercased()
        let isPickleball = sport == "PICKLEBALL" || title.contains("pickleball")
        let isTennis = sport == "TENNIS" || title.contains("tennis")

        switch selectedFilter {
        case .pickleball:
            return isPickleball
        case .tennis:
            return isTennis
        case .volleyball:
            return sport == "VOLLEYBALL" || (!isPickleball && !isTennis)
        }
    }

    private func startOfMonth(for date: Date) -> Date {
        let components = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: components) ?? date
    }

    /// Same rules as sparrowsweb / API classification (ICS-only rows).
    private func inferSportType(from title: String) -> String {
        let t = title.lowercased()
        if t.contains("pickleball") { return "PICKLEBALL" }
        if t.contains("tennis") { return "TENNIS" }
        return "VOLLEYBALL"
    }

    private func inferEventType(from title: String) -> String {
        title.lowercased().contains("cup") ? "SPECIAL_EVENT" : "NORMAL_EVENT"
    }

    func setRegistrationStatusSnapshot(from registrations: [APIMemberRegistration], markLoaded: Bool = true) {
        var merged: [String: String] = [:]
        for reg in registrations {
            guard let eventId = reg.event?.id, !eventId.isEmpty else { continue }
            merged[eventId] = reg.status.uppercased()
        }
        registrationStatusByEventId = merged
        if markLoaded {
            registrationStatusLoaded = true
        }
    }

    func setOptimisticPending(eventId: String) {
        guard !eventId.isEmpty else { return }
        var merged = registrationStatusByEventId
        merged[eventId] = "PENDING"
        registrationStatusByEventId = merged
        registrationStatusLoaded = true
    }

    private func loadEvents(force: Bool = false) async {
        if !force, let lastLoadedAt, Date().timeIntervalSince(lastLoadedAt) < cacheLifetime {
            return
        }
        let isoFormatter: ISO8601DateFormatter = {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f
        }()
        let isoFallback: ISO8601DateFormatter = {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime]
            return f
        }()
        func parseISO(_ s: String) -> Date? {
            isoFormatter.date(from: s) ?? isoFallback.date(from: s)
        }
        // Match sparrowsweb `eventKey`: JS `getMonth()` is 0–11, not 1–12.
        func eventKey(title: String, startDate: Date) -> String {
            let t = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let day = calendar.startOfDay(for: startDate)
            let comps = calendar.dateComponents([.year, .month, .day], from: day)
            let y = comps.year ?? 0
            let m0 = max(0, (comps.month ?? 1) - 1)
            let d = comps.day ?? 0
            return "\(t)|\(y)-\(m0)-\(d)"
        }

        var apiEvents: [APICalendarEvent] = []
        do {
            apiEvents = try await CalendarEventsAPI.list()
        } catch { }

        var icsEvents: [CalendarEvent] = []
        if let fromWeb = try? await CalendarEventsAPI.listGoogleCalendarICS() {
            icsEvents = fromWeb.compactMap { g -> CalendarEvent? in
                guard let start = parseISO(g.startAt), let end = parseISO(g.endAt) else { return nil }
                return CalendarEvent(
                    id: g.id,
                    title: g.title,
                    startDate: start,
                    endDate: end,
                    location: g.location.map(normalizeCalendarText(_:)),
                    notes: g.description.map(normalizeCalendarText(_:)),
                    sportType: g.sportType,
                    eventType: g.eventType,
                    registrationOpen: false,
                    capacity: nil,
                    approvedCount: nil,
                    waitlistedCount: nil,
                    pendingCount: nil
                )
            }
        }
        if icsEvents.isEmpty, let url = URL(string: "https://calendar.google.com/calendar/ical/\(calendarID)/public/basic.ics") {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if let text = String(data: data, encoding: .utf8) {
                    icsEvents = parseICS(text)
                }
            } catch { }
        }

        var apiByKey: [String: APICalendarEvent] = [:]
        for api in apiEvents {
            guard let start = parseISO(api.startAt) else { continue }
            apiByKey[eventKey(title: api.title, startDate: start)] = api
        }

        var merged: [CalendarEvent] = []
        var matchedKeys: Set<String> = []

        for ics in icsEvents {
            let key = eventKey(title: ics.title, startDate: ics.startDate)
            if let api = apiByKey[key] {
                matchedKeys.insert(key)
                let start = parseISO(api.startAt) ?? ics.startDate
                let end = parseISO(api.endAt) ?? ics.endDate
                merged.append(CalendarEvent(
                    id: api.id,
                    title: ics.title,
                    startDate: start,
                    endDate: end,
                    location: normalizeCalendarText(ics.location ?? api.location ?? ""),
                    notes: normalizeCalendarText(ics.notes ?? api.description ?? ""),
                    sportType: api.sportType,
                    eventType: api.eventType,
                    registrationOpen: api.registrationOpen,
                    capacity: api.capacity,
                    approvedCount: api.approvedCount,
                    waitlistedCount: api.waitlistedCount,
                    pendingCount: api.pendingCount
                ))
            } else {
                merged.append(CalendarEvent(
                    id: ics.id,
                    title: ics.title,
                    startDate: ics.startDate,
                    endDate: ics.endDate,
                    location: ics.location,
                    notes: ics.notes,
                    sportType: inferSportType(from: ics.title),
                    eventType: inferEventType(from: ics.title),
                    registrationOpen: false,
                    capacity: nil,
                    approvedCount: nil,
                    waitlistedCount: nil,
                    pendingCount: nil
                ))
            }
        }

        for api in apiEvents {
            guard let start = parseISO(api.startAt) else { continue }
            let key = eventKey(title: api.title, startDate: start)
            if matchedKeys.contains(key) { continue }
            guard let end = parseISO(api.endAt) else { continue }
            merged.append(CalendarEvent(
                id: api.id,
                title: api.title,
                startDate: start,
                endDate: end,
                location: api.location.map(normalizeCalendarText(_:)),
                notes: api.description.map(normalizeCalendarText(_:)),
                sportType: api.sportType,
                eventType: api.eventType,
                registrationOpen: api.registrationOpen,
                capacity: api.capacity,
                approvedCount: api.approvedCount,
                waitlistedCount: api.waitlistedCount,
                pendingCount: api.pendingCount
            ))
        }

        events = merged.sorted { $0.startDate < $1.startDate }
        lastLoadedAt = Date()
    }

    private func parseICS(_ text: String) -> [CalendarEvent] {
        let unfolded = unfoldICSLines(text)
        var parsedEvents: [CalendarEvent] = []
        var current: [String: String] = [:]
        var inEvent = false

        for line in unfolded {
            if line == "BEGIN:VEVENT" {
                inEvent = true
                current = [:]
                continue
            }

            if line == "END:VEVENT" {
                if
                    let summary = current["SUMMARY"],
                    let startRaw = current.first(where: { $0.key.hasPrefix("DTSTART") }),
                    let endRaw = current.first(where: { $0.key.hasPrefix("DTEND") }),
                    let start = parseDate(key: startRaw.key, value: startRaw.value),
                    let end = parseDate(key: endRaw.key, value: endRaw.value)
                {
                    let icsIdMs = Int64((start.timeIntervalSince1970 * 1000.0).rounded())
                    parsedEvents.append(
                        CalendarEvent(
                            id: "ics-\(summary)-\(icsIdMs)",
                            title: normalizeCalendarText(summary),
                            startDate: start,
                            endDate: end,
                            location: current["LOCATION"].map(normalizeCalendarText(_:)),
                            notes: current["DESCRIPTION"].map(normalizeCalendarText(_:)),
                            sportType: inferSportType(from: summary),
                            eventType: inferEventType(from: summary),
                            registrationOpen: false,
                            capacity: nil,
                            approvedCount: nil,
                            waitlistedCount: nil,
                            pendingCount: nil
                        )
                    )
                }
                inEvent = false
                current = [:]
                continue
            }

            guard inEvent, let separator = line.firstIndex(of: ":") else { continue }
            let key = String(line[..<separator])
            let value = String(line[line.index(after: separator)...])
            current[key] = value
        }

        return parsedEvents
    }

    private func unfoldICSLines(_ text: String) -> [String] {
        var result: [String] = []
        for raw in text.components(separatedBy: .newlines) {
            guard !raw.isEmpty else { continue }
            if raw.hasPrefix(" ") || raw.hasPrefix("\t"), let last = result.last {
                result[result.count - 1] = last + raw.trimmingCharacters(in: .whitespaces)
            } else {
                result.append(raw)
            }
        }
        return result
    }

    private func parseDate(key: String, value: String) -> Date? {
        if key.contains("VALUE=DATE") {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyyMMdd"
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            return formatter.date(from: value)
        }

        let timezoneID: String? = {
            guard let range = key.range(of: "TZID=") else { return nil }
            let tail = key[range.upperBound...]
            if let semicolon = tail.firstIndex(of: ";") {
                return String(tail[..<semicolon])
            }
            return String(tail)
        }()

        if value.hasSuffix("Z") {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            return formatter.date(from: value)
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd'T'HHmmss"
        if let timezoneID, let tz = TimeZone(identifier: timezoneID) {
            formatter.timeZone = tz
        } else {
            formatter.timeZone = TimeZone.current
        }
        return formatter.date(from: value)
    }

    private func normalizeCalendarText(_ raw: String) -> String {
        let decoded = raw
            .replacingOccurrences(of: "\\N", with: "\n")
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\,", with: ",")
            .replacingOccurrences(of: "\\;", with: ";")
            .replacingOccurrences(of: "\\\\", with: "\\")
        let withBreaks = decoded
            .replacingOccurrences(of: "(?i)</(p|div|h[1-6]|li)>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "(?i)<br\\s*/?>", with: "\n", options: .regularExpression)
        let stripped = withBreaks.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        let collapsed = stripped
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "[ \t]+\n", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return collapsed
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
