import UIKit
import Capacitor
import Firebase
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?

    // ── Supabase config ────────────────────────────────────────
    // supabaseAnon: paste your anon key (the long eyJ... string from
    // Supabase dashboard → Settings → API → anon/public key)
    let supabaseUrl  = "https://afwvsrjbaxutfonmmxjd.supabase.co"
    let supabaseAnon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmd3ZzcmpiYXh1dGZvbm1teGpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTI0NTIsImV4cCI6MjA4OTU4ODQ1Mn0.HkOFceoIDLdtgMjWHC0NFhPz3vXFBDdAbu_98Kqgcek"
    // ──────────────────────────────────────────────────────────

    // How long to keep retrying if no session found yet (seconds)
    private let retryDuration: TimeInterval = 30
    private let retryInterval: TimeInterval = 2
    private var retryTimer: Timer?
    private var retryStart: Date?

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

    // APNs token → hand to Firebase so it can exchange for FCM token
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        print("[FCM] APNs device token received, length: \(deviceToken.count)")
        Messaging.messaging().apnsToken = deviceToken
        print("[FCM] APNs token handed to Firebase Messaging")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[FCM] Failed to register for remote notifications: \(error.localizedDescription)")
    }

    // ── Firebase calls this when the FCM token is ready or refreshed ──
    // This is the ONLY reliable place to get the real FCM token on iOS.
    // fcmManager.js registration event gives an APNs token, not FCM — ignore it for saving.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else {
            print("[FCM] MessagingDelegate called with nil token")
            return
        }
        print("[FCM] Real FCM token received: \(token.prefix(30))...")

        // Try to save immediately if a session exists
        if let accessToken = getSupabaseAccessToken() {
            print("[FCM] Session found — saving token now")
            stopRetryTimer()
            saveFcmToken(token: token, accessToken: accessToken)
        } else {
            // No session yet (app launched before login) — store and retry
            print("[FCM] No session yet — storing token and starting retry loop")
            UserDefaults.standard.set(token, forKey: "pendingFcmToken")
            startRetryTimer()
        }
    }

    // ── Retry loop: called by JS bridge after login completes ──
    // AppShell calls window.webkit.messageHandlers.flushPendingFcmToken.postMessage('')
    // after the Supabase session is established. See fcmManager.js for the call site.
    private func startRetryTimer() {
        stopRetryTimer()
        retryStart = Date()
        retryTimer = Timer.scheduledTimer(withTimeInterval: retryInterval, repeats: true) { [weak self] _ in
            self?.attemptPendingTokenSave()
        }
    }

    private func stopRetryTimer() {
        retryTimer?.invalidate()
        retryTimer = nil
        retryStart = nil
    }

    private func attemptPendingTokenSave() {
        // Give up after retryDuration seconds
        if let start = retryStart, Date().timeIntervalSince(start) > retryDuration {
            print("[FCM] Retry timeout — giving up on pending token save")
            stopRetryTimer()
            return
        }

        guard let token = UserDefaults.standard.string(forKey: "pendingFcmToken") else {
            print("[FCM] No pending token in UserDefaults — stopping retry")
            stopRetryTimer()
            return
        }

        guard let accessToken = getSupabaseAccessToken() else {
            print("[FCM] Retry: still no session")
            return
        }

        print("[FCM] Retry: session now available — saving token")
        stopRetryTimer()
        UserDefaults.standard.removeObject(forKey: "pendingFcmToken")
        saveFcmToken(token: token, accessToken: accessToken)
    }

    // ── Read Supabase session from UserDefaults ────────────────
    // Supabase JS stores the session under a key like:
    //   sb-<project-ref>-auth-token
    // The value is a JSON string with access_token inside.
    private func getSupabaseAccessToken() -> String? {
        let key = "sb-afwvsrjbaxutfonmmxjd-auth-token"

        // Try direct string (older Supabase JS versions)
        if let raw = UserDefaults.standard.string(forKey: key),
           let data = raw.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = json["access_token"] as? String {
            return token
        }

        // Try Data (some Capacitor builds store it differently)
        if let data = UserDefaults.standard.data(forKey: key),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = json["access_token"] as? String {
            return token
        }

        return nil
    }

    // ── Save FCM token to Supabase via REST upsert ─────────────
    private func saveFcmToken(token: String, accessToken: String) {
        guard let userId = getUserIdFromJWT(accessToken) else {
            print("[FCM] Could not decode user ID from JWT — not saving token")
            return
        }

        guard let url = URL(string: "\(supabaseUrl)/rest/v1/fcm_tokens") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(supabaseAnon, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        // Upsert: if a row with (user_id, platform) already exists, update it
        request.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")

        let body: [String: Any] = [
            "user_id":    userId,
            "token":      token,
            "platform":   "ios",
            "updated_at": ISO8601DateFormatter().string(from: Date())
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[FCM] Failed to save token to Supabase: \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse {
                if http.statusCode == 200 || http.statusCode == 201 {
                    print("[FCM] ✅ Token saved to Supabase — status \(http.statusCode)")
                } else {
                    let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    print("[FCM] ⚠️ Unexpected status \(http.statusCode): \(body)")
                }
            }
        }.resume()
    }

    // ── Decode user ID from JWT payload ───────────────────────
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
              let sub  = json["sub"] as? String else { return nil }
        return sub
    }
}