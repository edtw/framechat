# Agent Mission — AFILIATORS Platform

## What We Are Building

AFILIATORS is a **WhatsApp-first CRM platform** for the Revolut affiliate program. People who want to cash out money from Revolut contact us via WhatsApp. The platform automates the entire pipeline:

1. **Leads arrive via WhatsApp** — people asking about Revolut money, cashout processes, limits, fees
2. **AI auto-responds** — DeepSeek-powered chatbot qualifies leads, answers common questions
3. **Pipeline tracking** — Every conversation is a lead that moves through stages: Novo → Em Contato → Qualificado → Proposta → Fechado
4. **Human takeover** — Operators can take over conversations from AI at any point
5. **Financial tools** — PIX payment generation, virtual cards for affiliate purchases

## The Business: Revolut Affiliate Program

### What Users Contact Us About
- **"Tenho dinheiro no Revolut, como sacar?"** — Cashout guidance
- **"Qual o limite de saque?"** — Limits and verification levels  
- **"Quanto tempo demora?"** — Processing times
- **"Quais as taxas?"** — Fee structures
- **"Preciso de ajuda com a conta"** — Account setup, verification, currency exchange
- **"O app nao funciona"** — Technical support

### The Affiliate Model
- Operators earn commission on successful Revolut signups and transactions
- The CRM tracks lead → signup → first transaction → ongoing activity
- PIX is the primary cashout method in Brazil

## Agent Responsibilities

When you work on this project, you are responsible for:

1. **Never break the build** — All changes must pass `npm test` and compile
2. **Follow existing patterns** — Match the code style, naming conventions, and architecture
3. **Write tests** — Every new feature needs unit + integration tests
4. **Update documentation** — If you change an API, update the docs
5. **Portuguese-first** — All user-facing text must be in Portuguese (pt-BR)
6. **Security first** — Never expose API keys, validate all inputs, respect LGPD

## Key Files to Read First

1. `docs/01_ARCHITECTURE.md` — System architecture
2. `docs/02_BUSINESS_CONTEXT.md` — Revolut affiliate details
3. `docs/03_AI_BEHAVIOR.md` — AI agent rules and prompts
4. `docs/04_API_REFERENCE.md` — All endpoints
5. `docs/05_DATABASE.md` — Data models
6. `docs/06_CI_CD.md` — Testing and deployment

## Quick Start for Agents

```bash
# 1. Verify everything is running
curl http://localhost:3005/health  # Backend
curl http://localhost:8000/health  # AI Handler
curl http://localhost:3001         # Frontend

# 2. Run tests
cd frontend && npx vitest run      # Frontend (20 tests)
cd backend && node --test __tests__/api.test.mjs  # Backend (14 tests)

# 3. Check compilation
cd frontend && npx next build --no-lint  # Verify build

# 4. Make changes
# - Frontend: /frontend/app/* and /frontend/components/*
# - Backend: /backend/services/*/routes/*
# - AI: /ai-handler/app/*
# - WhatsApp: /whatsapp-service/src/*

# 5. Restart affected service
docker-compose restart backend       # Backend changes
docker-compose restart whatsapp-service  # WhatsApp changes
docker-compose up -d ai-handler      # AI changes (needs rebuild)
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 + TypeScript | React SSR, file-based routing |
| Backend | Express.js (CommonJS) | Simple, fast, Node ecosystem |
| Database | PostgreSQL + Prisma | Type-safe ORM, migrations |
| Cache | Redis | Session storage, context management |
| AI | DeepSeek (via OpenAI SDK) | Cost-effective, Portuguese-capable |
| WhatsApp | Baileys (WebSocket) | Free WhatsApp Web protocol |
| Testing | Vitest + Playwright + Node Test Runner | Unit, E2E, API |
| Infra | Docker Compose | Local dev, CI parity |
