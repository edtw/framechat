# Revolut — Attack Vectors & Business Logic Flaws

This document catalogs attack vectors identified through static analysis of the Revolut Android APK (v2026). Organized by risk category.

---

## 1. Referral / Invite System

### 1.1 Campaign Version Confusion
**Severity**: Medium | **Type**: Business Logic

v3 and v4 invite endpoints coexist with different parameter schemas.
```
GET inviteCampaigns/inviteHistory/v3?type=X&campaignType=Y&inviteState=Z&sortBy=W
GET inviteCampaigns/inviteHistory/v4?redesigned=true&campaignType=Y
```
**Vector**: Call v3 with invalid states, or v4 with v3 parameters. Different validation rules may allow bypassing invite count limits.

### 1.2 Invitee Status Race Condition
**Severity**: High | **Type**: TOCTOU Race

Invitee status is checked by the *inviter* via `inviteCampaigns/inviteeStatus`. The invitee's actions (KYC, top-up, trade) trigger state transitions on the server. If action completion and state check are not atomic:
```
T1: Invitee completes KYC (triggers state change)
T2: Inviter polls inviteeStatus (reads intermediate state)
T3: Reward is credited based on read-at-T2 state
```
**Vector**: Time the invitee's final action to coincide with reward calculation window.

### 1.3 Existing User Invitation
**Severity**: High | **Type**: Authorization

`POST v2/invitation/accept-by-existing-user` allows already-registered users to accept invitations.
**Questions**:
- Can a user accept their own invite (self-referral)?
- Can A invite B, then B invites A (circular)?
- Is there a time-based cooldown between accepting invites?
- What validation links the inviter-invitee relationship?

**Vector**: Self-referral or circular referral chains to farm rewards.

### 1.4 Reward Reveal Timing Attack
**Severity**: Medium | **Type**: Business Logic

`POST inviteCampaigns/inviteHistory/{inviteId}/revealReward` is a manual action separate from reward calculation. If the reward value is determined at reveal-time rather than invite-time:
```
T1: Complete invite during "€50 bonus" promo
T2: Wait for promo to change
T3: Reveal reward during "€100 bonus" promo → get €100?
```
**Vector**: Time-of-reveal vs time-of-completion reward determination.

### 1.5 Invite ID Enumeration
**Severity**: Critical | **Type**: IDOR

`POST inviteCampaigns/inviteHistory/{inviteId}/revealReward` accepts only `inviteId` in the path. If inviteId is sequential or predictable:
**Vector**: Enumerate inviteIds to reveal/claim rewards belonging to other users.

### 1.6 Pre-KYC Invite Acceptance
**Severity**: Medium | **Type**: Business Logic

If invitation can be accepted before KYC completion, the invitee's identity is not yet verified. This could enable:
- Mass account creation for invite farming
- Accepting invites with fake/unverified identities
- The invitee completing KYC with different details than the invite claimed

---

## 2. Authentication & Account Creation

### 2.1 Auth Mode Confusion
**Severity**: High | **Type**: Authorization

Three auth header modes toggle different behavior:
```
X-Anonymous-Fallback-App-Auth: true    ← Pre-auth / anonymous
CUSTOM_APP_AUTH_NAME: true             ← Standard authenticated
X-Force-App-Auth: true                 ← Force re-authentication
```
**Vector**: Mix auth modes across endpoints. Call authenticated endpoints with anonymous headers. Call anonymous endpoints with authenticated headers. Test if auth mode downgrade is possible.

### 2.2 Phone Verification Channel Enumeration
**Severity**: Low | **Type**: Information Disclosure

`GET verification-codes/channels?phone={phone}` returns available verification methods.
**Vector**: Enumerate phone numbers to check if they have Revolut accounts (response differs for registered vs unregistered numbers).

### 2.3 Verification Code Brute-Force
**Severity**: High | **Type**: Rate Limiting

Multiple endpoints for sending verification codes:
- SMS: `POST verification-codes/sms`
- Call: `POST verification-codes/call`
- Email: `POST verification-codes/email`

**Vector**: Rotate between channels to bypass per-channel rate limits. hCaptcha (`X-Captcha-Token`) may be the only protection — test if captcha can be bypassed or if it's only enforced on specific channels.

### 2.4 Token Type Injection
**Severity**: Critical | **Type**: Privilege Escalation

`POST token` with `X-Token-Type: {type}` header suggests scoped tokens.
**Vector**: Test different token type values to obtain tokens with elevated privileges. Check if token types are enumerable.

### 2.5 Auth Token Refresh Without Validation
**Severity**: High | **Type**: Authentication

`PUT token` can be called with either `CUSTOM_APP_AUTH_NAME` (standard) or `X-Force-App-Auth` (force re-auth):
**Vector**: Attempt token refresh with expired/invalidated tokens. Test if force-re-auth skips validation checks.

---

## 3. User Profile Manipulation

### 3.1 SSN/ITIN Bypass
**Severity**: High | **Type**: Validation

`PATCH user/current` accepts `X-Skip-SSN-ITIN: true` header.
**Vector**: Skip tax ID validation during profile updates. This may enable creating accounts without proper identity verification.

### 3.2 Username/Email Validation as Oracle
**Severity**: Low | **Type**: Information Disclosure

```
POST user/current/username/validate
POST user/current/email/validate
```
**Vector**: Use validation endpoints to enumerate existing usernames/emails (user enumeration oracle).

### 3.3 Phone Confirmation Without Standard Headers
**Severity**: Medium | **Type**: Authorization

`POST user/current/phone/confirm` has two overloads — one with `CUSTOM_APP_AUTH_NAME` and one without (standard headers).
**Vector**: Call the non-auth-header version to confirm phone changes without proper authentication.

---

## 4. KYC / Identity Verification Bypass

### 4.1 Third-Party SDK Attack Surface
**Severity**: Varies | **Type**: Supply Chain

Multiple KYC SDKs integrated:
- Onfido (`com.onfido.android.sdk.*`)
- Fourthline (`com.fourthline.*`)
- InCode (`com.incode.recogkit.*`)
- Trustdock (`native-app-sdk-api.trustdock-ekyc.com`)

**Vectors**:
- Each SDK has its own API endpoints — test those directly
- SDK responses may be intercepted/modified at the Java layer before reaching Revolut's servers
- Onfido SDK uses biometric authentication (`biometrics/authenticate`) — test replay attacks

### 4.2 KYC Re-evaluation Bypass
**Severity**: Medium | **Type**: Business Logic

`GET trading/users/current/kyc` checks KYC status.
**Vector**: If KYC result is cached server-side, complete KYC on one account and attempt to link result to another account.

---

## 5. Payment & Financial Operations

### 5.1 Payment Authorization Amendment
**Severity**: Critical | **Type**: Authorization

`POST /payments/authorisations/{authorisationId}` — amend payment authorizations.
**Vector**: Test if amendment can increase authorization amount, change recipient, or bypass approval.

### 5.2 Order Token Manipulation
**Severity**: High | **Type**: IDOR

```
rev-payment/token/{orderToken}/delivery-method
rev-payment/token/{orderToken}/shipping-contact
```
**Vector**: Enumerate order tokens to access/modify other users' orders.

---

## 6. Infrastructure / Networking

### 6.1 Protobuf Deserialization
**Severity**: Medium | **Type**: Injection

NativeBridge uses Protobuf 3.19.1 for serialization. Protobuf is generally safe against deserialization attacks, but older versions may have vulnerabilities.
**Vector**: Send malformed protobuf payloads to trigger crashes or unexpected behavior.

### 6.2 Native Bridge Bypass
**Severity**: High | **Type**: Implementation

libNativeBridge.so handles network calls with hidden symbols. If native code implements its own certificate validation separately from Java:
**Vector**: MITM attack on native-layer TLS by hooking native functions directly (Frida `Interceptor.attach` on libNativeBridge.so SSL functions).

---

## 7. Device Integrity / Anti-Tamper Evasion

### 7.1 DexProtector Detection Evasion
**Severity**: N/A (defensive) | **Type**: Security Control

DexProtector (libdexprotector.so) detects root, Frida, debugging.
**Bypass vectors (for research)**:
- Hook `ProtectedAppComponentFactory` to return clean components
- Hook `ProtectedRevolutApplication` to skip integrity checks
- Patch libdexprotector.so to no-op its detection functions
- Use Magisk Delta + Shamiko + renamed frida-server

### 7.2 SEON Device Fingerprint Bypass
**Severity**: N/A | **Type**: Security Control

SEON SDK (split_feature_seon_sdk_retail.apk) contains 1.6MB device database.
**Bypass vectors**:
- Hook SEON data collection methods to return spoofed values
- Block SEON API calls at the network level (api.cb-device-intelligence.com)
- Spoof device characteristics via Frida hooks on Build/SystemProperties

---

## Priority Testing Order

1. **IDOR on revealReward** (1.5) — If inviteId is predictable, direct reward theft
2. **Existing user invitation** (1.3) — Self-referral/circular chains for reward farming
3. **Token type injection** (2.4) — Privilege escalation via scoped tokens
4. **Auth mode confusion** (2.1) — Mixed auth mode attacks
5. **Race condition on invitee status** (1.2) — TOCTOU for double rewards
6. **SSN/ITIN bypass** (3.1) — Identity verification bypass
7. **KYC re-evaluation bypass** (4.2) — Account verification linking
