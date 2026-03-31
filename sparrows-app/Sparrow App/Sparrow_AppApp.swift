//
//  Sparrow_AppApp.swift
//  Sparrow App
//
//  Created by Joe on 7/2/2026.
//

import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
    static let sparrowsOpenAnnouncements = Notification.Name("sparrowsOpenAnnouncements")
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var orientationLock: UIInterfaceOrientationMask = .portrait

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        AppDelegate.orientationLock
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let kind = response.notification.request.content.userInfo["sparrowsNotificationType"] as? String
        if kind == "announcement" {
            NotificationCenter.default.post(name: .sparrowsOpenAnnouncements, object: nil)
        }
        completionHandler()
    }
}

enum AppOrientation {
    static func lockPortrait() {
        AppDelegate.orientationLock = .portrait
        UIDevice.current.setValue(UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
        UIViewController.attemptRotationToDeviceOrientation()
    }

    static func allowScoreboardRotation() {
        AppDelegate.orientationLock = .allButUpsideDown
        UIViewController.attemptRotationToDeviceOrientation()
    }
}

@main
struct Sparrow_AppApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
