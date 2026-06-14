/**
 * LGPD Compliance Routes
 * AFILIATORS Backend
 *
 * Consent management, data deletion requests, privacy policy
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();

// Privacy policy is public, consent endpoints require auth
const PRIVACY_POLICY_TEXT = `
POLITICA DE PRIVACIDADE - AFILIATORS

1. INTRODUCAO

Esta politica de privacidade explica como a AFILIATORS coleta, armazena, usa e protege seus
dados pessoais, em conformidade com a Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018).

2. DADOS COLETADOS

Coletamos os seguintes tipos de dados pessoais:
- Dados de identificacao: nome, email, telefone, CPF
- Dados financeiros: valor de negocios, transacoes PIX, dados de cartao virtual
- Dados de comunicacao: conversas via WhatsApp
- Dados de navegacao: endereco IP, user agent

3. FINALIDADE DO TRATAMENTO

Seus dados sao tratados para as seguintes finalidades:
- Executar contratos e prestar servicos contratados
- Gerenciar relacionamento comercial (CRM)
- Processar pagamentos via PIX
- Emitir e gerenciar cartoes virtuais
- Comunicacao via WhatsApp com seu consentimento
- Marketing, quando autorizado
- Cumprir obrigacoes legais e regulatorias

4. BASE LEGAL

O tratamento de dados e realizado com base nas seguintes hipoteses legais da LGPD:
- Art. 7, I - Consentimento do titular
- Art. 7, V - Execucao de contrato
- Art. 7, IX - Interesse legitimo
- Art. 7, X - Protecao ao credito

5. COMPARTILHAMENTO

Seus dados nao serao vendidos ou compartilhados com terceiros, exceto:
- Operadores de pagamento (PIX, bandeiras de cartao)
- Autoridades fiscalizadoras, por obrigacao legal
- Prestadores de servico que atuam em nosso nome (suboperadores)

6. ARMAZENAMENTO

Seus dados sao armazenados em servidores seguros localizados no Brasil.
Dados de cartao virtual (PAN, CVV) sao criptografados com AES-256-GCM.
Dados de API keys sao armazenados com criptografia em repouso.

7. DIREITOS DO TITULAR

Voce tem os seguintes direitos garantidos pela LGPD:
- Confirmacao da existencia de tratamento
- Acesso aos dados
- Correcao de dados incompletos, inexatos ou desatualizados
- Anonimizacao, bloqueio ou eliminacao de dados desnecessarios
- Portabilidade dos dados
- Eliminacao dos dados tratados com consentimento
- Informacao sobre compartilhamento
- Revogacao do consentimento
- Oposicao a tratamento

8. EXERCICIO DOS DIREITOS

Para exercer seus direitos, entre em contato pelo email: lgpd@afiliators.com
As solicitacoes serao atendidas em ate 15 dias uteis.

9. ELIMINACAO DE DADOS

Ao solicitar a eliminacao de dados:
- Dados essenciais para obrigacoes legais serao mantidos pelo periodo legal
- Dados de transacoes financeiras seguem periodo de retencao de 5 anos
- Demais dados serao eliminados ou anonimizados em ate 30 dias

10. SEGURANCA

Adotamos medidas tecnicas e administrativas para proteger seus dados:
- Criptografia em transito (TLS 1.3) e em repouso (AES-256)
- Controle de acesso baseado em funcoes (RBAC)
- Registro de auditoria de acessos
- Monitoramento continuo de seguranca

11. CONTATO

Encarregado de Dados (DPO): dpo@afiliators.com
Email para direitos LGPD: lgpd@afiliators.com

ULTIMA ATUALIZACAO: 01/06/2026
`;

/**
 * GET /api/lgpd/privacy-policy
 * Public endpoint - return privacy policy text
 */
router.get('/privacy-policy', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'Politica de Privacidade - AFILIATORS',
      version: '1.0.0',
      updatedAt: '2026-06-01T00:00:00Z',
      text: PRIVACY_POLICY_TEXT,
    },
  });
});

// Protected routes
router.use(authenticateToken);

/**
 * POST /api/lgpd/consent
 * Record consent for a lead
 */
router.post('/consent', async (req, res) => {
  try {
    const { leadId, consentType, granted, expiresAt } = req.body;

    if (!leadId || !consentType) {
      return res.status(400).json({
        success: false,
        error: 'leadId and consentType are required',
      });
    }

    const validTypes = ['DATA_PROCESSING', 'WHATSAPP_CONTACT', 'MARKETING', 'PIX_TRANSACTION', 'CARD_ISSUANCE'];
    if (!validTypes.includes(consentType)) {
      return res.status(400).json({
        success: false,
        error: `consentType must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Verify lead belongs to operator
    const lead = await prisma.lead.findFirst({
      where: { id: parseInt(leadId), operatorId: req.user.operatorId },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found or access denied' });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Upsert consent (one consent type per lead)
    const consent = await prisma.consentRecord.upsert({
      where: { leadId: parseInt(leadId) },
      update: {
        consentType,
        granted: granted !== undefined ? granted : true,
        ipAddress,
        userAgent,
        grantedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        revokedAt: null, // Clear revocation on re-grant
      },
      create: {
        operatorId: req.user.operatorId,
        leadId: parseInt(leadId),
        consentType,
        granted: granted !== undefined ? granted : true,
        ipAddress,
        userAgent,
        grantedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    res.status(201).json({ success: true, data: consent });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to record consent');
    res.status(500).json({ success: false, error: 'Failed to record consent', message: error.message });
  }
});

/**
 * GET /api/lgpd/consent/:leadId
 * Check consent for a lead
 */
router.get('/consent/:leadId', async (req, res) => {
  try {
    const consent = await prisma.consentRecord.findFirst({
      where: {
        leadId: parseInt(req.params.leadId),
        operatorId: req.user.operatorId,
      },
    });

    if (!consent) {
      return res.status(404).json({
        success: false,
        error: 'No consent record found for this lead',
        hasConsent: false,
      });
    }

    res.json({
      success: true,
      data: {
        consent,
        hasConsent: consent.granted && !consent.revokedAt,
        isExpired: consent.expiresAt ? new Date() > consent.expiresAt : false,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get consent');
    res.status(500).json({ success: false, error: 'Failed to get consent', message: error.message });
  }
});

/**
 * DELETE /api/lgpd/consent/:leadId
 * Revoke consent for a lead
 */
router.delete('/consent/:leadId', async (req, res) => {
  try {
    const consent = await prisma.consentRecord.findFirst({
      where: {
        leadId: parseInt(req.params.leadId),
        operatorId: req.user.operatorId,
      },
    });

    if (!consent) {
      return res.status(404).json({ success: false, error: 'No consent record found' });
    }

    const updated = await prisma.consentRecord.update({
      where: { id: consent.id },
      data: {
        granted: false,
        revokedAt: new Date(),
      },
    });

    res.json({ success: true, data: updated, message: 'Consent revoked successfully' });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to revoke consent');
    res.status(500).json({ success: false, error: 'Failed to revoke consent', message: error.message });
  }
});

/**
 * POST /api/lgpd/deletion-requests
 * Submit a data deletion request
 */
router.post('/deletion-requests', async (req, res) => {
  try {
    const { leadId, contactEmail, requestType } = req.body;

    if (!contactEmail || !requestType) {
      return res.status(400).json({
        success: false,
        error: 'contactEmail and requestType are required',
      });
    }

    const validTypes = ['FULL_ERASURE', 'ANONYMIZATION'];
    if (!validTypes.includes(requestType)) {
      return res.status(400).json({
        success: false,
        error: `requestType must be one of: ${validTypes.join(', ')}`,
      });
    }

    const request = await prisma.dataDeletionRequest.create({
      data: {
        operatorId: req.user.operatorId,
        leadId: leadId ? parseInt(leadId) : null,
        contactEmail,
        requestType,
        status: 'PENDING',
      },
    });

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to submit deletion request');
    res.status(500).json({ success: false, error: 'Failed to submit deletion request', message: error.message });
  }
});

/**
 * GET /api/lgpd/deletion-requests
 * List deletion requests for the operator
 */
router.get('/deletion-requests', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };
    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.dataDeletionRequest.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.dataDeletionRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list deletion requests');
    res.status(500).json({ success: false, error: 'Failed to list deletion requests', message: error.message });
  }
});

module.exports = router;
