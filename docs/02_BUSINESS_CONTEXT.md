# Business Context — Revolut Affiliate Program

## The Business Model

AFILIATORS is built for the **Revolut affiliate program**. Operators earn commission by helping people sign up for Revolut, use the platform, and complete transactions.

### Revenue Streams
1. **Signup commissions** — One-time payment when a referred user creates and verifies a Revolut account
2. **Transaction commissions** — Ongoing percentage of user transactions
3. **Premium upgrades** — Bonus when users upgrade to Revolut Premium/Metal
4. **Currency exchange** — Commission on FX transactions

## User Personas

### End Users (who message us on WhatsApp)
- **"Tenho dinheiro preso no Revolut"** — Needs cashout help
- **"Quero criar conta"** — New user, needs guidance through signup
- **"Qual o melhor plano?"** — Comparing Standard vs Premium vs Metal
- **"Como funciona o cambio?"** — Currency exchange questions
- **"O app deu erro"** — Technical support

### Operators (who use the CRM)
- Bruno — Sales operator, handles leads
- Vladimir — Sales operator, handles leads
- Admin — Platform administrator

## Common User Questions & AI Responses

### 1. Cashout ("Como sacar dinheiro do Revolut?")
**AI Response Pattern:**
1. Ask which currency and amount
2. Explain PIX cashout process (instant, free up to certain limit)
3. Guide through the app: Home → Transfer → PIX → Enter amount
4. Mention processing time: typically instant, up to 30 minutes
5. If stuck: offer human support escalation

### 2. Account Creation ("Quero abrir conta no Revolut")
**AI Response Pattern:**
1. Send affiliate signup link
2. List required documents: RG/CNH, CPF, comprovante de residencia
3. Explain verification process: photo + document + selfie
4. Timeline: usually 24-48 hours for approval
5. Follow up after 2 days if no confirmation

### 3. Limits & Fees ("Quais os limites? Tem taxas?")
**AI Response Pattern:**
1. Explain tiered limits: Standard (R$5k/mo), Premium (R$20k/mo), Metal (R$50k/mo)
2. PIX transfers: free
3. International transfers: % fee based on amount
4. ATM withdrawals: free up to R$2k/mo, then %
5. Currency exchange: interbank rate + small markup

### 4. Support ("O app nao funciona / deu erro")
**AI Response Pattern:**
1. Ask for specific error message or screenshot
2. Common fixes: update app, clear cache, check internet
3. If account locked: explain verification process
4. Escalate to human if unresolved after 3 exchanges

## Lead Pipeline Stages

```
NOVO ──→ EM_CONTATO ──→ QUALIFICADO ──→ PROPOSTA ──→ FECHADO
  │           │               │               │            │
  New       First          Showed         Sent          Signed up
  lead      contact        interest       proposal      /cashed out
  │           │               │               │            │
  └───────────┴───────────────┴───────────────┴──→ PERDIDO
                                                  (no response,
                                                   not interested,
                                                   already has Revolut)
```

### Stage Transitions (Auto by AI Orchestrator)
| Trigger | From | To |
|---------|------|----|
| First message received | NOVO | EM_CONTATO |
| User shows interest ("quero", "tenho interesse") | EM_CONTATO | QUALIFICADO |
| User asks about prices/limits | QUALIFICADO | PROPOSTA |
| User confirms signup/cashout | PROPOSTA | FECHADO |
| No response for 7 days | Any | PERDIDO |
| User says "nao quero", "ja tenho" | Any | PERDIDO |

## LGPD Compliance (Brazilian Data Protection)

- All user data stored in PostgreSQL with operator-level isolation
- Users can request data export or deletion via `/lgpd` page
- Consent tracking for WhatsApp communications
- Data retention: inactive leads archived after 6 months
- No data shared with third parties beyond Revolut (for affiliate tracking)

## Portuguese Business Terminology

| English | Portuguese (use this) |
|---------|----------------------|
| Lead | Lead (same) |
| Contact | Contato |
| Deal/Negotiation | Negocio |
| Pipeline | Pipeline / Funil |
| Cashout | Saque / Cashout |
| Commission | Comissao |
| Signup | Cadastro / Criar conta |
| Affiliate | Afiliado |
| Operator | Operador |
| Follow-up | Acompanhamento |
| Takeover | Assumir conversa |
