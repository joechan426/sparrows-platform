//
//  Sparrow_AppApp.swift
//  Sparrow App
//
//  Created by Joe on 7/2/2026.
//

import SwiftUI
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    static var orientationLock: UIInterfaceOrientationMask = .portrait

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        AppDelegate.orientationLock
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
