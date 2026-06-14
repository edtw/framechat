# Revolut APK — Static Analysis Full Report

**APK**: com.revolut.revolut (Android 14, arm64-v8a, Xiaomi)
**Date**: 2026-06-03
**Files decompiled**: 182,513 Java source files from base.apk (212MB)

---

## 1. Package Structure

```
com.revolut.*                    — Main application code
com.meshconnect.link.*           — Internal networking/RPC framework (Retrofit wrapper)
com.onfido.android.sdk.*         — Onfido KYC SDK
com.fourthline.*                 — Fourthline KYC SDK
com.incode.*                     — InCode face/document recognition
io.seon.*                        — SEON fraud detection
com.twilio.*                     — Twilio voice calls
com.stripe.*                     — Stripe payments
com.plaid.*                      — Plaid bank linking
com.hcaptcha.*                   — hCaptcha bot protection
com.appsflyer.*                  — AppsFlyer attribution
com.google.firebase.*            — Firebase (analytics, remote config, crashlytics)
com.google.android.gms.*         — Google Play Services (SafetyNet, etc.)
p000.*                           — Obfuscated custom security classes (DexProtector)
```

## 2. Native Libraries (arm64-v8a)

| Library | Size | Purpose | Security Relevance |
|---|---|---|---|
| libNativeBridge.so | 7.9MB | C++ core: Protobuf 3.19.1 serialization, business logic | **Custom HTTP/TLS stack possible** — symbols hidden |
| libdexprotector.so | 378KB | DexProtector commercial anti-tamper | **Detects root, Frida, Xposed, emulator, APK mods** |
| libsqlcipher.so | 4.9MB | SQLCipher encrypted database | User data encrypted at rest |
| libopencv_java4.so | 9.8MB | OpenCV computer vision | KYC document analysis |
| libtensorflowlite_jni.so | 4.1MB | TensorFlow Lite | ML-based fraud/face detection |
| libmediapipe_tasks_vision_jni.so | 14MB | Google MediaPipe | KYC face/liveness verification |
| libalice.so | 472KB | Unknown — possible internal codename | Investigate |
| libfilament-jni.so + related | 7.7MB total | Filament 3D rendering | Possibly AR features |

### Build Details (from NativeBridge symbols)
- NDK: 18.1.5063045 + clang 14.0.7 (hybrid build)
- Standard: C++11
- Protobuf: 3.19.1
- Visibility: `-fvisibility=hidden` (all symbols stripped)
- Obfuscation: DexProtector string encryption + control flow

## 3. SSL / Certificate Pinning

### Finding: NO Java-level pinning
- 0 pinned certificate hashes found
- 0 pinned domains in OkHttp CertificatePinner
- Only standard OkHttp `CertificatePinner.DEFAULT` used in Java layer

### Native-level pinning (libNativeBridge.so)
- All networking symbols hidden (`-fvisibility=hidden`)
- No HTTP/curl strings visible (custom implementation)
- Pinning is entirely implemented in native C++ code
- This means our `ssl_bypass.js` JSSE hooks will work for Java-layer TLS, but native calls may bypass JSSE entirely

### Custom TrustManager
- `p000/C167634p.java` — Composite TrustManager
  - System certs (TrustManagerFactory default)
  - Custom certs (empty KeyStore)
  - Falls back to custom if system check fails
  - This allows the app to trust certificates loaded dynamically

## 4. Code Obfuscation

- **ProGuard/R8**: Heavy obfuscation, especially in `p000.*` package
- **DexProtector**: Commercial obfuscation + anti-tamper
  - `ProtectedAppComponentFactory` — wraps Android component instantiation
  - `ProtectedRevolutApplication` — wrapped Application class
  - `MessageGuardException` — anti-tamper exception type
- **MeshConnect**: Internal library wraps Retrofit with custom serialization (Gson + Protobuf)

## 5. Key Service Interfaces Found

| Service | Purpose | File |
|---|---|---|
| LoginService | Verification codes (SMS/call/email) | `com/revolut/feature/confirmationcode/.../LoginService.java` |
| InviteCampaignService | Referral campaigns + invites | `com/revolut/feature/referrals/.../InviteCampaignService.java` |
| InviteFriendsMessagingService | Invite messaging | `com/revolut/feature/referrals/.../InviteFriendsMessagingService.java` |
| UserService | User profile management | `com/revolut/feature/user/.../UserService.java` |
| RetailTokenService | Auth token operations | `com/revolut/retail/network_authentication/.../RetailTokenService.java` |
| UserKycService | KYC verification | `com/revolut/feature/kyc/.../UserKycService.java` |
| BiometricVerificationService | Biometric auth | `com/revolut/biometric_verification/.../BiometricVerificationService.java` |

## 6. API Base Domains

```
api.revolut.com          — Main API
sso.revolut.com          — SSO / Authentication
oba.revolut.com          — Online Banking Authentication
checkout.revolut.com     — Payment checkout
chat.revolut.com         — In-app chat
exchange.revolut.com     — Currency exchange
trade.revolut.com        — Stock/crypto trading
merchant.revolut.com     — Merchant services
pos.revolut.com          — Point of sale
revolut.codes            — Alternate domain (multiple subdomains)
```

## 7. Third-Party Integration Points

| Provider | Purpose | Detection Technique |
|---|---|---|
| Onfido | KYC document + face verification | `com.onfido.android.sdk.*` |
| Fourthline | KYC compliance (EU-focused) | `com.fourthline.*` |
| Trustdock | eKYC identity verification | `native-app-sdk-api.trustdock-ekyc.com` |
| InCode | Face/document recognition SDK | `com.incode.recogkit.*` (6.7MB split) |
| SEON | Device fingerprinting + fraud | `io.seon.*` (1.6MB device DB) |
| CB Device Intelligence | Device intelligence | `api.cb-device-intelligence.com` |
| hCaptcha | Bot/human verification | `X-Captcha-Token` header |
| Credolab | Credit scoring | `scoring-eu.credolab.com` |
| Plaid | Bank account linking | `cdn.plaid.com` |
| Stripe | Payment processing | `js.stripe.com`, `m.stripe.network` |
