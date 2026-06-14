# Revolut API Surface — Full Endpoint Catalog

Extracted from 182,513 decompiled Java source files. All endpoints are relative to the base domain (api.revolut.com unless otherwise noted).

---

## Authentication Flow

### Phone Verification (LoginService.java)
```
GET  verification-codes/channels?phone={phone}
     Headers: X-Anonymous-Fallback-App-Auth: true | CUSTOM_APP_AUTH_NAME: true
     Response: List<Channel> — available verification methods (SMS, call, email)
     Note: Two overloads: anonymous (pre-auth) and authenticated (post-login)

POST verification-codes/sms
     Headers: X-Anonymous-Fallback-App-Auth: true | CUSTOM_APP_AUTH_NAME: true
     Optional: X-Captcha-Token (hCaptcha)
     Body: ResendRequestDto

POST verification-codes/call
     Headers: same as above
     Body: ResendRequestDto

POST verification-codes/email
     Headers: same as above
     Body: ResendRequestDto
```

### Token Management (RetailTokenService.java)
```
POST token
     Headers: X-Token-Type: {type}
     Purpose: Obtain scoped token
     Note: Requires prior authentication

PUT  token
     Headers: X-Token-Type: {type}
     Body: RefreshRequest
     Purpose: Refresh scoped token

PUT  token
     Headers: X-Force-App-Auth: true
     Body: RefreshRequest
     Purpose: Force re-authentication with full app auth
```

---

## User Management (UserService.java)

```
GET  user/current
     Response: CurrentUserDto — full user profile

PATCH user/current
     Headers: X-Skip-SSN-ITIN: bool
     Body: UpdateUserRequest
     Purpose: Update user details (name, address, etc.)

POST user/current/phone/confirm
     Headers: CUSTOM_APP_AUTH_NAME: true
     Body: PhoneConfirmRequest
     Response: PhoneConfirmResult
     Note: Two overloads — with and without custom headers

POST user/current/email/code
     Body: EmailCodeRequest
     Purpose: Send verification code to email

POST user/current/email/validate
     Body: EmailValidateRequest
     Purpose: Validate email format/ownership

POST user/current/email/confirm
     Body: EmailConfirmRequest
     Purpose: Confirm email with verification code

POST user/current/username/validate
     Body: UsernameValidateRequest
     Purpose: Check username availability

POST user/password
     Body: ChangePasswordRequest
     Purpose: Set/change password

POST user/current/review/user-details/confirm
     Purpose: Acknowledge/review personal details

POST signout
     Purpose: Terminate session

GET  user/current/usernames
     Response: UsernamesDto

GET  user/current/address/geo-location
     Response: GeoLocationDto

DELETE user/current/picture
     Purpose: Remove profile picture
```

---

## Referral / Invite System (InviteCampaignService.java)

```
GET  inviteCampaigns/lastActive
     Query: campaignType, activeInvites, v (version), youthId
     Response: CampaignDto
     Purpose: Get currently active invite campaign for the user
     Note: Suspended function (Kotlin coroutine) — requires Continuation

GET  inviteCampaigns/v4/lastActive
     Query: campaignType, activeInvites
     Response: CampaignDto
     Purpose: V4 endpoint (newer) of active campaign

GET  inviteCampaigns/inviteHistory/v3
     Query: type, campaignType, redesigned (bool), inviteState (list), sortBy
     Response: InviteHistoryDto
     Purpose: Get user's invite history with filtering

GET  inviteCampaigns/inviteHistory/v4
     Query: redesigned (bool), campaignType
     Response: InviteHistoryDto
     Purpose: V4 invite history (simplified query params)

GET  inviteCampaigns/benefits
     Query: campaignType
     Response: BenefitsDto
     Purpose: Show what benefits/rewards are available for referrals

GET  inviteCampaigns/inviteeStatus
     Query: campaignType
     Response: InviteeStatusDto
     Purpose: Check status of someone you invited
     Note: Suspended function

GET  referrals/invite/{inviteId}
     Path: inviteId
     Query: redesigned (bool)
     Response: InviteDetailDto
     Purpose: Get details of a specific invite

GET  referrals/invites
     Query: campaignType, cursor, limit
     Response: PaginatedInvitesDto
     Purpose: Get paginated list of invites
     Note: Suspended function

GET  referrals/invites/summary
     Query: campaignType
     Response: InviteSummaryDto
     Purpose: Summary statistics of invites
     Note: Suspended function

GET  invites/{inviteId}/transaction-widget
     Path: inviteId
     Response: TransactionWidgetDto
     Purpose: Get transaction widget for an invite reward
     Note: Suspended function

POST v2/invitation/accept-by-existing-user
     Body: AcceptInvitationRequest
     Purpose: Accept an invitation as an existing user
     Note: Suspended function

POST inviteCampaigns/inviteHistory/{inviteId}/revealReward
     Path: inviteId
     Purpose: Reveal/claim the reward for a completed invite
```

### Invite Friends Messaging (InviteFriendsMessagingService.java)
```
POST referrals/invite/sms
     Purpose: Send invite via SMS

POST referrals/invite/email
     Purpose: Send invite via email

POST referrals/invite/link
     Purpose: Generate invite link for sharing
```

---

## KYC / Identity Verification

```
GET  trading/users/current/kyc
     Purpose: Check KYC status for trading
     Service: OnboardingService.java
```

### Third-Party KYC Endpoints
```
Onfido:      sdk.onfido.com, api.onfido.com, assets.onfido.com
Fourthline:  cdn.ext.fourthline.com, mapi.ext.fourthline.com
Trustdock:   native-app-sdk-api.trustdock-ekyc.com
```

---

## Payment & Transfer Endpoints

```
POST /payments/authorisations/{authorisationId}
      Service: ApmPaymentAuthorisationsService.java

POST rev-payment/token/{orderToken}/delivery-method
      Service: RevolutPayService.java

POST rev-payment/token/{orderToken}/shipping-contact
      Service: RevolutPayService.java

POST topup/by-token/barzahlen/{id}
      Service: CashTopUpBarcodeService.java
```

---

## Other Notable Services

```
GET  /api/client/in-app-calls/token
     Service: InAppCallSupportApi.java
     Purpose: Get Twilio token for in-app voice calls

POST biometrics/authenticate
     Service: Onfido MotionApi.java
     Purpose: Biometric authentication via Onfido

GET  /credit-open-market/application/cancel
     Service: PcwApplicationService.java
     Purpose: Cancel credit application

GET  user/feature-profile/BOLETO_DDA
     Service: ProductFeatureOnboardingService.java
     Purpose: Boleto payment feature onboarding (Brazil)

POST /apms/{product}/deregister
     Service: ApmOnboardingService.java
     Purpose: Deregister from alternative payment method

GET  youth/users/{juniorRegId}/phone
     Service: JuniorProfileService.java
     Purpose: Get phone for junior account

GET  /connect/sim-phones/{id}/label
     Service: EsimPhoneNumberService.java
     Purpose: eSIM phone label management
```

---

## Auth Header Taxonomy

| Header | Purpose | When Used |
|---|---|---|
| `X-Anonymous-Fallback-App-Auth: true` | Anonymous pre-auth state | Before login |
| `CUSTOM_APP_AUTH_NAME: true` | Standard authenticated state | After login |
| `X-Force-App-Auth: true` | Force re-authentication | Token refresh |
| `X-Token-Type` | Token type discrimination | Token endpoints |
| `X-Captcha-Token` | hCaptcha verification token | Sensitive operations |
| `X-Skip-SSN-ITIN` | Skip tax ID validation | User profile updates |
