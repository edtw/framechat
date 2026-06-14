# Discord Integration — Complete Documentation

## Overview
WhatsApp-first CRM extended with a **Discord personal-account AI assistant**. 
The AI connects via a self-bot (personal user token), replies to DMs and server 
mentions in the user's own writing style, and can proactively engage on relevant 
servers via an approval-gated engagement engine.

**Built:** 2026-06-10 to 2026-06-13
**Status:** Full stack deployed, live on port 3007

---

## Architecture

```
Discord Client (self-bot) → discord-service (:3007) → Backend (:3005) → PostgreSQL
                                    ↓
                              AI Handler (:8000) → DeepSeek API
```

### New Service: `discord-service` (Node.js ESM, Port 3007)
- Uses `discord.js-selfbot-v13` for personal user token connection
- Buffered message pipeline → AI processing → human-style reply
- Engagement engine (discovery → join → propose → approval queue → send)

---

## New Files Created (17 files)

### AI Handler (4 new modules)
| File | Purpose |
|------|---------|
| `ai-handler/app/prompts/human_style.py` | Multilingual human-style writing directives (pt/en blocklists, 11 style traits) |
| `ai-handler/app/prompts/writing_signature.py` | Heuristic chat writing style analysis — 13 traits, zero AI tokens |
| `ai-handler/app/prompts/self_signature.py` | Self-signature: learns the USER's own writing voice from their DMs |
| `ai-handler/app/prompts/context_loader.py` | Token-economy context compression (4-tier: raw→truncated→summarized→dropped) |
| `ai-handler/app/prompts/message_attention.py` | Burst detection + social media conversation formatting |

### Discord Service (3 new modules)
| File | Purpose |
|------|---------|
| `discord-service/src/discord/manager.js` | Account connection, scope filter (DMs + mentions), config caching |
| `discord-service/src/utils/delays.js` | Human-like response timing (read→think→type→send) |
| `discord-service/src/utils/burst.js` | JavaScript burst detection + multi-message reply splitting |

### Discord Service — Engagement (5 files)
| File | Purpose |
|------|---------|
| `discord-service/src/engagement/config.js` | 20 ENGAGEMENT_* env vars, kill switch, blocklist |
| `discord-service/src/engagement/rate-limiter.js` | Daily counters, cooldowns, sliding-window rate caps |
| `discord-service/src/engagement/relevance.js` | Keyword scoring for server/channel relevance |
| `discord-service/src/engagement/discovery.js` | Disboard.org scraper for server discovery |
| `discord-service/src/engagement/joiner.js` | Throttled auto-join with warm-up gate |
| `discord-service/src/engagement/engagement-loop.js` | Read channel → score → propose to approval queue |
| `discord-service/src/engagement/sender.js` | Periodic approved-item poster with human delays |
| `discord-service/src/engagement/scheduler.js` | Registers all 4 jittered loops |

### Frontend (3 files)
| File | Purpose |
|------|---------|
| `frontend/app/discord/layout.tsx` | Auth-guard wrapper for Discord pages |
| `frontend/app/discord/page.tsx` | Three-panel Discord UI (conversations + messages + signatures) |
| `frontend/app/discord/queue/page.tsx` | Engagement approval queue |
| `frontend/components/discord/DiscordToggle.tsx` | Discord-style green/gray toggle switch |
| `frontend/types/discord.ts` | TypeScript types (DiscordAccount, WritingSignature, etc.) |

---

## Modified Files (12 files)

### Backend
| File | Changes |
|------|---------|
| `backend/prisma/schema.prisma` | +6 Discord models, +writingSignature, +selfSignature fields |
| `backend/server.js` | Mounted `/api/discord` routes |
| `backend/services/discord/routes/public.js` | 20+ JWT endpoints (accounts, config, conversations, messages, signatures, queue) |
| `backend/services/discord/routes/internal.js` | Service-auth endpoints for discord-service communication |
| `backend/services/discord/database/accounts.js` | Account CRUD + token encryption/decryption |
| `backend/services/discord/database/conversations.js` | Conversation upsert + listing |
| `backend/services/discord/database/messages.js` | Message storage |
| `backend/services/discord/database/engagement.js` | Targets, queue items CRUD |

### AI Handler
| File | Changes |
|------|---------|
| `ai-handler/app/models/schemas.py` | +chat_jid, +orchestrator, +writing_signature, +self_signature, +burst_chunks |
| `ai-handler/app/routers/chat.py` | Orchestrator integration, analyze-signature endpoint, burst chunks |
| `ai-handler/app/services/ai_manager.py` | Human style + writing signature + self-signature + context merging |
| `ai-handler/app/core/config.py` | +HUMAN_STYLE_ENABLED setting |

### Discord Service
| File | Changes |
|------|---------|
| `discord-service/src/index.js` | Full message pipeline, auto-reconnect, signature fetching, burst integration |
| `discord-service/src/api/backend-client.js` | +getSignature, +saveSignature, +getSelfSignature, +saveSelfSignature, +getMessages |
| `discord-service/src/api/ai-handler-client.js` | +analyzeSignature, +writing_signature, +self_signature forwarding |

### Docker
| File | Changes |
|------|---------|
| `docker-compose.yml` | +discord-service container, +20 ENGAGEMENT_* env vars, +DISCORD_SERVICE_URL |

### Frontend
| File | Changes |
|------|---------|
| `frontend/components/layout/DashboardLayout.tsx` | +Discord nav item |
| `frontend/components/layout/Sidebar.tsx` | +Discord nav item |

---

## Database Schema (6 new tables)

| Model | Purpose |
|-------|---------|
| `DiscordAccount` | Connected Discord accounts (token encrypted at rest) |
| `DiscordAgentConfig` | Per-account AI behavior config |
| `DiscordConversation` | Tracked conversations (DM + server channels) |
| `DiscordMessage` | Message history per conversation |
| `EngagementTarget` | Discovered/joined servers for engagement |
| `EngagementQueueItem` | Approval queue for proactive messages |

### New Fields on Existing Models
- `DiscordConversation.writingSignature` (JSON) — cached partner writing style
- `DiscordConversation.signatureUpdatedAt` (DateTime) — last analysis timestamp
- `DiscordAccount.selfSignature` (JSON) — cached user writing style
- `DiscordAccount.selfSignatureUpdatedAt` (DateTime) — last self-analysis

---

## Key Features

### 1. Human-Style AI Writing
- Language detection (pt/en/auto) with per-language blocklists
- 11 style traits forcing short, punchy, natural replies
- Portuguese: 16 banned AI-tell words. English: 18 banned words.
- Always replies in the same language the user wrote in

### 2. Writing Signature System
- **Partner signature**: Analyzes how the OTHER person writes (message length, emoji use, punctuation, capitalization, common phrases, formality)
- **Self-signature**: Analyzes how the USER writes from their own DMs
- Both computed heuristically — ZERO AI tokens consumed for analysis
- Cached per conversation, reanalyzed every 50 messages or 6 hours

### 3. Smart Context Loading (Token Economy)
- 4-tier compression: last 5 raw → 6-15 truncated → 16-30 summarized → 30+ dropped
- 60-70% token savings on long conversations
- `should_load_context()` skips context entirely for single messages

### 4. Natural Response Delays
- READ delay: 0.8-4s (simulates reading the message)
- THINK delay: 0.5-8s (cognitive processing, varies with complexity)
- TYPING delay: ~280 characters per minute (average human speed)
- SEND delay: 0.2-0.8s (re-reading before sending)
- Variance: 1-in-8 extra slow, 1-in-15 very fast
- Discord typing indicator refreshed for long messages

### 5. Message Burst Detection
- Detects rapid-fire messages (<3s intervals)
- Preserves social media feel — annotated fragments, not paragraphs
- Multi-message reply splitting with inter-message delays
- Mirrors partner's burst pattern

### 6. Proactive Engagement (Approval-Gated)
- Discovery: Scrapes Disboard.org for relevant servers
- Throttled joining: max 3/day, 1h warm-up, relevance gate
- Engagement loop: Read → Score → Propose → Approval Queue
- Sender: Posts approved items only, max 20/hour, 8-45s delays
- Master kill switch: `ENGAGEMENT_ENABLED=false`

---

## API Endpoints

### Public (JWT Auth) — `/api/discord/*`
| Method | Path | Purpose |
|--------|------|---------|
| GET | /accounts | List accounts |
| POST | /accounts | Add account (token encrypted) |
| DELETE | /accounts/:id | Delete account |
| POST | /accounts/:id/connect | Connect account |
| POST | /accounts/:id/disconnect | Disconnect account |
| PUT | /accounts/:id/config | Update AI config |
| POST | /accounts/:id/self-analysis | Trigger self-signature analysis |
| GET | /conversations | List conversations |
| GET | /conversations/:id | Conversation detail |
| GET | /conversations/:id/messages | Message history (paginated) |
| GET | /conversations/:id/signature | Partner writing signature |
| POST | /conversations/:id/analyze | Trigger signature analysis |
| GET | /queue | Engagement queue items |
| POST | /queue/:id/approve | Approve queue item |
| POST | /queue/:id/reject | Reject queue item |

### Internal (Service Auth) — `/api/discord/internal/*`
| Method | Path | Purpose |
|--------|------|---------|
| GET | /accounts | List enabled accounts |
| GET | /accounts/:id/credentials | Decrypted token |
| GET | /accounts/:id/ai-config | AI config + knowledge base |
| POST | /accounts/:id/status | Update connection status |
| GET | /accounts/:id/self-signature | Get self-signature |
| PUT | /accounts/:id/self-signature | Store self-signature |
| POST | /conversations | Upsert conversation |
| GET | /conversations/:id/messages | Messages for analysis |
| GET | /conversations/:id/signature | Get signature |
| PUT | /conversations/:id/signature | Store signature |
| POST | /messages | Store message |

---

## Configuration

### Environment Variables (discord-service)
```
ENGAGEMENT_ENABLED=true|false          # Master kill switch
ENGAGEMENT_MAX_JOINS_PER_DAY=3         # Auto-join throttle
ENGAGEMENT_JOIN_MIN_RELEVANCE=0.3      # Relevance gate
ENGAGEMENT_PER_SERVER_DAILY_CAP=2      # Proposals per server
ENGAGEMENT_SEND_MAX_PER_HOUR=20        # Global send cap
ENGAGEMENT_SEND_DELAY_MIN_MS=8000      # Min delay between sends
ENGAGEMENT_SEND_DELAY_MAX_MS=45000     # Max delay between sends
```

---

## Testing

### Test DeepSeek AI
```bash
curl -X POST http://localhost:8000/api/chat/ \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"test","message":"Oi, tudo bem?","chat_jid":"test_123"}'
```

### Test Analyze Signature
```bash
curl -X POST http://localhost:8000/api/chat/analyze-signature \
  -H 'Content-Type: application/json' \
  -d '{"messages":["oi","tudo bem?","queria saber"]}'
```

### Health Sweep
```bash
curl http://localhost:3005/health  # Backend
curl http://localhost:8000/health  # AI
curl http://localhost:3006/health  # WhatsApp
curl http://localhost:3007/health  # Discord
curl http://localhost:3001/discord # Frontend
```

---

## Known Limitations
1. **Self-bot violates Discord ToS** — permanent ban risk (accepted, same as Baileys for WhatsApp)
2. **DeepSeek API key** must have sufficient balance for AI generation
3. **Frontend rebuild** requires `npm run build` + symlink fix on host
4. **AI Handler** has no volume mount — needs `docker-compose up -d --build` to pick up Python changes
5. **Engagement mode** is completely approval-gated — nothing posts without operator approval
