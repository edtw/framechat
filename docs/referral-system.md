# Revolut Referral/Invite System — Deep Analysis

## Overview

The Revolut referral system is a multi-layered campaign-based architecture. Users participate in "invite campaigns" where they refer new users and receive rewards when invitees complete required actions.

---

## Campaign Architecture

### Campaign Model (inferred from API contracts)

```
Campaign {
    campaignType: String          // "referral", "youth", "business", etc.
    activeInvites: Integer        // Number of active invites allowed
    benefits: Benefits            // What the inviter gets
    inviteeBenefits: Benefits     // What the invitee gets
    v: Integer                    // API version
}

Benefits {
    rewardType: String            // "cash", "points", "crypto", "free_trades"
    rewardAmount: Number
    currency: String
    conditions: List<Condition>   // Requirements for reward
}

Condition {
    type: String                  // "kyc_complete", "first_topup", "first_trade", "card_order"
    threshold: Number             // Minimum amount if applicable
    timeframe: Duration           // Time limit to complete
}
```

### Campaign Versions
- `/lastActive` — Legacy endpoint
- `/v4/lastActive` — Current version (simplified query params, more response fields)
- `/inviteHistory/v3` — Legacy history with full filtering
- `/inviteHistory/v4` — Current history (simplified, only `redesigned` + `campaignType`)

The presence of parallel v3/v4 endpoints suggests an API migration in progress. Both may have slightly different behavior or validation.

---

## Invite Flow State Machine

```
[User opens app]
     │
     ▼
[GET inviteCampaigns/v4/lastActive]
     │
     ├── No active campaign → Show "Coming soon" UI
     │
     └── Active campaign found
          │
          ▼
     [GET inviteCampaigns/benefits]
          │
          ├── Show invite screen with benefit preview
          │
          ▼
     [User shares invite]
          │
          ├── POST referrals/invite/sms    (SMS)
          ├── POST referrals/invite/email  (Email)
          └── POST referrals/invite/link   (Share link)
          │
          ▼
     [Invitee clicks link → installs app]
          │
          ▼
     [Invitee signs up via verification-codes/*]
          │
          ├── SSO sign-up flow (com.revolut.sso.*)
          │   ├── phone verification
          │   ├── email verification
          │   ├── personal details
          │   └── KYC (Onfido/Fourthline)
          │
          ▼
     [GET inviteCampaigns/inviteeStatus]
          │   Query: campaignType
          │   Checks if invitee completed required actions
          │
          ▼
     [Inviter reward status update]
          │
          ▼
     [GET referrals/invites/summary]
          │   Query: campaignType
          │   Shows pending/completed/rewarded counts
          │
          ▼
     [Invitee completes conditions]
          │
          ▼
     [Reward becomes available]
          │
          ▼
     [POST inviteCampaigns/inviteHistory/{id}/revealReward]
          │   Inviter claims reward manually (gamification)
          │
          ▼
     [GET invites/{inviteId}/transaction-widget]
          │   Shows reward transaction details
```

---

## Business Logic Analysis

### Vectors for Investigation

**1. Campaign Version Confusion**
- Both v3 and v4 endpoints exist simultaneously
- Different query parameters accepted
- V3 accepts `inviteState` filtering (list)
- V4 simplified query but may have different validation rules
- **Test**: Call v3 with parameters that v4 would reject. Or call v4 with v3-style filtering.

**2. Invitee Status Race Condition**
- `inviteeStatus` is checked by the inviter, not the invitee
- The invitee's actions (KYC, top-up, trade) trigger state changes
- If state check and action completion are not atomic → race condition
- **Test**: Complete invitee requirements while simultaneously polling `inviteeStatus`

**3. `accept-by-existing-user` Endpoint**
- `POST v2/invitation/accept-by-existing-user`
- Allows EXISTING users to accept invitations
- This is interesting — can an already-registered user apply an invite code?
- If so, what validation prevents self-referral or circular invites?
- **Test**: Accept invite as existing user, check if invitee conditions are waived

**4. Reward Reveal Timing**
- `revealReward` is a separate POST from reward credit
- The reward may already be determined server-side before "reveal"
- If reward is determined at invite time vs reveal time → could the reward change?
- **Test**: Complete invite during high-value promo, but reveal during low-value period

**5. Campaign Eligibility Gating**
- Youth accounts have a separate `youthId` parameter
- Different user segments may have different campaign eligibility
- What happens if a user switches segments mid-campaign?
- **Test**: Start campaign as regular user, switch to youth/business, check eligibility

**6. Geographic Restrictions**
- Rewards vary by country (Brazil-specific BOLETO feature found)
- IP/country mismatch during invite flow
- **Test**: Create invite in high-reward country, invitee completes in low-reward country

**7. Referral Loop / Circular Invites**
- Can A invite B, B invite A?
- Can the same person be invited multiple times (different phone/email)?
- KYC should prevent this, but what about pre-KYC invite acceptance?
- **Test**: Create chain A→B→A, check if reward triggers

**8. `redesigned` Flag Behavior**
- Multiple endpoints accept `redesigned: boolean`
- This likely toggles between old and new UI/UX flows
- Could the `redesigned` flag also affect backend validation?
- **Test**: Compare responses with `redesigned=true` vs `redesigned=false`

**9. Invite History Pagination**
- `GET referrals/invites?cursor={cursor}&limit={limit}`
- Cursor-based pagination → sequential access
- No documented rate limit on this endpoint
- **Test**: Rapid pagination to enumerate all invites, check for IDOR

**10. `revealReward` Authorization**
- Only path parameter is `inviteId` (no body)
- How does the server verify the inviter owns this invite?
- If inviteId is sequential/predictable → IDOR risk
- **Test**: Reveal rewards for invite IDs not belonging to your account
