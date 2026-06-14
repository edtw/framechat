# AFILIATORS — Revolut Affiliate CRM Platform

## What This Is
WhatsApp-first CRM for the Revolut affiliate program. People contact us via WhatsApp about Revolut money, cashout, and account setup. The platform automates the entire pipeline with AI (DeepSeek) and provides operators with a full CRM.

## Quick Start
```bash
# Start everything
cd /Users/eto/Documents/AFILIATORS
docker-compose up -d          # Backend + AI + WhatsApp + DB + Redis
cd frontend && npm run dev    # Frontend (port 3001)

# Verify
curl http://localhost:3005/health  # Backend
curl http://localhost:8000/health  # AI (deepseek: true = working)
curl http://localhost:3001         # Frontend

# Test
cd frontend && npx vitest run      # 20 tests
cd backend && node --test __tests__/api.test.mjs  # 14 tests
```

## Critical Rules
1. **Backend is CommonJS** — `require()`/`module.exports` only. ESM `import`/`export` WILL crash.
2. **Frontend uses TypeScript** — All pages have 'use client' directive.
3. **Portuguese (pt-BR)** — All user-facing text must be in Portuguese.
4. **Never expose keys** — API keys go in `.env`, never in code.
5. **Test before pushing** — 34 tests must pass.

## Architecture
```
Frontend (Next.js :3001) → Backend (Express :3005) → PostgreSQL (:5432)
                              ↓
                         AI Handler (FastAPI :8000) → DeepSeek API
                              ↓
                    WhatsApp Service (:3006) → Baileys → WhatsApp
```

## Key Files
- `docs/00_AGENT_MISSION.md` — Start here. Full agent mission and context.
- `docs/01_ARCHITECTURE.md` — System architecture and data flow.
- `docs/02_BUSINESS_CONTEXT.md` — Revolut affiliate program details.
- `docs/03_AI_BEHAVIOR.md` — AI prompt templates and behavior rules.
- `docs/04_API_REFERENCE.md` — All API endpoints.
- `docs/05_DATABASE.md` — Prisma schema and relationships.
- `docs/06_CI_CD.md` — Testing and deployment.
- `docs/07_AGENT_PROMPTS.md` — Ready-to-use prompts for AI agents.

## Login Credentials
| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@afiliators.local | admin123 | ADMIN |
| Bruno | bruno@afiliators.local | bruno123 | OPERATOR |
| Vladimir | vladimir@afiliators.local | vladimir123 | OPERATOR |

## Ports
| Service | Port | Tech |
|---------|------|------|
| Frontend | 3001 | Next.js 14 |
| Backend | 3005 | Express.js (CJS) |
| AI Handler | 8000 | FastAPI (Python) |
| WhatsApp | 3006 | Node.js (ESM) |
| Postgres | 5432 | PostgreSQL 16 |
| Redis | 6379 | Redis 7 |

## Common Commands
```bash
# Restart services
docker-compose restart backend
docker-compose restart whatsapp-service
docker-compose up -d ai-handler  # Rebuilds if code changed

# Database
docker exec afiliators-postgres psql -U postgres -d afiliators -c "\dt"
docker exec afiliators-backend node prisma/seed.js

# Logs
docker logs afiliators-backend --tail 20
docker logs afiliators-ai-handler --tail 20
docker logs afiliators-whatsapp-service --tail 20

# Prisma
cd backend && npx prisma studio       # DB GUI
cd backend && npx prisma migrate dev  # Create migration
```
