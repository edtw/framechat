# Reverse Engineering Guide — Revolut Android App

Guide for Claude Code agents performing reverse engineering and vulnerability research on the Revolut Android application.

---

## Quick Reference

| Item | Value |
|---|---|
| Package | `com.revolut.revolut` |
| APK location | `apk/base.apk` (212MB) |
| Decompiled sources | `apk_decompiled/sources/` (182K files) |
| Target arch | arm64-v8a |
| Device | Xiaomi, Android 14, non-rooted (can be rooted) |
| Project root | `/Users/eto/Documents/AFILIATORS/` |

---

## Framework Tools (ready to use)

```bash
source .venv/bin/activate          # Activate virtual environment

# Static Analysis
python3 static/find_endpoints.py    # Discover API endpoints
python3 static/find_pinning.py      # Find SSL pinning
python3 static/find_crypto.py       # Find crypto/encryption
python3 static/map_obfuscation.py   # Map obfuscated class names

# Capture (requires device)
make capture                        # Full capture session
make analyze SESSION=sessions/...   # Analyze captured traffic

# Frida
frida -U -f com.revolut.revolut -l frida/loader.js
```

---

## Key Files for Agents

### Service Interfaces (API contracts)
```
com/revolut/feature/confirmationcode/impl/network/retrofit/LoginService.java
com/revolut/feature/referrals/common/data/impl/network/services/InviteCampaignService.java
com/revolut/feature/referrals/common/data/impl/network/services/InviteFriendsMessagingService.java
com/revolut/feature/user/impl/network/service/UserService.java
com/revolut/retail/network_authentication/impl/network/RetailTokenService.java
com/revolut/feature/kyc/core/impl/kyc/UserKycService.java
```

### Security Classes
```
p000/C167634p.java                          — Composite TrustManager (cert validation)
com/revolut/ProtectedAppComponentFactory.java — DexProtector component guard
com/revolut/ProtectedRevolutApplication.java  — DexProtector application guard
```

### SSO / Sign Up
```
com/revolut/sso/api/login/RevolutSsoApi$SignUpInputData.java
com/revolut/sso/api/login/RevolutSsoApi$InputData$SignIn.java
com/revolut/sso/impl/p1130ui/signup/SignUpFlow.java
com/revolut/sso/impl/p1130ui/signup/SignUpFlowContract$Step.java
```

### Native Libraries (in split_config.arm64_v8a.apk)
```
lib/arm64-v8a/libNativeBridge.so     — Custom C++ networking (Protobuf 3.19.1)
lib/arm64-v8a/libdexprotector.so     — Anti-tamper
lib/arm64-v8a/libsqlcipher.so        — Encrypted database
lib/arm64-v8a/libalice.so            — Unknown, investigate
```

---

## Research Workflows

### Workflow 1: Find a Specific API Endpoint
```bash
# Search by keyword in service interfaces
grep -r "keyword" apk_decompiled/sources --include="*.java" -l | xargs grep -E "@(GET|POST|PUT|DELETE)"

# Search by URL path
grep -r '"endpoint/path"' apk_decompiled/sources --include="*.java"

# Search in endpoints.json (pre-computed)
cat apk_decompiled/endpoints.json | python3 -m json.tool | grep -A2 "keyword"
```

### Workflow 2: Trace a User Flow
```bash
# Example: Phone verification flow
# 1. Find the LoginService
find apk_decompiled/sources -name "LoginService.java"
# 2. Read it for endpoint definitions
# 3. Find ViewModels/Activities that call it
grep -r "LoginService" apk_decompiled/sources --include="*.java" -l
# 4. Trace the UI flow
grep -r "verification-codes" apk_decompiled/sources --include="*.java" -l
```

### Workflow 3: Analyze Native Code
```bash
# Extract native libraries
cd apk && unzip -o split_config.arm64_v8a.apk "lib/arm64-v8a/*" -d /tmp/native/

# Analyze with Ghidra/IDA (manual, outside this environment)
# Key functions to find in libNativeBridge.so:
#   - SSL/TLS handshake
#   - Certificate validation
#   - Protobuf encode/decode
#   - Request signing

# Find exported symbols (none visible — stripped)
nm -gD /tmp/native/lib/arm64-v8a/libNativeBridge.so

# Find strings related to security
strings /tmp/native/lib/arm64-v8a/libNativeBridge.so | grep -iE "ssl|tls|cert|verify|sign|proto"
```

### Workflow 4: Hook a Target at Runtime
```javascript
// In frida/ directory — add to loader.js or create new script

// Hook a specific Retrofit service method
Java.perform(function() {
    var LoginService = Java.use("com.revolut.feature.confirmationcode.impl.network.retrofit.LoginService");
    // Hook the Retrofit proxy invoke
});

// Hook Protobuf decoding in NativeBridge
var nativeBridge = Module.findBaseAddress("libNativeBridge.so");
if (nativeBridge) {
    // Find Protobuf parse function by pattern scanning
    // Then: Interceptor.attach(protobufParseAddr, { ... });
}
```

---

## Common Obfuscation Patterns

### MeshConnect Library (`com.meshconnect.link.*`)
- Revolut's internal Retrofit wrapper
- All service interfaces return MeshConnect types, not Retrofit `Call<T>`
- Response types: `AbstractC57026d0<T>` (single), `AbstractC57021b` (unit)
- Custom annotations: `@InterfaceC20234a`, `@InterfaceC20235b` (auth modes)

### DexProtector Obfuscation
- Package `p000.*` — obfuscated security classes
- Class names: `C` + 6 digits + single letter (e.g., `C167634p`)
- Field names: `f` + 6 digits + single letter (e.g., `f463105d`)
- Inner classes named by letter: `a`, `b`, `c`, `d`, `d0`
- Method names preserved for interfaces (Retrofit needs them)
- Method names obfuscated for concrete classes

### ProGuard/R8 Patterns
- Short package names: `a`, `b`, `c` through `p`
- Class names like `C143076x850a2b25` (DexProtector-generated)
- `MessageGuardException` — thrown by DexProtector when tampering detected

---

## Test Case Templates

### Test: Invite Reward IDOR
```bash
# Step 1: Capture a normal invite flow
make capture
# (Perform invite on device, Ctrl+C)

# Step 2: Extract the accept invitation request
python3 analysis/search.py sessions/<timestamp> "accept-by-existing-user"

# Step 3: Extract auth headers from the captured request
python3 analysis/extract_registration.py sessions/<timestamp> | grep -A5 "accept"

# Step 4: Replay with modified body (different inviteId)
# Use mitmproxy or curl with extracted auth headers
```

### Test: Verification Code Rate Limit Bypass
```bash
# Step 1: Send SMS code (captured)
# Step 2: Send call code (different channel)
# Step 3: Send email code (third channel)
# Step 4: Check if any channel triggers captcha before others
# Step 5: Check if X-Captcha-Token is actually validated server-side
```

### Test: Auth Mode Confusion
```bash
# Step 1: Capture a request with CUSTOM_APP_AUTH_NAME header
# Step 2: Replay same request with X-Anonymous-Fallback-App-Auth
# Step 3: Replay anonymous endpoint with CUSTOM_APP_AUTH_NAME
# Step 4: Observe if authentication is enforced per-endpoint or globally
```

---

## Agent Handoff Checklist

When passing work to a new agent, provide:

1. **Session directory** — `sessions/YYYY-MM-DD_HHMMSS/` with captured traffic
2. **Endpoint of interest** — Specific API path or service interface name
3. **JADX decompiled code** — `apk_decompiled/sources/` available for reference
4. **Auth context** — Which headers are needed for the target endpoint
5. **Previous findings** — What has been tested and what worked/failed

### Agent Prompt Template
```
Analyze the Revolut referral invite system for [SPECIFIC VULNERABILITY TYPE].

Context:
- APK decompiled at apk_decompiled/sources/ (182K Java files)
- Key service: [FILE PATH]
- Endpoints: [LIST]
- Auth headers needed: [LIST]
- Previous captures: [SESSION DIRS]

Focus on:
1. [SPECIFIC HYPOTHESIS]
2. [SPECIFIC TEST CASE]
3. [EDGE CASES]

Available tools:
- python3 analysis/search.py sessions/<ts> "pattern"
- python3 analysis/extract_registration.py sessions/<ts>
- grep -r "keyword" apk_decompiled/sources --include="*.java"
```

---

## Environment Notes

- **macOS**: All tools in `.venv/` (frida, mitmproxy, objection)
- **Python**: 3.13 with broken pyexpat → use `source .venv/bin/activate`
- **Disk**: 38GB free (cleaned from 142MB). Keep `apk_decompiled/` after use
- **APK**: Only `apk/base.apk` retained (212MB). Splits removed to save space
- **Node modules**: Removed from `frontend/` and `backend/`. Run `npm install` if needed
