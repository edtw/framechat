# Agent Prompts — Ready-to-Use Task Templates

Each prompt below is designed to be given directly to an AI agent (Claude, etc.) to complete a specific task on the AFILIATORS platform.

---

## Prompt 1: Create a New CRM Page

```
TASK: Create a new CRM page at /frontend/app/[route]/page.tsx

CONTEXT:
- You are working on the AFILIATORS WhatsApp CRM platform for Revolut affiliates
- The frontend uses Next.js 14 with TypeScript, Tailwind CSS, and framer-motion
- All pages use DashboardLayout wrapper and dark theme (#0A0A0F background)
- All user-facing text must be in Portuguese (pt-BR)
- Use extractList() from @/lib/api-helpers for safe API data extraction
- Follow existing page patterns from /frontend/app/contatos/page.tsx or /tarefas/page.tsx

REQUIREMENTS:
1. Wrap content in <DashboardLayout> component
2. Include: header with title + subtitle, search/filter bar, data list/grid
3. Handle ALL states: loading (skeleton), empty, error, data
4. Use shared components: Input, Button, Modal from @/components/ui/
5. Use lucide-react icons
6. Write a corresponding backend route at /backend/services/crm/routes/[name].js
7. Register the route in /backend/server.js
8. Add the page to DashboardLayout navigation

READ THESE FILES FIRST:
- /docs/04_API_REFERENCE.md (for API patterns)
- /frontend/app/contatos/page.tsx (as template)
- /frontend/components/layout/DashboardLayout.tsx (for navigation)
- /backend/services/crm/routes/contacts.js (as backend template)
```

---

## Prompt 2: Fix a Bug

```
TASK: [describe the bug with the exact error message]

CONTEXT:
- AFILIATORS platform: Next.js 14 frontend, Express.js backend, Python AI handler
- All backend files use CommonJS (require/module.exports), NOT ESM (import/export)
- Frontend uses TypeScript with strict mode
- Tests must pass: 20 frontend + 14 backend

BEFORE FIXING:
1. Read the file where the error occurs
2. Search for similar patterns across the codebase
3. Understand the data flow: frontend → API → backend → Prisma → PostgreSQL

CHECKS AFTER FIXING:
1. npx vitest run (from /frontend) — must be 20/20
2. node --test __tests__/api.test.mjs (from /backend) — must be 14/14
3. Check Next.js compilation in the terminal for errors
4. Test the page manually via curl or browser

DO NOT:
- Change from CommonJS to ESM or vice versa
- Remove existing functionality
- Change the API response format without updating the frontend
```

---

## Prompt 3: Improve AI Behavior

```
TASK: Improve the DeepSeek AI agent's responses for [specific scenario]

CONTEXT:
- AI handler is at /ai-handler/
- Provider: DeepSeek via OpenAI-compatible SDK
- Prompts are in /ai-handler/app/prompts/affiliate_templates.py
- Intent detection: /ai-handler/app/services/intent_detector.py
- Orchestrator: /ai-handler/app/services/orchestrator.py
- Production config: temperature=0.3, max_tokens=200

RULES:
1. All prompts must be in Portuguese (pt-BR)
2. Follow the behavior guidelines in /docs/03_AI_BEHAVIOR.md
3. Never invent prices, limits, or fees
4. Add detection patterns for new intents if needed
5. Update the orchestrator INTENT_TO_STAGE mapping if needed

AFTER CHANGES:
1. Rebuild AI handler: docker-compose build ai-handler && docker-compose up -d ai-handler
2. Test: curl -X POST http://localhost:8000/api/chat/ -H "Content-Type: application/json" -d '{"message":"...","session_id":"test","detect_intent":true}'
3. Check orchestrator pipeline: curl http://localhost:8000/api/orchestrator/pipeline
```

---

## Prompt 4: Add a WhatsApp Feature

```
TASK: [describe WhatsApp feature]

CONTEXT:
- WhatsApp service: /whatsapp-service/src/index.js (ESM module, Node.js)
- Uses Baileys library for WhatsApp Web protocol
- Message handler: WhatsAppManager.prototype.handleIncomingMessage
- Message buffering: 3-second window (MESSAGE_BUFFER_MS=3000)
- Group detection: isGroupChat(jid) checks for @g.us suffix

KEY PATTERNS:
- All incoming messages go through handleIncomingMessage
- Group messages are stored but AI doesn't respond
- Messages are buffered before AI processing
- AI response is sent via flushMessageBuffer
- WebSocket events are emitted to operators

FILES TO MODIFY:
- /whatsapp-service/src/index.js (main server + message pipeline)
- /whatsapp-service/src/whatsapp/manager.js (Baileys connection manager)
- /whatsapp-service/src/api/backend-client.js (calls to backend API)
- /whatsapp-service/src/services/context-manager.js (conversation history)

AFTER CHANGES:
1. Restart: docker-compose restart whatsapp-service
2. Check logs: docker logs afiliators-whatsapp-service --tail 20
3. Verify health: curl http://localhost:3006/health
```

---

## Prompt 5: Frontend UI Component

```
TASK: Create/modify a UI component at /frontend/components/[path]/[Name].tsx

DESIGN SYSTEM:
- Dark theme: bg-[#0A0A0F], text-white, borders: border-white/[0.06] to border-white/10
- Cards: rounded-2xl or rounded-[28px], bg-white/[0.02] or bg-white/[0.03]
- Accent: emerald-500/teal-500 gradient for primary actions
- Status colors: emerald (success), amber (warning), red (error), blue (info), purple (AI)
- Typography: text-sm for body, text-xs for secondary, text-[10px] for badges
- Spacing: p-4/p-5 for cards, gap-3/gap-4 for grids, space-y-4 for lists

COMPONENT REQUIREMENTS:
1. 'use client' directive
2. TypeScript interface for props (include className for parent overrides)
3. Handle loading, empty, error, disabled states
4. Framer-motion for enter/exit animations
5. Focus-visible rings for accessibility
6. aria-labels on icon-only buttons
7. Export both named and default

READ THESE FOR REFERENCE:
- /frontend/components/ui/Modal.tsx (accessibility best practices)
- /frontend/components/dashboard/SessionCard.tsx (card pattern)
```

---

## Prompt 6: Database Migration

```
TASK: Add/modify a database model

CONTEXT:
- Prisma schema: /backend/prisma/schema.prisma
- All models use operatorId for multi-tenant isolation
- Portuguese table names with @map(): leads → crm_leads, deals → crm_deals

STEPS:
1. Edit /backend/prisma/schema.prisma with the new/changed model
2. Run migration: cd backend && npx prisma migrate dev --name [description]
3. Update seed file if needed: /backend/prisma/seed.js
4. Create/update the backend service route
5. Register route in /backend/server.js
6. Create/update the frontend page

AFTER CHANGES:
1. Restart backend: docker-compose restart backend
2. Verify migration: docker exec afiliators-postgres psql -U postgres -d afiliators -c "\d [table_name]"
```

---

## Prompt 7: End-to-End Test

```
TASK: Write E2E tests for [feature/page]

CONTEXT:
- E2E framework: Playwright
- Tests location: /frontend/e2e/
- Config: /frontend/playwright.config.ts
- Base URL: http://localhost:3001

REQUIREMENTS:
1. Login first (use admin@afiliators.local / admin123)
2. Navigate to the target page
3. Verify page renders without errors
4. Test critical user interactions
5. Test error states (inject bad API responses via route interception)
6. Capture page errors: page.on('pageerror', ...)

TEMPLATE:
```typescript
import { test, expect } from '@playwright/test';

test.describe('[Feature]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('admin@afiliators.local');
    await page.locator('#password').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
  });

  test('page renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    
    await page.goto('/target-page');
    await page.waitForTimeout(3000);
    
    expect(errors.filter(e => e.includes('is not a function'))).toHaveLength(0);
  });
});
```

---

## Prompt 8: Full System Health Check

```
TASK: Verify the entire AFILIATORS platform is operational

RUN THESE COMMANDS:

# Backend health
curl http://localhost:3005/health

# AI Handler health (should show deepseek: true)
curl http://localhost:8000/health

# WhatsApp Service health
curl http://localhost:3006/health

# Frontend (check any page)
curl -s http://localhost:3001/login | head -c 100

# Database
docker exec afiliators-postgres psql -U postgres -d afiliators -c "SELECT count(*) FROM operators;"
docker exec afiliators-postgres psql -U postgres -d afiliators -c "SELECT count(*) FROM users;"

# Tests
cd /frontend && npx vitest run    # Expect 20/20
cd /backend && node --test __tests__/api.test.mjs  # Expect 14/14

# Docker
docker ps --format "table {{.Names}}\t{{.Status}}"

EXPECTED:
- All 5 containers: healthy/running
- DeepSeek: true
- Tests: 20 frontend + 14 backend = 34 total, all passing
- Frontend: serving HTML at all 11 routes
- Database: 3 operators, 3 users
```
