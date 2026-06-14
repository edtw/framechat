# API Reference — AFILIATORS Backend

Base URL: `http://localhost:3005`

## Authentication

All endpoints (except `/health`, `/`, `/api/auth/login`) require:
```
Authorization: Bearer <jwt_token>
```

### POST /api/auth/login
```json
// Request
{ "email": "admin@afiliators.local", "password": "admin123" }

// Response 200
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "user": { "id": 1, "operatorId": 1, "name": "Admin", "role": "ADMIN" }
  }
}
```

### Test Credentials
| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@afiliators.local | admin123 | ADMIN |
| Bruno | bruno@afiliators.local | bruno123 | OPERATOR |
| Vladimir | vladimir@afiliators.local | vladimir123 | OPERATOR |

---

## CRM — Leads

### GET /api/crm/leads
List leads with optional search and status filter.
```json
// Response
{ "success": true, "leads": [...] }
```

### POST /api/crm/leads
Create a new lead.
```json
// Request
{ "name": "Joao", "email": "joao@email.com", "phone": "+5511999999999" }
```

### GET /api/crm/leads/stats
Lead statistics.
```json
// Response
{ "success": true, "data": { "total": 0, "byStatus": {} } }
```

---

## CRM — Contacts

### GET /api/crm/contacts
List contacts. Query: `?search=term`

### POST /api/crm/contacts
Create contact.
```json
// Request
{ "name": "Maria", "phone": "+5511988888888", "email": "maria@email.com", "company": "Acme" }
```

---

## CRM — Tasks

### GET /api/crm/tasks
List tasks.

### POST /api/crm/tasks
```json
// Request
{ "title": "Ligar para lead", "priority": "HIGH", "dueDate": "2026-06-10" }
```

### PATCH /api/crm/tasks/:id
Update task status.
```json
// Request
{ "status": "COMPLETED" }
```

---

## CRM — Deals (Negocios)

### GET /api/crm/deals
List deals. Query: `?status=OPEN&search=term`

### POST /api/crm/deals
```json
// Request
{ "title": "Venda Premium", "value": 5000, "leadId": 1 }
```

### PATCH /api/crm/deals/:id
Update deal stage.
```json
// Request
{ "stage": "WON" }
```

---

## WhatsApp

### GET /api/whatsapp/sessions
List WhatsApp sessions for the operator.

### POST /api/whatsapp/sessions
Create a WhatsApp session (auto-generates sessionId).
```json
// Request
{ "name": "Bruno WhatsApp" }
// Response
{ "success": true, "sessionId": "wa_1_1780524680436", "session": {...} }
```

### GET /api/whatsapp/sessions/:id/qr
Get QR code for session scanning.

### DELETE /api/whatsapp/sessions/:id
Disconnect and delete a WhatsApp session.

### GET /api/whatsapp/conversations
List conversations.

### GET /api/whatsapp/conversations/:id
Get conversation with messages.

### POST /api/whatsapp/conversations/send-message
Send a message to a WhatsApp contact.
```json
// Request
{ "sessionId": "wa_1_...", "userPhone": "+5511999999999", "message": "Ola!" }
```

### POST /api/whatsapp/conversations/takeover
Take over a conversation from AI.
```json
// Request
{ "sessionId": "wa_1_...", "userPhone": "+5511999999999" }
```

### POST /api/whatsapp/conversations/return-to-ai
Return conversation to AI.

### GET /api/whatsapp/conversations/takeover-status/:sessionId/:userPhone
Check if conversation is taken over.

---

## Operators

### GET /api/operators
List all operators.
```json
// Response
{ "success": true, "data": [{ "id": 1, "name": "Admin", ... }], "pagination": {...} }
```

---

## PIX

### GET /api/pix/transactions
List PIX transactions. Query: `?status=PAID&search=term`

### POST /api/pix/generate
Generate a PIX payment code.

---

## Virtual Cards

### GET /api/virtual-cards
List virtual cards.

---

## AI Orchestrator (Proxy)

### GET /api/orchestrator/health
Orchestrator status and pipeline summary.

### GET /api/orchestrator/pipeline
Pipeline stage counts.
```json
{ "success": true, "pipeline": { "NOVO": 0, "EM_CONTATO": 1, ... } }
```

### GET /api/orchestrator/alerts
Recent alerts. Query: `?severity=CRITICAL&limit=50`

### POST /api/webhooks/orchestrator
Receive alerts from AI handler → broadcasts to operators via WebSocket.
```json
// Request (from AI handler)
{ "severity": "CRITICAL", "title": "...", "message": "...", "conversation": "..." }
```

---

## Health

### GET /health
```json
{ "status": "healthy", "uptime": 123.45, "services": { "auth": "running", ... } }
```

### GET /
API info and endpoint listing.
