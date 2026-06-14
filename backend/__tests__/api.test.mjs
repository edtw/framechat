/**
 * Backend API Tests — Node.js built-in test runner
 * Tests critical endpoints: health, auth, sessions, CRM
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';

const API_BASE = 'http://localhost:3005';

let adminToken = '';
let operatorToken = '';

before(async () => {
  // Login as admin
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@afiliators.local', password: 'admin123' }),
  });
  const data = await res.json();
  adminToken = data?.data?.token || data?.token || '';

  // Login as operator
  const res2 = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bruno@afiliators.local', password: 'bruno123' }),
  });
  const data2 = await res2.json();
  operatorToken = data2?.data?.token || data2?.token || '';
});

describe('Health', () => {
  it('GET /health returns healthy', async () => {
    const res = await fetch(`${API_BASE}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
  });

  it('GET / returns API info', async () => {
    const res = await fetch(`${API_BASE}/`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.name.includes('AFILIATORS'));
  });
});

describe('Auth', () => {
  it('POST /api/auth/login succeeds with valid credentials', async () => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@afiliators.local', password: 'admin123' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.token);
  });

  it('POST /api/auth/login fails with wrong password', async () => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@afiliators.local', password: 'wrong' }),
    });
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/auth/login fails with missing fields', async () => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
  });
});

describe('CRM Leads', () => {
  it('GET /api/crm/leads requires auth', async () => {
    const res = await fetch(`${API_BASE}/api/crm/leads`);
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/crm/leads returns leads for authenticated user', async () => {
    const res = await fetch(`${API_BASE}/api/crm/leads`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  it('GET /api/crm/leads/stats returns stats', async () => {
    const res = await fetch(`${API_BASE}/api/crm/leads/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });
});

describe('WhatsApp Sessions', () => {
  let createdSessionId = '';

  it('GET /api/whatsapp/sessions returns sessions', async () => {
    const res = await fetch(`${API_BASE}/api/whatsapp/sessions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.sessions));
  });

  it('POST /api/whatsapp/sessions creates a session', async () => {
    const res = await fetch(`${API_BASE}/api/whatsapp/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Test Session via API' }),
    });
    assert.ok(res.status === 201 || res.status === 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    createdSessionId = data.sessionId || data.session?.sessionId;
    assert.ok(createdSessionId);
  });

  it('GET /api/whatsapp/sessions includes created session', { skip: !createdSessionId }, async () => {
    const res = await fetch(`${API_BASE}/api/whatsapp/sessions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    const found = data.sessions.some(s => s.sessionId === createdSessionId);
    assert.ok(found);
  });

  it('DELETE /api/whatsapp/sessions/:id deletes session', async () => {
    if (!createdSessionId) return;
    const res = await fetch(`${API_BASE}/api/whatsapp/sessions/${createdSessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });
});

describe('Operators', () => {
  it('GET /api/operators returns operators list', async () => {
    const res = await fetch(`${API_BASE}/api/operators`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.length >= 2);
  });
});

describe('Role-Based Access', () => {
  it('OPERATOR can access leads', async () => {
    const res = await fetch(`${API_BASE}/api/crm/leads`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    assert.strictEqual(res.status, 200);
  });

  it('OPERATOR can access WhatsApp sessions', async () => {
    const res = await fetch(`${API_BASE}/api/whatsapp/sessions`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    assert.strictEqual(res.status, 200);
  });
});
