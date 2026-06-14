# Architecture — AFILIATORS Platform

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        OPERATOR BROWSER                              │
│                    http://localhost:3001                              │
│                                                                      │
│  ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌──────┐ ┌──────────────┐  │
│  │Dashboard│ │ Leads   │ │ Conversas  │ │ PIX  │ │ Configuracoes│  │
│  │/dashboard│ │ /leads  │ │ /whatsapp  │ │ /pix │ │ /settings    │  │
│  └─────────┘ └─────────┘ └───────────┘ └──────┘ └──────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP + WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      BACKEND API (Express.js)                         │
│                      http://localhost:3005                            │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────┐ ┌──────────┐    │
│  │ Auth     │ │ CRM      │ │ WhatsApp   │ │ PIX  │ │ Knowledge│    │
│  │ /api/auth│ │ /api/crm │ │ /api/wh... │ │/api/ │ │ /api/kn..│    │
│  └──────────┘ └──────────┘ └───────────┘ └──────┘ └──────────┘    │
│                                                                      │
│  WebSocket Server (Socket.io) — Real-time alerts to operators       │
└──────┬──────────────────┬──────────────────────┬─────────────────────┘
       │                  │                      │
       ▼                  ▼                      ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐
│  PostgreSQL  │ │    Redis     │ │   AI Handler (FastAPI)        │
│  :5432       │ │    :6379     │ │   http://localhost:8000       │
│              │ │              │ │                              │
│  24 tables   │ │  Context     │ │  ┌────────────────────────┐  │
│  Prisma ORM  │ │  Sessions    │ │  │ DeepSeek Provider      │  │
│              │ │  Cache       │ │  │ model: deepseek-chat   │  │
└──────────────┘ └──────────────┘ │  │ temp: 0.3, max_tok:200 │  │
                                  │  └────────────────────────┘  │
                                  │  ┌────────────────────────┐  │
                                  │  │ AI Orchestrator         │  │
                                  │  │ Pipeline auto-advance   │  │
                                  │  │ Angry user detection    │  │
                                  │  │ Webhook alerts          │  │
                                  │  │ Prometheus metrics      │  │
                                  │  └────────────────────────┘  │
                                  └──────────────────────────────┘
                                                  ▲
                                                  │ HTTP
                                      ┌───────────┴───────────┐
                                      │  WhatsApp Service     │
                                      │  http://loc:3006      │
                                      │                       │
                                      │  Baileys WebSocket    │
                                      │  Message buffering    │
                                      │  Group detection      │
                                      │  Context management   │
                                      └───────────────────────┘
                                                  ▲
                                                  │ WebSocket
                                                  ▼
                                          ┌───────────────┐
                                          │  WhatsApp      │
                                          │  Cloud API     │
                                          │  (Baileys)     │
                                          └───────────────┘
```

## Service Ports

| Service | Port | Tech | Docker Name |
|---------|------|------|-------------|
| Frontend | 3001 | Next.js 14 (dev) | N/A (runs on host) |
| Backend | 3005 | Express.js (CommonJS) | afiliators-backend |
| AI Handler | 8000 | FastAPI (Python) | afiliators-ai-handler |
| WhatsApp Service | 3006 | Node.js (ESM) | afiliators-whatsapp-service |
| PostgreSQL | 5432 | Postgres 16 | afiliators-postgres |
| Redis | 6379 | Redis 7 | afiliators-redis |

## Message Flow (WhatsApp → Response)

```
1. WhatsApp message arrives via Baileys WebSocket
2. whatsapp-service receives it → handleIncomingMessage()
3. Group detection: if @g.us → skip AI, store only
4. Message buffering: collect messages for 3s window
5. Buffer flush → AI Handler POST /api/chat {message, context, behavior}
6. AI Handler: intent detection → orchestrator pipeline → DeepSeek → response
7. Response sent back via Baileys with typing delay
8. Message stored in backend DB
9. WebSocket event emitted to operator frontend
```

## Key Architectural Decisions

1. **CommonJS for Backend** — All backend files use `require()`/`module.exports`. ESM files will crash.
2. **Docker volumes for dev** — Code is volume-mounted, changes appear instantly on restart
3. **Prisma as single DB layer** — All database access through Prisma Client singleton
4. **Python for AI** — AI handler is separate Python service for ML ecosystem access
5. **Baileys for WhatsApp** — Free, no API costs, multi-device support

## Directory Structure

```
AFILIATORS/
├── frontend/              # Next.js 14 app
│   ├── app/               # Page routes
│   ├── components/        # Shared UI components
│   ├── stores/            # Zustand state
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities (api, utils, api-helpers)
│   ├── e2e/               # Playwright tests
│   └── __tests__/         # Vitest unit tests
├── backend/               # Express.js API
│   ├── server.js          # Main entry, routes, middleware
│   ├── core/              # Prisma, auth, config, logger
│   ├── services/          # Domain modules (auth, crm, whatsapp, pix, etc.)
│   └── prisma/            # Schema + seed
├── ai-handler/            # Python FastAPI
│   └── app/
│       ├── providers/     # DeepSeek client
│       ├── services/      # AI Manager, Orchestrator, Intent Detector
│       ├── routers/       # Chat + Orchestrator endpoints
│       └── prompts/       # Prompt templates (pt-BR)
├── whatsapp-service/      # Baileys microservice
│   └── src/
│       ├── index.js       # Main server + message pipeline
│       ├── whatsapp/      # Baileys manager
│       ├── api/           # Backend + AI clients
│       └── services/      # Context manager
├── docs/                  # Documentation (you are here)
├── docker-compose.yml     # All services
└── .github/workflows/     # CI/CD pipelines
```
