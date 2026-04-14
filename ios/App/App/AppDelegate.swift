import UIKit
import Capacitor
import Firebase
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?

    let supabaseUrl  = "https://afwvsrjbaxutfonmmxjd.supabase.co"
    // Paste your anon key below (same as VITE_SUPABASE_ANON_KEY in your .env)
    let supabaseAnon = "YOUR_SUPABASE_ANON_KEY"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        print("[FCM] APNs device token received, length: \(deviceToken.count)")
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                print("[FCM] Error fetching FCM token: \(error.localizedDescription)")
            } else if let token = token {
                print("[FCM] FCM token fetched: \(token.prefix(30))...")
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[FCM] Failed to register: \(error.localizedDescription)")
    }

    // Called by Firebase when FCM token is available or refreshed
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        print("[FCM] MessagingDelegate token received: \(token.prefix(30))...")

        if let accessToken = getSupabaseAccessToken() {
            saveFcmToken(token: token, accessToken: accessToken)
        } else {
            print("[FCM] No Supabase session yet — storing token for later")
            UserDefaults.standard.set(token, forKey: "pendingFcmToken")
        }
    }

    private func getSupabaseAccessToken() -> String? {
        let key = "sb-afwvsrjbaxutfonmmxjd-auth-token"
        if let data = UserDefaults.standard.string(forKey: key),
           let jsonData = data.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
           let accessToken = json["access_token"] as? String {
            return accessToken
        }
        return nil
    }

    private func saveFcmToken(token: String, accessToken: String) {
        guard let url = URL(string: "\(supabaseUrl)/rest/v1/fcm_tokens") else { return }
        guard let userId = getUserIdFromJWT(accessToken) else {
            print("[FCM] Could not decode user ID from JWT")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(supabaseAnon, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")

        let body: [String: Any] = [
            "user_id": userId,
            "token": token,
            "platform": "ios",
            "updated_at": ISO8601DateFormatter().string(from: Date())
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[FCM] Failed to save token: \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse {
                print("[FCM] Token saved, status: \(http.statusCode)")
            }
        }.resume()
    }

    private func getUserIdFromJWT(_ token: String) -> String? {
        let parts = token.components(separatedBy: ".")
        guard parts.count == 3 else { return nil }
        var base64 = parts[1]
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder > 0 { base64 += String(repeating: "=", count: 4 - remainder) }
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = json["sub"] as? String else { return nil }
        return sub
    }
}