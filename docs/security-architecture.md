# Revolut Security Architecture — Full Breakdown

Documentation of Revolut's defensive layers, detection mechanisms, and their bypass strategies for authorized security research.

---

## Security Stack Layers

```
┌────────────────────────────────────────┐
│ Layer 6: Server-Side                    │
│ SafetyNet/Play Integrity attestation    │
│ SEON behavioral analysis                │
│ Rate limiting + anomaly detection       │
├────────────────────────────────────────┤
│ Layer 5: Application — Runtime Checks   │
│ DexProtector (libdexprotector.so)       │
│ ProtectedAppComponentFactory            │
│ MessageGuardException handling          │
├────────────────────────────────────────┤
│ Layer 4: Application — Network          │
│ libNativeBridge.so native TLS           │
│ Protobuf 3.19.1 serialization           │
│ Custom auth header scheme               │
├────────────────────────────────────────┤
│ Layer 3: Application — HTTP             │
│ OkHttp CertificatePinner (DEFAULT only) │
│ Composite TrustManager (p000/C167634p)  │
│ hCaptcha integration                    │
├────────────────────────────────────────┤
│ Layer 2: Application — Data             │
│ SQLCipher encrypted local DB            │
│ Encrypted SharedPreferences             │
│ ProGuard/R8 code obfuscation            │
├────────────────────────────────────────┤
│ Layer 1: Platform                       │
│ Android Keystore (hardware-backed)      │
│ Android verified boot (dm-verity)       │
│ SELinux enforcing                       │
└────────────────────────────────────────┘
```

---

## Layer 1: Platform Security

### Android Verified Boot
- Ensures system partition integrity
- Any modification to /system triggers boot warnings
- **Bypass**: Magisk Delta performs systemless root — no /system modification
- **Bypass**: AVBv2 custom signing with self-generated keys (unlocked bootloader)

### SELinux
- Enforcing mode on production devices
- Restricts frida-server from certain operations
- **Bypass**: Run frida-server in permissive domain (`/data/local/tmp/`)
- **Bypass**: Magisk policies can grant additional permissions

### Android Keystore
- Hardware-backed key storage (TEE)
- Used for biometric auth and token encryption
- Cannot extract keys from TEE
- **Research**: Hook Keystore usage at the Java layer to capture data before encryption

---

## Layer 2: Data Security

### SQLCipher (libsqlcipher.so — 4.9MB)
- Full-database AES-256 encryption
- Key derived from user authentication
- **Research**: Hook `SQLCipherUtils.getWritableDatabase()` to capture the encryption key
- **Research**: Hook `net.sqlcipher.database.SQLiteDatabase.rawQuery()` to capture queries and results

### Encrypted SharedPreferences
- AndroidX Security `EncryptedSharedPreferences`
- Uses Android Keystore for key wrapping
- **Research**: Hook `SharedPreferences.getString()` after decryption

### ProGuard/R8 Obfuscation
- Classes in `p000.*` are heavily obfuscated
- Method names, field names, and control flow are mangled
- DexProtector adds additional string encryption
- **Bypass**: jadx `--deobf` flag recovers some names
- **Bypass**: Runtime Frida hooks don't depend on compile-time names

---

## Layer 3: HTTP Security

### OkHttp CertificatePinner
- Only `CertificatePinner.DEFAULT` used — NO custom pins
- This means the Java layer DOES NOT implement certificate pinning
- All standard OkHttp traffic would be interceptable IF native layer doesn't override
- **Bypass**: Our `ssl_bypass.js` JSSE hooks work here

### Composite TrustManager (p000/C167634p)
```java
// Obfuscated custom TrustManager
class C167634p implements X509TrustManager {
    X509TrustManager systemTM;   // System certs from TrustManagerFactory
    X509TrustManager customTM;   // Custom certs from empty KeyStore
    
    checkServerTrusted(chain, authType) {
        try { systemTM.checkServerTrusted(chain, authType); }
        catch { customTM.checkServerTrusted(chain, authType); }  // FALLBACK!
    }
}
```
- **Purpose**: Allows the app to trust custom certificates in addition to system certs
- **Fallback pattern**: If system validation fails, custom TM tries (trusts everything)
- This is likely used for development/staging environments
- **Risk**: In production, the customTM fallback could allow MITM if system TM is bypassed
- **Bypass**: Our `ssl_bypass.js` hook on `SSLContext.init()` replaces the TM array BEFORE this composite is created

### hCaptcha
- Used on verification code endpoints (`X-Captcha-Token` header)
- Triggered by rate limiting or suspicious behavior
- **Research**: Test if captcha is server-validated or client-only
- **Research**: Check if captcha-free auth paths exist (anonymous fallback)

---

## Layer 4: Native Network Layer

### libNativeBridge.so (7.9MB)
- Custom C++ networking library
- Uses Protobuf 3.19.1 for message serialization
- ALL symbols hidden (`-fvisibility=hidden`)
- Built with NDK 18.1 + clang 14.0.7

**Key capabilities (inferred)**:
- Protobuf message encoding/decoding (replaces JSON for internal APIs)
- Custom HTTP/2 or gRPC client (no curl/OkHttp strings found)
- Certificate/public key pinning (no Java-side pinning → it's here)
- Request signing (prevent MITM even without pinning)
- Response verification

**Bypass Strategy**:
1. **Static approach**: Reverse engineer libNativeBridge.so with Ghidra/IDA
   - Find SSL/TLS functions via symbol cross-references
   - Identify certificate validation logic
   - Patch the binary to skip validation
2. **Dynamic approach**: Frida `Interceptor.attach` on native functions
   - Hook `SSL_set_verify`, `SSL_CTX_set_verify`, or equivalent
   - Hook `X509_verify_cert` to return success
   - Hook Protobuf parse/serialize functions to capture plaintext

### Protobuf Message Format
- Messages are binary, not human-readable
- Schema (.proto files) must be extracted to decode captured traffic
- **Recovery**: Protobuf compilers embed field descriptors — extract from libNativeBridge.so
- **Recovery**: Java Protobuf classes may contain `descriptor` static fields

---

## Layer 5: Runtime Protection

### DexProtector (libdexprotector.so — 378KB)
Commercial anti-tamper product. Detects:
- Root access (su binary, Magisk, SuperSU)
- Frida / Xposed / Substrate frameworks
- Debuggers (ptrace, JDWP)
- Emulators (build.prop, hardware characteristics)
- APK modification (signature check, DEX integrity)

**Detection Techniques (inferred from industry knowledge)**:
```
File checks:      /system/bin/su, /sbin/magisk, /data/local/tmp/frida-server
Port scans:       :27042 (Frida default), :27043
Process checks:   frida-server, magiskd, xposed
/proc checks:     /proc/self/maps for frida-agent, magisk
APK integrity:    Signature check, DEX CRC
Debug checks:     ptrace attach, JDWP port open
```

### ProtectedAppComponentFactory
- Wraps Android's `AppComponentFactory`
- Intercepts component instantiation (Activities, Services, etc.)
- Can prevent Frida from spawning the app with `-f` flag
- **Bypass**: Use `frida -n` (attach to running process) instead of `-f` (spawn)
- **Bypass**: Hook `ProtectedAppComponentFactory.instantiateActivity()` to remove wrapping

### ProtectedRevolutApplication
- Wraps the Application class
- Can detect Xposed modules loaded at app startup
- **Bypass**: Install Frida hooks AFTER application initialization (delayed attach)

---

## Layer 6: Server-Side

### SafetyNet / Play Integrity
- Attestation API checks device integrity
- Server receives attestation token and verifies with Google
- **Bypass**: Hook `SafetyNetClient.attest()` to cancel call (returns cancelled task)
- **Bypass**: Use device that passes SafetyNet natively (non-rooted stock ROM)
- **Limitation**: Server-side attestation verification cannot be bypassed from client

### SEON Behavioral Analysis
- SEON SDK collects 1000+ device parameters
- Sent to SEON servers for fraud scoring
- `android-devices.db` (1.6MB) maps device characteristics to known models
- **Bypass**: Use a real device (not emulator) — fingerprint matches expected values
- **Bypass**: Hook SEON data collection to spoof specific parameters

### Rate Limiting
- hCaptcha triggers on suspicious patterns
- Server-side rate limits per IP, device ID, phone number
- **Bypass**: Rotate between verification channels (SMS/call/email)
- **Bypass**: Test if different auth headers bypass rate limits differently

---

## Defense-in-Depth Summary

| Attack | Blocked By | Bypass Difficulty |
|---|---|---|
| MITM (Java TLS) | libNativeBridge native TLS | Hard — requires native hooking |
| MITM + cert replacement | Native cert pinning + DexProtector integrity | Hard |
| APK repackaging | DexProtector signature check | Hard |
| Frida injection | DexProtector runtime detection | Medium — rename + hide |
| Root detection | DexProtector + SafetyNet | Medium — Magisk Delta + Shamiko |
| Emulator | SEON device fingerprinting | Hard — use real device |
| API replay | Timestamps, nonces, request signing | Unknown — need traffic capture |
| IDOR | Server-side authorization checks | Depends on implementation |
| Token theft | Hardware-backed Keystore | Very Hard |
