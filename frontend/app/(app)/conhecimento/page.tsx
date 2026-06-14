'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Search,
  ChevronDown,
  ChevronRight,
  DollarSign,
  CreditCard,
  Shield,
  Smartphone,
  HelpCircle,
  Phone,
  Mail,
  Globe,
  AlertTriangle,
  BadgeCheck,
  ArrowRight,
  PiggyBank,
  Banknote,
  Receipt,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== KNOWLEDGE BASE DATA ====================

interface KnowledgeItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
}

interface KnowledgeSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  items: KnowledgeItem[];
}

const KNOWLEDGE_SECTIONS: KnowledgeSection[] = [
  {
    id: 'planos',
    title: 'Planos e Preços Revolut',
    icon: CreditCard,
    description: 'Comparação completa dos planos Standard, Plus, Premium, Metal e Ultra.',
    items: [
      {
        id: 'planos-comparacao',
        category: 'Planos',
        question: 'Quais são os planos da Revolut e quanto custam?',
        answer: `**Planos Revolut (preços Europa):**

| Plano | Mensal | Anual |
|-------|--------|-------|
| **Standard** | Grátis | Grátis |
| **Plus** | €2,99 | €30 |
| **Premium** | €7,99 | €80 |
| **Metal** | €13,99 | €140 |
| **Ultra** | €45-60 | €540 |

**Diferenças principais:**
- **Standard**: Conta básica, €1.000/mês de câmbio sem taxa, saques até €200/mês
- **Plus**: €3.000/mês de câmbio sem taxa, cartão personalizado
- **Premium**: Câmbio ILIMITADO sem taxa, seguro viagem, acesso a lounges com desconto
- **Metal**: Tudo do Premium + cashback 0,1% (Europa) / 1% (fora), cartão de aço inox
- **Ultra**: Tudo do Metal + assinaturas premium inclusas (MasterClass, Perplexity Pro, etc), eSIM 3GB/mês, concierge elite`,
        tags: ['planos', 'preços', 'standard', 'premium', 'metal', 'ultra'],
      },
      {
        id: 'limites-saques',
        category: 'Planos',
        question: 'Quais os limites de saque e transferência?',
        answer: `**Limites por plano (Europa):**

| Plano | Saque Grátis/mês | FX Grátis/mês |
|-------|-----------------|---------------|
| Standard | €200 ou 5 saques | €1.000 |
| Plus | €200 ou 5 saques | €3.000 |
| Premium | €400 | ILIMITADO |
| Metal | €800 | ILIMITADO |
| Ultra | €2.000 | ILIMITADO |

**Taxas ao exceder:**
- Saque: 2% (mínimo €1)
- Câmbio (Standard): 1% sobre o excedente
- Câmbio (Plus): 0,5% sobre o excedente

**No Brasil:**
- Limite de uso justo: R$ 10.000/mês
- Após: taxa adicional de 0,5%
- Saque ATM: Grátis até R$ 1.600 ou 5 saques/mês`,
        tags: ['limites', 'saque', 'transferência', 'atm', 'câmbio'],
      },
      {
        id: 'qual-plano-recomendar',
        category: 'Planos',
        question: 'Qual plano devo recomendar para cada tipo de cliente?',
        answer: `**Guia de recomendação:**

**Standard** → Para quem:
- Vai usar pouco (viagem ocasional)
- Não precisa de câmbio frequente
- Quer experimentar o Revolut sem compromisso

**Premium** → Para quem:
- Viaja com frequência
- Faz câmbio regularmente (mais de €1.000/mês)
- Quer seguro viagem incluso
- Economia de ~€120/ano vs Standard se usar >€1.000/mês em câmbio

**Metal** → Para quem:
- Quer cashback nas compras
- Viaja muito e quer benefícios máximos
- Gosta do status do cartão de metal
- Economia de ~€240/ano considerando cashback + câmbio

**Ultra** → Para quem:
- Já paga por várias assinaturas separadas
- Viajante frequente (acesso ilimitado a lounges)
- Alto volume de transferências internacionais
- Quer o melhor de tudo`,
        tags: ['recomendação', 'planos', 'vendas', 'comparação'],
      },
    ],
  },
  {
    id: 'pix',
    title: 'PIX e Transferências no Brasil',
    icon: Banknote,
    description: 'Tudo sobre PIX, taxas de transferência e limites no Brasil.',
    items: [
      {
        id: 'pix-como-funciona',
        category: 'PIX',
        question: 'Como fazer PIX pelo Revolut?',
        answer: `**Passo a passo para PIX no Revolut:**

1. Abra o app Revolut
2. Toque em **Transferir** (ícone de seta)
3. Selecione **PIX**
4. Escolha o tipo de chave: CPF/CNPJ, telefone, email, ou chave aleatória
5. Digite o valor
6. Confirme a transação

**Importante:**
- PIX é o ÚNICO método para transferências locais em BRL
- Não existe TED/DOC no Revolut Brasil
- Receber PIX é GRATUITO (sem taxa do Revolut)
- Transferências entre contas Revolut são instantâneas e gratuitas
- PIX Automático disponível para contas recorrentes`,
        tags: ['pix', 'transferência', 'brasil', 'passo a passo'],
      },
      {
        id: 'taxas-brasil',
        category: 'PIX',
        question: 'Quais as taxas do Revolut no Brasil?',
        answer: `**Taxas no Brasil (Standard):**

| Operação | Taxa |
|----------|------|
| PIX local (BRL → BRL) | Consultar no app |
| Transferência com conversão (BRL → USD/EUR) | 0,5% |
| Cartão para conta | R$ 7,50 + 0,8% |
| Câmbio BRL → Estrangeiro | 1,1% IOF + 0,6% spread |
| Fora do horário comercial | +0,2% spread |
| Câmbio Estrangeiro → BRL | 0,38% IOF + 0,6% spread |
| Saque ATM | Grátis até R$ 1.600/mês (ou 5 saques), depois 2% |
| Limite exportação BRL | USD 10.000/ano (sem comprovante) |

**Horário comercial para câmbio:**
- USD: Seg-Sex 9h-18h (horário de Brasília)
- Outras moedas: Seg-Sex 9h-17h`,
        tags: ['taxas', 'brasil', 'câmbio', 'iof', 'pix'],
      },
      {
        id: 'pix-automatico',
        category: 'PIX',
        question: 'O que é PIX Automático e como funciona?',
        answer: `**PIX Automático:**
- Serviço GRATUITO para contas recorrentes
- Autoriza empresas (CNPJ) a debitarem sua conta em recorrência
- Periodicidade: semanal, mensal, trimestral ou anual
- Você define limite de valor por autorização
- Ideal para: água, luz, internet, streaming, academia, escola

**Como configurar:**
1. Acesse a área PIX no app
2. Selecione "PIX Automático"
3. Cadastre a empresa pelo CNPJ
4. Defina o valor máximo e periodicidade
5. Confirme a autorização`,
        tags: ['pix', 'automático', 'recorrente', 'contas'],
      },
    ],
  },
  {
    id: 'cadastro',
    title: 'Abertura de Conta e Verificação',
    icon: BadgeCheck,
    description: 'Processo de cadastro, documentos necessários e verificação de identidade.',
    items: [
      {
        id: 'documentos',
        category: 'Cadastro',
        question: 'Quais documentos preciso para abrir conta no Revolut?',
        answer: `**Documentos necessários (Brasil):**
- RG ou CNH (documento com foto, válido)
- CPF
- Comprovante de residência (conta de luz, água, internet — últimos 90 dias)
- Selfie (foto do rosto) para verificação biométrica

**Processo:**
1. Baixe o app e use o link de afiliado
2. Preencha dados pessoais (nome, CPF, data nascimento)
3. Tire foto do documento (frente e verso)
4. Tire uma selfie para verificação
5. Aguarde aprovação (24-48 horas úteis)

**Dicas para aprovação:**
- Documento sem rasuras ou danos
- Foto bem iluminada, sem reflexos
- Nome no documento deve bater com o cadastro
- Documento dentro da validade`,
        tags: ['cadastro', 'documentos', 'verificação', 'kyc', 'abertura'],
      },
      {
        id: 'verificacao-recusada',
        category: 'Cadastro',
        question: 'O que fazer quando a verificação é recusada?',
        answer: `**Motivos comuns de recusa:**
- Documento vencido
- Foto ilegível ou com reflexo
- Documento danificado ou escrito à mão
- Dados diferentes do cadastro
- Menor de 18 anos

**O que fazer:**
1. Verifique se o documento está válido e legível
2. Tire nova foto em ambiente bem iluminado
3. Confira se todos os dados batem com o documento
4. Tente novamente no app (você tem múltiplas tentativas)
5. Se continuar recusando, entre em contato pelo chat do app

**Prazo:** Até 7 dias úteis para análise em casos complexos`,
        tags: ['verificação', 'recusa', 'problemas', 'documentos'],
      },
    ],
  },
  {
    id: 'problemas',
    title: 'Problemas Comuns e Soluções',
    icon: AlertTriangle,
    description: 'Conta bloqueada, app com erro, cartão não funciona e outros problemas.',
    items: [
      {
        id: 'conta-bloqueada',
        category: 'Problemas',
        question: 'Minha conta foi bloqueada. O que fazer?',
        answer: `**Causas comuns de bloqueio:**
- Atividade suspeita ou incomum
- Transferências grandes ou inesperadas
- Recebimento de fontes sinalizadas
- Documentos de verificação pendentes
- Violação dos termos de uso

**Passo a passo para resolver:**
1. **Chat do app** (24h) — primeiro contato, disponível mesmo com conta bloqueada
2. Forneça os documentos solicitados rapidamente
3. Se não resolver em 48h, escale:

**Canais de suporte no Brasil:**
| Canal | Contato |
|-------|---------|
| Chat no app | 24 horas, 7 dias |
| Telefone SP | (11) 5039-1888 |
| Telefone Brasil | 0800 591 1445 |
| Suporte | suporte@revolut.com |
| Ouvidoria | ouvidoria@revolut.com |
| Reclamação formal | formalcomplaints@revolut.com |

4. Se nenhum canal resolver, registre reclamação no **Banco Central do Brasil**
   - Site: bcb.gov.br
   - A reclamação no BC geralmente acelera a resolução`,
        tags: ['bloqueio', 'conta', 'suporte', 'reclamação'],
      },
      {
        id: 'cartao-nao-funciona',
        category: 'Problemas',
        question: 'O cartão Revolut não funciona. O que fazer?',
        answer: `**Problemas comuns com o cartão:**

**Cartão recusado em compras:**
1. Verifique se o cartão está ativo no app
2. Confira se há saldo suficiente
3. Verifique se o limite do cartão não foi atingido
4. Tente com chip + senha (não por aproximação)
5. Alguns estabelecimentos não aceitam cartão internacional

**ATM no Brasil:**
- Relatos de recusa em vários bancos brasileiros
- **Santander** costuma funcionar melhor
- Evite Banco24Horas (taxas altas)
- Use a função "Encontrar ATM" no app

**Cartão clonado/perdido:**
1. Bloqueie IMEDIATAMENTE pelo app
2. Peça novo cartão (taxa de reemissão pode aplicar)
3. Conteste transações não reconhecidas pelo chat`,
        tags: ['cartão', 'problemas', 'atm', 'recusado'],
      },
      {
        id: 'app-erro',
        category: 'Problemas',
        question: 'O app Revolut está com erro. Como resolver?',
        answer: `**Soluções para problemas no app:**

1. **Atualize o app** — verifique a loja de apps (App Store / Google Play)
2. **Limpe o cache** — Android: Configurações → Apps → Revolut → Limpar cache
3. **Reinicie o celular** — resolve a maioria dos problemas temporários
4. **Verifique a internet** — Wi-Fi instável ou dados móveis fracos causam erros
5. **Forçar parada** — Android: Configurações → Apps → Revolut → Forçar parada
6. **Reinstale o app** — último recurso (seus dados ficam salvos na nuvem)

**Se nada funcionar:**
- Tente acessar pelo site: revolut.com (funções limitadas)
- Entre em contato pelo suporte alternativo: suporte@revolut.com
- Se tiver outro celular disponível, teste nele`,
        tags: ['app', 'erro', 'troubleshooting', 'suporte'],
      },
    ],
  },
  {
    id: 'afiliados',
    title: 'Programa de Afiliados',
    icon: DollarSign,
    description: 'Como funciona o programa de afiliados Revolut e comissões.',
    items: [
      {
        id: 'como-ganhar',
        category: 'Afiliados',
        question: 'Como ganhar dinheiro com o programa de afiliados Revolut?',
        answer: `**Modelo de Comissão:**
- **CPA (Custo por Ação)** — comissão fixa por cadastro qualificado
- Plataforma: **Impact** (principal), **Admitad** (30+ países)
- Dois programas: **Revolut Retail** (pessoas físicas) e **Revolut Business** (empresas)

**Cadastro qualificado = usuário precisa:**
1. Clicar no seu link de afiliado
2. Criar conta Revolut
3. Passar verificação KYC
4. Fazer primeiro depósito/transação

**Pagamentos:**
- Mensal via transferência bancária
- Prazo: 30 dias
- Sem valor mínimo de saque

**Como se inscrever:**
- Site: revolut.com/en-IN/become-a-revolut-affiliate/
- E-mail: affiliates@revolut.com
- Aprovação: 1-5 dias úteis`,
        tags: ['afiliados', 'comissão', 'impact', 'ganhos'],
      },
      {
        id: 'programa-indicacao',
        category: 'Afiliados',
        question: 'Como funciona o programa de indicação (referral)?',
        answer: `**Programa de Indicação Revolut:**

- **Recompensa unilateral**: apenas o indicador ganha
- **Campanhas temporárias**: ~21 dias, convite aparece no app
- **Máximo**: 5 indicações por campanha

**Passos que o indicado precisa completar:**
1. Abrir conta Revolut NOVA pelo seu link
2. Fazer depósito externo (não serve transferência entre Revolut)
3. Pedir cartão físico (paga frete ~€5)
4. Fazer 3 compras de pelo menos €5 cada

**Valores das recompensas (modelo variável):**
- 60% chance: £10 (~R$65)
- 26% chance: £25 (~R$160)
- 10% chance: £50 (~R$320)
- 3% chance: £100 (~R$640)
- 1% chance: £200 (~R$1.280)

**Estorno:** Recompensa cancelada se indicado fechar conta em 14 dias ou cancelar cartão`,
        tags: ['indicação', 'referral', 'recompensa', 'bônus'],
      },
    ],
  },
  {
    id: 'suporte',
    title: 'Canais de Suporte Revolut',
    icon: HelpCircle,
    description: 'Todos os canais oficiais de suporte e como escalar problemas.',
    items: [
      {
        id: 'canais-oficiais',
        category: 'Suporte',
        question: 'Quais são todos os canais de suporte do Revolut?',
        answer: `**Canais de Suporte Revolut Brasil:**

| Canal | Contato | Horário |
|-------|---------|---------|
| Chat no app | Menu → Ajuda → Chat | 24/7 |
| Telefone SP | (11) 5039-1888 | Dias úteis |
| 0800 Brasil | 0800 591 1445 | Dias úteis |
| Email Suporte | suporte@revolut.com | — |
| Ouvidoria | ouvidoria@revolut.com | — |
| Reclamação Formal | formalcomplaints@revolut.com | — |
| Site | revolut.com/pt-BR | 24/7 |

**Para escalar:**
1. Comece sempre pelo chat do app
2. Anote o número do protocolo
3. Se não resolver em 48h, escale para ouvidoria
4. Último recurso: **Banco Central do Brasil** (bcb.gov.br)

**Ligações internacionais:**
- UK: +44 20 3322 8352
- EU: +370 5 214 3608`,
        tags: ['suporte', 'contato', 'telefone', 'email', 'chat'],
      },
    ],
  },
];

// ==================== COMPONENTS ====================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors"
      title="Copiar"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function KnowledgeCard({
  item,
  isExpanded,
  onToggle,
}: {
  item: KnowledgeItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-white/10 transition-all"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left group"
      >
        <div className={cn(
          'mt-0.5 transition-transform duration-200',
          isExpanded && 'rotate-90'
        )}>
          <ChevronRight size={16} className={isExpanded ? 'text-emerald-400' : 'text-white/30 group-hover:text-white/50'} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            'text-sm font-medium transition-colors',
            isExpanded ? 'text-emerald-400' : 'text-white/80 group-hover:text-white'
          )}>
            {item.question}
          </h4>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.04] text-white/30 border border-white/[0.04]">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <CopyButton text={`${item.question}\n\n${item.answer}`} />
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pl-11">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                {item.answer}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ==================== MAIN PAGE ====================

export default function ConhecimentoPage() {
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(KNOWLEDGE_SECTIONS.map((s) => s.id))
  );

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // Filter by search
  const filteredSections = search.trim()
    ? KNOWLEDGE_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.question.toLowerCase().includes(search.toLowerCase()) ||
            item.answer.toLowerCase().includes(search.toLowerCase()) ||
            item.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
        ),
      })).filter((section) => section.items.length > 0)
    : KNOWLEDGE_SECTIONS;

  return (
    
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Base de Conhecimento</h1>
            <p className="text-sm text-white/40 mt-0.5">
              Tudo sobre Revolut para ajudar seus clientes
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            placeholder="Buscar na base de conhecimento... (ex: PIX, taxas, planos)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/30 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Search results info */}
        {search && (
          <p className="text-xs text-white/40">
            {filteredSections.reduce((sum, s) => sum + s.items.length, 0)} resultados para "{search}"
          </p>
        )}

        {/* Sections */}
        <div className="space-y-4">
          {filteredSections.map((section) => {
            const isSectionExpanded = expandedSections.has(section.id);
            const SectionIcon = section.icon;

            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[24px] border border-white/5 bg-white/[0.02] overflow-hidden"
              >
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 p-5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <SectionIcon size={18} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-white">{section.title}</h2>
                    <p className="text-xs text-white/40 mt-0.5">
                      {section.description} · {section.items.length} {section.items.length === 1 ? 'artigo' : 'artigos'}
                    </p>
                  </div>
                  <div className={cn(
                    'transition-transform duration-200',
                    isSectionExpanded && 'rotate-180'
                  )}>
                    <ChevronDown size={18} className="text-white/30" />
                  </div>
                </button>

                {/* Section items */}
                <AnimatePresence>
                  {isSectionExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-2.5">
                        {section.items.length === 0 && search ? (
                          <p className="text-sm text-white/30 py-4 text-center">
                            Nenhum artigo encontrado para "{search}" nesta seção.
                          </p>
                        ) : (
                          section.items.map((item) => (
                            <KnowledgeCard
                              key={item.id}
                              item={item}
                              isExpanded={expandedItems.has(item.id)}
                              onToggle={() => toggleItem(item.id)}
                            />
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen size={48} className="text-white/10 mb-4" />
            <h2 className="text-lg font-medium text-white/60 mb-2">Nenhum resultado</h2>
            <p className="text-sm text-white/30 max-w-md">
              Nenhum artigo corresponde à sua busca. Tente outros termos como "PIX", "taxas", "planos" ou "cadastro".
            </p>
          </div>
        )}
      </motion.div>
    
  );
}
