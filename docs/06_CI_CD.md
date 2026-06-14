# CI/CD & Testing — AFILIATORS

## Test Commands

```bash
# Frontend unit tests (Vitest)
cd frontend && npx vitest run              # Run once
cd frontend && npx vitest                  # Watch mode
cd frontend && npx vitest run --coverage   # With coverage

# Frontend E2E tests (Playwright)
cd frontend && npx playwright test         # All E2E
cd frontend && npx playwright test smoke   # Smoke only

# Backend API tests (Node Test Runner)
cd backend && node --test __tests__/api.test.mjs

# Frontend lint + type check
cd frontend && npx next lint
cd frontend && npx tsc --noEmit

# Full CI simulation
cd frontend && npx next lint && npx vitest run && npm run build
cd backend && node --test __tests__/api.test.mjs
```

## CI/CD Pipeline (GitHub Actions)

File: `.github/workflows/ci.yml`

### Push to any branch:
1. **Lint** — ESLint (frontend, backend, whatsapp-service) + Ruff (Python AI handler)
2. **TypeScript** — `tsc --noEmit`
3. **Unit Tests** — Vitest (frontend) + Node Test Runner (backend with Postgres)
4. **Docker Build** — Verify all 4 images build

### Pull Request to main:
5. **E2E Tests** — Playwright with real backend + Postgres + seed data
6. **Smoke Tests** — Every page renders without runtime errors

### Push to main:
7. **Deploy** — SSH to production, pull images, restart containers

## Test File Structure

```
frontend/
├── __tests__/
│   ├── setup.ts                    # jsdom + localStorage mock
│   ├── components/
│   │   ├── Button.test.tsx         # Button rendering, click, disabled, loading
│   │   └── Modal.test.tsx          # Modal open/close, callback
│   └── api/
│       ├── utils.test.ts           # cn(), formatCurrency(), formatTime()
│       └── authStore.test.ts       # Login, logout, hydrated state
├── e2e/
│   ├── auth.spec.ts                # Login flow, validation, redirect
│   ├── whatsapp.spec.ts            # Session creation, QR flow
│   └── smoke.spec.ts               # All pages render without crash
└── playwright.config.ts

backend/
└── __tests__/
    └── api.test.mjs                # Health, Auth, CRM, WhatsApp, Operators
```

## Pre-Push Checklist (Manual)

Before pushing, verify:
```bash
# 1. All tests pass
cd frontend && npx vitest run          # Should be 20/20
cd backend && node --test __tests__/api.test.mjs  # Should be 14/14

# 2. Frontend compiles
cd frontend && npx next build --no-lint

# 3. Backend starts without errors
docker-compose restart backend
curl http://localhost:3005/health

# 4. New pages don't 404
curl -s http://localhost:3001/contatos | head -c 100
curl -s http://localhost:3001/tarefas | head -c 100
curl -s http://localhost:3001/negocios | head -c 100
```

## Adding New Tests

### Frontend Component Test
```typescript
// __tests__/components/NewComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewComponent } from '@/components/ui/NewComponent';

describe('NewComponent', () => {
  it('renders correctly', () => {
    render(<NewComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Backend API Test
```javascript
// __tests__/new-feature.test.mjs
import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('New Feature', () => {
  let token;
  before(async () => {
    const res = await fetch('http://localhost:3005/api/auth/login', { ... });
    token = (await res.json()).data.token;
  });

  it('GET /api/new-endpoint returns data', async () => {
    const res = await fetch('http://localhost:3005/api/new-endpoint', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
  });
});
```

### E2E Test
```typescript
// e2e/new-feature.spec.ts
import { test, expect } from '@playwright/test';

test('new feature works', async ({ page }) => {
  await page.goto('/login');
  // ... test flow
});
```

## Environment Variables for CI

```bash
DATABASE_URL=postgresql://postgres:postgres_test_password@localhost:5432/afiliators_test
JWT_SECRET=test_jwt_secret_min_32_chars_long
ENCRYPTION_KEY=test_encryption_key_32chars_min
REDIS_URL=redis://localhost:6379
PORT=3005
NEXT_PUBLIC_API_URL=http://localhost:3005
```
