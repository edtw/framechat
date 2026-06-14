/**
 * AFILIATORS Seed — Creates default operators and admin user
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding AFILIATORS database...\n');

  // Create Admin Operator
  const adminOp = await prisma.operator.upsert({
    where: { email: 'admin@afiliators.local' },
    update: {},
    create: {
      name: 'AFILIATORS Admin',
      email: 'admin@afiliators.local',
      phone: '+5511999999999',
      active: true,
    },
  });
  console.log('✅ Admin operator created');

  // Create Bruno operator
  const brunoOp = await prisma.operator.upsert({
    where: { email: 'bruno@afiliators.local' },
    update: {},
    create: {
      name: 'Bruno',
      email: 'bruno@afiliators.local',
      phone: '+5511988888888',
      active: true,
    },
  });
  console.log('✅ Bruno operator created');

  // Create Vladimir operator
  const vladOp = await prisma.operator.upsert({
    where: { email: 'vladimir@afiliators.local' },
    update: {},
    create: {
      name: 'Vladimir',
      email: 'vladimir@afiliators.local',
      phone: '+5511977777777',
      active: true,
    },
  });
  console.log('✅ Vladimir operator created');

  // Create Admin user
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@afiliators.local' },
    update: {},
    create: {
      operatorId: adminOp.id,
      email: 'admin@afiliators.local',
      password: adminHash,
      name: 'Admin',
      role: 'ADMIN',
      active: true,
    },
  });
  console.log('✅ Admin user (admin@afiliators.local / admin123)');

  // Create Bruno user (operator)
  const brunoHash = await bcrypt.hash('bruno123', 10);
  await prisma.user.upsert({
    where: { email: 'bruno@afiliators.local' },
    update: {},
    create: {
      operatorId: brunoOp.id,
      email: 'bruno@afiliators.local',
      password: brunoHash,
      name: 'Bruno',
      role: 'OPERATOR',
      active: true,
    },
  });
  console.log('✅ Bruno user (bruno@afiliators.local / bruno123)');

  // Create Vladimir user (operator)
  const vladHash = await bcrypt.hash('vladimir123', 10);
  await prisma.user.upsert({
    where: { email: 'vladimir@afiliators.local' },
    update: {},
    create: {
      operatorId: vladOp.id,
      email: 'vladimir@afiliators.local',
      password: vladHash,
      name: 'Vladimir',
      role: 'OPERATOR',
      active: true,
    },
  });
  console.log('✅ Vladimir user (vladimir@afiliators.local / vladimir123)');

  // Create sample tags
  const tags = [
    { name: 'VIP', color: '#F59E0B' },
    { name: 'Urgente', color: '#EF4444' },
    { name: 'Investidor', color: '#8B5CF6' },
    { name: 'Iniciante', color: '#3B82F6' },
    { name: 'Recorrente', color: '#10B981' },
  ];
  for (const tag of tags) {
    await prisma.tag.upsert({ where: { name: tag.name }, update: {}, create: tag });
  }
  console.log('✅ Tags created');

  // Create sample knowledge items for operators
  const knowledgeItems = [
    {
      title: 'Como funciona o PIX',
      content: 'O PIX é um pagamento instantâneo brasileiro. O código PIX Copia e Cola é gerado automaticamente pelo sistema. Basta compartilhar com o lead e aguardar a confirmação do pagamento.',
      category: 'Pagamentos',
    },
    {
      title: 'Cartão Virtual Afiliators',
      content: 'O cartão virtual Afiliators permite saque via NFC em maquininhas credenciadas. O lead recebe o cartão virtual e pode utilizá-lo imediatamente após concordar com os termos LGPD.',
      category: 'Produtos',
    },
    {
      title: 'Política de Privacidade LGPD',
      content: 'Todos os dados dos leads são protegidos pela LGPD. Solicitamos consentimento explícito antes de processar dados pessoais. Leads podem solicitar exclusão de dados a qualquer momento.',
      category: 'LGPD',
    },
  ];
  for (const op of [brunoOp, vladOp]) {
    for (const item of knowledgeItems) {
      await prisma.knowledgeItem.create({
        data: { ...item, operatorId: op.id },
      });
    }
  }
  console.log('✅ Knowledge base items created');

  console.log('\n🎉 Seed complete!');
  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('─────────────────────────────────────────');
  console.log('Admin:    admin@afiliators.local / admin123');
  console.log('Bruno:    bruno@afiliators.local / bruno123');
  console.log('Vladimir: vladimir@afiliators.local / vladimir123');
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
