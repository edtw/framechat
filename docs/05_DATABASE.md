# Database Schema — AFILIATORS

## PostgreSQL + Prisma ORM

Connection: `postgresql://postgres:postgres_dev_password_change_in_production@localhost:5432/afiliators`

## Core Models

### Operators
```prisma
model Operator {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  phone     String?
  cpf       String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users             User[]
  leads             Lead[]
  contacts          Contact[]
  tasks             Task[]
  deals             Deal[]
  whatsappSessions  WhatsAppSession[]
  knowledgeItems    KnowledgeItem[]
  pixTransactions   PixTransaction[]
  virtualCards      VirtualCard[]
}
```

### Users (Login)
```prisma
model User {
  id         Int      @id @default(autoincrement())
  operatorId Int
  name       String
  email      String   @unique
  password   String        // bcrypt hashed
  role       UserRole @default(OPERATOR)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())

  operator Operator @relation(fields: [operatorId], references: [id])
}

enum UserRole { ADMIN, OPERATOR }
```

### Leads (CRM)
```prisma
model Lead {
  id          Int       @id @default(autoincrement())
  operatorId  Int
  name        String
  email       String
  phone       String
  company     String?
  cpf         String?
  value       Decimal?  @db.Decimal(12, 2)
  status      LeadStatus @default(NEW)
  priority    Priority  @default(MEDIUM)
  score       Int?
  source      String?
  description String?
  lastContact DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  operator         Operator          @relation(fields: [operatorId], references: [id])
  deals            Deal[]
  tasks            Task[]
  timelineEvents   TimelineEvent[]
  pixTransactions  PixTransaction[]

  @@index([operatorId])
  @@index([status])
}

enum LeadStatus { NEW, CONTACTED, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST }
enum Priority { LOW, MEDIUM, HIGH, URGENT }
```

### WhatsApp Sessions
```prisma
model WhatsAppSession {
  id          String   @id
  operatorId  Int
  name        String
  qrCode      String?
  status      SessionStatus @default(DISCONNECTED)
  phoneNumber String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  operator      Operator              @relation(fields: [operatorId], references: [id])
  conversations Conversation[]
  agentConfig   WhatsAppAgentConfig?

  @@index([operatorId])
}

enum SessionStatus { CONNECTED, DISCONNECTED, CONNECTING, QR_READY, ERROR }
```

### Deals (Negocios)
```prisma
model Deal {
  id                Int       @id @default(autoincrement())
  operatorId        Int
  leadId            Int       @unique
  title             String
  value             Decimal?  @db.Decimal(12, 2)
  stage             DealStage @default(PROPOSAL)
  probability       Int       @default(50)
  expectedCloseDate DateTime?
  closedAt          DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  operator         Operator          @relation(fields: [operatorId], references: [id])
  lead             Lead              @relation(fields: [leadId], references: [id])
  pixTransactions  PixTransaction[]
  virtualCards     VirtualCard[]

  @@index([operatorId])
  @@index([stage])
}

enum DealStage { PROPOSAL, NEGOTIATION, CONTRACT, WON, LOST }
```

### Full Table List (24 tables)
```
operators, users, crm_leads, crm_contacts, crm_tasks, crm_deals,
crm_tags, crm_lead_tags, crm_notes, crm_followups, crm_timeline_events,
whatsapp_sessions, whatsapp_agent_configs, conversations, messages, sessions,
pix_transactions, virtual_cards, card_transactions,
knowledge_items, consent_records, data_deletion_requests,
ai_provider_keys, _prisma_migrations
```

## Data Relationships

```
Operator ──┬── User (login)
            ├── Lead ──┬── Deal
            │           ├── Task
            │           ├── TimelineEvent
            │           └── PixTransaction
            ├── Contact
            ├── WhatsAppSession ──┬── Conversation ── Message
            │                     └── WhatsAppAgentConfig
            ├── PixTransaction
            ├── VirtualCard ── CardTransaction
            └── KnowledgeItem
```

## Seed Data

3 operators with 1 user each:
- Admin (ADMIN): admin@afiliators.local / admin123
- Bruno (OPERATOR): bruno@afiliators.local / bruno123
- Vladimir (OPERATOR): vladimir@afiliators.local / vladimir123

## Common Operations

```bash
# View tables
docker exec afiliators-postgres psql -U postgres -d afiliators -c "\dt"

# Query leads
docker exec afiliators-postgres psql -U postgres -d afiliators \
  -c 'SELECT id, name, email, phone, status FROM crm_leads;'

# Reset database
docker-compose down -v && docker-compose up -d
docker exec afiliators-backend node prisma/seed.js
```
