require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { OAuth2Client } = require('google-auth-library');
// Relatório financeiro em PDF/Excel (INSTITUTION Sprint 8, briefing
// 08/09/2026) — pdfkit+exceljs escolhidos em vez de puppeteer: geram o
// arquivo direto em memória, sem precisar de Chromium instalado no serviço
// gratuito do Render (ver mapa de deploy em memória de longo prazo).
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// ─── ASAAS (Pix/Boleto/Cartão) — segundo gateway de cobrança Aluno→Escola,
// somado ao Stripe Connect acima (seção 10e-2/10e-3 mais abaixo). Diferente
// do Stripe (a plataforma tem UMA conta e roteia pra sub-contas conectadas
// das Escolas), aqui cada Escola traz a PRÓPRIA conta Asaas — não existe
// conceito de conta conectada da plataforma. Isso é o que garante que a
// taxa do Asaas cai sobre a Escola, nunca sobre o Kav Class: toda chamada
// usa a API Key da própria Escola (ver asaasFetch), nunca uma key nossa.
//
// Consequência: precisamos guardar um SEGREDO de verdade por Escola (a API
// Key dela), não só um ID como stripeConnectAccountId — por isso cifrado em
// repouso (AES-256-GCM) com uma chave mestra da plataforma
// (ASAAS_ENCRYPTION_KEY, uma só, global). Sem essa env var, toda rota Asaas
// responde 503 — mesmo padrão do guard "if (!stripe)" acima.
const ASAAS_ENCRYPTION_KEY = process.env.ASAAS_ENCRYPTION_KEY
  ? Buffer.from(process.env.ASAAS_ENCRYPTION_KEY, 'hex')
  : null;
const ASAAS_API_BASE_URL = process.env.ASAAS_API_BASE_URL || 'https://api.asaas.com/v3';

function criptografarAsaasApiKey(texto) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', ASAAS_ENCRYPTION_KEY, iv);
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  // iv (12) + authTag (16) + texto cifrado, tudo num único valor base64 —
  // simples de guardar numa coluna TEXT só, sem colunas extras pro iv/tag.
  return Buffer.concat([iv, tag, cifrado]).toString('base64');
}

function descriptografarAsaasApiKey(valorCifrado) {
  const dados = Buffer.from(valorCifrado, 'base64');
  const iv = dados.subarray(0, 12);
  const tag = dados.subarray(12, 28);
  const cifrado = dados.subarray(28);
  const decifra = crypto.createDecipheriv('aes-256-gcm', ASAAS_ENCRYPTION_KEY, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(cifrado), decifra.final()]).toString('utf8');
}

// Chama a API do Asaas usando a API Key da própria Escola (nunca uma key da
// plataforma) — isso é o que garante que a taxa do Asaas cai sobre a
// Escola, não sobre o Kav Class. `escola` precisa ter vindo de uma query
// com `select: { asaasApiKeyCriptografada: true }` explícito (é um
// segredo, não entra em select genérico de rota nenhuma).
async function asaasFetch(escola, path, options = {}) {
  if (!escola?.asaasApiKeyCriptografada) {
    const erro = new Error('Escola sem Asaas conectado.');
    erro.status = 400;
    throw erro;
  }
  const apiKey = descriptografarAsaasApiKey(escola.asaasApiKeyCriptografada);
  const resposta = await fetch(`${ASAAS_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'KavClass/1.0',
      access_token: apiKey,
      ...(options.headers || {}),
    },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const mensagem = corpo?.errors?.[0]?.description || corpo?.message || 'Erro ao chamar o Asaas.';
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

// ─── FISCAL — NFS-e via Notaas (INSTITUTION Sprints 27/28, briefing
// 24/09/2026) ────────────────────────────────────────────────────────────
// Mesmo esquema de cifra do Asaas acima (AES-256-GCM) — reaproveita
// ASAAS_ENCRYPTION_KEY como chave mestra da PLATAFORMA (não é exclusiva do
// Asaas, só nasceu lá primeiro), pra não introduzir uma env var nova só
// pra isso. Sem essa env var, toda rota fiscal responde 503 (mesmo padrão
// dos outros guards `if (!stripe)`/`if (!ASAAS_ENCRYPTION_KEY)`).
const NOTAAS_API_BASE_URL = process.env.NOTAAS_API_BASE_URL || 'https://platform.notaas.com.br/api/v1';
const NOTAAS_WEBHOOK_URL_BASE = 'https://kav-class-1.onrender.com/api/webhooks/notaas';

function criptografarNotaasApiKey(texto) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', ASAAS_ENCRYPTION_KEY, iv);
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  return Buffer.concat([iv, tag, cifrado]).toString('base64');
}

function descriptografarNotaasApiKey(valorCifrado) {
  const dados = Buffer.from(valorCifrado, 'base64');
  const iv = dados.subarray(0, 12);
  const tag = dados.subarray(12, 28);
  const cifrado = dados.subarray(28);
  const decifra = crypto.createDecipheriv('aes-256-gcm', ASAAS_ENCRYPTION_KEY, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(cifrado), decifra.final()]).toString('utf8');
}

// Chama a API da Notaas com a API Key CIFRADA de uma Escola ou Professor —
// `titular` precisa ter vindo de uma query com o campo cifrado explícito no
// select (segredo, não entra em select genérico). Lança erro com `.status`
// pra tratarErro devolver o código certo.
async function notaasFetch(apiKeyCriptografada, path, options = {}) {
  if (!apiKeyCriptografada) {
    const erro = new Error('Notaas não conectado.');
    erro.status = 400;
    throw erro;
  }
  const apiKey = descriptografarNotaasApiKey(apiKeyCriptografada);
  const resposta = await fetch(`${NOTAAS_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...(options.headers || {}),
    },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const mensagem = corpo?.message || corpo?.error || 'Erro ao chamar a Notaas.';
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

// Registra (ou substitui) o webhook do projeto Notaas apontando pra nossa
// rota única — diferente do Asaas, a Notaas tem endpoint de webhook via API
// (POST /webhooks/endpoints), então não precisamos pedir pra colar nada no
// painel de terceiro. `token` é usado como URL (identifica de qual
// Escola/Professor veio o evento) E como segredo HMAC — mesmo valor.
async function registrarWebhookNotaas(apiKeyCriptografada, token) {
  await notaasFetch(apiKeyCriptografada, '/webhooks/endpoints', {
    method: 'POST',
    body: JSON.stringify({
      url: `${NOTAAS_WEBHOOK_URL_BASE}/${token}`,
      events: ['nfse.issued', 'nfse.error', 'nfse.cancelled'],
      secret: token,
    }),
  });
}

// ─── FISCAL — Organização Notaas (26/09/2026) ───────────────────────────────
// Modelo revisado: em vez de cada Escola/Professor criar a própria conta na
// Notaas e colar a API Key deles, a KAV CLASS usa UM token de organização só
// nosso (NOTAAS_ORG_TOKEN, prefixo ntaas_org_) pra cadastrar um "projeto"
// Notaas por Escola/Professor (com o CNPJ/dados fiscais REAIS de quem presta
// o serviço) e gerar uma API Key escopada só àquele projeto. A nota sai
// numerada e autorizada pela prefeitura/SEFAZ do CNPJ da Escola/Professor —
// não do nosso. Isso não elimina o certificado digital A1 (.pfx) próprio do
// CNPJ: é exigência legal de assinatura da nota, nenhuma plataforma emite
// nota de um CNPJ sem o certificado dele. Recurso "Organização" aparece
// documentado como plano Enterprise da Notaas — se o token não tiver esse
// acesso, notaasOrgFetch abaixo vai falhar com 401/403 e a rota devolve erro
// claro pro usuário resolver com a Notaas.
const NOTAAS_ORG_TOKEN = process.env.NOTAAS_ORG_TOKEN || null;
// Plano Enterprise da Notaas (org multi-empresa) tem custo que não está
// orçado ainda (26/09/2026) — enquanto NOTAAS_ORG_TOKEN não existir, o
// front mostra "em breve" em vez do formulário de cadastro fiscal, pra não
// deixar a escola preencher dados e tomar um erro.
const NOTAAS_FISCAL_DISPONIVEL = !!NOTAAS_ORG_TOKEN;

async function notaasOrgFetch(path, options = {}) {
  if (!NOTAAS_ORG_TOKEN) {
    const erro = new Error('Integração fiscal (Notaas) não configurada no servidor.');
    erro.status = 503;
    throw erro;
  }
  const resposta = await fetch(`${NOTAAS_API_BASE_URL}${path}`, {
    ...options,
    headers: { 'x-api-key': NOTAAS_ORG_TOKEN, ...(options.headers || {}) },
  });
  const tipo = resposta.headers.get('content-type') || '';
  const corpo = tipo.includes('application/json') ? await resposta.json().catch(() => ({})) : await resposta.text().catch(() => '');
  if (!resposta.ok) {
    const mensagem = (typeof corpo === 'object' ? corpo?.message || corpo?.error : corpo) || 'Erro ao chamar a Notaas.';
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

// Orquestra os 3 passos pra dar de alta uma empresa fiscal nova sob a nossa
// organização: cria o projeto (dados cadastrais), sobe o certificado A1
// (.pfx) daquele CNPJ, gera a API Key escopada ao projeto. Se qualquer passo
// falhar depois do projeto criado, o projeto fica órfão na Notaas (sem
// certificado/chave) — aceitável pro MVP, não tenta desfazer automaticamente.
// NOTA: o nome do campo com a chave em si na resposta de POST
// .../api-keys não está 100% confirmado pela documentação pública
// (`apiKey` foi o mais provável) — tratamento defensivo abaixo cobre as
// variantes prováveis.
async function criarEmpresaFiscalNotaas({
  nomeProjeto, cnpj, razaoSocial, inscricaoMunicipal, inscricaoEstadual, regimeTributario, codigoMunicipio,
  certificadoBase64, certificadoNomeArquivo, senhaCertificado,
}) {
  const projeto = await notaasOrgFetch('/org/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nomeProjeto, cnpj, razaoSocial, inscricaoMunicipal, inscricaoEstadual, regimeTributario, codigoMunicipio }),
  });

  const formCertificado = new FormData();
  formCertificado.append('file', new Blob([Buffer.from(certificadoBase64, 'base64')]), certificadoNomeArquivo || 'certificado.pfx');
  formCertificado.append('password', senhaCertificado);
  const certificado = await notaasOrgFetch(`/org/projects/${projeto.id}/certificate`, { method: 'POST', body: formCertificado });

  const chaveResp = await notaasOrgFetch(`/org/projects/${projeto.id}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'kav-class' }),
  });
  const apiKey = chaveResp?.apiKey || chaveResp?.key || chaveResp?.token;
  if (!apiKey) {
    const erro = new Error('Notaas não retornou a chave do projeto criado.');
    erro.status = 502;
    throw erro;
  }

  return { projetoId: projeto.id, apiKey, certificadoValidoAte: certificado?.validUntil || null, certificadoNomeArquivo: certificado?.fileName || certificadoNomeArquivo || null };
}

// ─── CLOUDFLARE STREAM (Reels, Epic D, 18/09/2026) ──────────────────────────
// Direct Creator Upload: o backend só pede à Cloudflare uma URL de upload
// descartável — o app sobe o arquivo de vídeo direto pra lá, o token da
// plataforma nunca chega ao cliente (mesmo espírito de não expor segredo
// nenhum de terceiro, ver asaasFetch acima). Sem CLOUDFLARE_ACCOUNT_ID/
// CLOUDFLARE_STREAM_API_TOKEN configurados, toda rota de Reels responde 503
// (mesmo padrão do `stripe` null acima).
const CLOUDFLARE_STREAM_CONFIGURADO = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_API_TOKEN);
async function cloudflareStreamFetch(path, options = {}) {
  const resposta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo.success === false) {
    const mensagem = corpo?.errors?.[0]?.message || 'Erro ao chamar o Cloudflare Stream.';
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo.result;
}

// Client IDs OAuth do Google (Web/iOS/Android) — login com Google fica desativado
// (503) até essas variáveis serem configuradas no ambiente.
const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
].filter(Boolean);
const googleClient = GOOGLE_CLIENT_IDS.length ? new OAuth2Client() : null;

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});
const app = express();

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Rede de segurança: um erro que escape de todo try/catch não deve derrubar
// o processo inteiro (e com ele, as requisições de todos os outros usuários).
process.on('unhandledRejection', (motivo) => {
  console.error('[UnhandledRejection]', motivo);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
});

const SEGREDO_JWT = process.env.JWT_SECRET || "kav_class_super_secreto_2026";

// ============================================================================
// AUTENTICAÇÃO REAL (JWT) — usada por toda rota que devolve/altera dado de
// uma conta específica. Nunca confiar em professorId/alunoId mandado pelo
// cliente em query/body: o id de verdade é sempre o que sai do token
// verificado em req.auth.id (ver docs/migrations/s0-2-escola-gestor-runbook.md,
// achado de segurança corrigido nesta sprint).
// ============================================================================

// Lê e valida o Bearer token. Devolve o payload decodificado, ou responde o
// 401 certo e devolve null — usada tanto pelo middleware abaixo quanto pelo
// autenticarProfessor (rotas de Escola/Gestor), pra não duplicar a checagem.
function _decodificarToken(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ erro: 'Token de autenticação ausente.' }); return null; }
  try {
    const payload = jwt.verify(token, SEGREDO_JWT);
    if (!payload.id || !payload.papel) { res.status(401).json({ erro: 'Token inválido.' }); return null; }
    return payload;
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido ou expirado.' });
    return null;
  }
}

function autenticar(req, res, next) {
  const payload = _decodificarToken(req, res);
  if (!payload) return;
  // papel: 'professor' | 'aluno' | 'conta' (tipo de conta — não confundir com o
  // papel DONO/GESTOR/PROFESSOR da Escola). contaId: claim nova (fundação de
  // identidade unificada), ausente em tokens emitidos antes desta sprint —
  // sempre tratar como opcional.
  req.auth = { id: payload.id, papel: payload.papel, contaId: payload.contaId || null };
  next();
}

function exigirProfessor(req, res, next) {
  autenticar(req, res, () => {
    if (req.auth.papel !== 'professor') { res.status(403).json({ erro: 'Acesso restrito a professores.' }); return; }
    next();
  });
}

function exigirAluno(req, res, next) {
  autenticar(req, res, () => {
    if (req.auth.papel !== 'aluno') { res.status(403).json({ erro: 'Acesso restrito a alunos.' }); return; }
    next();
  });
}

// Mapeamento dias da semana (índice 0-6 → nome PT-BR)
const NOMES_DIAS = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

app.use(cors());

// ─── STRIPE WEBHOOK (raw body MUST come before express.json) ─────────────────
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(200).json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Assinatura inválida:', err.message);
    return res.status(400).json({ erro: `Webhook Error: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode === 'setup') {
        // S3.1: cartão de cobrança automática (Aluno → Escola) salvo pelo
        // aluno na Checkout Session hospedada. Caminho redundante com
        // GET /api/matriculas/:id/cobranca-automatica/verificar/:sessionId
        // (o app chama isso ao voltar do navegador) — o webhook é o
        // fallback caso o app não volte a rodar antes de confirmar.
        const matriculaId = session.metadata?.matriculaId;
        if (matriculaId && session.setup_intent) {
          try {
            const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
            if (setupIntent.status === 'succeeded' && setupIntent.payment_method) {
              const paymentMethodId = String(setupIntent.payment_method);
              await stripe.customers.update(session.customer, {
                invoice_settings: { default_payment_method: paymentMethodId },
              });
              await prisma.matricula.updateMany({
                where: { id: matriculaId },
                data: { cobrancaAutomaticaAtiva: true, stripePaymentMethodId: paymentMethodId, cobrancaUltimoErro: null },
              });
            }
          } catch (err) {
            console.error('[Webhook] Erro ao confirmar cartão de cobrança automática:', err.message);
          }
        }
      } else if (session.metadata?.assinaturaPremiumId) {
        // Fase 5 (paywall): assinatura de conteúdo premium Aluno→Professor.
        // mode:'subscription' — diferente do "else" abaixo (também
        // subscription, mas da assinatura Escola→Kav Class), por isso
        // precisa vir ANTES e checar metadata explicitamente.
        await prisma.assinaturaPremium.updateMany({
          where: { id: session.metadata.assinaturaPremiumId },
          data: {
            status: 'ATIVA',
            stripeSubscriptionId: session.subscription ? String(session.subscription) : null,
            stripeCustomerId: session.customer ? String(session.customer) : null,
          },
        });
      } else if (session.client_reference_id) {
        // Assinatura Professor/Escola → Kav Class (planos em 2 níveis).
        await ativarAssinaturaPosCheckout(session);
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'ATIVO' : 'CANCELADO';
      await prisma.professor.updateMany({
        where: { stripeCustomerId: sub.customer },
        data: {
          assinaturaStatus: status,
          assinaturaFim: sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null,
        },
      });
      // Fase 5 (paywall): mesma lógica, tabela diferente — só afeta linhas
      // se sub.id bater com uma AssinaturaPremium (nunca colide com a
      // assinatura Escola→Kav Class acima, que não guarda subscriptionId
      // nenhum nessa tabela).
      await prisma.assinaturaPremium.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: (sub.status === 'active' || sub.status === 'trialing') ? 'ATIVA' : 'CANCELADA' },
      });
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await prisma.professor.updateMany({
        where: { stripeCustomerId: sub.customer },
        data: { assinaturaStatus: 'CANCELADO' },
      });
      await prisma.assinaturaPremium.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: 'CANCELADA' },
      });
    } else if (event.type === 'account.updated') {
      // S3.1: Stripe Connect Express da Escola — sincroniza o status de
      // onboarding assim que charges_enabled/payouts_enabled mudam, sem
      // depender só da checagem sob demanda em GET /stripe-connect/status.
      const conta = event.data.object;
      const completo = !!(conta.charges_enabled && conta.payouts_enabled);
      await prisma.escola.updateMany({
        where: { stripeConnectAccountId: conta.id },
        data: { stripeConnectOnboardingCompleto: completo },
      });
    } else if (event.type === 'payment_intent.succeeded') {
      // S3.1: confirmação assíncrona de cobrança automática — o cron já
      // marca PAGO na resposta síncrona do PaymentIntent na maioria dos
      // casos; isto cobre o caso do evento chegar depois de um retry/queda.
      const pi = event.data.object;
      if (pi.metadata?.pagamentoId) {
        await prisma.pagamento.updateMany({
          where: { id: pi.metadata.pagamentoId, status: { not: 'PAGO' } },
          data: { status: 'PAGO', dataPagamento: new Date(), stripePaymentIntentId: pi.id, viaCobrancaAutomatica: true },
        });
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      if (pi.metadata?.matriculaId) {
        await prisma.matricula.updateMany({
          where: { id: pi.metadata.matriculaId },
          data: {
            cobrancaUltimoErro: pi.last_payment_error?.message || 'Pagamento recusado.',
            cobrancaUltimaTentativa: new Date(),
          },
        });
      }
    }
  } catch (err) {
    console.error('[Webhook] Erro ao processar evento:', err);
  }

  res.json({ received: true });
});

// ─── ASAAS WEBHOOK (mesmo lugar do webhook Stripe acima, antes do
// express.json global) ────────────────────────────────────────────────────
// Diferente do Stripe, o Asaas não assina o corpo (sem HMAC) — autentica só
// por um header de token simples que cada Escola configura no PRÓPRIO
// painel Asaas dela (é conta de terceiro, não dá pra registrar webhook por
// API como fazemos com account.updated do Stripe Connect). O token é
// comparado contra QUALQUER Escola cadastrada: como os IDs do Asaas
// (customer/subscription/payment) são globais na plataforma deles, depois
// de autenticado o resto do processamento acha a linha certa sem precisar
// re-filtrar por escola. Usa express.json() local (não raw) porque não há
// assinatura pra verificar sobre o corpo cru.
app.post('/asaas/webhook', express.json({ limit: '2mb' }), async (req, res) => {
  const token = req.headers['asaas-access-token'];
  if (!token) return res.status(401).json({ erro: 'Token ausente.' });

  const escola = await prisma.escola.findFirst({ where: { asaasWebhookToken: token }, select: { id: true } }).catch(() => null);
  if (!escola) return res.status(401).json({ erro: 'Token inválido.' });

  try {
    const evento = req.body?.event;
    const payment = req.body?.payment;
    if (payment) {
      const metodoPorBillingType = { PIX: 'PIX', BOLETO: 'BOLETO', CREDIT_CARD: 'CARTAO' };

      if (evento === 'PAYMENT_CREATED') {
        // Asaas gerou sozinho a fatura de um novo ciclo da Subscription —
        // espelha como um Pagamento nosso, pro painel do GESTOR mostrar
        // igual ao que já mostra pras faturas do Stripe.
        const matricula = await prisma.matricula.findFirst({ where: { asaasSubscriptionId: payment.subscription } });
        if (matricula) {
          const jaExiste = await prisma.pagamento.findFirst({ where: { asaasPaymentId: payment.id } });
          if (!jaExiste) {
            await prisma.pagamento.create({
              data: {
                valor: payment.value,
                vencimento: new Date(`${payment.dueDate}T12:00:00`),
                status: 'PENDENTE',
                metodo: metodoPorBillingType[payment.billingType] || null,
                professorId: matricula.professorId,
                alunoId: matricula.alunoId,
                matriculaId: matricula.id,
                viaCobrancaAutomatica: true,
                asaasPaymentId: payment.id,
              },
            });
          }
        }
      } else if (evento === 'PAYMENT_CONFIRMED' || evento === 'PAYMENT_RECEIVED') {
        await prisma.pagamento.updateMany({
          where: { asaasPaymentId: payment.id, status: { not: 'PAGO' } },
          data: { status: 'PAGO', dataPagamento: new Date(), metodo: metodoPorBillingType[payment.billingType] || undefined },
        });
        await prisma.matricula.updateMany({
          where: { asaasSubscriptionId: payment.subscription },
          data: { cobrancaUltimoErro: null, cobrancaUltimaTentativa: new Date() },
        });
      } else if (evento === 'PAYMENT_OVERDUE') {
        await prisma.pagamento.updateMany({ where: { asaasPaymentId: payment.id }, data: { status: 'ATRASADO' } });
        await prisma.matricula.updateMany({
          where: { asaasSubscriptionId: payment.subscription },
          data: { cobrancaUltimoErro: 'Fatura vencida sem pagamento.', cobrancaUltimaTentativa: new Date() },
        });
      } else if (evento === 'PAYMENT_DELETED' || evento === 'PAYMENT_REFUNDED') {
        await prisma.pagamento.updateMany({ where: { asaasPaymentId: payment.id }, data: { status: 'CANCELADO' } });
      }
    }
  } catch (err) {
    console.error('[Asaas Webhook] Erro ao processar evento:', err);
  }

  res.json({ received: true });
});

// ─── CLOUDFLARE STREAM WEBHOOK (Reels, Epic D) — raw body MUST come before
// express.json, mesmo motivo do webhook do Stripe acima: a assinatura HMAC
// é calculada sobre os bytes crus do corpo, reserializar via JSON.stringify
// pode não bater byte a byte com o que a Cloudflare assinou. Dispara quando
// o encode de um vídeo termina (ou falha) — atualiza Reel.status de
// PROCESSANDO pra PRONTO/ERRO. Registrado via CronCreate/setup manual (ver
// docs) com POST /accounts/:id/stream/webhook, que devolve o secret usado
// aqui em CLOUDFLARE_STREAM_WEBHOOK_SECRET.
app.post('/stream/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const segredo = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  if (!segredo) return res.status(200).json({ received: true });

  try {
    const assinatura = req.headers['webhook-signature'] || '';
    const partes = Object.fromEntries(assinatura.split(',').map((p) => p.split('=')));
    const corpoCru = req.body.toString('utf8');
    const esperado = crypto.createHmac('sha256', segredo).update(`${partes.time}.${corpoCru}`).digest('hex');
    const valido = partes.sig1 && esperado.length === partes.sig1.length &&
      crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.sig1));
    if (!valido) return res.status(401).json({ erro: 'Assinatura inválida.' });

    const evento = JSON.parse(corpoCru);
    const pronto = evento.status?.state === 'ready' || evento.readyToStream === true;
    const erro = evento.status?.state === 'error';

    if (evento.uid && (pronto || erro)) {
      await prisma.reel.updateMany({
        where: { videoId: evento.uid },
        data: {
          status: pronto ? 'PRONTO' : 'ERRO',
          ...(pronto ? {
            thumbnailUrl: evento.thumbnail || null,
            duracaoSegundos: evento.duration ? Math.round(evento.duration) : null,
          } : {}),
        },
      });
    }
  } catch (err) {
    console.error('[Stream Webhook] Erro ao processar evento:', err.message);
  }

  res.json({ received: true });
});

// POST /api/webhooks/notaas/:token — resultado assíncrono de emissão/
// cancelamento de NFS-e (INSTITUTION Sprints 27/28, briefing 24/09/2026).
// `token` identifica de qual Escola OU Professor veio o evento (cada um tem
// seu próprio projeto/API Key na Notaas) e é o MESMO valor usado como
// segredo HMAC no registro do webhook (registrarWebhookNotaas). Usa
// express.raw (não o json global abaixo) porque a assinatura é calculada
// sobre o corpo cru, antes de qualquer parse.
// ⚠️ Formato exato do header de assinatura não confirmado 100% contra uma
// entrega real da Notaas (documentação pública não deixou claro se o valor
// vem com prefixo "sha256=" ou só o hex) — aceita os dois formatos por
// segurança; validar contra um webhook de teste real antes de confiar cego.
app.post('/api/webhooks/notaas/:token', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const { token } = req.params;
    const [escola, professor] = await Promise.all([
      prisma.escola.findFirst({ where: { notaasWebhookToken: token }, select: { id: true } }),
      prisma.professor.findFirst({ where: { notaasWebhookToken: token }, select: { id: true } }),
    ]);
    if (!escola && !professor) return res.status(401).json({ erro: 'Token inválido.' });

    const corpoCru = req.body.toString('utf8');
    const assinaturaHeader = String(req.headers['x-notaas-signature'] || '').replace(/^sha256=/, '');
    const esperado = crypto.createHmac('sha256', token).update(corpoCru).digest('hex');
    const valido = assinaturaHeader.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(assinaturaHeader), Buffer.from(esperado));
    if (!valido) return res.status(401).json({ erro: 'Assinatura inválida.' });

    const evento = JSON.parse(corpoCru);
    const dados = evento.data || {};
    const notaasInvoiceId = dados.invoiceId;
    if (!notaasInvoiceId) return res.json({ received: true });

    if (evento.event === 'nfse.issued') {
      await prisma.notaFiscal.updateMany({
        where: { notaasInvoiceId },
        data: { status: 'EMITIDA', numeroNota: dados.nNFSe || null, chaveAcesso: dados.chNFSe || null, emitidaEm: new Date() },
      });
    } else if (evento.event === 'nfse.documents_ready') {
      await prisma.notaFiscal.updateMany({
        where: { notaasInvoiceId },
        data: { pdfUrl: dados.pdfUrl || dados.pdf || null, xmlUrl: dados.xmlUrl || dados.xml || null },
      });
    } else if (evento.event === 'nfse.error') {
      await prisma.notaFiscal.updateMany({
        where: { notaasInvoiceId },
        data: { status: 'ERRO', erro: dados.message || dados.error || 'Erro ao emitir a nota.' },
      });
    } else if (evento.event === 'nfse.cancelled') {
      await prisma.notaFiscal.updateMany({ where: { notaasInvoiceId }, data: { status: 'CANCELADA' } });
    }

    res.json({ received: true });
  } catch (err) {
    // 200 mesmo em erro interno nosso — evita a Notaas ficar reentregando
    // (até 5 tentativas com backoff) por um bug daqui, não do lado dela.
    console.error('[Notaas Webhook] Erro ao processar evento:', err.message);
    res.status(200).json({ received: true });
  }
});

app.use(express.json({ limit: '20mb' }));

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

// Classifica erros do Prisma antes de responder: "registro não encontrado"
// (P2025 — update/delete por id que já não existe mais) vira 404 limpo em
// vez de cair no 500 genérico. Qualquer outro erro segue como 500.
function tratarErro(err, res, mensagemPadrao) {
  console.error(err);
  if (err?.code === 'P2025') {
    return res.status(404).json({ erro: 'Registro não encontrado.' });
  }
  return res.status(500).json({ erro: mensagemPadrao });
}

function gerarCodigoConvite() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += chars[crypto.randomInt(chars.length)];
  return `KAV-${r}`;
}

// crypto.randomInt (CSPRNG) em vez de Math.random(): este código autoriza
// redefinição de senha — precisa ser imprevisível de verdade, não só
// "parecer" aleatório (Math.random não dá garantia criptográfica).
function gerarOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Token público imprevisível (48 hex chars) — usado pelas rotas públicas de
// captação de lead (S4.2), onde o token É a credencial, sem login nenhum.
// Diferente de gerarCodigoConvite() (4 chars, mas sempre enviado por e-mail
// só pro dono da caixa de entrada): aqui o link pode ser divulgado em
// site/redes, então precisa ser longo o bastante pra não ser adivinhável.
function gerarTokenPublico() {
  return crypto.randomBytes(24).toString('hex');
}

// Limitador de taxa em memória pras rotas PÚBLICAS de captação (S4.2) — sem
// dependência nova, só o necessário pra um formulário exposto na internet
// não virar porta aberta pra um bot martelar criação de leads. Em memória:
// reseta a cada restart e não é compartilhado entre instâncias — ok pra um
// único processo (é como este serviço roda hoje no Render); se a app
// escalar horizontalmente isso precisa virar um store compartilhado —
// registrado aqui, não é suposição silenciosa.
const _janelasRequisicaoPublica = new Map();
setInterval(() => {
  const umaHora = 60 * 60 * 1000;
  const agora = Date.now();
  for (const [chave, registro] of _janelasRequisicaoPublica) {
    if (agora - registro.inicio > umaHora) _janelasRequisicaoPublica.delete(chave);
  }
}, 30 * 60 * 1000).unref();

function limitarTaxaPublica(maxRequisicoes, janelaMs) {
  return (req, res, next) => {
    const chave = `${req.ip}:${req.method}:${req.path}`;
    const agora = Date.now();
    const registro = _janelasRequisicaoPublica.get(chave);
    if (!registro || agora - registro.inicio > janelaMs) {
      _janelasRequisicaoPublica.set(chave, { inicio: agora, contagem: 1 });
      return next();
    }
    if (registro.contagem >= maxRequisicoes) {
      return res.status(429).json({ erro: 'Muitas tentativas. Tente novamente em alguns minutos.' });
    }
    registro.contagem++;
    next();
  };
}

// Valida o idToken do Google no próprio servidor (nunca confiar em dados que o
// app alega ter vindo do Google sem checar a assinatura contra o Google).
// Lança um erro com `.status` para as rotas devolverem o código HTTP certo.
async function verificarGoogleIdToken(idToken) {
  if (!googleClient) {
    throw Object.assign(new Error('Login com Google não está configurado no servidor.'), { status: 503 });
  }
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_IDS });
    const payload = ticket.getPayload();
    if (!payload?.email_verified) {
      throw Object.assign(new Error('E-mail do Google não verificado.'), { status: 401 });
    }
    return payload;
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error('Token do Google inválido ou expirado.'), { status: 401 });
  }
}

async function enviarPushNotificacao(expoPushToken, titulo, corpo, dados = {}) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: expoPushToken, sound: 'default', title: titulo, body: corpo, data: dados }),
    });
  } catch (err) {
    console.error('[Push] Falha ao enviar notificação:', err.message);
  }
}

function gerarAulasRecorrentes(aluno) {
  const { diaSemanaNumero, horarioAula, recorrenciaAula, tempoContrato, id: alunoId, professorId } = aluno;

  if (diaSemanaNumero == null || !horarioAula || !recorrenciaAula || !tempoContrato) return [];

  const [horas, minutos] = horarioAula.split(':').map(Number);
  const hoje = new Date();
  const fimContrato = new Date(hoje);
  fimContrato.setMonth(fimContrato.getMonth() + tempoContrato);

  let dataAtual = new Date(hoje);
  while (dataAtual.getDay() !== diaSemanaNumero) {
    dataAtual.setDate(dataAtual.getDate() + 1);
  }
  // UTC-3 (Brazil): store UTC equivalent so toLocaleTimeString shows the correct local time
  dataAtual.setUTCHours(horas + 3, minutos, 0, 0);

  const aulas = [];
  const MAX_AULAS = 300;

  while (dataAtual <= fimContrato && aulas.length < MAX_AULAS) {
    aulas.push({ dataHora: new Date(dataAtual), professorId, alunoId, status: 'AGENDADA', tipo: 'REGULAR' });

    if (recorrenciaAula === 'SEMANAL') {
      dataAtual.setDate(dataAtual.getDate() + 7);
    } else if (recorrenciaAula === 'QUINZENAL') {
      dataAtual.setDate(dataAtual.getDate() + 15);
    } else {
      // MENSAL: repete na mesma semana-do-mês e dia-da-semana
      const semanaDoMes = Math.ceil(dataAtual.getDate() / 7);
      const diaAlvo = dataAtual.getDay();

      // Avança para o 1º dia do próximo mês e captura o mês-alvo ANTES de modificar dataAtual
      const proximoMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 1);
      const mesAlvo = proximoMes.getMonth();
      dataAtual = proximoMes;

      const diff = (diaAlvo - dataAtual.getDay() + 7) % 7;
      dataAtual.setDate(1 + diff + (semanaDoMes - 1) * 7);

      // Se overflow para o mês seguinte (ex: 5ª ocorrência inexistente), recua 1 semana
      if (dataAtual.getMonth() !== mesAlvo) {
        dataAtual.setDate(dataAtual.getDate() - 7);
      }
      dataAtual.setHours(horas, minutos, 0, 0);
    }
  }

  return aulas;
}

async function enviarEmailRedefinicao(destinatario, codigo) {
  // Checa antes de carregar o módulo — sem isso, um require() que trava
  // (visto em sandbox local) prende a chamada mesmo sem credencial nenhuma
  // configurada, quando o certo é falhar rápido e claro.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Variáveis EMAIL_USER e EMAIL_PASS não configuradas no servidor.');
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    // Sem isso, uma conexão SMTP que trava (rede bloqueando a porta, Gmail
    // fora do ar) prende essa chamada indefinidamente — e com ela, quem
    // estiver esperando a resposta HTTP.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  await transporter.sendMail({
    from: `"KAV Class" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: 'Redefinição de senha – KAV Class',
    html: `<h2>Código de redefinição</h2><p>Código (válido por 15 min):</p><h1 style="letter-spacing:8px">${codigo}</h1>`,
  });
}

// ============================================================================
// CRON: VERIFICADOR DE CONTRATOS (executa todo dia às 08h)
// ============================================================================

async function verificarContratosExpirados() {
  try {
    const hoje = new Date();

    const alunos = await prisma.aluno.findMany({
      where: { status: 'ATIVO', dataInicioContrato: { not: null }, tempoContrato: { not: null } },
      include: { professor: { select: { id: true, nome: true, expoPushToken: true } } },
    });

    for (const aluno of alunos) {
      const fimContrato = new Date(aluno.dataInicioContrato);
      fimContrato.setMonth(fimContrato.getMonth() + aluno.tempoContrato);
      const diasRestantes = Math.ceil((fimContrato - hoje) / 86400000);

      if (diasRestantes <= 0) {
        const jaExiste = await prisma.notificacao.findFirst({
          where: { professorId: aluno.professorId, tipo: 'CONTRATO_EXPIRADO', dadosExtra: { contains: aluno.id } },
        });
        if (!jaExiste) {
          await prisma.notificacao.create({
            data: {
              tipo: 'CONTRATO_EXPIRADO',
              titulo: 'Contrato Encerrado',
              mensagem: `O contrato de ${aluno.nome} encerrou em ${fimContrato.toLocaleDateString('pt-BR')}. Deseja renovar?`,
              professorId: aluno.professorId,
              dadosExtra: JSON.stringify({ alunoId: aluno.id, alunoNome: aluno.nome }),
            },
          });
          await enviarPushNotificacao(aluno.professor.expoPushToken, 'Contrato Encerrado', `O contrato de ${aluno.nome} encerrou.`, { tipo: 'CONTRATO_EXPIRADO', alunoId: aluno.id });
        }
      } else if (diasRestantes <= 7) {
        const jaExiste = await prisma.notificacao.findFirst({
          where: { professorId: aluno.professorId, tipo: 'CONTRATO_EXPIRANDO', dadosExtra: { contains: aluno.id } },
        });
        if (!jaExiste) {
          await prisma.notificacao.create({
            data: {
              tipo: 'CONTRATO_EXPIRANDO',
              titulo: 'Contrato Expirando em Breve',
              mensagem: `O contrato de ${aluno.nome} vence em ${diasRestantes} dia(s).`,
              professorId: aluno.professorId,
              dadosExtra: JSON.stringify({ alunoId: aluno.id, alunoNome: aluno.nome, diasRestantes }),
            },
          });
          await enviarPushNotificacao(aluno.professor.expoPushToken, 'Contrato Expirando', `O contrato de ${aluno.nome} vence em ${diasRestantes} dia(s).`, { tipo: 'CONTRATO_EXPIRANDO', alunoId: aluno.id });
        }
      }
    }
  } catch (err) {
    console.error('[Cron] Erro na verificação de contratos:', err.message);
  }
}
cron.schedule('0 8 * * *', verificarContratosExpirados);

// ============================================================================
// CRON: PAGAMENTOS ATRASADOS (executa todo dia às 08h)
// ============================================================================

async function verificarPagamentosAtrasados() {
  try {
    const hoje = new Date();

    const pagamentos = await prisma.pagamento.findMany({
      where: { status: 'PENDENTE', vencimento: { lt: hoje }, notificadoAtrasado: false },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });

    for (const pagamento of pagamentos) {
      if (pagamento.aluno?.expoPushToken) {
        await enviarPushNotificacao(
          pagamento.aluno.expoPushToken,
          'Pagamento atrasado',
          `Sua mensalidade venceu em ${pagamento.vencimento.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Regularize para manter suas aulas em dia.`,
          { tipo: 'PAGAMENTO_ATRASADO', pagamentoId: pagamento.id }
        );
      }
      await prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: 'ATRASADO', notificadoAtrasado: true },
      });
    }
  } catch (err) {
    console.error('[Cron] Erro na verificação de pagamentos atrasados:', err.message);
  }
}
cron.schedule('0 8 * * *', verificarPagamentosAtrasados);

// ============================================================================
// CRON: LEMBRETE DE AULA NO DIA SEGUINTE (executa todo dia às 08h)
// ============================================================================

async function verificarAulasAmanha() {
  try {
    const inicioAmanha = new Date();
    inicioAmanha.setDate(inicioAmanha.getDate() + 1);
    inicioAmanha.setHours(0, 0, 0, 0);
    const fimAmanha = new Date(inicioAmanha);
    fimAmanha.setHours(23, 59, 59, 999);

    const aulas = await prisma.aula.findMany({
      where: { status: 'AGENDADA', dataHora: { gte: inicioAmanha, lte: fimAmanha }, lembreteEnviado: false },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });

    for (const aula of aulas) {
      if (aula.aluno?.expoPushToken) {
        const horario = aula.dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        await enviarPushNotificacao(
          aula.aluno.expoPushToken,
          'Aula amanhã',
          `Sua aula é amanhã às ${horario}.`,
          { tipo: 'AULA_PROXIMA', aulaId: aula.id }
        );
      }
      await prisma.aula.update({ where: { id: aula.id }, data: { lembreteEnviado: true } });
    }
  } catch (err) {
    console.error('[Cron] Erro na verificação de aulas de amanhã:', err.message);
  }
}
cron.schedule('0 8 * * *', verificarAulasAmanha);

// ============================================================================
// CRON: CONFIRMAÇÃO DE PRESENÇA DO ALUNO 24H ANTES (INSTITUTION Sprint 13,
// briefing 22/09/2026) — roda a cada hora cheia, pra pegar o horário exato
// de cada aula (diferente do lembrete acima, que é 1x/dia fixo às 08h e não
// pede resposta). Janela de 1h (23h–24h de antecedência) casa com a
// cadência horária do cron: cada aula cai numa única execução.
// ============================================================================

async function solicitarConfirmacaoAlunos24h() {
  try {
    const janelaInicio = new Date(Date.now() + 23 * 60 * 60 * 1000);
    const janelaFim = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const aulas = await prisma.aula.findMany({
      where: {
        status: 'AGENDADA',
        dataHora: { gte: janelaInicio, lt: janelaFim },
        confirmacaoAlunoSolicitadaEm: null,
      },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });

    for (const aula of aulas) {
      if (aula.aluno?.expoPushToken) {
        const horario = aula.dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        await enviarPushNotificacao(
          aula.aluno.expoPushToken,
          'Confirme sua presença',
          `Sua aula é amanhã às ${horario}. Você vai?`,
          { tipo: 'CONFIRMAR_PRESENCA', aulaId: aula.id }
        );
      }
      await prisma.aula.update({ where: { id: aula.id }, data: { confirmacaoAlunoSolicitadaEm: new Date() } });
    }
  } catch (err) {
    console.error('[Cron] Erro ao solicitar confirmação de presença:', err.message);
  }
}
cron.schedule('0 * * * *', solicitarConfirmacaoAlunos24h);

// ============================================================================
// CRON: COBRANÇA AUTOMÁTICA ALUNO → ESCOLA (executa todo dia às 08h) — S3.1
//
// Critério de pronto do roadmap: "uma matrícula com cobrança automática
// ativa gera e cobra a fatura do mês seguinte sem intervenção manual". Regra
// adotada: no dia em que o mês bate o diaVencimento da Matrícula, se ainda
// não existe fatura (Pagamento) pra esse ciclo, gera uma e tenta cobrar na
// hora via PaymentIntent off_session. Falha de cartão não é reprocessada no
// mesmo dia — fica registrada em cobrancaUltimoErro pro painel do GESTOR
// (GET /api/escola/cobranca-automatica/resumo, seção 10e-2 abaixo), e a
// fatura PENDENTE segue o fluxo normal (vira ATRASADO no cron de pagamentos
// atrasados acima, como qualquer fatura manual).
// ============================================================================

async function cobrarFaturaAutomaticamente(matricula, pagamento) {
  const escola = await prisma.escola.findUnique({
    where: { id: matricula.escolaId },
    select: { stripeConnectAccountId: true },
  });
  if (!escola?.stripeConnectAccountId) {
    await prisma.matricula.update({
      where: { id: matricula.id },
      data: { cobrancaUltimoErro: 'Escola sem conta Stripe conectada.', cobrancaUltimaTentativa: new Date() },
    });
    return;
  }
  try {
    // Destination charge: dinheiro roteado direto pra conta conectada da
    // Escola (on_behalf_of + transfer_data.destination), sem
    // application_fee_amount — decisão registrada de não cobrar taxa extra
    // de plataforma por transação nesta sprint.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(pagamento.valor * 100),
      currency: 'brl',
      customer: matricula.stripeCustomerId,
      payment_method: matricula.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      on_behalf_of: escola.stripeConnectAccountId,
      transfer_data: { destination: escola.stripeConnectAccountId },
      metadata: { pagamentoId: pagamento.id, matriculaId: matricula.id },
    });

    if (paymentIntent.status === 'succeeded') {
      await prisma.pagamento.update({
        where: { id: pagamento.id },
        data: {
          status: 'PAGO',
          dataPagamento: new Date(),
          metodo: 'CARTAO',
          stripePaymentIntentId: paymentIntent.id,
          viaCobrancaAutomatica: true,
        },
      });
      await prisma.matricula.update({
        where: { id: matricula.id },
        data: { cobrancaUltimoErro: null, cobrancaUltimaTentativa: new Date() },
      });
    } else {
      // requires_action (ex: 3DS) não dá pra resolver sem o aluno na tela —
      // fica registrado como pendência pro painel do GESTOR acompanhar.
      await prisma.pagamento.update({ where: { id: pagamento.id }, data: { stripePaymentIntentId: paymentIntent.id } });
      await prisma.matricula.update({
        where: { id: matricula.id },
        data: { cobrancaUltimoErro: `Cobrança pendente de confirmação (status: ${paymentIntent.status}).`, cobrancaUltimaTentativa: new Date() },
      });
    }
  } catch (err) {
    const mensagem = err?.raw?.message || err?.message || 'Falha ao cobrar cartão.';
    console.error(`[CobrancaAutomatica] Falha ao cobrar matrícula ${matricula.id}:`, mensagem);
    await prisma.matricula.update({
      where: { id: matricula.id },
      data: { cobrancaUltimoErro: mensagem, cobrancaUltimaTentativa: new Date() },
    });
  }
}

async function verificarCobrancasAutomaticas() {
  if (!stripe) return;
  try {
    const hoje = new Date();
    const diaHoje = hoje.getDate();

    const matriculas = await prisma.matricula.findMany({
      where: {
        cobrancaAutomaticaAtiva: true,
        status: 'ATIVO',
        stripeCustomerId: { not: null },
        stripePaymentMethodId: { not: null },
      },
    });

    for (const matricula of matriculas) {
      // Ancora no dia de vencimento configurado, com fallback pro último dia
      // do mês em meses mais curtos (ex: diaVencimento 31 em fevereiro).
      const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
      const diaAlvo = Math.min(matricula.diaVencimento, ultimoDiaDoMes);
      if (diaHoje !== diaAlvo) continue;

      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
      const jaExiste = await prisma.pagamento.findFirst({
        where: { matriculaId: matricula.id, vencimento: { gte: inicioMes, lte: fimMes } },
      });
      if (jaExiste) continue;

      // Mesma trava de S3.2: contrato pendente bloqueia cobrança (ver
      // POST /api/matriculas/:id/faturas, seção 10d, mesma regra).
      const contrato = await prisma.contrato.findFirst({ where: { matriculaId: matricula.id } });
      if (contrato && contrato.status !== 'ASSINADO') continue;

      const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), diaAlvo, 12, 0, 0, 0);
      const pagamento = await prisma.pagamento.create({
        data: {
          valor: matricula.valorMensalidade,
          vencimento,
          status: 'PENDENTE',
          professorId: matricula.professorId,
          alunoId: matricula.alunoId,
          matriculaId: matricula.id,
        },
      });

      await cobrarFaturaAutomaticamente(matricula, pagamento);
    }
  } catch (err) {
    console.error('[Cron] Erro na cobrança automática:', err.message);
  }
}
cron.schedule('0 8 * * *', verificarCobrancasAutomaticas);

// ============================================================================
// 1. ROTAS PÚBLICAS
// ============================================================================

app.get('/ping', (_req, res) => res.json({ mensagem: 'Backend do KAV Class está online!' }));

// Duração do período de teste grátis oferecido a professores novos.
const DIAS_TESTE_GRATIS = 15;

app.post('/api/professores/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, dataNascimento, cursos, fotoUrl } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    if (await prisma.professor.findFirst({ where: { email: emailNorm } }))
      return res.status(400).json({ erro: 'E-mail já em uso.' });

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome, fotoUrl: fotoUrl || null });
    const novoProfessor = await prisma.professor.create({
      data: {
        nome,
        email: emailNorm,
        telefone: telefone || null,
        dataNascimento: parseDataNascimento(dataNascimento),
        senha: senhaHash,
        // escola:{create} abaixo obriga o create inteiro pro modo "Checked" do
        // Prisma, que não aceita contaId escalar junto de outra relação
        // aninhada — precisa ser conta:{connect}.
        conta: contaId ? { connect: { id: contaId } } : undefined,
        cursos: Array.isArray(cursos) ? cursos : (cursos ? [cursos] : []),
        codigoConvite: gerarCodigoConvite(),
        fotoUrl: fotoUrl || null,
        assinaturaStatus: 'TESTE',
        assinaturaFim: new Date(Date.now() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000),
        // Toda conta nova é dona da própria Escola de 1 pessoa (Pacote Professor
        // por padrão) — ver docs/roadmap-escola.md, Fase 0.
        escola: { create: { nome } },
      },
    });

    const token = jwt.sign({ id: novoProfessor.id, papel: 'professor', contaId: contaId || undefined }, SEGREDO_JWT, { expiresIn: '7d' });
    res.status(201).json({
      mensagem: 'Professor criado! Teste grátis de 15 dias ativado.',
      token,
      usuario: { id: novoProfessor.id, nome: novoProfessor.nome, papel: 'professor' },
      codigoConvite: novoProfessor.codigoConvite,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar professor.' });
  }
});

// POST /api/escola/cadastro — Fase 6 (S6.3): autocadastro de Escola direto
// pelo app, sem depender do painel web. Mesmo espírito de /api/professores/cadastro
// (conta ativa na hora, 15 dias grátis) — a diferença é que aqui a Escola já
// nasce PACOTE_ESCOLA e com o quem cadastrou como DONO. Não passa por
// checkout aqui: quando o teste acabar, checarBloqueioAssinaturaProfessor
// bloqueia o login e o DONO cai em /escolher-plano com pacote:'PACOTE_ESCOLA'
// — checkout self-service dos planos Básico/Completo de Escola (planos em 2
// níveis, 18/09/2026), sem intervenção manual.
app.post('/api/escola/cadastro', async (req, res) => {
  try {
    const { nomeEscola, nome, email, senha, telefone, fotoUrl } = req.body;
    if (!nomeEscola?.trim() || !nome?.trim() || !email || !senha) {
      return res.status(400).json({ erro: 'nomeEscola, nome, email e senha são obrigatórios.' });
    }

    const emailNorm = email.toLowerCase().trim();
    if (await prisma.professor.findFirst({ where: { email: emailNorm } }))
      return res.status(400).json({ erro: 'E-mail já em uso.' });

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome: nome.trim(), fotoUrl: fotoUrl || null });
    const novoDono = await prisma.professor.create({
      data: {
        nome: nome.trim(),
        email: emailNorm,
        telefone: telefone || null,
        senha: senhaHash,
        // conta:{connect}, não contaId escalar — escola:{create} abaixo já
        // força o modo "Checked" (ver comentário em /api/professores/cadastro).
        conta: contaId ? { connect: { id: contaId } } : undefined,
        codigoConvite: gerarCodigoConvite(),
        fotoUrl: fotoUrl || null,
        assinaturaStatus: 'TESTE',
        assinaturaFim: new Date(Date.now() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000),
        papel: 'DONO',
        escola: {
          create: {
            nome: nomeEscola.trim(),
            pacote: 'PACOTE_ESCOLA',
          },
        },
      },
      include: { escola: { select: { nome: true } } },
    });

    const token = jwt.sign({ id: novoDono.id, papel: 'professor', contaId: contaId || undefined }, SEGREDO_JWT, { expiresIn: '7d' });
    res.status(201).json({
      mensagem: 'Escola criada! Teste grátis de 15 dias ativado.',
      token,
      usuario: { id: novoDono.id, nome: novoDono.nome, papel: 'professor' },
      nomeEscola: novoDono.escola.nome,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar escola.' });
  }
});

// Converte "DD/MM/AAAA" (formato usado pelo app) em Date; ignora entradas inválidas.
function parseDataNascimento(valor) {
  if (!valor || typeof valor !== 'string') return null;
  const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const data = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return isNaN(data.getTime()) ? null : data;
}

function calcularIdadeAnos(dataNascimento) {
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - dataNascimento.getUTCFullYear();
  const aindaNaoFezAniversario =
    hoje.getUTCMonth() < dataNascimento.getUTCMonth() ||
    (hoje.getUTCMonth() === dataNascimento.getUTCMonth() && hoje.getUTCDate() < dataNascimento.getUTCDate());
  if (aindaNaoFezAniversario) idade--;
  return idade;
}

app.post('/api/alunos/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, dataNascimento, codigoConvite, fotoUrl, responsavel } = req.body;
    if (!nome || !email || !senha || !codigoConvite) return res.status(400).json({ erro: 'nome, email, senha e codigoConvite são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();

    // Código de convite é exclusivo do professor autônomo (SELF) — aluno de
    // Escola (INSTITUTION) é cadastrado direto por DONO/GESTOR/SECRETARIA em
    // /api/escola/alunos/criar, sem código. Por isso o filtro exige
    // pacote PACOTE_PROFESSOR: mesmo um código válido de professor
    // institucional não deve funcionar aqui.
    const codigoNorm = codigoConvite.toUpperCase().trim();
    const professor = await prisma.professor.findFirst({
      where: { codigoConvite: codigoNorm, escola: { pacote: 'PACOTE_PROFESSOR' } },
    });
    if (!professor) return res.status(404).json({ erro: 'Código de convite inválido.' });

    const escolaIdAlvo = professor.escolaId;

    if (await prisma.aluno.findFirst({ where: { email: emailNorm, escolaId: escolaIdAlvo } })) {
      return res.status(400).json({ erro: 'E-mail já em uso nesta Escola.' });
    }

    // Rede Social Fase 1, Step 2: e-mail já é aluno em OUTRA escola/professor
    // — com MULTI_VINCULO_HABILITADO, anexa esta nova matrícula à mesma
    // Conta, mas só depois de confirmar que quem está cadastrando conhece a
    // senha de verdade daquela Conta (senão qualquer um matricularia um
    // estranho sem ele saber, só sabendo o e-mail).
    let senhaHash;
    let contaId;
    const existenteOutraEscola = await prisma.aluno.findFirst({ where: { email: emailNorm } });
    if (existenteOutraEscola) {
      if (!MULTI_VINCULO_HABILITADO) return res.status(400).json({ erro: 'E-mail já em uso.' });
      const conta = await prisma.conta.findUnique({ where: { email: emailNorm } });
      if (!conta?.senha || !await bcrypt.compare(senha, conta.senha)) {
        return res.status(400).json({ erro: 'Este e-mail já tem uma conta KAV Class. Informe a senha da conta existente para matricular em mais uma escola.' });
      }
      contaId = conta.id;
      senhaHash = conta.senha;
    } else {
      senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
      contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome, fotoUrl: fotoUrl || null });
    }

    // A idade decide o vínculo do responsável financeiro (Emusys: "nome do
    // aluno e do responsável, se menor de idade"). Sem dataNascimento válida,
    // não dá pra saber a idade — nesse caso o aluno fica sem responsável
    // formal por ora, igual ao comportamento de antes desta sprint.
    const dataNascParsed = parseDataNascimento(dataNascimento);
    const menorDeIdade = dataNascParsed ? calcularIdadeAnos(dataNascParsed) < 18 : false;

    if (menorDeIdade && !responsavel?.nome?.trim()) {
      return res.status(400).json({ erro: 'Aluno menor de idade: informe o nome do responsável financeiro.' });
    }

    const novoAluno = await prisma.$transaction(async (tx) => {
      let responsavelId = null;
      let vinculoResponsavel = null;

      if (dataNascParsed) {
        const dadosResponsavel = menorDeIdade
          ? {
              nome: responsavel.nome.trim(),
              cpf: responsavel.cpf?.trim() || null,
              email: responsavel.email?.toLowerCase().trim() || null,
              telefone: responsavel.telefone?.trim() || null,
            }
          : { nome, cpf: null, email: emailNorm, telefone: telefone || null };

        const respCriado = await tx.responsavelFinanceiro.create({
          data: { ...dadosResponsavel, escolaId: escolaIdAlvo },
        });
        responsavelId = respCriado.id;
        vinculoResponsavel = menorDeIdade ? 'DEPENDENTE' : 'CONTRATANTE';
      }

      return tx.aluno.create({
        data: {
          nome,
          telefone: telefone || null,
          dataNascimento: dataNascParsed,
          email: emailNorm,
          senha: senhaHash,
          contaId,
          professorId: professor.id,
          escolaId: escolaIdAlvo,
          status: 'PENDENTE',
          fotoUrl: fotoUrl || null,
          responsavelId,
          vinculoResponsavel,
        },
      });
    });

    res.status(201).json({ mensagem: 'Aluno cadastrado!', aluno: { id: novoAluno.id, nome: novoAluno.nome } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Confere se a assinatura do professor permite acesso. Se o teste grátis venceu,
// rebaixa a conta pra INATIVO nesse momento (checagem "preguiçosa", feita no login,
// no mesmo espírito do resto da API que não tem middleware de autorização por rota).
// Retorna null se pode entrar, ou o corpo do 403 a devolver se estiver bloqueado.
async function checarBloqueioAssinaturaProfessor(professor) {
  let status = professor.assinaturaStatus;
  let testeVencido = false;

  if (status === 'TESTE') {
    if (professor.assinaturaFim && professor.assinaturaFim <= new Date()) {
      await prisma.professor.update({ where: { id: professor.id }, data: { assinaturaStatus: 'INATIVO' } });
      status = 'INATIVO';
      testeVencido = true;
    } else {
      return null;
    }
  }

  if (status === 'PENDENTE' || status === 'INATIVO' || status === 'CANCELADO') {
    // pacote decide qual par de planos (Professor Básico/Completo ou Escola
    // Básico/Completo) o app mostra em /escolher-plano — todo Professor é
    // DONO da própria escola de 1 pessoa por padrão (Pacote Professor), só
    // quem de fato cadastrou uma instituição (POST /api/escola/cadastro)
    // tem pacote PACOTE_ESCOLA aqui.
    const escola = await prisma.escola.findUnique({ where: { id: professor.escolaId }, select: { pacote: true, modalidadeEnsino: true } });
    const pacote = escola?.pacote || 'PACOTE_PROFESSOR';
    return {
      erro: testeVencido
        ? 'Seu período de teste grátis de 15 dias terminou. Escolha um plano para continuar.'
        : 'Sua conta ainda não possui uma assinatura ativa. Selecione um plano para continuar.',
      assinaturaStatus: status,
      professorId: professor.id,
      email: professor.email,
      codigoConvite: professor.codigoConvite,
      pacote,
      // Modalidade do que está de fato sendo assinado: da Escola quando é
      // instituição, do próprio Professor quando é conta individual (SELF).
      modalidadeEnsino: pacote === 'PACOTE_ESCOLA' ? (escola?.modalidadeEnsino || []) : professor.modalidadeEnsino,
    };
  }
  return null;
}

// Professor desligado da Equipe (soft delete, auditoria INSTITUTION,
// 11/09/2026) não consegue logar — mensagem separada de
// checarBloqueioAssinaturaProfessor de propósito, pra não confundir com
// "precisa escolher um plano" (o frontend trata esses dois bloqueios de
// forma diferente).
function checarProfessorAtivoNaEscola(professor) {
  if (professor.ativoNaEscola === false) {
    return { erro: 'Você foi desligado desta escola. Fale com a administração.' };
  }
  return null;
}

// ============================================================================
// CONTA — fundação de identidade unificada (Rede Social Fase 1, Step 1).
// USAR_CONTA_NO_LOGIN controla se /api/login e /api/auth/google/* já
// resolvem por Conta (com fallback pra rota antiga em segundos, bastando
// desligar a env var, sem novo deploy, se o backfill tiver algum problema
// não previsto). Independente da env var, toda escrita de senha já
// mantém Conta.senha sincronizada a partir de agora — assim, quando a flag
// virar padrão, não existe um período onde Conta está desatualizada.
// ============================================================================
const USAR_CONTA_NO_LOGIN = process.env.USAR_CONTA_NO_LOGIN === 'true';

// Step 2 (multi-vínculo de verdade): só ligar depois da migration que troca
// o @unique(email) global por @@unique([email, escolaId]) já ter rodado em
// produção (ver prisma/migrations/20260915130000.../20260915130001...).
// Controla exclusivamente a CRIAÇÃO de um segundo vínculo (self/ativar,
// cadastro de aluno anexando a Conta existente) — não afeta leitura/login,
// que já usa findFirst/updateMany desde a Step 1 independente desta flag.
const MULTI_VINCULO_HABILITADO = process.env.MULTI_VINCULO_HABILITADO === 'true';

// Mantém Conta.senha (e opcionalmente nome/fotoUrl/googleId) em sincronia
// com o que é gravado em Professor/Aluno. Cria a Conta se ainda não existir
// (upsert por e-mail) e devolve o id, pra já linkar contaId na linha sendo
// criada/atualizada. Chamada em todo ponto do arquivo que grava senha ou
// cria uma conta nova — nunca falha o fluxo principal se a própria escrita
// em Conta der erro (best-effort: o backfill cobre o que ficar pra trás).
async function sincronizarConta(email, { senha, nome, fotoUrl, googleId } = {}) {
  const emailNorm = email.toLowerCase().trim();
  const dados = {};
  if (senha !== undefined) dados.senha = senha;
  if (nome !== undefined) dados.nome = nome;
  if (fotoUrl !== undefined) dados.fotoUrl = fotoUrl;
  if (googleId !== undefined) dados.googleId = googleId;
  try {
    const conta = await prisma.conta.upsert({
      where: { email: emailNorm },
      create: { email: emailNorm, ...dados },
      update: dados,
    });
    return conta.id;
  } catch (err) {
    console.error('[Conta] Falha ao sincronizar Conta pro e-mail', emailNorm, '-', err.message);
    return null;
  }
}

// Login pela Conta unificada (USAR_CONTA_NO_LOGIN=true). Resolve todos os
// vínculos (Professor[]/Aluno[]) da Conta pelo e-mail, escolhe um "padrão"
// com a MESMA prioridade e os MESMOS bloqueios de sempre (professor antes
// de aluno; desligado/sem assinatura ativa barra o login) — mas só barra de
// verdade se não houver nenhum outro vínculo utilizável, já que hoje (Step
// 1) toda Conta tem no máximo 1 vínculo (email ainda é @unique global em
// Professor/Aluno), então o comportamento observado é idêntico ao de antes.
async function loginPorConta(req, res) {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'email e senha são obrigatórios.' });

  const emailNorm = email.toLowerCase().trim();
  const conta = await prisma.conta.findUnique({
    where: { email: emailNorm },
    include: { professores: true, alunos: true },
  });
  if (!conta || !conta.senha || !await bcrypt.compare(senha, conta.senha)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  const candidatos = [
    ...conta.professores.map((p) => ({ ...p, papel: 'professor' })),
    ...conta.alunos.map((a) => ({ ...a, papel: 'aluno' })),
  ];

  if (candidatos.length === 0) {
    const token = jwt.sign({ id: conta.id, papel: 'conta', contaId: conta.id }, SEGREDO_JWT, { expiresIn: '7d' });
    return res.json({ mensagem: 'Login realizado!', token, usuario: { id: conta.id, nome: conta.nome || '', papel: 'conta' }, vinculos: [] });
  }

  const bloqueioDe = async (c) => {
    if (c.papel !== 'professor') return null;
    return checarProfessorAtivoNaEscola(c) || await checarBloqueioAssinaturaProfessor(c);
  };

  let padrao = candidatos[0];
  let bloqueioPadrao = await bloqueioDe(padrao);
  for (let i = 1; i < candidatos.length && bloqueioPadrao; i++) {
    const b = await bloqueioDe(candidatos[i]);
    if (!b) { padrao = candidatos[i]; bloqueioPadrao = null; }
  }
  if (bloqueioPadrao) return res.status(403).json(bloqueioPadrao);

  const token = jwt.sign({ id: padrao.id, papel: padrao.papel, contaId: conta.id }, SEGREDO_JWT, { expiresIn: '7d' });
  res.json({
    mensagem: 'Login realizado!',
    token,
    usuario: { id: padrao.id, nome: padrao.nome, papel: padrao.papel },
    vinculos: candidatos.map((c) => ({ id: c.id, papel: c.papel, nome: c.nome, escolaId: c.escolaId })),
  });
}

app.post('/api/login', async (req, res) => {
  try {
    if (USAR_CONTA_NO_LOGIN) return await loginPorConta(req, res);

    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'email e senha são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    // findFirst, não findUnique: email deixou de ser único sozinho (Rede
    // Social Fase 1, Step 2) — pode haver mais de uma linha por e-mail
    // (ex.: professor institucional + SELF). Este login legado (sem
    // USAR_CONTA_NO_LOGIN) sempre pega a primeira encontrada, igual ao
    // comportamento de sempre pra quem só tem 1 vínculo; quem tem mais de 1
    // deve estar usando o login por Conta.
    let usuario = await prisma.professor.findFirst({ where: { email: emailNorm }, orderBy: { createdAt: 'asc' } });
    let papel = 'professor';
    if (!usuario) { usuario = await prisma.aluno.findFirst({ where: { email: emailNorm }, orderBy: { createdAt: 'asc' } }); papel = 'aluno'; }
    if (!usuario) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    if (!await bcrypt.compare(senha, usuario.senha)) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    if (papel === 'professor') {
      const desligado = checarProfessorAtivoNaEscola(usuario);
      if (desligado) return res.status(403).json(desligado);
      const bloqueio = await checarBloqueioAssinaturaProfessor(usuario);
      if (bloqueio) return res.status(403).json(bloqueio);
    }

    const token = jwt.sign({ id: usuario.id, papel, contaId: usuario.contaId || undefined }, SEGREDO_JWT, { expiresIn: '7d' });
    res.json({ mensagem: 'Login realizado!', token, usuario: { id: usuario.id, nome: usuario.nome, papel } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Troca de vínculo dentro da mesma Conta já autenticada — token novo pra
// outra linha Professor/Aluno, sem pedir senha de novo. Nenhuma rota de
// negócio existente muda: trocar de vínculo é só isso, "pedir outro token".
app.post('/api/contas/trocar-vinculo', autenticar, async (req, res) => {
  try {
    if (!req.auth.contaId) return res.status(400).json({ erro: 'Conta não migrada para o novo login.' });
    const { vinculoId, papel } = req.body;
    if (!vinculoId || (papel !== 'professor' && papel !== 'aluno')) {
      return res.status(400).json({ erro: 'vinculoId e papel (professor|aluno) são obrigatórios.' });
    }

    const modelo = papel === 'professor' ? prisma.professor : prisma.aluno;
    const alvo = await modelo.findFirst({ where: { id: vinculoId, contaId: req.auth.contaId } });
    if (!alvo) return res.status(403).json({ erro: 'Vínculo não pertence a esta conta.' });

    if (papel === 'professor') {
      const desligado = checarProfessorAtivoNaEscola(alvo);
      if (desligado) return res.status(403).json(desligado);
      const bloqueio = await checarBloqueioAssinaturaProfessor(alvo);
      if (bloqueio) return res.status(403).json(bloqueio);
    }

    const token = jwt.sign({ id: alvo.id, papel, contaId: req.auth.contaId }, SEGREDO_JWT, { expiresIn: '7d' });
    res.json({ token, usuario: { id: alvo.id, nome: alvo.nome, papel } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Cadastro de Conta "neutra" — sem vínculo nenhum ainda. Dark launch: sem
// tela conectada até a busca/descoberta (Fase 2) existir. papel:'conta' no
// token não bate com 'professor'/'aluno', então exigirProfessor/exigirAluno
// já rejeitam automaticamente, sem precisar tocar nessas funções.
app.post('/api/contas/cadastro', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'email e senha são obrigatórios.' });
    if (senha.length < 6) return res.status(400).json({ erro: 'senha: mínimo 6 caracteres.' });

    const emailNorm = email.toLowerCase().trim();
    if (await prisma.conta.findUnique({ where: { email: emailNorm } })) {
      return res.status(400).json({ erro: 'Já existe uma conta com esse e-mail.' });
    }

    const hash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
    const conta = await prisma.conta.create({ data: { email: emailNorm, senha: hash, nome: nome?.trim() || null } });

    const token = jwt.sign({ id: conta.id, papel: 'conta', contaId: conta.id }, SEGREDO_JWT, { expiresIn: '7d' });
    res.status(201).json({ mensagem: 'Conta criada!', token, usuario: { id: conta.id, nome: conta.nome || '', papel: 'conta' }, vinculos: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// BUSCA/DESCOBERTA — Rede Social Fase 3. Protegido só por `autenticar`
// (qualquer papel serve: 'conta' neutra, 'professor' ou 'aluno') — é a rede
// "fechada" descrita no roadmap: precisa estar logado pra navegar, mas não
// precisa ter vínculo nenhum ainda. Nunca usar exigirProfessor/exigirAluno
// aqui de propósito.
//
// Professor só aparece com visivelBuscaSelf=true (mensalidade SELF paga —
// ver POST /api/professor/self/ativar) E assinatura utilizável: é o gate de
// monetização descrito no roadmap, professor filiado a Escola sem SELF
// simplesmente não existe pra quem busca aula particular. Escola aparece
// sempre que for PACOTE_ESCOLA (a instituição já paga pela plataforma, sem
// gate adicional de visibilidade).
// ============================================================================

const RESULTADOS_BUSCA_MAX = 30;

app.get('/api/busca/professores', autenticar, async (req, res) => {
  try {
    const { curso, cidade, estado, q, modalidade } = req.query;

    const professores = await prisma.professor.findMany({
      where: {
        visivelBuscaSelf: true,
        ativoNaEscola: true,
        assinaturaStatus: { in: ['ATIVO', 'VITALICIO', 'TESTE'] },
        // Gate por nível (planos em 2 níveis, 18/09/2026): busca/avaliação
        // pública é feature do plano COMPLETO — BASICO continua com o SaaS
        // de gestão normal, só não aparece pra quem procura aula/escola.
        nivelPlano: 'COMPLETO',
        ...(curso ? { cursos: { has: String(curso) } } : {}),
        ...(cidade ? { cidade: { equals: String(cidade), mode: 'insensitive' } } : {}),
        ...(estado ? { estado: { equals: String(estado).toUpperCase() } } : {}),
        ...(q ? { nome: { contains: String(q), mode: 'insensitive' } } : {}),
        ...(modalidade ? { modalidadeEnsino: { has: String(modalidade).toUpperCase() } } : {}),
      },
      select: { id: true, nome: true, fotoUrl: true, bio: true, cidade: true, estado: true, cursos: true, modalidadeEnsino: true },
      orderBy: { createdAt: 'desc' },
      take: RESULTADOS_BUSCA_MAX,
    });

    // Ranking por nota (Rede Social — Epic B, 18/09/2026): groupBy numa
    // query só, em vez de um aggregate por professor (evitaria N+1 pra até
    // RESULTADOS_BUSCA_MAX linhas). Quem não tem avaliação nenhuma cai pro
    // fim da lista, não some.
    const notas = professores.length
      ? await prisma.avaliacao.groupBy({
          by: ['professorId'],
          where: { professorId: { in: professores.map((p) => p.id) } },
          _avg: { nota: true },
          _count: { nota: true },
        })
      : [];
    const notaPorProfessor = new Map(notas.map((n) => [n.professorId, n]));
    const comNota = professores.map((p) => {
      const n = notaPorProfessor.get(p.id);
      return { ...p, notaMedia: n?._avg.nota ?? null, totalAvaliacoes: n?._count.nota ?? 0 };
    });
    comNota.sort((a, b) => (b.notaMedia ?? -1) - (a.notaMedia ?? -1));

    res.json({ professores: comNota });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar professores.' });
  }
});

app.get('/api/busca/escolas', autenticar, async (req, res) => {
  try {
    const { curso, cidade, estado, q, modalidade } = req.query;

    const escolas = await prisma.escola.findMany({
      where: {
        pacote: 'PACOTE_ESCOLA',
        nivelPlano: 'COMPLETO',
        ...(cidade ? { cidade: { equals: String(cidade), mode: 'insensitive' } } : {}),
        ...(estado ? { estado: { equals: String(estado).toUpperCase() } } : {}),
        ...(q ? { nome: { contains: String(q), mode: 'insensitive' } } : {}),
        ...(curso ? { cursos: { some: { nome: { equals: String(curso), mode: 'insensitive' }, ativo: true } } } : {}),
        ...(modalidade ? { modalidadeEnsino: { has: String(modalidade).toUpperCase() } } : {}),
      },
      select: { id: true, nome: true, logoUrl: true, bio: true, cidade: true, estado: true, modalidadeEnsino: true },
      orderBy: { createdAt: 'desc' },
      take: RESULTADOS_BUSCA_MAX,
    });

    // Ranking por nota (Rede Social — Epic B, 18/09/2026): notaEscola vive em
    // Avaliacao.professorId (o aluno avalia professor+escola na mesma
    // submissão mensal), não tem escolaId direto — por isso o join manual em
    // vez de groupBy (Prisma não agrupa por campo de relação).
    const escolaIds = escolas.map((e) => e.id);
    const avaliacoesEscolas = escolaIds.length
      ? await prisma.avaliacao.findMany({
          where: { notaEscola: { not: null }, professor: { escolaId: { in: escolaIds } } },
          select: { notaEscola: true, professor: { select: { escolaId: true } } },
        })
      : [];
    const somaPorEscola = new Map();
    for (const a of avaliacoesEscolas) {
      const atual = somaPorEscola.get(a.professor.escolaId) || { soma: 0, total: 0 };
      atual.soma += a.notaEscola;
      atual.total += 1;
      somaPorEscola.set(a.professor.escolaId, atual);
    }
    const comNota = escolas.map((e) => {
      const agr = somaPorEscola.get(e.id);
      return { ...e, notaMedia: agr ? agr.soma / agr.total : null, totalAvaliacoes: agr?.total ?? 0 };
    });
    comNota.sort((a, b) => (b.notaMedia ?? -1) - (a.notaMedia ?? -1));

    res.json({ escolas: comNota });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar escolas.' });
  }
});

// Perfil público "vitrine" — só os campos que fazem sentido pra um
// desconhecido ver (nunca email/telefone/chavePix). 404 (não 403) quando o
// professor não está com SELF ativo, de propósito: não revela se aquele id
// existe ou não pra quem só está de passagem.
const AVALIACOES_PUBLICAS_POR_PAGINA = 20;

app.get('/api/professores/:id/perfil-publico', autenticar, async (req, res) => {
  try {
    const professor = await prisma.professor.findFirst({
      where: { id: req.params.id, visivelBuscaSelf: true, ativoNaEscola: true, nivelPlano: 'COMPLETO' },
      select: { id: true, nome: true, fotoUrl: true, bio: true, cidade: true, estado: true, cursos: true, videoApresentacaoUrl: true, precoAssinaturaPremium: true, modalidadeEnsino: true, whatsapp: true, emailContato: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const avaliacao = await prisma.avaliacao.aggregate({
      where: { professorId: professor.id },
      _avg: { nota: true },
      _count: { nota: true },
    });

    // Lista pública de avaliações (Rede Social — Epic B, 18/09/2026): só
    // chega aqui quem já passou pelo gate nivelPlano:COMPLETO acima. Nome do
    // aluno + comentário: mesma exposição que já existia pro próprio
    // professor ver em (professor)/perfil.tsx, agora pública.
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const avaliacoes = await prisma.avaliacao.findMany({
      where: { professorId: professor.id, comentario: { not: null } },
      select: { id: true, nota: true, comentario: true, createdAt: true, aluno: { select: { nome: true, fotoUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pagina - 1) * AVALIACOES_PUBLICAS_POR_PAGINA,
      take: AVALIACOES_PUBLICAS_POR_PAGINA,
    });

    res.json({
      ...professor,
      notaMedia: avaliacao._avg.nota,
      totalAvaliacoes: avaliacao._count.nota,
      avaliacoes,
      proximaPagina: avaliacoes.length === AVALIACOES_PUBLICAS_POR_PAGINA ? pagina + 1 : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar perfil.' });
  }
});

app.get('/api/escolas/:id/perfil-publico', autenticar, async (req, res) => {
  try {
    const escola = await prisma.escola.findFirst({
      where: { id: req.params.id, pacote: 'PACOTE_ESCOLA', nivelPlano: 'COMPLETO' },
      select: { id: true, nome: true, logoUrl: true, bio: true, cidade: true, estado: true, modalidadeEnsino: true, whatsapp: true, email: true },
    });
    if (!escola) return res.status(404).json({ erro: 'Escola não encontrada.' });

    const avaliacao = await prisma.avaliacao.aggregate({
      where: { professor: { escolaId: escola.id } },
      _avg: { notaEscola: true },
      _count: { notaEscola: true },
    });

    const cursos = await prisma.curso.findMany({
      where: { escolaId: escola.id, ativo: true },
      select: { nome: true },
      take: 50,
    });

    // Lista pública de avaliações da Escola (Rede Social — Epic B,
    // 18/09/2026) — mesma linha de Avaliacao do professor, só que lendo
    // notaEscola/mesReferencia em vez de nota (ver comentário no model).
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const avaliacoesRaw = await prisma.avaliacao.findMany({
      where: { professor: { escolaId: escola.id }, notaEscola: { not: null }, comentario: { not: null } },
      select: { id: true, notaEscola: true, comentario: true, createdAt: true, aluno: { select: { nome: true, fotoUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pagina - 1) * AVALIACOES_PUBLICAS_POR_PAGINA,
      take: AVALIACOES_PUBLICAS_POR_PAGINA,
    });
    const avaliacoes = avaliacoesRaw.map(({ notaEscola, ...a }) => ({ ...a, nota: notaEscola }));

    res.json({
      ...escola,
      cursos: cursos.map((c) => c.nome),
      notaMedia: avaliacao._avg.notaEscola,
      totalAvaliacoes: avaliacao._count.notaEscola,
      avaliacoes,
      proximaPagina: avaliacoes.length === AVALIACOES_PUBLICAS_POR_PAGINA ? pagina + 1 : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar perfil.' });
  }
});

// GET /api/professores/:id/reels e /api/escolas/:id/reels — grid de Reels
// do perfil público (Rede Social — Epic D, 18/09/2026). Diferente de GET
// /api/reels (escopado pela escola de quem PEDE, feed estilo comunidade
// fechada), aqui é escopado pelo AUTOR sendo visitado — qualquer pessoa
// autenticada pode ver os Reels públicos de qualquer professor/escola,
// sem precisar compartilhar a mesma Escola.
async function listarReelsPublicos(req, res, filtroAutor) {
  try {
    const cursor = req.query.cursor;
    const reels = await prisma.reel.findMany({
      where: { ...filtroAutor, status: 'PRONTO' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      include: { _count: { select: { curtidas: true, comentarios: true } } },
    });

    const curtidasDoUsuario = reels.length ? await prisma.reelCurtida.findMany({
      where: {
        reelId: { in: reels.map((r) => r.id) },
        ...(req.auth.papel === 'professor' ? { autorProfessorId: req.auth.id } : { autorAlunoId: req.auth.id }),
      },
      select: { reelId: true },
    }) : [];
    const idsCurtidos = new Set(curtidasDoUsuario.map((c) => c.reelId));

    res.json({
      reels: reels.map((r) => ({
        id: r.id,
        videoId: r.videoId,
        thumbnailUrl: r.thumbnailUrl,
        duracaoSegundos: r.duracaoSegundos,
        descricao: r.descricao,
        totalVisualizacoes: r.totalVisualizacoes,
        createdAt: r.createdAt,
        totalCurtidas: r._count.curtidas,
        totalComentarios: r._count.comentarios,
        curtidoPeloUsuario: idsCurtidos.has(r.id),
      })),
      proximoCursor: reels.length === 20 ? reels[reels.length - 1].id : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar Reels.' });
  }
}

app.get('/api/professores/:id/reels', autenticar, (req, res) =>
  listarReelsPublicos(req, res, { autorProfessorId: req.params.id }));

app.get('/api/escolas/:id/reels', autenticar, (req, res) =>
  listarReelsPublicos(req, res, { autorEscolaId: req.params.id }));

// GET /api/professores/:id/posts e /api/escolas/:id/posts — galeria de
// fotos do perfil público (Rede Social, 18/09/2026), estilo LinkedIn: só
// posts com mídia, nunca conteúdo exclusivo/pago (exclusivo:false sempre —
// visitante do perfil público não passou pelo gate de paywall nenhum).
async function listarPostsComMidiaPublicos(req, res, filtroAutor) {
  try {
    const cursor = req.query.cursor;
    const posts = await prisma.post.findMany({
      where: { ...filtroAutor, exclusivo: false, midiaUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      select: { id: true, midiaUrl: true, conteudo: true, createdAt: true },
    });
    res.json({ posts, proximoCursor: posts.length === 20 ? posts[posts.length - 1].id : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar publicações.' });
  }
}

app.get('/api/professores/:id/posts', autenticar, (req, res) =>
  listarPostsComMidiaPublicos(req, res, { autorProfessorId: req.params.id }));

app.get('/api/escolas/:id/posts', autenticar, (req, res) =>
  listarPostsComMidiaPublicos(req, res, { autorEscolaId: req.params.id }));

// ============================================================================
// FEED / POSTS — Rede Social Fase 4. Comunidade fechada por Escola: o feed
// só mostra posts com o MESMO escolaId do vínculo ativo de quem está
// olhando (nunca um feed global) — "timeline do professor"/"comunidade de
// turma" do roadmap, não uma rede aberta tipo Twitter. Só Professor/Escola
// publicam; Aluno só curte/comenta (ver comentário no schema.prisma).
// ============================================================================

app.post('/api/posts', exigirProfessor, async (req, res) => {
  try {
    const { conteudo, midiaUrl, exclusivo } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ erro: 'conteudo é obrigatório.' });

    const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true, precoAssinaturaPremium: true } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    if (exclusivo && !professor.precoAssinaturaPremium) {
      return res.status(400).json({ erro: 'Configure um preço de assinatura premium antes de publicar conteúdo exclusivo.' });
    }

    const post = await prisma.post.create({
      data: {
        conteudo: conteudo.trim(),
        midiaUrl: midiaUrl || null,
        exclusivo: !!exclusivo,
        autorProfessorId: req.auth.id,
        escolaId: professor.escolaId,
      },
    });
    res.status(201).json({ mensagem: 'Post publicado!', post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao publicar post.' });
  }
});

// POST /api/escola/posts — DONO/GESTOR posta EM NOME da instituição (não
// como professor individual). Reaproveita exigirPapelNaEscola, mesmo padrão
// de toda rota administrativa do painel Escola.
app.post('/api/escola/posts', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const { conteudo, midiaUrl } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ erro: 'conteudo é obrigatório.' });

    const post = await prisma.post.create({
      data: {
        conteudo: conteudo.trim(),
        midiaUrl: midiaUrl || null,
        autorEscolaId: professor.escolaId,
        escolaId: professor.escolaId,
      },
    });
    res.status(201).json({ mensagem: 'Post publicado!', post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao publicar post.' });
  }
});

// DELETE /api/posts/:id — o próprio autor sempre pode apagar; DONO/GESTOR
// da Escola também pode apagar QUALQUER post escopado a ela (moderação),
// mesmo um que não tenha publicado (ex.: post de um professor da equipe).
app.delete('/api/posts/:id', autenticar, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ erro: 'Post não encontrado.' });

    let autorizado = false;
    if (req.auth.papel === 'professor') {
      if (post.autorProfessorId === req.auth.id) {
        autorizado = true;
      } else {
        const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { papel: true, escolaId: true } });
        if (professor && ['DONO', 'GESTOR'].includes(professor.papel) && professor.escolaId === post.escolaId) {
          autorizado = true;
        }
      }
    }
    if (!autorizado) return res.status(403).json({ erro: 'Você não pode apagar este post.' });

    await prisma.post.delete({ where: { id: post.id } });
    res.json({ mensagem: 'Post removido.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover post.' });
  }
});

// GET /api/feed — escopado pelo escolaId do vínculo ATIVO de quem pede
// (mesmo padrão de todo o resto do app: troca de vínculo = pedir outro
// token, nunca "somar" feeds de vários vínculos numa mesma resposta).
// Paginação por cursor simples (id do último post já carregado).
app.get('/api/feed', autenticar, async (req, res) => {
  try {
    let escolaId;
    if (req.auth.papel === 'professor') {
      const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
      if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
      escolaId = professor.escolaId;
    } else if (req.auth.papel === 'aluno') {
      const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
      if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
      escolaId = aluno.escolaId;
    } else {
      return res.status(403).json({ erro: 'Entre como professor ou aluno pra ver o feed.' });
    }

    const cursor = req.query.cursor;
    const posts = await prisma.post.findMany({
      where: { escolaId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      include: {
        autorProfessor: { select: { id: true, nome: true, fotoUrl: true } },
        autorEscola: { select: { id: true, nome: true, logoUrl: true } },
        _count: { select: { curtidas: true, comentarios: true } },
      },
    });

    // Marca se quem pediu já curtiu cada post — 1 query agregada, não N+1.
    const curtidasDoUsuario = posts.length ? await prisma.postCurtida.findMany({
      where: {
        postId: { in: posts.map((p) => p.id) },
        ...(req.auth.papel === 'professor' ? { autorProfessorId: req.auth.id } : { autorAlunoId: req.auth.id }),
      },
      select: { postId: true },
    }) : [];
    const idsCurtidos = new Set(curtidasDoUsuario.map((c) => c.postId));

    // Paywall (Fase 5): só Aluno é gateado — Professor sempre vê o próprio
    // feed institucional inteiro (é a equipe, não o público pagante). 1
    // query agregada (nunca N+1) pelos autores de posts exclusivos deste lote.
    const professoresExclusivosDoLote = req.auth.papel === 'aluno'
      ? [...new Set(posts.filter((p) => p.exclusivo && p.autorProfessorId).map((p) => p.autorProfessorId))]
      : [];
    const idsProfessorAssinados = professoresExclusivosDoLote.length
      ? new Set((await prisma.assinaturaPremium.findMany({
          where: { alunoId: req.auth.id, status: 'ATIVA', professorId: { in: professoresExclusivosDoLote } },
          select: { professorId: true },
        })).map((a) => a.professorId))
      : new Set();

    res.json({
      posts: posts.map((p) => {
        const bloqueado = req.auth.papel === 'aluno' && p.exclusivo && !idsProfessorAssinados.has(p.autorProfessorId);
        return {
          id: p.id,
          conteudo: bloqueado ? null : p.conteudo,
          midiaUrl: bloqueado ? null : p.midiaUrl,
          exclusivo: p.exclusivo,
          bloqueado,
          createdAt: p.createdAt,
          autor: p.autorProfessor
            ? { tipo: 'professor', id: p.autorProfessor.id, nome: p.autorProfessor.nome, fotoUrl: p.autorProfessor.fotoUrl }
            : { tipo: 'escola', id: p.autorEscola.id, nome: p.autorEscola.nome, fotoUrl: p.autorEscola.logoUrl },
          totalCurtidas: p._count.curtidas,
          totalComentarios: p._count.comentarios,
          curtidoPeloUsuario: idsCurtidos.has(p.id),
        };
      }),
      proximoCursor: posts.length === 20 ? posts[posts.length - 1].id : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o feed.' });
  }
});

// POST /api/posts/:id/curtir — toggle (curte se não tinha curtido, descurte
// se já tinha). Professor ou aluno, nunca Conta neutra (precisa ter vínculo
// pra curtir algo).
// Paywall (Fase 5): aluno sem assinatura ATIVA não interage com post
// exclusivo de outro professor (não faz sentido curtir/comentar algo que
// nem consegue ler) — professor nunca é bloqueado aqui (ver GET /api/feed).
async function alunoBloqueadoPorPaywall(post, req) {
  if (req.auth.papel !== 'aluno' || !post.exclusivo || !post.autorProfessorId) return false;
  const assinatura = await prisma.assinaturaPremium.findUnique({
    where: { alunoId_professorId: { alunoId: req.auth.id, professorId: post.autorProfessorId } },
    select: { status: true },
  });
  return assinatura?.status !== 'ATIVA';
}

app.post('/api/posts/:id/curtir', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true, exclusivo: true, autorProfessorId: true } });
    if (!post) return res.status(404).json({ erro: 'Post não encontrado.' });
    if (await alunoBloqueadoPorPaywall(post, req)) {
      return res.status(403).json({ erro: 'Assine o conteúdo premium deste professor pra interagir com este post.' });
    }

    const campoAutor = req.auth.papel === 'professor' ? 'autorProfessorId' : 'autorAlunoId';
    const existente = await prisma.postCurtida.findFirst({ where: { postId: post.id, [campoAutor]: req.auth.id } });

    if (existente) {
      await prisma.postCurtida.delete({ where: { id: existente.id } });
      return res.json({ curtido: false });
    }

    await prisma.postCurtida.create({ data: { postId: post.id, [campoAutor]: req.auth.id } });
    res.json({ curtido: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao curtir.' });
  }
});

app.get('/api/posts/:id/comentarios', autenticar, async (req, res) => {
  try {
    const comentarios = await prisma.postComentario.findMany({
      where: { postId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        autorProfessor: { select: { id: true, nome: true, fotoUrl: true } },
        autorAluno: { select: { id: true, nome: true, fotoUrl: true } },
      },
      take: 100,
    });
    res.json({
      comentarios: comentarios.map((c) => ({
        id: c.id,
        conteudo: c.conteudo,
        createdAt: c.createdAt,
        autor: c.autorProfessor
          ? { tipo: 'professor', id: c.autorProfessor.id, nome: c.autorProfessor.nome, fotoUrl: c.autorProfessor.fotoUrl }
          : { tipo: 'aluno', id: c.autorAluno.id, nome: c.autorAluno.nome, fotoUrl: c.autorAluno.fotoUrl },
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar comentários.' });
  }
});

app.post('/api/posts/:id/comentarios', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const { conteudo } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ erro: 'conteudo é obrigatório.' });

    const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true, exclusivo: true, autorProfessorId: true } });
    if (!post) return res.status(404).json({ erro: 'Post não encontrado.' });
    if (await alunoBloqueadoPorPaywall(post, req)) {
      return res.status(403).json({ erro: 'Assine o conteúdo premium deste professor pra interagir com este post.' });
    }

    const campoAutor = req.auth.papel === 'professor' ? 'autorProfessorId' : 'autorAlunoId';
    const comentario = await prisma.postComentario.create({
      data: { postId: post.id, conteudo: conteudo.trim(), [campoAutor]: req.auth.id },
    });
    res.status(201).json({ comentario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao comentar.' });
  }
});

// ============================================================================
// REELS (Rede Social — planos/captação, Epic D, 18/09/2026) — vídeo curto
// liberado já no plano BASICO (isca de captação, não depende de
// nivelPlano:COMPLETO como busca/avaliações). Hospedagem: Cloudflare Stream
// via Direct Creator Upload (ver cloudflareStreamFetch acima).
// ============================================================================

const DURACAO_MAXIMA_REEL_SEGUNDOS = 90;

// POST /api/reels/upload-url — gera a URL de upload descartável da
// Cloudflare E já cria a linha do Reel na hora (status PROCESSANDO),
// amarrada ao autor autenticado. Diferente de um desenho ingênuo em 2
// passos (gerar URL → só depois "registrar" com o videoId de volta), criar
// aqui evita um vetor onde qualquer professor autenticado poderia "roubar"
// um vídeo enviando de volta um videoId gerado pra OUTRO professor (o uid
// da Cloudflare não é escopado por usuário, só pela nossa conta inteira).
app.post('/api/reels/upload-url', exigirProfessor, async (req, res) => {
  if (!CLOUDFLARE_STREAM_CONFIGURADO) {
    return res.status(503).json({ erro: 'Serviço de vídeo não configurado. Contate o suporte.' });
  }
  try {
    const { descricao, comoInstituicao } = req.body;

    const professor = await prisma.professor.findUnique({
      where: { id: req.auth.id },
      select: { escolaId: true, papel: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    if (comoInstituicao && !['DONO', 'GESTOR'].includes(professor.papel)) {
      return res.status(403).json({ erro: 'Só DONO/GESTOR pode publicar Reels em nome da instituição.' });
    }

    const resultado = await cloudflareStreamFetch('/stream/direct_upload', {
      method: 'POST',
      body: JSON.stringify({ maxDurationSeconds: DURACAO_MAXIMA_REEL_SEGUNDOS }),
    });

    const reel = await prisma.reel.create({
      data: {
        videoId: resultado.uid,
        descricao: descricao?.trim() || null,
        escolaId: professor.escolaId,
        ...(comoInstituicao ? { autorEscolaId: professor.escolaId } : { autorProfessorId: req.auth.id }),
      },
    });

    res.json({ uploadURL: resultado.uploadURL, reelId: reel.id });
  } catch (error) {
    console.error('[Reels] Erro ao gerar upload URL:', error.message);
    res.status(error.status || 500).json({ erro: error.message || 'Erro ao preparar upload do vídeo.' });
  }
});

// GET /api/reels — feed paginado, mesmo escopo por escolaId de GET
// /api/feed. Só devolve status:PRONTO (ainda processando/erro não aparece
// pra ninguém além do próprio autor, que não tem tela de "meus reels"
// nesta primeira versão — o upload já mostra "publicado" na hora).
app.get('/api/reels', autenticar, async (req, res) => {
  try {
    let escolaId;
    if (req.auth.papel === 'professor') {
      const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
      if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
      escolaId = professor.escolaId;
    } else if (req.auth.papel === 'aluno') {
      const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
      if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
      escolaId = aluno.escolaId;
    } else {
      return res.status(403).json({ erro: 'Entre como professor ou aluno pra ver os Reels.' });
    }

    const cursor = req.query.cursor;
    const reels = await prisma.reel.findMany({
      where: { escolaId, status: 'PRONTO' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      include: {
        autorProfessor: { select: { id: true, nome: true, fotoUrl: true } },
        autorEscola: { select: { id: true, nome: true, logoUrl: true } },
        _count: { select: { curtidas: true, comentarios: true } },
      },
    });

    const curtidasDoUsuario = reels.length ? await prisma.reelCurtida.findMany({
      where: {
        reelId: { in: reels.map((r) => r.id) },
        ...(req.auth.papel === 'professor' ? { autorProfessorId: req.auth.id } : { autorAlunoId: req.auth.id }),
      },
      select: { reelId: true },
    }) : [];
    const idsCurtidos = new Set(curtidasDoUsuario.map((c) => c.reelId));

    res.json({
      reels: reels.map((r) => ({
        id: r.id,
        videoId: r.videoId,
        thumbnailUrl: r.thumbnailUrl,
        duracaoSegundos: r.duracaoSegundos,
        descricao: r.descricao,
        totalVisualizacoes: r.totalVisualizacoes,
        createdAt: r.createdAt,
        autor: r.autorProfessor
          ? { tipo: 'professor', id: r.autorProfessor.id, nome: r.autorProfessor.nome, fotoUrl: r.autorProfessor.fotoUrl }
          : { tipo: 'escola', id: r.autorEscola.id, nome: r.autorEscola.nome, fotoUrl: r.autorEscola.logoUrl },
        totalCurtidas: r._count.curtidas,
        totalComentarios: r._count.comentarios,
        curtidoPeloUsuario: idsCurtidos.has(r.id),
      })),
      proximoCursor: reels.length === 20 ? reels[reels.length - 1].id : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar os Reels.' });
  }
});

// DELETE /api/reels/:id — mesma regra de moderação de DELETE /api/posts/:id:
// o próprio autor sempre pode, DONO/GESTOR da Escola pode apagar qualquer
// um escopado a ela.
app.delete('/api/reels/:id', autenticar, async (req, res) => {
  try {
    const reel = await prisma.reel.findUnique({ where: { id: req.params.id } });
    if (!reel) return res.status(404).json({ erro: 'Reel não encontrado.' });

    let autorizado = false;
    if (req.auth.papel === 'professor') {
      if (reel.autorProfessorId === req.auth.id) {
        autorizado = true;
      } else {
        const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { papel: true, escolaId: true } });
        if (professor && ['DONO', 'GESTOR'].includes(professor.papel) && professor.escolaId === reel.escolaId) {
          autorizado = true;
        }
      }
    }
    if (!autorizado) return res.status(403).json({ erro: 'Você não pode apagar este Reel.' });

    await prisma.reel.delete({ where: { id: reel.id } });
    if (CLOUDFLARE_STREAM_CONFIGURADO) {
      // Best-effort — não bloqueia a resposta se a Cloudflare estiver fora do ar.
      cloudflareStreamFetch(`/stream/${reel.videoId}`, { method: 'DELETE' }).catch(() => {});
    }
    res.json({ mensagem: 'Reel removido.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover Reel.' });
  }
});

app.post('/api/reels/:id/curtir', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!reel) return res.status(404).json({ erro: 'Reel não encontrado.' });

    const campoAutor = req.auth.papel === 'professor' ? 'autorProfessorId' : 'autorAlunoId';
    const existente = await prisma.reelCurtida.findFirst({ where: { reelId: reel.id, [campoAutor]: req.auth.id } });

    if (existente) {
      await prisma.reelCurtida.delete({ where: { id: existente.id } });
      return res.json({ curtido: false });
    }

    await prisma.reelCurtida.create({ data: { reelId: reel.id, [campoAutor]: req.auth.id } });
    res.json({ curtido: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao curtir.' });
  }
});

app.get('/api/reels/:id/comentarios', autenticar, async (req, res) => {
  try {
    const comentarios = await prisma.reelComentario.findMany({
      where: { reelId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        autorProfessor: { select: { id: true, nome: true, fotoUrl: true } },
        autorAluno: { select: { id: true, nome: true, fotoUrl: true } },
      },
      take: 100,
    });
    res.json({
      comentarios: comentarios.map((c) => ({
        id: c.id,
        conteudo: c.conteudo,
        createdAt: c.createdAt,
        autor: c.autorProfessor
          ? { tipo: 'professor', id: c.autorProfessor.id, nome: c.autorProfessor.nome, fotoUrl: c.autorProfessor.fotoUrl }
          : { tipo: 'aluno', id: c.autorAluno.id, nome: c.autorAluno.nome, fotoUrl: c.autorAluno.fotoUrl },
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar comentários.' });
  }
});

app.post('/api/reels/:id/comentarios', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const { conteudo } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ erro: 'conteudo é obrigatório.' });

    const reel = await prisma.reel.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!reel) return res.status(404).json({ erro: 'Reel não encontrado.' });

    const campoAutor = req.auth.papel === 'professor' ? 'autorProfessorId' : 'autorAlunoId';
    const comentario = await prisma.reelComentario.create({
      data: { reelId: reel.id, conteudo: conteudo.trim(), [campoAutor]: req.auth.id },
    });
    res.status(201).json({ comentario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao comentar.' });
  }
});

// ─── LOGIN COM GOOGLE ────────────────────────────────────────────────────────
// Passo 1: valida o Google idToken e diz se já existe conta (login direto) ou
// se é a primeira vez (o app precisa mostrar a tela de completar cadastro).
app.post('/api/auth/google/verificar', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ erro: 'idToken é obrigatório.' });

    let payload;
    try {
      payload = await verificarGoogleIdToken(idToken);
    } catch (err) {
      return res.status(err.status || 401).json({ erro: err.message });
    }

    const googleId = payload.sub;
    const emailNorm = payload.email.toLowerCase().trim();

    // Mesmo padrão do /api/login: tenta professor primeiro, depois aluno,
    // sem exigir que o app já saiba o papel do usuário de antemão.
    let usuario = await prisma.professor.findFirst({ where: { OR: [{ googleId }, { email: emailNorm }] } });
    let papel = 'professor';
    if (!usuario) {
      usuario = await prisma.aluno.findFirst({ where: { OR: [{ googleId }, { email: emailNorm }] } });
      papel = 'aluno';
    }

    if (!usuario) {
      return res.json({
        existe: false,
        email: emailNorm,
        nome: payload.name || '',
        fotoUrl: payload.picture || null,
      });
    }

    if (!usuario.googleId) {
      const modelo = papel === 'professor' ? prisma.professor : prisma.aluno;
      usuario = await modelo.update({ where: { id: usuario.id }, data: { googleId } });
    }
    await sincronizarConta(usuario.email, { googleId, nome: usuario.nome, fotoUrl: usuario.fotoUrl });

    if (papel === 'professor') {
      const desligado = checarProfessorAtivoNaEscola(usuario);
      if (desligado) return res.status(403).json(desligado);
      const bloqueio = await checarBloqueioAssinaturaProfessor(usuario);
      if (bloqueio) return res.status(403).json(bloqueio);
    }

    const token = jwt.sign({ id: usuario.id, papel, contaId: usuario.contaId || undefined }, SEGREDO_JWT, { expiresIn: '7d' });
    res.json({ existe: true, token, usuario: { id: usuario.id, nome: usuario.nome, papel } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Passo 2 (só na primeira vez): revalida o idToken e cria a conta com as
// perguntas obrigatórias do sistema que o Google não responde por nós.
app.post('/api/auth/google/cadastrar', async (req, res) => {
  try {
    const { idToken, papel, telefone, dataNascimento, cursos, codigoConvite, responsavel } = req.body;
    if (!idToken || !papel) return res.status(400).json({ erro: 'idToken e papel são obrigatórios.' });
    if (papel !== 'professor' && papel !== 'aluno') return res.status(400).json({ erro: 'papel inválido.' });

    let payload;
    try {
      payload = await verificarGoogleIdToken(idToken);
    } catch (err) {
      return res.status(err.status || 401).json({ erro: err.message });
    }

    const googleId = payload.sub;
    const emailNorm = payload.email.toLowerCase().trim();
    const modelo = papel === 'professor' ? prisma.professor : prisma.aluno;

    if (await modelo.findFirst({ where: { OR: [{ googleId }, { email: emailNorm }] } }))
      return res.status(400).json({ erro: 'Já existe uma conta com esse e-mail.' });

    const dataNasc = parseDataNascimento(dataNascimento);
    if (!telefone || !dataNasc) return res.status(400).json({ erro: 'telefone e dataNascimento são obrigatórios.' });

    // Conta criada via Google nunca loga por senha — o hash de um valor aleatório
    // nunca exposto garante isso sem precisar tornar a coluna "senha" opcional.
    const senhaHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), await bcrypt.genSalt(10));
    const nome = payload.name || emailNorm;
    const contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome, fotoUrl: payload.picture || null, googleId });
    let usuario;

    if (papel === 'professor') {
      if (!Array.isArray(cursos) || cursos.length === 0) {
        return res.status(400).json({ erro: 'Selecione pelo menos um curso que você leciona.' });
      }
      usuario = await prisma.professor.create({
        data: {
          nome,
          email: emailNorm,
          senha: senhaHash,
          telefone,
          dataNascimento: dataNasc,
          cursos,
          fotoUrl: payload.picture || null,
          googleId,
          // conta:{connect}, não contaId escalar (ver comentário em
          // /api/professores/cadastro).
          conta: contaId ? { connect: { id: contaId } } : undefined,
          codigoConvite: gerarCodigoConvite(),
          assinaturaStatus: 'TESTE',
          assinaturaFim: new Date(Date.now() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000),
          // Toda conta nova é dona da própria Escola de 1 pessoa (Pacote Professor
          // por padrão) — ver docs/roadmap-escola.md, Fase 0.
          escola: { create: { nome } },
        },
      });
    } else {
      if (!codigoConvite) return res.status(400).json({ erro: 'codigoConvite é obrigatório.' });
      // Mesmo padrão de /api/alunos/cadastro: código é exclusivo do
      // professor autônomo (SELF) — aluno de Escola entra por cadastro
      // direto de um DONO/GESTOR/SECRETARIA, não por código.
      const codigoNorm = codigoConvite.toUpperCase().trim();
      const professor = await prisma.professor.findFirst({
        where: { codigoConvite: codigoNorm, escola: { pacote: 'PACOTE_PROFESSOR' } },
      });
      if (!professor) return res.status(404).json({ erro: 'Código de convite inválido.' });
      const escolaIdAlvo = professor.escolaId;

      const menorDeIdade = calcularIdadeAnos(dataNasc) < 18;
      if (menorDeIdade && !responsavel?.nome?.trim()) {
        return res.status(400).json({ erro: 'Aluno menor de idade: informe o nome do responsável financeiro.' });
      }

      usuario = await prisma.$transaction(async (tx) => {
        const dadosResponsavel = menorDeIdade
          ? {
              nome: responsavel.nome.trim(),
              cpf: responsavel.cpf?.trim() || null,
              email: responsavel.email?.toLowerCase().trim() || null,
              telefone: responsavel.telefone?.trim() || null,
            }
          : { nome, cpf: null, email: emailNorm, telefone };

        const respCriado = await tx.responsavelFinanceiro.create({
          data: { ...dadosResponsavel, escolaId: escolaIdAlvo },
        });

        return tx.aluno.create({
          data: {
            nome,
            email: emailNorm,
            senha: senhaHash,
            telefone,
            dataNascimento: dataNasc,
            fotoUrl: payload.picture || null,
            googleId,
            contaId,
            professorId: professor.id,
            escolaId: escolaIdAlvo,
            status: 'PENDENTE',
            responsavelId: respCriado.id,
            vinculoResponsavel: menorDeIdade ? 'DEPENDENTE' : 'CONTRATANTE',
          },
        });
      });
    }

    const token = jwt.sign({ id: usuario.id, papel, contaId: contaId || undefined }, SEGREDO_JWT, { expiresIn: '7d' });
    res.status(201).json({
      mensagem: papel === 'professor' ? 'Professor criado! Teste grátis de 15 dias ativado.' : 'Aluno cadastrado!',
      token,
      usuario: { id: usuario.id, nome: usuario.nome, papel },
      codigoConvite: usuario.codigoConvite,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ erro: 'E-mail obrigatório.' });

    const encontrado = await prisma.professor.findFirst({ where: { email } }) ||
                       await prisma.aluno.findFirst({ where: { email } });

    if (encontrado) {
      await prisma.tokenRedefinicaoSenha.updateMany({ where: { email, usado: false }, data: { usado: true } });
      const codigo = gerarOTP();
      await prisma.tokenRedefinicaoSenha.create({
        data: {
          email,
          token: codigo,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      });
      await enviarEmailRedefinicao(email, codigo);
    }
    res.json({ mensagem: 'Se o e-mail estiver cadastrado, o código foi enviado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, codigo, novaSenha } = req.body;
    if (!email || !codigo || !novaSenha) return res.status(400).json({ erro: 'email, codigo e novaSenha são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    const tokenRecord = await prisma.tokenRedefinicaoSenha.findFirst({
      where: { email: emailNorm, token: codigo, usado: false },
    });
    if (!tokenRecord || new Date() > tokenRecord.expiresAt)
      return res.status(400).json({ erro: 'Código inválido/expirado.' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(novaSenha, salt);
    // updateMany, não update: email deixou de ser único sozinho (Rede Social
    // Fase 1, Step 2) — se a Conta tiver mais de um vínculo Professor/Aluno
    // com esse e-mail, todos recebem o mesmo hash novo (dual-write igual ao
    // resto do arquivo; Conta.senha via sincronizarConta abaixo é quem
    // decide de verdade o login por Conta).
    if (await prisma.professor.findFirst({ where: { email: emailNorm } })) {
      await prisma.professor.updateMany({ where: { email: emailNorm }, data: { senha: hash } });
    } else {
      await prisma.aluno.updateMany({ where: { email: emailNorm }, data: { senha: hash } });
    }
    await sincronizarConta(emailNorm, { senha: hash });
    await prisma.tokenRedefinicaoSenha.update({ where: { id: tokenRecord.id }, data: { usado: true } });
    res.json({ mensagem: 'Senha redefinida!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/push-token', autenticar, async (req, res) => {
  try {
    const { expoPushToken } = req.body;
    if (!expoPushToken) return res.status(400).json({ erro: 'expoPushToken é obrigatório.' });

    if (req.auth.papel === 'professor') {
      await prisma.professor.update({ where: { id: req.auth.id }, data: { expoPushToken } });
    } else {
      await prisma.aluno.update({ where: { id: req.auth.id }, data: { expoPushToken } });
    }
    res.json({ mensagem: 'Token salvo.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar token.' });
  }
});

// ============================================================================
// ROTAS DO PROFESSOR
// ============================================================================

app.get('/api/dashboard', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;

    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: { codigoConvite: true, nome: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
    const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);

    const aulasHoje = await prisma.aula.findMany({
      where: {
        professorId,
        dataHora: { gte: inicioHoje, lte: fimHoje },
        aluno: { status: 'ATIVO' },
      },
      include: { aluno: { select: { nome: true, id: true, status: true, horarioAula: true } } },
      orderBy: { dataHora: 'asc' },
    });

    let codigoConvite = professor.codigoConvite;
    if (!codigoConvite) {
      codigoConvite = gerarCodigoConvite();
      await prisma.professor.update({ where: { id: professorId }, data: { codigoConvite } });
    }

    res.json({
      nome: professor.nome,
      codigoConvite,
      aulasHoje,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/alunos-pendentes', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const alunos = await prisma.aluno.findMany({
      where: { professorId, status: 'PENDENTE' },
      select: { id: true, nome: true, email: true, telefone: true, fotoUrl: true, createdAt: true },
    });
    res.json(alunos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/configurar-aluno', exigirProfessor, async (req, res) => {
  try {
    const {
      alunoId, valorMensalidade, diaCobranca, diaVencimento,
      diaSemana, diaSemanaAula, horarioAula, recorrencia, recorrenciaAula,
      tempoContrato,
    } = req.body;

    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
    if (valorMensalidade == null || isNaN(parseFloat(String(valorMensalidade)))) {
      return res.status(400).json({ erro: 'valorMensalidade inválido ou ausente.' });
    }

    // O aluno precisa ser mesmo deste professor — sem isso, qualquer
    // professor autenticado poderia reconfigurar (aulas + cobranças) o aluno
    // de outro professor só sabendo o id dele.
    const alunoAlvo = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { professorId: true } });
    if (!alunoAlvo || alunoAlvo.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aluno não encontrado.' });
    }

    // FIX: parse explícito para garantir que strings numéricas ("1") virem Int
    const diaSemanaRaw = diaSemana ?? diaSemanaAula;
    const diaSemanaNum = diaSemanaRaw != null ? parseInt(String(diaSemanaRaw), 10) : null;

    const diaVenc = parseInt(String(diaCobranca ?? diaVencimento ?? '10'), 10);
    const recorr = recorrencia ?? recorrenciaAula ?? 'SEMANAL';
    const meses = parseInt(String(tempoContrato ?? '6'), 10);
    const hora = horarioAula ?? '08:00';

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(hora)) {
      return res.status(400).json({ erro: 'horarioAula inválido. Use o formato HH:MM.' });
    }

    const diaNome = (diaSemanaNum != null && !isNaN(diaSemanaNum)) ? NOMES_DIAS[diaSemanaNum] : (diaSemanaRaw ?? null);

    const dataInicio = new Date();

    // Tudo ou nada: se qualquer passo falhar no meio, o aluno não fica com
    // aulas geradas sem cobrança (ou vice-versa) — nenhuma escrita fica de pé.
    const { aluno, novasAulas, pagamentos } = await prisma.$transaction(async (tx) => {
      await tx.aula.deleteMany({ where: { alunoId, status: 'AGENDADA', dataHora: { gte: dataInicio } } });

      const aluno = await tx.aluno.update({
        where: { id: alunoId },
        data: {
          valorMensalidade: parseFloat(String(valorMensalidade)),
          diaVencimento: isNaN(diaVenc) ? 10 : diaVenc,
          diaSemanaAula: diaNome,
          diaSemanaNumero: (diaSemanaNum != null && !isNaN(diaSemanaNum)) ? diaSemanaNum : null,
          horarioAula: hora,
          recorrenciaAula: recorr,
          tempoContrato: isNaN(meses) ? 6 : meses,
          dataInicioContrato: dataInicio,
          status: 'ATIVO',
        },
      });

      const novasAulas = gerarAulasRecorrentes({
        ...aluno,
        diaSemanaNumero: (diaSemanaNum != null && !isNaN(diaSemanaNum)) ? diaSemanaNum : aluno.diaSemanaNumero,
      });

      if (novasAulas.length > 0) {
        await tx.aula.createMany({ data: novasAulas });
      }

      // Remove TODOS os pendentes para evitar duplicação ao reconfigurar
      await tx.pagamento.deleteMany({ where: { alunoId, status: 'PENDENTE' } });

      const pagamentos = [];
      const valorFinal  = parseFloat(String(valorMensalidade));
      const mesesFinal  = isNaN(meses) ? 6 : meses;
      const diaVencFinal = isNaN(diaVenc) ? 10 : diaVenc;
      // Se o dia de vencimento deste mês já passou, começa a cobrar no próximo mês
      const primeiraDta = new Date(dataInicio);
      primeiraDta.setDate(diaVencFinal);
      const mesOffset = primeiraDta <= dataInicio ? 1 : 0;
      for (let i = 0; i < mesesFinal; i++) {
        const venc = new Date(dataInicio);
        venc.setMonth(venc.getMonth() + i + mesOffset);
        venc.setDate(diaVencFinal);
        pagamentos.push({
          valor: valorFinal,
          vencimento: venc,
          status: 'PENDENTE',
          alunoId,
          professorId: aluno.professorId,
        });
      }
      if (pagamentos.length > 0) await tx.pagamento.createMany({ data: pagamentos });

      return { aluno, novasAulas, pagamentos };
    }, { maxWait: 10000, timeout: 15000 });

    // Responde ao cliente ANTES das notificações para não bloquear em caso de falha
    res.json({
      mensagem: 'Aluno configurado!',
      aulasGeradas: novasAulas.length,
      cobrancasGeradas: pagamentos.length,
    });

    // Notificações são best-effort — erros aqui não afetam o aluno
    try {
      if (aluno.expoPushToken) {
        await enviarPushNotificacao(
          aluno.expoPushToken,
          'Contrato Ativado!',
          'Seu contrato foi configurado pelo professor. Acesse o app para ver suas aulas.',
          { tipo: 'CONTRATO_ATIVADO' }
        );
      }
      await prisma.notificacao.create({
        data: {
          tipo: 'ALUNO_ATIVADO',
          titulo: 'Aluno Ativado',
          mensagem: `${aluno.nome} foi configurado com ${novasAulas.length} aula(s) e ${pagamentos.length} cobrança(s).`,
          professorId: aluno.professorId,
          dadosExtra: JSON.stringify({ alunoId: aluno.id, alunoNome: aluno.nome, aulasGeradas: novasAulas.length }),
          lida: false,
        },
      });
    } catch (notifErr) {
      console.error('[configurar-aluno] Falha ao enviar notificação:', notifErr.message);
    }
  } catch (err) {
    tratarErro(err, res, 'Erro ao configurar aluno.');
  }
});

app.delete('/api/alunos/:id/cancelar', exigirProfessor, async (req, res) => {
  try {
    const id = req.params.id;
    const alunoAlvo = await prisma.aluno.findUnique({ where: { id }, select: { professorId: true } });
    if (!alunoAlvo || alunoAlvo.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aluno não encontrado.' });
    }
    // Tudo ou nada: se cair no meio, nenhum registro relacionado fica
    // apagado com o aluno ainda de pé (ou vice-versa).
    await prisma.$transaction([
      prisma.aula.deleteMany({ where: { alunoId: id } }),
      prisma.pagamento.deleteMany({ where: { alunoId: id } }),
      prisma.reposicao.deleteMany({ where: { alunoId: id } }),
      prisma.mensagem.deleteMany({ where: { alunoId: id } }),
      // MensagemDireta não tem FK pro Aluno (participante é tipo+id solto,
      // ver ConversaDireta) — sem isso, apagar o aluno deixaria as conversas
      // dele órfãs (inofensivo pro app, que já ignora conversa sem o outro
      // participante, mas suja o banco à toa).
      prisma.conversaDireta.deleteMany({
        where: { OR: [
          { participanteATipo: 'ALUNO', participanteAId: id },
          { participanteBTipo: 'ALUNO', participanteBId: id },
        ] },
      }),
      prisma.aluno.delete({ where: { id } }),
    ], { maxWait: 10000, timeout: 15000 });
    res.json({ mensagem: 'Aluno excluído permanentemente.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao excluir aluno.');
  }
});

app.patch('/api/alunos/:id/status', exigirProfessor, async (req, res) => {
  try {
    const { id } = req.params;
    const aluno = await prisma.aluno.findUnique({
      where: { id },
      select: {
        status: true, diaSemanaNumero: true, horarioAula: true,
        recorrenciaAula: true, tempoContrato: true, dataInicioContrato: true,
        valorMensalidade: true, diaVencimento: true, professorId: true,
      },
    });
    if (!aluno || aluno.professorId !== req.auth.id) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    const novoStatus = aluno.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const agora = new Date();

    // Tudo ou nada: evita deixar o aluno com o status trocado mas as
    // aulas/pagamentos relacionados só parcialmente atualizados.
    await prisma.$transaction(async (tx) => {
      await tx.aluno.update({ where: { id }, data: { status: novoStatus } });

      if (novoStatus === 'INATIVO') {
        await tx.aula.updateMany({
          where: { alunoId: id, status: 'AGENDADA', dataHora: { gte: agora } },
          data: { status: 'CANCELADA' },
        });
        await tx.pagamento.updateMany({
          where: { alunoId: id, status: 'PENDENTE', vencimento: { gte: agora } },
          data: { status: 'CANCELADO' },
        });
      } else {
        // Reativando: regenera aulas e pagamentos se o aluno já foi configurado antes
        if (aluno.tempoContrato && aluno.dataInicioContrato && aluno.diaSemanaNumero != null && aluno.horarioAula) {
          await tx.aula.deleteMany({ where: { alunoId: id, status: 'CANCELADA', dataHora: { gte: agora } } });

          const novasAulas = gerarAulasRecorrentes({ ...aluno, id });
          if (novasAulas.length > 0) {
            await tx.aula.createMany({ data: novasAulas });
          }

          await tx.pagamento.deleteMany({ where: { alunoId: id, status: 'CANCELADO', vencimento: { gte: agora } } });

          const fimContrato = new Date(aluno.dataInicioContrato);
          fimContrato.setMonth(fimContrato.getMonth() + aluno.tempoContrato);
          const mesesRestantes = Math.max(0, Math.ceil((fimContrato - agora) / (30 * 24 * 60 * 60 * 1000)));
          const diaVenc = aluno.diaVencimento ?? 10;
          const valor = aluno.valorMensalidade ?? 0;
          const novosPagementos = [];
          for (let i = 0; i < mesesRestantes; i++) {
            const venc = new Date(agora);
            venc.setMonth(venc.getMonth() + i);
            venc.setDate(diaVenc);
            novosPagementos.push({ valor, vencimento: venc, status: 'PENDENTE', alunoId: id, professorId: aluno.professorId });
          }
          if (novosPagementos.length > 0) await tx.pagamento.createMany({ data: novosPagementos });
        }
      }
    }, { maxWait: 10000, timeout: 15000 });

    res.json({ status: novoStatus });
  } catch (err) {
    tratarErro(err, res, 'Erro ao alterar status.');
  }
});

app.patch('/api/alunos/:id/mensalidade', exigirProfessor, async (req, res) => {
  try {
    const { id } = req.params;
    const alunoAlvo = await prisma.aluno.findUnique({ where: { id }, select: { professorId: true } });
    if (!alunoAlvo || alunoAlvo.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aluno não encontrado.' });
    }
    const { valorMensalidade } = req.body;
    const valor = parseFloat(String(valorMensalidade).replace(',', '.'));
    if (isNaN(valor) || valor <= 0) return res.status(400).json({ erro: 'Valor de mensalidade inválido.' });
    const atualizado = await prisma.aluno.update({
      where: { id },
      data: { valorMensalidade: valor },
      select: { valorMensalidade: true },
    });
    res.json({ valorMensalidade: atualizado.valorMensalidade });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar mensalidade.');
  }
});

// PUT /api/alunos/:id/responsavel — cria ou atualiza o responsável
// financeiro de um aluno que já existe (cadastrado antes de S1.1, ou que
// nasceu sem responsável por falta de dataNascimento no cadastro). Sempre
// cria um ResponsavelFinanceiro novo em vez de tentar reaproveitar um
// existente por CPF — juntar responsáveis duplicados fica pra uma sprint
// futura, com uma tela dedicada de busca, pra não arriscar linkar a pessoa
// errada silenciosamente.
app.put('/api/alunos/:id/responsavel', exigirProfessor, async (req, res) => {
  try {
    const { id } = req.params;
    const alunoAlvo = await prisma.aluno.findUnique({ where: { id }, select: { professorId: true, escolaId: true } });
    if (!alunoAlvo || alunoAlvo.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aluno não encontrado.' });
    }

    const { nome, cpf, email, telefone, vinculo } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    const vinculoFinal = vinculo === 'DEPENDENTE' ? 'DEPENDENTE' : 'CONTRATANTE';

    const atualizado = await prisma.$transaction(async (tx) => {
      const responsavel = await tx.responsavelFinanceiro.create({
        data: {
          nome: nome.trim(),
          cpf: cpf?.trim() || null,
          email: email?.toLowerCase().trim() || null,
          telefone: telefone?.trim() || null,
          escolaId: alunoAlvo.escolaId,
        },
      });
      return tx.aluno.update({
        where: { id },
        data: { responsavelId: responsavel.id, vinculoResponsavel: vinculoFinal },
        select: { id: true, nome: true, responsavel: true, vinculoResponsavel: true },
      });
    });

    res.json({ mensagem: 'Responsável financeiro salvo!', aluno: atualizado });
  } catch (err) {
    tratarErro(err, res, 'Erro ao salvar responsável financeiro.');
  }
});

// PUT /api/alunos/:id/anotacoes — nota privada do professor sobre o aluno.
// Nunca aparece em nenhuma rota que o próprio Aluno consulta (perfil, dashboard) —
// é só pro professor lembrar de algo, tipo "prova em breve" ou "prefere tarde".
app.put('/api/alunos/:id/anotacoes', exigirProfessor, async (req, res) => {
  try {
    const { anotacoes } = req.body;
    const { count } = await prisma.aluno.updateMany({
      where: { id: req.params.id, professorId: req.auth.id },
      data: { anotacoesPrivadas: typeof anotacoes === 'string' ? anotacoes.slice(0, 2000) : null },
    });
    if (!count) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    res.json({ mensagem: 'Anotação salva.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao salvar anotação.');
  }
});

app.get('/api/meus-alunos', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const alunos = await prisma.aluno.findMany({
      where: { professorId, status: 'ATIVO' },
      include: {
        responsavel: true,
        aulas: {
          orderBy: { dataHora: 'desc' },
          include: { materiais: true },
        },
      },
    });
    res.json(alunos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/alunos-inativos', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const alunos = await prisma.aluno.findMany({
      where: { professorId, status: 'INATIVO' },
      select: { id: true, nome: true, email: true, status: true, fotoUrl: true },
    });
    res.json(alunos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aulas', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const aulas = await prisma.aula.findMany({
      where: { professorId, aluno: { status: 'ATIVO' } },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
    });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/pagamentos', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const pagamentos = await prisma.pagamento.findMany({
      where: { professorId, aluno: { status: 'ATIVO' } },
      include: { aluno: { select: { nome: true } } },
      orderBy: { vencimento: 'asc' },
    });
    res.json(pagamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/pagamentos/:id/aprovar', exigirProfessor, async (req, res) => {
  try {
    const existente = await prisma.pagamento.findUnique({ where: { id: req.params.id }, select: { professorId: true } });
    if (!existente || existente.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    }
    const p = await prisma.pagamento.update({
      where: { id: req.params.id },
      data: { status: 'PAGO', dataPagamento: new Date() },
    });
    res.json(p);
  } catch (err) {
    tratarErro(err, res, 'Erro ao aprovar.');
  }
});

app.post('/api/pagamentos/:id/notificar-vencimento', exigirProfessor, async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: req.params.id },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });
    if (!pagamento || pagamento.professorId !== req.auth.id) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    if (!pagamento.aluno?.expoPushToken) {
      return res.status(400).json({ erro: 'Aluno não possui token de notificação cadastrado.' });
    }
    await enviarPushNotificacao(
      pagamento.aluno.expoPushToken,
      'KAV Class — Mensalidade a Vencer',
      'Olá, nós da KAV class estamos passando rapidinho pra te avisar que sua mensalidade está para vencer, até mais!'
    );
    res.json({ mensagem: 'Notificação enviada com sucesso.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar notificação.' });
  }
});

app.get('/api/calendario', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;

    // FIX: parseInt explícito — req.query retorna strings, new Date() precisa de Number
    const ano = parseInt(req.query.ano, 10);
    const mes = parseInt(req.query.mes, 10);

    if (isNaN(ano) || isNaN(mes)) return res.status(400).json({ erro: 'ano e mes devem ser números.' });

    const aulas = await prisma.aula.findMany({
      where: {
        professorId,
        aluno: { status: 'ATIVO' },
        dataHora: {
          gte: new Date(ano, mes - 1, 1),
          lte: new Date(ano, mes, 0, 23, 59, 59),
        },
      },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
    });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/professor/perfil', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: {
        id: true, nome: true, email: true, telefone: true,
        cursos: true, codigoConvite: true, chavePix: true,
        linkPagamentoCartao: true, fotoUrl: true, createdAt: true,
        papel: true, permissoesSecretaria: true, escola: { select: { pacote: true, nome: true, stripeConnectOnboardingCompleto: true } },
        precoAssinaturaPremium: true,
        bio: true, cidade: true, estado: true, videoApresentacaoUrl: true, visivelBuscaSelf: true,
        modalidadeEnsino: true, whatsapp: true, emailContato: true,
      },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    res.json(professor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/professor/perfil', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const {
      nome, telefone, chavePix, linkPagamentoCartao, fotoUrl, senhaAtual, novaSenha,
      bio, cidade, estado, videoApresentacaoUrl, visivelBuscaSelf, modalidadeEnsino,
      whatsapp, emailContato,
    } = req.body;

    const professor = await prisma.professor.findUnique({ where: { id: professorId } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (telefone?.trim()) dados.telefone = telefone.trim();
    if (chavePix !== undefined) dados.chavePix = chavePix.trim() || null;
    if (linkPagamentoCartao !== undefined) dados.linkPagamentoCartao = linkPagamentoCartao.trim() || null;
    if (fotoUrl !== undefined) dados.fotoUrl = fotoUrl || null;
    // Perfil vitrine (Rede Social Fase 3) — visível em /api/professores/:id/perfil-publico
    // quando visivelBuscaSelf=true.
    if (bio !== undefined) dados.bio = bio?.trim() || null;
    if (cidade !== undefined) dados.cidade = cidade?.trim() || null;
    if (estado !== undefined) dados.estado = estado?.trim().toUpperCase() || null;
    if (videoApresentacaoUrl !== undefined) dados.videoApresentacaoUrl = videoApresentacaoUrl?.trim() || null;
    if (whatsapp !== undefined) dados.whatsapp = whatsapp?.replace(/\D/g, '') || null;
    if (emailContato !== undefined) dados.emailContato = emailContato?.trim().toLowerCase() || null;
    if (modalidadeEnsino !== undefined) {
      const valores = Array.isArray(modalidadeEnsino) ? modalidadeEnsino : [];
      if (!valores.length || !valores.every((m) => ['PRESENCIAL', 'REMOTO', 'ONLINE'].includes(m))) {
        return res.status(400).json({ erro: 'modalidadeEnsino inválido — use PRESENCIAL, REMOTO e/ou ONLINE.' });
      }
      dados.modalidadeEnsino = valores;
    }
    // Discoverável na busca de aula particular é auto-serviço pro professor
    // (diferente do gate por assinaturaStatus, que a própria query de busca
    // já aplica) — ligar antes de ter assinatura ativa não faz mal, só não
    // aparece até o status virar ATIVO/VITALICIO/TESTE.
    if (visivelBuscaSelf !== undefined) dados.visivelBuscaSelf = !!visivelBuscaSelf;

    if (senhaAtual && novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ erro: 'Nova senha: mín. 6 caracteres.' });
      if (!await bcrypt.compare(senhaAtual, professor.senha)) return res.status(401).json({ erro: 'Senha atual incorreta.' });
      const salt = await bcrypt.genSalt(10);
      dados.senha = await bcrypt.hash(novaSenha, salt);
    }

    if (!Object.keys(dados).length) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    const atualizado = await prisma.professor.update({
      where: { id: professorId },
      data: dados,
      select: {
        id: true, nome: true, email: true, telefone: true,
        cursos: true, codigoConvite: true, chavePix: true, linkPagamentoCartao: true, fotoUrl: true,
        bio: true, cidade: true, estado: true, videoApresentacaoUrl: true, visivelBuscaSelf: true,
        modalidadeEnsino: true, whatsapp: true, emailContato: true,
      },
    });
    if (dados.senha) await sincronizarConta(atualizado.email, { senha: dados.senha });
    res.json({ mensagem: 'Perfil atualizado!', professor: atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/professor/notificacoes', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const notificacoes = await prisma.notificacao.findMany({
      where: { professorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const naoLidas = notificacoes.filter(n => !n.lida).length;
    res.json({ notificacoes, naoLidas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/professor/notificacoes/:id/lida', exigirProfessor, async (req, res) => {
  try {
    const { count } = await prisma.notificacao.updateMany({
      where: { id: req.params.id, professorId: req.auth.id },
      data: { lida: true },
    });
    if (!count) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    res.json({ mensagem: 'Marcada como lida.' });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

app.put('/api/professor/notificacoes/todas-lidas', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    await prisma.notificacao.updateMany({ where: { professorId, lida: false }, data: { lida: true } });
    res.json({ mensagem: 'Todas as notificações marcadas como lidas.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.delete('/api/professor/notificacoes/:id', exigirProfessor, async (req, res) => {
  try {
    const { count } = await prisma.notificacao.deleteMany({
      where: { id: req.params.id, professorId: req.auth.id },
    });
    if (!count) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    res.json({ mensagem: 'Notificação excluída.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao excluir notificação.');
  }
});

app.delete('/api/professor/notificacoes', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    await prisma.notificacao.deleteMany({ where: { professorId } });
    res.json({ mensagem: 'Histórico de notificações apagado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao apagar histórico.' });
  }
});

// ============================================================================
// 5. ROTAS DO ALUNO
// ============================================================================

app.get('/api/aluno/dashboard', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;

    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      select: { status: true, tempoContrato: true, dataInicioContrato: true, professorId: true },
    });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    if (aluno.status === 'PENDENTE') return res.json({ pendente: true });
    if (aluno.status === 'INATIVO') return res.json({ inativo: true });

    const agora = new Date();

    // avaliacaoMensalPendente (auditoria INSTITUTION, 11/09/2026): mesma
    // checagem de duplicata que POST /api/aluno/avaliacao-mensal já faz
    // (server.js ~3856), só que exposta aqui como leitura — antes disso não
    // existia nenhuma rota que dissesse ao app "tem avaliação pendente".
    // Sem professor atribuído não tem quem avaliar, então nunca fica pendente.
    let avaliacaoMensalPendente = false;
    if (aluno.professorId) {
      const mesReferencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
      const jaAvaliou = await prisma.avaliacao.findFirst({ where: { alunoId, mesReferencia } });
      avaliacaoMensalPendente = !jaAvaliou;
    }

    const [proximaAula, aulasHistorico, pagamentos] = await Promise.all([
      prisma.aula.findFirst({
        where: { alunoId, dataHora: { gte: agora }, status: { not: 'CANCELADA' } },
        include: { professor: { select: { nome: true } } },
        orderBy: { dataHora: 'asc' },
      }),
      prisma.aula.findMany({
        where: { alunoId, dataHora: { lt: agora } },
        select: { presenca: true },
      }),
      prisma.pagamento.findMany({
        where: { alunoId },
        orderBy: { vencimento: 'asc' },
        select: { status: true, vencimento: true },
      }),
    ]);

    const presencas = aulasHistorico.filter(a => a.presenca === 'PRESENTE').length;
    const faltas = aulasHistorico.filter(a => a.presenca === 'AUSENCIA_ALUNO').length;
    const total = aulasHistorico.filter(a => a.presenca !== null).length;

    const atrasado = pagamentos.find(p => p.status.toUpperCase() === 'ATRASADO');
    const pendentePag = pagamentos.find(p => p.status.toUpperCase() === 'PENDENTE');
    const emAnalise = pagamentos.find(p => p.status.toUpperCase() === 'EM_ANALISE');

    let statusPagamento = pagamentos.length > 0 ? 'PAGO' : null;
    let vencimentoPagamento = null;

    if (atrasado) {
      statusPagamento = 'ATRASADO';
      vencimentoPagamento = atrasado.vencimento;
    } else if (pendentePag) {
      statusPagamento = new Date(pendentePag.vencimento) < agora ? 'ATRASADO' : 'PENDENTE';
      vencimentoPagamento = pendentePag.vencimento;
    } else if (emAnalise) {
      statusPagamento = 'EM_ANALISE';
      vencimentoPagamento = emAnalise.vencimento;
    }

    res.json({
      pendente: false,
      inativo: false,
      proximaAula: proximaAula || null,
      frequencia: { presencas, faltas, total },
      pagamento: statusPagamento ? { status: statusPagamento, vencimento: vencimentoPagamento } : null,
      plano: {
        tempoContrato: aluno.tempoContrato || null,
        dataInicio: aluno.dataInicioContrato || null,
      },
      avaliacaoMensalPendente,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/aluno/contrato — o próprio aluno vê/baixa o contrato que a
// escola anexou no cadastro dele (INSTITUTION Sprint 23, briefing
// 23/09/2026). Mesmo campo (Aluno.contratoUrl) que a escola já edita no
// modal dela — só uma leitura escopada, sem rota nova de escrita (quem
// sobe o contrato continua sendo a escola). Funciona pra aluno de
// qualquer pacote (SELF ou Escola), o campo não distingue os dois.
app.get('/api/aluno/contrato', exigirAluno, async (req, res) => {
  try {
    const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { contratoUrl: true } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    res.json({ contratoUrl: aluno.contratoUrl || null });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar contrato.');
  }
});

app.get('/api/aluno/perfil', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      select: {
        id: true, nome: true, email: true, telefone: true, curso: true,
        status: true, valorMensalidade: true, diaVencimento: true,
        recorrenciaAula: true, diaSemanaAula: true, horarioAula: true,
        tempoContrato: true, dataInicioContrato: true, createdAt: true, fotoUrl: true,
        vinculoResponsavel: true,
        responsavel: { select: { nome: true, cpf: true, email: true, telefone: true } },
        professor: { select: { id: true, nome: true, telefone: true, fotoUrl: true, chavePix: true } },
        escola: { select: { id: true, nome: true, pacote: true } },
      },
    });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    res.json(aluno);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/aluno/perfil', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const { nome, telefone, fotoUrl, senhaAtual, novaSenha } = req.body;

    const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (telefone?.trim()) dados.telefone = telefone.trim();
    if (fotoUrl !== undefined) dados.fotoUrl = fotoUrl || null;

    if (senhaAtual && novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ erro: 'Nova senha: mín. 6 caracteres.' });
      if (!await bcrypt.compare(senhaAtual, aluno.senha)) return res.status(401).json({ erro: 'Senha atual incorreta.' });
      const salt = await bcrypt.genSalt(10);
      dados.senha = await bcrypt.hash(novaSenha, salt);
    }

    if (!Object.keys(dados).length) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    const atualizado = await prisma.aluno.update({
      where: { id: alunoId },
      data: dados,
      select: { id: true, nome: true, email: true, telefone: true, fotoUrl: true },
    });
    if (dados.senha) await sincronizarConta(atualizado.email, { senha: dados.senha });
    res.json({ mensagem: 'Perfil atualizado!', aluno: atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});
app.get('/api/aluno/professor-config', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      include: { professor: { select: { chavePix: true, linkPagamentoCartao: true, nome: true } } },
    });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    if (!aluno.professor) return res.status(404).json({ erro: 'Professor vinculado não encontrado.' });
    res.json(aluno.professor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/pagamentos', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const pagamentos = await prisma.pagamento.findMany({ where: { alunoId }, orderBy: { vencimento: 'asc' } });
    res.json(pagamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/aluno/pagamentos/:id/comprovante', exigirAluno, async (req, res) => {
  try {
    const { comprovanteUrl } = req.body;
    if (!comprovanteUrl) return res.status(400).json({ erro: 'comprovanteUrl obrigatório.' });
    const existente = await prisma.pagamento.findUnique({ where: { id: req.params.id }, select: { alunoId: true } });
    if (!existente || existente.alunoId !== req.auth.id) {
      return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    }
    const p = await prisma.pagamento.update({
      where: { id: req.params.id },
      data: { comprovanteUrl, status: 'EM_ANALISE' },
    });
    res.json({ mensagem: 'Comprovante enviado!', pagamento: p });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

app.get('/api/aluno/materiais', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const [aulas, materiaisAvulsos] = await Promise.all([
      prisma.aula.findMany({
        where: { alunoId },
        include: { materiais: true },
        orderBy: { dataHora: 'desc' },
      }),
      prisma.material.findMany({
        where: { alunoId, aulaId: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.json({
      aulas: aulas.filter(a => a.materiais.length > 0),
      materiaisAvulsos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/reposicoes', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const r = await prisma.reposicao.findMany({
      where: { alunoId },
      include: { professor: { select: { nome: true, cursos: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/aluno/reposicoes — aluno pede uma reposição por conta própria
// (fluxo que faltava: até aqui só o professor conseguia propor uma data e
// o aluno confirmar/pedir outra). Nasce em SOLICITADA, origem ALUNO — segue
// o fluxo de duas camadas de aprovação (S2.1): professor precisa
// autorizar antes de a Escola poder finalizar.
app.post('/api/aluno/reposicoes', exigirAluno, async (req, res) => {
  try {
    const { dataOriginal, dataProposta, motivo } = req.body;
    if (!dataProposta?.trim() || !motivo?.trim()) {
      return res.status(400).json({ erro: 'dataProposta e motivo são obrigatórios.' });
    }
    const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { professorId: true } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    const reposicao = await prisma.reposicao.create({
      data: {
        professorId: aluno.professorId,
        alunoId: req.auth.id,
        dataOriginal: dataOriginal?.trim() || null,
        dataProposta: dataProposta.trim(),
        motivo: motivo.trim(),
        status: 'SOLICITADA',
        origem: 'ALUNO',
      },
    });

    const professor = await prisma.professor.findUnique({ where: { id: aluno.professorId }, select: { expoPushToken: true } });
    if (professor?.expoPushToken) {
      await enviarPushNotificacao(professor.expoPushToken, 'Pedido de reposição', `Um aluno pediu reposição para ${dataProposta.trim()}.`, { tipo: 'NOVA_REPOSICAO', reposicaoId: reposicao.id });
    }

    res.status(201).json({ mensagem: 'Pedido enviado ao professor.', reposicao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao solicitar reposição.' });
  }
});

app.post('/api/reposicoes/:id/confirmar', exigirAluno, async (req, res) => {
  try {
    const { count } = await prisma.reposicao.updateMany({
      where: { id: req.params.id, alunoId: req.auth.id },
      data: { status: 'CONFIRMADA' },
    });
    if (!count) return res.status(404).json({ erro: 'Reposição não encontrada.' });
    const r = await prisma.reposicao.findUnique({ where: { id: req.params.id } });
    res.json({ mensagem: 'Reposição confirmada!', reposicao: r });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

app.post('/api/reposicoes/:id/solicitar-outro', exigirAluno, async (req, res) => {
  try {
    const { count } = await prisma.reposicao.updateMany({
      where: { id: req.params.id, alunoId: req.auth.id },
      data: { status: 'SOLICITANDO_OUTRO' },
    });
    if (!count) return res.status(404).json({ erro: 'Reposição não encontrada.' });
    const r = await prisma.reposicao.findUnique({ where: { id: req.params.id } });
    res.json({ mensagem: 'Solicitação enviada ao professor.', reposicao: r });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

// ============================================================================
// 7. MURAL DA TURMA (CHAT EM GRUPO)
// ============================================================================

// GET /api/mural — quadro de avisos do professor pra turma inteira (só
// broadcast, remetente 'professor'). Professor vê o próprio mural; aluno vê
// o mural do professor dele. Quem manda é req.auth (token), nunca query solta.
//
// FIX: antes esta rota também devolvia as mensagens PRIVADAS de todo aluno
// do professor (POST /api/aluno/mensagens), o que vazava a conversa de um
// aluno pros outros alunos verem no próprio mural. Mural agora é só
// broadcast; a conversa privada tem rota própria
// (GET/POST /api/aluno/mensagens do lado aluno, /api/professor/mensagens do
// lado professor) que já filtrava certo por alunoId.
app.get('/api/mural', autenticar, async (req, res) => {
  try {
    let professorId;
    if (req.auth.papel === 'aluno') {
      const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { professorId: true } });
      if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
      professorId = aluno.professorId;
    } else {
      professorId = req.auth.id;
    }

    const msgsProf = await prisma.mensagem.findMany({
      where: { professorId, remetente: 'professor' },
      orderBy: { createdAt: 'asc' },
    });

    res.json(msgsProf.map(m => ({ id: m.id, texto: m.texto, remetente: 'professor', nome: 'Professor(a)', createdAt: m.createdAt })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/mural — professor envia mensagem para toda a turma
app.post('/api/mural', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: 'texto obrigatório.' });

    const professor = await prisma.professor.findUnique({ where: { id: professorId }, select: { id: true, nome: true } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const msg = await prisma.mensagem.create({
      data: { professorId, texto, remetente: 'professor' },
    });

    // Notifica todos os alunos ativos em paralelo — sequencial travava a
    // resposta até a última chamada de push terminar.
    const alunos = await prisma.aluno.findMany({
      where: { professorId, status: 'ATIVO' },
      select: { expoPushToken: true },
    });
    await Promise.all(
      alunos
        .filter(a => a.expoPushToken)
        .map(a => enviarPushNotificacao(a.expoPushToken, `${professor.nome}`, texto, { tipo: 'NOVA_MENSAGEM' }))
    );

    res.status(201).json({ ...msg, nome: 'Professor(a)' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 8. MENSAGENS DIRETAS (DM aberto, Rede Social 18/09/2026)
// Qualquer Professor ou Aluno manda mensagem pra qualquer outro, sem
// precisar de vínculo/matrícula — estilo Instagram Direct, sem etapa de
// "solicitação de mensagem" (pedido explícito do usuário: direto na caixa).
// Substitui as rotas antigas de mensagem privada aluno↔professor (o mural
// de turma continua igual, acima).
// ============================================================================

// participanteA é sempre o menor entre os dois pela chave "TIPO:id" —
// assim @@unique acha a conversa não importa quem mandou a mensagem
// primeiro.
function ordenarParticipantesDM(tipoA, idA, tipoB, idB) {
  const chaveA = `${tipoA}:${idA}`;
  const chaveB = `${tipoB}:${idB}`;
  return chaveA <= chaveB
    ? { participanteATipo: tipoA, participanteAId: idA, participanteBTipo: tipoB, participanteBId: idB }
    : { participanteATipo: tipoB, participanteAId: idB, participanteBTipo: tipoA, participanteBId: idA };
}

async function resolverIdentidadeDM(tipo, id) {
  const modelo = tipo === 'professor' ? prisma.professor : prisma.aluno;
  return modelo.findUnique({ where: { id }, select: { id: true, nome: true, fotoUrl: true, expoPushToken: true } });
}

// GET /api/mensagens/conversas — caixa de entrada de quem está logado.
app.get('/api/mensagens/conversas', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const meuTipo = req.auth.papel.toUpperCase();
    const meuId = req.auth.id;

    const conversas = await prisma.conversaDireta.findMany({
      where: {
        OR: [
          { participanteATipo: meuTipo, participanteAId: meuId },
          { participanteBTipo: meuTipo, participanteBId: meuId },
        ],
      },
      orderBy: { ultimaMensagemEm: 'desc' },
      include: { mensagens: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const resultado = await Promise.all(conversas.map(async (c) => {
      const souA = c.participanteATipo === meuTipo && c.participanteAId === meuId;
      const outroTipo = souA ? c.participanteBTipo : c.participanteATipo;
      const outroId = souA ? c.participanteBId : c.participanteAId;
      const outro = await resolverIdentidadeDM(outroTipo.toLowerCase(), outroId);
      if (!outro) return null;
      const naoLidas = await prisma.mensagemDireta.count({
        where: { conversaId: c.id, lida: false, NOT: { autorTipo: meuTipo, autorId: meuId } },
      });
      return {
        id: c.id,
        outro: { tipo: outroTipo.toLowerCase(), id: outro.id, nome: outro.nome, fotoUrl: outro.fotoUrl },
        ultimaMensagem: c.mensagens[0] ? {
          texto: c.mensagens[0].texto,
          autorTipo: c.mensagens[0].autorTipo.toLowerCase(),
          autorId: c.mensagens[0].autorId,
          createdAt: c.mensagens[0].createdAt,
        } : null,
        naoLidas,
        ultimaMensagemEm: c.ultimaMensagemEm,
      };
    }));

    res.json({ conversas: resultado.filter(Boolean) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar conversas.' });
  }
});

// GET /api/mensagens/conversas/:tipo/:id — histórico com uma pessoa
// específica (professor ou aluno). Sem conversa ainda: devolve lista vazia
// em vez de 404, pra tela poder abrir a thread antes da 1ª mensagem.
app.get('/api/mensagens/conversas/:tipo/:id', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const outroTipoParam = req.params.tipo;
    if (!['professor', 'aluno'].includes(outroTipoParam)) return res.status(400).json({ erro: 'tipo inválido.' });

    const outro = await resolverIdentidadeDM(outroTipoParam, req.params.id);
    if (!outro) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const meuTipo = req.auth.papel.toUpperCase();
    const outroTipo = outroTipoParam.toUpperCase();
    const chave = ordenarParticipantesDM(meuTipo, req.auth.id, outroTipo, req.params.id);

    const conversa = await prisma.conversaDireta.findUnique({
      where: { participanteATipo_participanteAId_participanteBTipo_participanteBId: chave },
    });

    const outroResumo = { tipo: outroTipoParam, id: outro.id, nome: outro.nome, fotoUrl: outro.fotoUrl };
    if (!conversa) return res.json({ conversaId: null, mensagens: [], proximoCursor: null, outro: outroResumo });

    const cursor = req.query.cursor;
    const mensagensDesc = await prisma.mensagemDireta.findMany({
      where: { conversaId: conversa.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    });

    // Marca como lidas as que não são minhas — só na primeira página (sem
    // cursor), que é a que a tela abre por padrão.
    if (!cursor) {
      await prisma.mensagemDireta.updateMany({
        where: { conversaId: conversa.id, lida: false, NOT: { autorTipo: meuTipo } },
        data: { lida: true },
      });
    }

    res.json({
      conversaId: conversa.id,
      mensagens: mensagensDesc.slice().reverse().map((m) => ({
        id: m.id, texto: m.texto, autorTipo: m.autorTipo.toLowerCase(), autorId: m.autorId, createdAt: m.createdAt,
      })),
      proximoCursor: mensagensDesc.length === 30 ? mensagensDesc[mensagensDesc.length - 1].id : null,
      outro: outroResumo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar conversa.' });
  }
});

// POST /api/mensagens/conversas/:tipo/:id — envia mensagem, cria a
// conversa na hora se ainda não existir.
app.post('/api/mensagens/conversas/:tipo/:id', autenticar, async (req, res) => {
  try {
    if (req.auth.papel !== 'professor' && req.auth.papel !== 'aluno') {
      return res.status(403).json({ erro: 'Entre como professor ou aluno.' });
    }
    const outroTipoParam = req.params.tipo;
    if (!['professor', 'aluno'].includes(outroTipoParam)) return res.status(400).json({ erro: 'tipo inválido.' });
    if (outroTipoParam === req.auth.papel && req.params.id === req.auth.id) {
      return res.status(400).json({ erro: 'Não é possível enviar mensagem pra si mesmo.' });
    }
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ erro: 'texto é obrigatório.' });

    const outro = await resolverIdentidadeDM(outroTipoParam, req.params.id);
    if (!outro) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const meuTipo = req.auth.papel.toUpperCase();
    const outroTipo = outroTipoParam.toUpperCase();
    const chave = ordenarParticipantesDM(meuTipo, req.auth.id, outroTipo, req.params.id);

    const conversa = await prisma.conversaDireta.upsert({
      where: { participanteATipo_participanteAId_participanteBTipo_participanteBId: chave },
      update: { ultimaMensagemEm: new Date() },
      create: chave,
    });

    const msg = await prisma.mensagemDireta.create({
      data: { conversaId: conversa.id, autorTipo: meuTipo, autorId: req.auth.id, texto: texto.trim() },
    });

    if (outro.expoPushToken) {
      const eu = await resolverIdentidadeDM(req.auth.papel, req.auth.id);
      await enviarPushNotificacao(outro.expoPushToken, eu?.nome || 'Nova mensagem', texto.trim(), { tipo: 'NOVA_MENSAGEM_DIRETA', conversaId: conversa.id });
    }

    res.status(201).json({ id: msg.id, texto: msg.texto, autorTipo: meuTipo.toLowerCase(), createdAt: msg.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

// ============================================================================
// 9. ROTAS DE REPOSIÇÕES DO PROFESSOR
// ============================================================================

// Professor cria uma proposta de reposição para um aluno
app.post('/api/reposicoes', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const { alunoId, dataOriginal, dataProposta, motivo } = req.body;
    if (!alunoId || !dataProposta || !motivo) {
      return res.status(400).json({ erro: 'alunoId, dataProposta e motivo são obrigatórios.' });
    }

    const aluno = await prisma.aluno.findFirst({ where: { id: alunoId, professorId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado ou não pertence a este professor.' });

    const reposicao = await prisma.reposicao.create({
      data: {
        professorId,
        alunoId,
        dataOriginal: dataOriginal ?? null,
        dataProposta,
        motivo,
        status: 'AGUARDANDO',
      },
    });

    // Notifica o aluno sobre a proposta de reposição
    if (aluno.expoPushToken) {
      await enviarPushNotificacao(aluno.expoPushToken, 'Proposta de Reposição', `Seu professor propôs uma reposição para ${dataProposta}.`, { tipo: 'NOVA_REPOSICAO', reposicaoId: reposicao.id });
    }

    res.status(201).json({ mensagem: 'Reposição criada!', reposicao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Professor vê todas as reposições dos seus alunos (alias /api/reposicoes e /api/professor/reposicoes)
async function buscarReposicoesProfessor(professorId) {
  return prisma.reposicao.findMany({
    where: { professorId, aluno: { status: 'ATIVO' } },
    include: { aluno: { select: { nome: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

app.get('/api/reposicoes', exigirProfessor, async (req, res) => {
  try {
    res.json(await buscarReposicoesProfessor(req.auth.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/professor/reposicoes', exigirProfessor, async (req, res) => {
  try {
    res.json(await buscarReposicoesProfessor(req.auth.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Professor define nova data depois que aluno solicitou outro horário
app.put('/api/reposicoes/:id/nova-data', exigirProfessor, async (req, res) => {
  try {
    const { dataProposta } = req.body;
    if (!dataProposta) return res.status(400).json({ erro: 'dataProposta obrigatório.' });

    const existente = await prisma.reposicao.findUnique({ where: { id: req.params.id }, select: { professorId: true } });
    if (!existente || existente.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Reposição não encontrada.' });
    }

    const reposicao = await prisma.reposicao.update({
      where: { id: req.params.id },
      data: { dataProposta, status: 'AGUARDANDO' },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });

    if (reposicao.aluno?.expoPushToken) {
      await enviarPushNotificacao(reposicao.aluno.expoPushToken, 'Nova data de reposição', `Seu professor propôs ${dataProposta} para a reposição.`, { tipo: 'NOVA_REPOSICAO', reposicaoId: reposicao.id });
    }

    res.json({ mensagem: 'Nova data enviada!', reposicao });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

// ─── Fluxo de reposição iniciada pelo aluno (S2.1): aprovar/negar são do
// professor; finalizar é da Escola (DONO/GESTOR — no Pacote Professor, o
// próprio professor solo, que é DONO da sua Escola de 1 pessoa). Ordem
// obrigatória: só finaliza o que já foi autorizado pelo professor.

app.put('/api/reposicoes/:id/aprovar', exigirProfessor, async (req, res) => {
  try {
    const { count } = await prisma.reposicao.updateMany({
      where: { id: req.params.id, professorId: req.auth.id, origem: 'ALUNO', status: 'SOLICITADA' },
      data: { status: 'AUTORIZADA' },
    });
    if (!count) return res.status(404).json({ erro: 'Nenhum pedido de reposição pendente com esse id.' });
    res.json({ mensagem: 'Reposição autorizada. Aguardando a Escola finalizar.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao aprovar reposição.');
  }
});

app.put('/api/reposicoes/:id/negar', exigirProfessor, async (req, res) => {
  try {
    const { count } = await prisma.reposicao.updateMany({
      where: { id: req.params.id, professorId: req.auth.id, origem: 'ALUNO', status: 'SOLICITADA' },
      data: { status: 'NEGADA' },
    });
    if (!count) return res.status(404).json({ erro: 'Nenhum pedido de reposição pendente com esse id.' });
    res.json({ mensagem: 'Reposição negada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao negar reposição.');
  }
});

// PUT /api/reposicoes/:id/finalizar — marca uma reposição como concluída.
// Aceita os dois fluxos (INSTITUTION Sprint 15, briefing 22/09/2026): o
// fluxo do aluno (origem ALUNO, já autorizado pelo professor — S2.1
// original) e o fluxo do professor (origem PROFESSOR, aluno já confirmou a
// data — status CONFIRMADA nunca tinha uma etapa de "concluir" antes desta
// sprint, ficava pendurado ali pra sempre). FINALIZADA é o único status
// terminal comum aos dois fluxos, por isso a tela de 3 colunas usa só ele
// pra "Reposições concluídas", sem distinguir a origem.
app.put('/api/reposicoes/:id/finalizar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'reposicoes');
    if (!professor) return;

    const { count } = await prisma.reposicao.updateMany({
      where: {
        id: req.params.id,
        professor: { escolaId: professor.escolaId }, // a reposição precisa ser de um professor da mesma Escola
        OR: [
          { origem: 'ALUNO', status: 'AUTORIZADA' },
          { origem: 'PROFESSOR', status: 'CONFIRMADA' },
        ],
      },
      data: { status: 'FINALIZADA' },
    });
    if (!count) return res.status(404).json({ erro: 'Nenhuma reposição pronta pra finalizar com esse id nesta Escola.' });
    res.json({ mensagem: 'Reposição finalizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao finalizar reposição.');
  }
});

// PUT /api/reposicoes/:id/agendar — a escola marca data/horário (e
// opcionalmente outro professor/sala) pra uma reposição que ainda está em
// "Para repor" — funciona pros 3 fluxos (ESCOLA/PROFESSOR/ALUNO), unificando
// o agendamento num só lugar (INSTITUTION Sprint 20, briefing 23/09/2026).
// Cria a Aula de reposição DE VERDADE (tipo=REPOSICAO) — ela passa a
// aparecer na Grade de hoje, no dashboard do aluno, no check-in do
// professor e na folha de pagamento como qualquer outra aula. Quando essa
// Aula receber presença PRESENTE, esta Reposicao vira FINALIZADA sozinha
// (ver finalizarReposicaoSeAplicavel).
app.put('/api/reposicoes/:id/agendar', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'reposicoes');
    if (!professorLogado) return;

    const { dataHora, professorId, salaId } = req.body;
    if (!dataHora || isNaN(new Date(dataHora).getTime())) {
      return res.status(400).json({ erro: 'dataHora é obrigatória e precisa ser uma data válida.' });
    }

    const reposicao = await prisma.reposicao.findFirst({
      where: {
        id: req.params.id,
        professor: { escolaId: professorLogado.escolaId },
        status: { in: ['AGUARDANDO', 'SOLICITANDO_OUTRO', 'SOLICITADA', 'PENDENTE_AGENDAMENTO'] },
      },
    });
    if (!reposicao) return res.status(404).json({ erro: 'Nenhuma reposição pendente de agendamento com esse id nesta Escola.' });

    let professorAlvoId = reposicao.professorId;
    if (professorId) {
      const professorAlvo = await prisma.professor.findFirst({ where: { id: professorId, escolaId: professorLogado.escolaId } });
      if (!professorAlvo) return res.status(400).json({ erro: 'Professor não encontrado nesta Escola.' });
      professorAlvoId = professorId;
    }
    if (salaId) {
      const sala = await prisma.sala.findFirst({ where: { id: salaId, escolaId: professorLogado.escolaId } });
      if (!sala) return res.status(400).json({ erro: 'Sala não encontrada nesta Escola.' });
    }

    const dataHoraAula = new Date(dataHora);
    const [novaAula, reposicaoAtualizada] = await prisma.$transaction([
      prisma.aula.create({
        data: {
          dataHora: dataHoraAula,
          professorId: professorAlvoId,
          alunoId: reposicao.alunoId,
          tipo: 'REPOSICAO',
          status: 'AGENDADA',
          salaId: salaId || null,
        },
      }),
      prisma.reposicao.update({
        where: { id: reposicao.id },
        data: {
          dataProposta: dataHoraAula.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }),
          status: 'AGENDADA',
        },
      }),
    ]);
    // aulaReposicaoId depende do id da Aula recém-criada — precisa de um
    // segundo update fora da transação acima (não dá pra referenciar o id
    // gerado dentro do mesmo array de operações do $transaction).
    await prisma.reposicao.update({ where: { id: reposicao.id }, data: { aulaReposicaoId: novaAula.id } });

    res.json({ mensagem: 'Reposição agendada!', aula: novaAula, reposicao: { ...reposicaoAtualizada, aulaReposicaoId: novaAula.id } });
  } catch (err) {
    tratarErro(err, res, 'Erro ao agendar reposição.');
  }
});

// GET /api/escola/reposicoes-quadro — quadro de 3 colunas (INSTITUTION
// Sprint 15): todas as reposições da Escola, categorizadas por onde estão
// no fluxo. "Para repor" junta os dois fluxos ainda sem data travada;
// "Agendadas" junta os dois fluxos já com data certa, faltando só a escola
// concluir; "Concluídas" é sempre FINALIZADA. Distinto de
// GET /api/escola/reposicoes (mantida como está, só alimenta o KPI antigo
// do Painel — origem ALUNO + AUTORIZADA).
app.get('/api/escola/reposicoes-quadro', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'reposicoes');
    if (!professor) return;

    const reposicoes = await prisma.reposicao.findMany({
      where: { professor: { escolaId: professor.escolaId } },
      include: {
        aluno: { select: { nome: true } },
        professor: { select: { nome: true } },
        aulaOriginal: { select: { id: true, dataHora: true } },
        aulaReposicao: { select: { id: true, dataHora: true, professor: { select: { nome: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paraRepor = reposicoes.filter((r) => ['AGUARDANDO', 'SOLICITANDO_OUTRO', 'SOLICITADA', 'PENDENTE_AGENDAMENTO'].includes(r.status));
    const agendadas = reposicoes.filter((r) => ['CONFIRMADA', 'AUTORIZADA', 'AGENDADA'].includes(r.status));
    const concluidas = reposicoes.filter((r) => r.status === 'FINALIZADA');

    res.json({ paraRepor, agendadas, concluidas });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar o quadro de reposições.');
  }
});

// ============================================================================
// 9. REGISTRO DE PRESENÇA E CONTEÚDO
// ============================================================================

app.post('/api/aulas/:id/registrar-presenca', exigirProfessor, async (req, res) => {
  try {
    const { presenca } = req.body;
    const validos = ['PRESENTE', 'AUSENCIA_PROFESSOR', 'AUSENCIA_ALUNO', 'PENDENTE_REPOSICAO'];
    if (!presenca || !validos.includes(presenca)) {
      return res.status(400).json({ erro: 'presenca inválida. Use: ' + validos.join(', ') });
    }

    const aulaExistente = await prisma.aula.findUnique({ where: { id: req.params.id }, select: { professorId: true } });
    if (!aulaExistente || aulaExistente.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aula não encontrada.' });
    }

    let novoStatus;
    if (presenca === 'PRESENTE') novoStatus = 'CONCLUIDA';
    else if (presenca === 'PENDENTE_REPOSICAO') novoStatus = 'AGENDADA';
    else novoStatus = 'CANCELADA';

    const aula = await prisma.aula.update({
      where: { id: req.params.id },
      data: { presenca, status: novoStatus },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });

    if (presenca === 'PENDENTE_REPOSICAO' && aula.aluno?.expoPushToken) {
      await enviarPushNotificacao(
        aula.aluno.expoPushToken,
        'Aula remarcada',
        'Sua aula foi marcada como pendente de reposição. Aguarde o professor propor uma nova data.',
        { tipo: 'AULA_REMARCADA', aulaId: aula.id }
      );
    }
    if (presenca === 'PRESENTE') await finalizarReposicaoSeAplicavel(aula.id);

    res.json({ mensagem: 'Presença registrada!', aula });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

// POST /api/presenca/qrcode — presença "sem toque manual" (Fase 5, S5.3):
// professor OU aluno escaneiam o QR fixado na sala e a própria aula deles,
// acontecendo agora naquela sala, é confirmada. Simplificação registrada
// aqui, não assumida em silêncio: um único scan (de qualquer um dos dois
// lados) já marca PRESENTE — isto não é uma reconciliação de duas pontas
// (tipo "professor confirmou, aluno não"), é literalmente eliminar o
// toque manual do professor numa lista, que é o critério de pronto do
// roadmap. Quem quiser registrar ausência continua usando
// POST /api/aulas/:id/registrar-presenca como sempre.
app.post('/api/presenca/qrcode', autenticar, async (req, res) => {
  try {
    const { salaId } = req.body;
    if (!salaId) return res.status(400).json({ erro: 'salaId é obrigatório.' });

    const sala = await prisma.sala.findUnique({ where: { id: salaId } });
    if (!sala) return res.status(404).json({ erro: 'QR Code inválido — sala não encontrada.' });

    const agora = new Date();
    const janelaMs = 2 * 60 * 60 * 1000; // ±2h — dá folga real pra atraso/adiantamento sem abrir demais.
    const filtroPessoa = req.auth.papel === 'professor' ? { professorId: req.auth.id } : { alunoId: req.auth.id };

    // status: AGENDADA (ainda por marcar) OU CONCLUIDA (já marcada por
    // alguém — é o caso do segundo scan, professor ou aluno, que precisa
    // achar a aula pra cair no "já registrada" abaixo, não sumir da busca).
    // CANCELADA fica de fora de propósito — não dá pra marcar presença
    // numa aula cancelada.
    const candidatas = await prisma.aula.findMany({
      where: {
        salaId,
        status: { in: ['AGENDADA', 'CONCLUIDA'] },
        dataHora: { gte: new Date(agora.getTime() - janelaMs), lte: new Date(agora.getTime() + janelaMs) },
        ...filtroPessoa,
      },
    });
    if (!candidatas.length) {
      return res.status(404).json({ erro: 'Nenhuma aula sua agendada agora nessa sala.' });
    }
    const aula = candidatas.reduce((maisProxima, atual) =>
      Math.abs(atual.dataHora - agora) < Math.abs(maisProxima.dataHora - agora) ? atual : maisProxima
    );

    if (aula.presenca) {
      return res.json({ mensagem: 'Presença já estava registrada pra essa aula.', jaRegistrada: true });
    }

    await prisma.aula.update({ where: { id: aula.id }, data: { presenca: 'PRESENTE', status: 'CONCLUIDA' } });
    await finalizarReposicaoSeAplicavel(aula.id);
    res.json({ mensagem: `Presença confirmada em ${sala.nome}!`, jaRegistrada: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar presença.' });
  }
});

// ─── PRESENÇA DUPLA (INSTITUTION Sprint 2, briefing 08/09/2026) ──────────
// Professor e aluno confirmam presença de forma independente (biometria no
// app, via expo-local-authentication) — cada check-in só grava o timestamp
// do próprio lado. Quando os dois já confirmaram, a aula vira PRESENTE de
// verdade. Enquanto só um confirmou, `presenca` fica como estava (null/
// PENDENTE_REPOSICAO) — não existe hoje um cron que decida "tempo esgotado,
// vira AUSENCIA_*" automaticamente; isso ficaria pra uma sprint futura de
// job agendado, registrado aqui como deliberadamente fora de escopo.
function recalcularPresencaAula(aula) {
  if (aula.presencaProfessorEm && aula.presencaAlunoEm) {
    return { presenca: 'PRESENTE', status: 'CONCLUIDA' };
  }
  return null;
}

// ─── Motor automático de reposição (INSTITUTION Sprint 20, briefing
// 23/09/2026) — fecha o ciclo que antes eram 2 mundos desconectados: a
// escola marcava `Aula.decisaoReposicao` na Grade de hoje e NADA aparecia
// na tela de Reposições; alguém tinha que criar uma `Reposicao` manual à
// parte. Agora os dois lados sincronizam sozinhos. ──────────────────────

// Chamado sempre que `decisaoReposicao` de uma Aula é definido (true/false)
// — cria, mantém ou remove a Reposicao automática (origem ESCOLA) ligada
// àquela Aula específica via aulaOriginalId. Idempotente: chamar de novo
// com o mesmo valor não duplica nem recria nada.
async function sincronizarReposicaoAutomatica(aula, decisaoReposicao) {
  const existente = await prisma.reposicao.findFirst({
    where: { aulaOriginalId: aula.id, origem: 'ESCOLA' },
  });

  if (decisaoReposicao === true) {
    if (existente) return existente; // já existe, nada a fazer
    return prisma.reposicao.create({
      data: {
        professorId: aula.professorId,
        alunoId: aula.alunoId,
        aulaOriginalId: aula.id,
        dataOriginal: aula.dataHora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        motivo: 'Falta registrada na Grade de hoje — aguardando a escola agendar a reposição.',
        origem: 'ESCOLA',
        status: 'PENDENTE_AGENDAMENTO',
      },
    });
  }

  // decisaoReposicao === false (falta injustificada, não precisa repor) —
  // se a escola mudou de ideia e já existia uma pendência automática ainda
  // não agendada, desfaz. Uma reposição já AGENDADA/FINALIZADA (a escola já
  // se comprometeu com uma data, possivelmente já virou aula de verdade)
  // não é apagada por uma mudança de classificação retroativa — fica pra
  // a escola cancelar manualmente se for o caso, evita perder histórico.
  if (existente && existente.status === 'PENDENTE_AGENDAMENTO') {
    await prisma.reposicao.delete({ where: { id: existente.id } });
  }
  return null;
}

// Chamado sempre que uma Aula recebe presença PRESENTE (checkin, override
// manual, ou marcação direta da escola) — se essa Aula é a que cobre uma
// Reposicao pendente (`aulaReposicaoId`), finaliza a Reposicao sozinha.
// Nenhuma tela precisa lembrar de fazer isso na mão.
async function finalizarReposicaoSeAplicavel(aulaId) {
  const { count } = await prisma.reposicao.updateMany({
    where: { aulaReposicaoId: aulaId, status: 'AGENDADA' },
    data: { status: 'FINALIZADA' },
  });
  return count > 0;
}

// POST /api/aulas/:id/checkin-professor — o próprio professor confirma
// presença da aula dele (autenticado com o token normal; a biometria já
// aconteceu no app antes de chamar esta rota).
app.post('/api/aulas/:id/checkin-professor', exigirProfessor, async (req, res) => {
  try {
    const aula = await prisma.aula.findUnique({ where: { id: req.params.id } });
    if (!aula || aula.professorId !== req.auth.id) return res.status(404).json({ erro: 'Aula não encontrada.' });
    if (aula.presencaProfessorEm) return res.json({ mensagem: 'Você já confirmou presença nesta aula.', aula });

    // assuntoTratado (INSTITUTION Sprint 9, briefing 08/09/2026): o
    // professor descreve o que foi dado, com base no CronogramaConteudo
    // vigente do curso — texto livre, sem validação contra o cronograma
    // (a escola só usa isso pra controle de qualidade, não é obrigatório).
    const data = { presencaProfessorEm: new Date() };
    if (typeof req.body?.assuntoTratado === 'string') data.assuntoTratado = req.body.assuntoTratado.trim() || null;
    Object.assign(data, recalcularPresencaAula({ ...aula, ...data }));

    const atualizada = await prisma.aula.update({ where: { id: aula.id }, data });
    if (atualizada.presenca === 'PRESENTE') await finalizarReposicaoSeAplicavel(atualizada.id);
    res.json({ mensagem: 'Presença confirmada!', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao confirmar presença.');
  }
});

// POST /api/aulas/:id/checkin-aluno — mesma ideia, do lado do aluno.
app.post('/api/aulas/:id/checkin-aluno', exigirAluno, async (req, res) => {
  try {
    const aula = await prisma.aula.findUnique({ where: { id: req.params.id } });
    if (!aula || aula.alunoId !== req.auth.id) return res.status(404).json({ erro: 'Aula não encontrada.' });
    if (aula.presencaAlunoEm) return res.json({ mensagem: 'Você já confirmou presença nesta aula.', aula });

    const data = { presencaAlunoEm: new Date() };
    Object.assign(data, recalcularPresencaAula({ ...aula, ...data }));

    const atualizada = await prisma.aula.update({ where: { id: aula.id }, data });
    if (atualizada.presenca === 'PRESENTE') await finalizarReposicaoSeAplicavel(atualizada.id);
    res.json({ mensagem: 'Presença confirmada!', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao confirmar presença.');
  }
});

// PUT /api/aulas/:id/confirmar-presenca-previa — resposta do aluno ao pedido
// de confirmação disparado ~24h antes da aula (INSTITUTION Sprint 13,
// briefing 22/09/2026). Distinto de POST checkin-aluno acima: aquele é o
// check-in biométrico NO momento da aula; este é a resposta antecipada de
// "eu vou" ou "eu não vou", pedida com antecedência pra escola se organizar
// (cobrir falta, avisar reposição etc.). Vale tanto pra aula oficial quanto
// reposição — ambas são um registro de Aula, sem distinção de rota.
app.put('/api/aulas/:id/confirmar-presenca-previa', exigirAluno, async (req, res) => {
  try {
    const { confirma } = req.body;
    if (typeof confirma !== 'boolean') {
      return res.status(400).json({ erro: 'confirma deve ser true (vou) ou false (não vou).' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id } });
    if (!aula || aula.alunoId !== req.auth.id) return res.status(404).json({ erro: 'Aula não encontrada.' });

    const atualizada = await prisma.aula.update({
      where: { id: aula.id },
      data: { confirmacaoAlunoEm: new Date(), confirmacaoAlunoResposta: confirma },
    });
    res.json({ mensagem: confirma ? 'Presença confirmada.' : 'Falta avisada — a escola foi sinalizada.', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao registrar confirmação de presença.');
  }
});

// PUT /api/aulas/:id/override-manual — quando professor ou aluno não
// conseguiram levar o celular, a escola marca presença manualmente — mas só
// com a senha de quem está sendo marcado (professor OU aluno, nunca a senha
// de quem está logado como DONO/GESTOR). Auditoria: fica registrado quem
// autorizou o override e o motivo.
app.put('/api/aulas/:id/override-manual', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    const { alvo, senha, motivo } = req.body;
    if (!['PROFESSOR', 'ALUNO'].includes(alvo) || !senha) {
      return res.status(400).json({ erro: 'alvo (PROFESSOR ou ALUNO) e senha são obrigatórios.' });
    }

    const aula = await prisma.aula.findUnique({
      where: { id: req.params.id },
      include: { professor: true, aluno: true },
    });
    if (!aula || aula.professor.escolaId !== professorLogado.escolaId) {
      return res.status(404).json({ erro: 'Aula não encontrada nesta Escola.' });
    }

    const dono = alvo === 'PROFESSOR' ? aula.professor : aula.aluno;
    if (!await bcrypt.compare(senha, dono.senha)) {
      return res.status(401).json({ erro: `Senha do ${alvo === 'PROFESSOR' ? 'professor' : 'aluno'} incorreta.` });
    }

    const data = alvo === 'PROFESSOR' ? { presencaProfessorEm: new Date() } : { presencaAlunoEm: new Date() };
    data.confirmadoManualmentePor = alvo;
    data.motivoManual = motivo || null;
    Object.assign(data, recalcularPresencaAula({ ...aula, ...data }));

    const atualizada = await prisma.aula.update({ where: { id: aula.id }, data });
    if (atualizada.presenca === 'PRESENTE') await finalizarReposicaoSeAplicavel(atualizada.id);
    res.json({ mensagem: 'Presença marcada manualmente.', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao marcar presença manualmente.');
  }
});

// PUT /api/aulas/:id/reposicao — só a escola decide se uma aula "é
// reposição ou não" (campo à parte, independente do fluxo de solicitação/
// aprovação de Reposicao já existente — ver decisão registrada no runbook).
// Sprint 20 (briefing 23/09/2026): agora sincroniza automaticamente com a
// tela de Reposições (ver sincronizarReposicaoAutomatica) — não é mais só
// uma marcação solta na Grade de hoje.
app.put('/api/aulas/:id/reposicao', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    const { decisaoReposicao } = req.body;
    if (typeof decisaoReposicao !== 'boolean') {
      return res.status(400).json({ erro: 'decisaoReposicao deve ser true ou false.' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id }, include: { professor: true } });
    if (!aula || aula.professor.escolaId !== professorLogado.escolaId) {
      return res.status(404).json({ erro: 'Aula não encontrada nesta Escola.' });
    }

    const atualizada = await prisma.aula.update({ where: { id: aula.id }, data: { decisaoReposicao } });
    await sincronizarReposicaoAutomatica(atualizada, decisaoReposicao);
    res.json({ mensagem: 'Decisão de reposição atualizada.', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar decisão de reposição.');
  }
});

// PUT /api/aulas/:id/registrar-falta — a escola marca falta (do aluno ou do
// professor) direto na Grade de hoje, de forma autônoma, sem precisar que
// professor/aluno tenham feito check-in antes e SEM senha (diferente de
// override-manual: aqui é registrar uma AUSÊNCIA, não reivindicar uma
// presença de alguém — risco de fraude bem menor, não precisa da mesma
// trava). INSTITUTION Sprint 20/21, briefing 23/09/2026 — é o botão que
// pinta a aula de amarelo (precisaReposicao=true) ou vermelho (false) na
// Grade de hoje, e já sincroniza a tela de Reposições sozinho.
app.put('/api/aulas/:id/registrar-falta', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    const { alvo, precisaReposicao } = req.body;
    if (!['ALUNO', 'PROFESSOR'].includes(alvo) || typeof precisaReposicao !== 'boolean') {
      return res.status(400).json({ erro: 'alvo (ALUNO ou PROFESSOR) e precisaReposicao (true/false) são obrigatórios.' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id }, include: { professor: true } });
    if (!aula || aula.professor.escolaId !== professorLogado.escolaId) {
      return res.status(404).json({ erro: 'Aula não encontrada nesta Escola.' });
    }

    const atualizada = await prisma.aula.update({
      where: { id: aula.id },
      data: {
        presenca: alvo === 'ALUNO' ? 'AUSENCIA_ALUNO' : 'AUSENCIA_PROFESSOR',
        status: 'CANCELADA',
        decisaoReposicao: precisaReposicao,
      },
    });
    await sincronizarReposicaoAutomatica(atualizada, precisaReposicao);
    res.json({ mensagem: 'Falta registrada.', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao registrar falta.');
  }
});

// PUT /api/aulas/:id/substituto — repasse de aula (INSTITUTION Sprint 12,
// briefing 22/09/2026): só a escola marca que OUTRO professor efetivamente
// leciona esta aula específica (cobertura de falta, repasse combinado
// etc.). professorId da Aula continua sendo o dono da grade/vínculo com o
// aluno — não muda. calcularOuAtualizarFolha lê professorSubstitutoId pra
// creditar o valor da aula a quem efetivamente lecionou.
app.put('/api/aulas/:id/substituto', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    const { professorSubstitutoId } = req.body;
    if (professorSubstitutoId !== null && typeof professorSubstitutoId !== 'string') {
      return res.status(400).json({ erro: 'professorSubstitutoId deve ser uma string (id do professor) ou null pra remover.' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id }, include: { professor: true } });
    if (!aula || aula.professor.escolaId !== professorLogado.escolaId) {
      return res.status(404).json({ erro: 'Aula não encontrada nesta Escola.' });
    }

    if (professorSubstitutoId) {
      if (professorSubstitutoId === aula.professorId) {
        return res.status(400).json({ erro: 'O professor substituto não pode ser o mesmo professor da grade.' });
      }
      const substituto = await prisma.professor.findUnique({ where: { id: professorSubstitutoId }, select: { escolaId: true } });
      if (!substituto || substituto.escolaId !== professorLogado.escolaId) {
        return res.status(404).json({ erro: 'Professor substituto não encontrado nesta Escola.' });
      }
    }

    const atualizada = await prisma.aula.update({ where: { id: aula.id }, data: { professorSubstitutoId } });
    res.json({ mensagem: professorSubstitutoId ? 'Substituição registrada.' : 'Substituição removida.', aula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao registrar substituição de professor.');
  }
});

app.post('/api/aulas/:id/material', exigirProfessor, async (req, res) => {
  try {
    const { titulo, tipo, conteudo, url, nomeArquivo } = req.body;
    if (!titulo || !tipo) {
      return res.status(400).json({ erro: 'titulo e tipo são obrigatórios.' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id } });
    if (!aula || aula.professorId !== req.auth.id) return res.status(404).json({ erro: 'Aula não encontrada.' });

    const material = await prisma.material.create({
      data: {
        titulo,
        tipo: tipo.toUpperCase(),
        conteudo: conteudo || null,
        url: url || null,
        nomeArquivo: nomeArquivo || null,
        aulaId: req.params.id,
        professorId: aula.professorId,
        alunoId: aula.alunoId,
      },
    });

    const aluno = await prisma.aluno.findUnique({
      where: { id: aula.alunoId },
      select: { expoPushToken: true },
    });
    if (aluno?.expoPushToken) {
      await enviarPushNotificacao(
        aluno.expoPushToken,
        'Novo conteúdo disponível!',
        `Seu professor adicionou "${titulo}" nos seus materiais didáticos.`,
        { tipo: 'NOVO_MATERIAL', aulaId: aula.id }
      );
    }

    res.status(201).json({ mensagem: 'Conteúdo adicionado!', material });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/aulas/:id/materiais-lote', exigirProfessor, async (req, res) => {
  try {
    const { materiais } = req.body;
    if (!Array.isArray(materiais) || materiais.length === 0) {
      return res.status(400).json({ erro: 'materiais (array) é obrigatório.' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id } });
    if (!aula || aula.professorId !== req.auth.id) return res.status(404).json({ erro: 'Aula não encontrada.' });

    // Cria o lote em paralelo (cada item com seu próprio try/catch via
    // allSettled) em vez de um create por vez em sequência.
    const resultados = await Promise.allSettled(materiais.map((item) => {
      const { titulo, tipo, conteudo, url, nomeArquivo } = item;
      if (!titulo || !tipo) {
        return Promise.reject(new Error(`Item sem título ou tipo: ${JSON.stringify(item)}`));
      }
      return prisma.material.create({
        data: {
          titulo,
          tipo: tipo.toUpperCase(),
          conteudo: conteudo || null,
          url: url || null,
          nomeArquivo: nomeArquivo || null,
          aulaId: req.params.id,
          professorId: aula.professorId,
          alunoId: aula.alunoId,
        },
      }).catch((e) => { throw new Error(`Erro ao criar "${titulo}": ${e.message}`); });
    }));

    const criados = resultados.filter(r => r.status === 'fulfilled').map(r => r.value);
    const erros = resultados.filter(r => r.status === 'rejected').map(r => r.reason.message);

    const aluno = await prisma.aluno.findUnique({
      where: { id: aula.alunoId },
      select: { expoPushToken: true },
    });
    if (aluno?.expoPushToken && criados.length > 0) {
      await enviarPushNotificacao(
        aluno.expoPushToken,
        'Novos conteúdos disponíveis!',
        `Seu professor adicionou ${criados.length} novo(s) material(is) didático(s).`,
        { tipo: 'NOVO_MATERIAL', aulaId: aula.id }
      );
    }

    res.status(201).json({ mensagem: 'Lote processado.', criados: criados.length, erros });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 10. CURSOS DO PROFESSOR
// ============================================================================

app.get('/api/meus-cursos', exigirProfessor, async (req, res) => {
  try {
    const professor = await prisma.professor.findUnique({
      where: { id: req.auth.id },
      select: { cursos: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    res.json(professor.cursos || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 10b. CURSO / SALA / TURMA (Fase 1, S1.2)
//
// Curso e Sala são catálogo da Escola — qualquer professor autenticado da
// Escola vê e cria (inclusive quem está sozinho no Pacote Professor, que
// também é uma Escola de 1 pessoa). Turma é sempre criada em nome de quem
// está autenticado (professorId = req.auth.id, mesmo padrão do resto da
// API) — atribuir turma a outro professor fica pra quando a Agenda geral
// do GESTOR existir (Fase 1, S1.4).
// ============================================================================

// Roda depois de exigirProfessor: busca o escolaId uma vez e anexa em
// req.auth.escolaId. 404 explícito se o professor do token não existir mais
// (conta apagada com uma sessão ainda viva, ou token adulterado) — evita
// que as rotas abaixo propaguem um escolaId nulo pro Prisma e estourem 500.
async function carregarEscolaDoProfessor(req, res, next) {
  const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
  if (!professor) { res.status(404).json({ erro: 'Professor não encontrado.' }); return; }
  req.auth.escolaId = professor.escolaId;
  next();
}

// exigirModuloEscola(chaveModulo) — mesmo papel de carregarEscolaDoProfessor
// (seta req.auth.escolaId), mas também bloqueia quem não tem acesso àquele
// módulo (INSTITUTION Sprint 16, briefing 22/09/2026: "estoque deve ser
// acionado ao funcionário que a escola disponibilizar o acesso"). Antes
// desta sprint, rotas de Salas/Produtos/Estoque usavam só
// carregarEscolaDoProfessor — mesmo uma SECRETARIA/FUNCIONARIO SEM
// permissão de 'recursos' conseguia chamar a API direto, ignorando o
// filtro que já existe em todo o resto do painel (NAV_ESCOLA/
// exigirPapelNaEscola). PROFESSOR continua com acesso direto — mesma
// convenção já usada em todo o painel hoje (só SECRETARIA/FUNCIONARIO são
// restritos por módulo; ver filtrarPorPermissao em _ui.tsx), não é uma
// trava nova pra quem já podia usar isso.
function exigirModuloEscola(chaveModulo) {
  return async (req, res, next) => {
    const professor = await prisma.professor.findUnique({
      where: { id: req.auth.id },
      select: { escolaId: true, papel: true, permissoesSecretaria: true },
    });
    if (!professor) { res.status(404).json({ erro: 'Professor não encontrado.' }); return; }
    req.auth.escolaId = professor.escolaId;

    const permitidoDireto = ['DONO', 'GESTOR', 'PROFESSOR'].includes(professor.papel);
    const permitidoPorFuncao = ['SECRETARIA', 'FUNCIONARIO'].includes(professor.papel)
      && (professor.permissoesSecretaria || []).includes(chaveModulo);
    if (!permitidoDireto && !permitidoPorFuncao) {
      res.status(403).json({ erro: 'Você não tem permissão para acessar isso.' });
      return;
    }
    next();
  };
}

app.get('/api/cursos', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const cursos = await prisma.curso.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { nome: 'asc' } });
    res.json(cursos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/cursos', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    const curso = await prisma.curso.create({ data: { nome: nome.trim(), escolaId: req.auth.escolaId } });
    res.status(201).json(curso);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar curso.' });
  }
});

app.patch('/api/cursos/:id', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, ativo, tabelaValoresId } = req.body;
    const escolaId = req.auth.escolaId;
    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (typeof ativo === 'boolean') dados.ativo = ativo;
    if (tabelaValoresId !== undefined) {
      if (tabelaValoresId) {
        const tabela = await prisma.tabelaValores.findFirst({ where: { id: tabelaValoresId, escolaId } });
        if (!tabela) return res.status(400).json({ erro: 'Tabela de valores não encontrada.' });
      }
      dados.tabelaValoresId = tabelaValoresId || null;
    }
    const { count } = await prisma.curso.updateMany({ where: { id: req.params.id, escolaId }, data: dados });
    if (!count) return res.status(404).json({ erro: 'Curso não encontrado.' });
    res.json({ mensagem: 'Curso atualizado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar curso.');
  }
});

app.get('/api/salas', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const salas = await prisma.sala.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { nome: 'asc' } });
    res.json(salas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/salas', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const { nome, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    const sala = await prisma.sala.create({ data: { nome: nome.trim(), descricao: descricao?.trim() || null, escolaId: req.auth.escolaId } });
    res.status(201).json(sala);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar sala.' });
  }
});

app.patch('/api/salas/:id', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const { nome, descricao, ativa } = req.body;
    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (descricao !== undefined) dados.descricao = descricao?.trim() || null;
    if (typeof ativa === 'boolean') dados.ativa = ativa;
    const { count } = await prisma.sala.updateMany({ where: { id: req.params.id, escolaId: req.auth.escolaId }, data: dados });
    if (!count) return res.status(404).json({ erro: 'Sala não encontrada.' });
    res.json({ mensagem: 'Sala atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar sala.');
  }
});

// GET /api/salas/:id/cartaz — página HTML pronta pra imprimir, com o QR
// Code de presença da sala (Fase 5, S5.3). Mesmo padrão de página HTML
// servida direto pelo backend já usado em S4.2 (sem build, sem deploy
// novo). O QR só carrega o id da sala (payload "KAVCLASS_SALA:<id>") — a
// tela de scanner do app resolve o resto (que aula, de quem) na hora.
//
// PÚBLICA de propósito, não um lapso: abre num navegador externo (o app
// chama WebBrowser.openBrowserAsync), então não dá pra mandar o
// Authorization: Bearer normal — e colocar um JWT de sessão (validade de
// 7 dias) numa query string pra isso vazaria em histórico de navegador
// sem necessidade nenhuma. O id da sala já é um UUID imprevisível (é o
// mesmo valor impresso no próprio pôster/QR e usado sem segredo nenhum em
// POST /api/presenca/qrcode) e o nome da sala não é dado sensível — não
// existe segredo adicional sendo exposto ao tirar a autenticação daqui.
app.get('/api/salas/:id/cartaz', limitarTaxaPublica(60, 10 * 60 * 1000), async (req, res) => {
  try {
    const sala = await prisma.sala.findUnique({ where: { id: req.params.id } });
    if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });

    const qrcode = require('qrcode');
    const payload = `KAVCLASS_SALA:${sala.id}`;
    const dataUrl = await qrcode.toDataURL(payload, { width: 480, margin: 2 });

    res.type('html').send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cartaz de presença — ${escaparHtml(sala.nome)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 48px 20px; color: #111; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  p.sub { color: #666; margin-top: 0; font-size: 14px; }
  img { width: 320px; height: 320px; margin: 28px 0; }
  .instrucao { max-width: 380px; margin: 0 auto; color: #333; font-size: 15px; line-height: 1.6; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>${escaparHtml(sala.nome)}</h1>
  <p class="sub">Presença por QR Code — KAV Class</p>
  <img src="${dataUrl}" alt="QR Code de presença" />
  <p class="instrucao">Abra o app KAV Class, toque em <b>Escanear presença</b> e aponte a câmera pra este código pra confirmar presença nesta sala.</p>
</body></html>`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar cartaz.' });
  }
});

app.get('/api/turmas', exigirProfessor, async (req, res) => {
  try {
    const turmas = await prisma.turma.findMany({
      where: { professorId: req.auth.id },
      include: { curso: true, sala: true },
      orderBy: { nome: 'asc' },
    });
    res.json(turmas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/escola/turmas — DONO/GESTOR vê as turmas de TODOS os
// professores da Escola (a rota acima, /api/turmas, continua só-do-próprio
// professor, sem mudança nenhuma — usada por quem já a chama hoje). Inclui
// a contagem de matrículas ativas pra dar noção de ocupação (X/limite).
app.get('/api/escola/turmas', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'logistica');
    if (!professor) return;

    const turmas = await prisma.turma.findMany({
      where: { escolaId: professor.escolaId },
      include: {
        curso: { select: { nome: true } },
        sala: { select: { nome: true } },
        professor: { select: { nome: true } },
        _count: { select: { matriculas: true } },
      },
      orderBy: { nome: 'asc' },
    });
    res.json(turmas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar turmas.' });
  }
});

app.post('/api/turmas', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, cursoId, salaId, limiteAlunos, professorId } = req.body;
    if (!nome?.trim() || !cursoId) return res.status(400).json({ erro: 'nome e cursoId são obrigatórios.' });

    const escolaId = req.auth.escolaId;

    // Curso (e sala, se informada) precisam ser da mesma Escola — sem isso
    // dava pra criar uma turma amarrada a um curso/sala de outra escola.
    const curso = await prisma.curso.findFirst({ where: { id: cursoId, escolaId } });
    if (!curso) return res.status(400).json({ erro: 'Curso não encontrado.' });
    if (salaId) {
      const sala = await prisma.sala.findFirst({ where: { id: salaId, escolaId } });
      if (!sala) return res.status(400).json({ erro: 'Sala não encontrada.' });
    }

    // professorId é opcional — quem cria pode atribuir a turma a outro
    // professor da mesma Escola (uso típico: DONO/GESTOR montando a grade).
    // Sem informar, cai no próprio professor logado, como sempre foi.
    let professorDaTurma = req.auth.id;
    if (professorId) {
      const prof = await prisma.professor.findFirst({ where: { id: professorId, escolaId } });
      if (!prof) return res.status(400).json({ erro: 'Professor não encontrado nesta Escola.' });
      professorDaTurma = professorId;
    }

    const limite = limiteAlunos != null ? parseInt(String(limiteAlunos), 10) : null;
    const turma = await prisma.turma.create({
      data: {
        nome: nome.trim(),
        cursoId,
        salaId: salaId || null,
        limiteAlunos: Number.isFinite(limite) ? limite : null,
        professorId: professorDaTurma,
        escolaId,
      },
      include: { curso: true, sala: true },
    });
    res.status(201).json(turma);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar turma.' });
  }
});

// PATCH /api/turmas/:id — o próprio professor dono da turma sempre pode
// editar; DONO/GESTOR da mesma Escola também podem (gerir a grade inteira é
// o ponto do Catálogo no painel institucional), mesmo sem ser o professor
// da turma.
app.patch('/api/turmas/:id', exigirProfessor, async (req, res) => {
  try {
    const professor = await prisma.professor.findUnique({
      where: { id: req.auth.id },
      select: { escolaId: true, papel: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const turmaAtual = await prisma.turma.findUnique({ where: { id: req.params.id }, select: { professorId: true, escolaId: true } });
    if (!turmaAtual) return res.status(404).json({ erro: 'Turma não encontrada.' });

    const podeEditar = turmaAtual.professorId === req.auth.id
      || (['DONO', 'GESTOR'].includes(professor.papel) && turmaAtual.escolaId === professor.escolaId);
    if (!podeEditar) return res.status(404).json({ erro: 'Turma não encontrada.' });

    const { nome, salaId, limiteAlunos, ativa } = req.body;
    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (typeof ativa === 'boolean') dados.ativa = ativa;
    if (limiteAlunos !== undefined) {
      const limite = limiteAlunos != null ? parseInt(String(limiteAlunos), 10) : null;
      dados.limiteAlunos = Number.isFinite(limite) ? limite : null;
    }
    if (salaId !== undefined) {
      if (salaId) {
        const sala = await prisma.sala.findFirst({ where: { id: salaId, escolaId: professor.escolaId } });
        if (!sala) return res.status(400).json({ erro: 'Sala não encontrada.' });
      }
      dados.salaId = salaId || null;
    }

    await prisma.turma.update({ where: { id: req.params.id }, data: dados });
    res.json({ mensagem: 'Turma atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar turma.');
  }
});

// ============================================================================
// 10c. TABELA DE VALORES (Fase 1, S1.3)
//
// Motor de precificação: Modalidade e PlanoPagamento são catálogo da
// Escola; TabelaValores tem N versões, cada versão tem um preço por
// combinação (PlanoPagamento, forma de pagamento). Ativar uma versão
// desativa as irmãs na mesma transação — não existe constraint de banco
// garantindo "só uma ativa por tabela" de propósito (índice único parcial
// adicionaria complexidade só pra isso; a rota de ativação já garante o
// invariante do jeito mais simples).
//
// Importante: nada aqui altera Aluno.valorMensalidade. Esse motor só entra
// em jogo quando algo novo (uma futura tela de matrícula) decidir ler o
// preço vigente — o que já está configurado continua exatamente como está.
// ============================================================================

app.get('/api/modalidades', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const modalidades = await prisma.modalidade.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { nome: 'asc' } });
    res.json(modalidades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/modalidades', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, frequencia, duracaoMinutos, padrao } = req.body;
    if (!nome?.trim() || !frequencia || !duracaoMinutos) {
      return res.status(400).json({ erro: 'nome, frequencia e duracaoMinutos são obrigatórios.' });
    }
    const escolaId = req.auth.escolaId;

    const modalidade = await prisma.$transaction(async (tx) => {
      if (padrao === true) {
        await tx.modalidade.updateMany({ where: { escolaId, padrao: true }, data: { padrao: false } });
      }
      return tx.modalidade.create({
        data: { nome: nome.trim(), frequencia, duracaoMinutos: parseInt(String(duracaoMinutos), 10), padrao: !!padrao, escolaId },
      });
    });
    res.status(201).json(modalidade);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar modalidade.' });
  }
});

app.patch('/api/modalidades/:id', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, frequencia, duracaoMinutos, padrao } = req.body;
    const escolaId = req.auth.escolaId;
    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (frequencia) dados.frequencia = frequencia;
    if (duracaoMinutos != null) dados.duracaoMinutos = parseInt(String(duracaoMinutos), 10);
    if (typeof padrao === 'boolean') dados.padrao = padrao;

    const atualizado = await prisma.$transaction(async (tx) => {
      if (padrao === true) {
        await tx.modalidade.updateMany({ where: { escolaId, padrao: true }, data: { padrao: false } });
      }
      return tx.modalidade.updateMany({ where: { id: req.params.id, escolaId }, data: dados });
    });
    if (!atualizado.count) return res.status(404).json({ erro: 'Modalidade não encontrada.' });
    res.json({ mensagem: 'Modalidade atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar modalidade.');
  }
});

app.get('/api/planos-pagamento', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const planos = await prisma.planoPagamento.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { nome: 'asc' } });
    res.json(planos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/planos-pagamento', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, periodicidade } = req.body;
    const validos = ['MENSAL', 'SEMESTRAL', 'ANUAL', 'LIVRE'];
    if (!nome?.trim() || !validos.includes(periodicidade)) {
      return res.status(400).json({ erro: 'nome é obrigatório e periodicidade deve ser ' + validos.join('|') });
    }
    const plano = await prisma.planoPagamento.create({
      data: { nome: nome.trim(), periodicidade, escolaId: req.auth.escolaId },
    });
    res.status(201).json(plano);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar plano de pagamento.' });
  }
});

app.get('/api/tabelas-valores', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const tabelas = await prisma.tabelaValores.findMany({
      where: { escolaId: req.auth.escolaId },
      include: { versoes: { where: { ativa: true }, include: { valores: true } } },
      orderBy: { nome: 'asc' },
    });
    res.json(tabelas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/tabelas-valores/:id', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const tabela = await prisma.tabelaValores.findFirst({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      include: {
        cursos: { select: { id: true, nome: true } },
        versoes: {
          orderBy: { createdAt: 'desc' },
          include: { valores: { include: { planoPagamento: true } } },
        },
      },
    });
    if (!tabela) return res.status(404).json({ erro: 'Tabela não encontrada.' });
    res.json(tabela);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/tabelas-valores', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    const tabela = await prisma.tabelaValores.create({ data: { nome: nome.trim(), escolaId: req.auth.escolaId } });
    res.status(201).json(tabela);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar tabela de valores.' });
  }
});

// POST /api/tabelas-valores/:id/versoes
// Body: { ativarImediatamente?: boolean, valores: [{ planoPagamentoId, metodo?, valor }] }
// Cria uma versão nova (rascunho, por padrão não-ativa) — dá pra preparar o
// reajuste do ano que vem com antecedência sem afetar ninguém até ativar.
app.post('/api/tabelas-valores/:id/versoes', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const tabela = await prisma.tabelaValores.findFirst({ where: { id: req.params.id, escolaId } });
    if (!tabela) return res.status(404).json({ erro: 'Tabela não encontrada.' });

    const { valores, ativarImediatamente } = req.body;
    if (!Array.isArray(valores) || valores.length === 0) {
      return res.status(400).json({ erro: 'valores (array) é obrigatório.' });
    }
    const metodosValidos = ['PIX', 'CARTAO', 'BOLETO'];
    for (const v of valores) {
      if (!v.planoPagamentoId || typeof v.valor !== 'number' || v.valor < 0) {
        return res.status(400).json({ erro: 'Cada item de valores precisa de planoPagamentoId e valor (número ≥ 0).' });
      }
      if (v.metodo && !metodosValidos.includes(v.metodo)) {
        return res.status(400).json({ erro: 'metodo inválido: ' + v.metodo });
      }
    }
    // Todos os planos referenciados precisam ser da mesma Escola.
    const planoIds = [...new Set(valores.map(v => v.planoPagamentoId))];
    const planosValidos = await prisma.planoPagamento.count({ where: { id: { in: planoIds }, escolaId } });
    if (planosValidos !== planoIds.length) {
      return res.status(400).json({ erro: 'Um ou mais planos de pagamento não pertencem a esta Escola.' });
    }

    const versao = await prisma.$transaction(async (tx) => {
      if (ativarImediatamente === true) {
        await tx.versaoTabelaValores.updateMany({ where: { tabelaId: tabela.id, ativa: true }, data: { ativa: false } });
      }
      return tx.versaoTabelaValores.create({
        data: {
          tabelaId: tabela.id,
          ativa: ativarImediatamente === true,
          valores: { create: valores.map(v => ({ planoPagamentoId: v.planoPagamentoId, metodo: v.metodo || null, valor: v.valor })) },
        },
        include: { valores: true },
      });
    });
    res.status(201).json(versao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar versão da tabela.' });
  }
});

// PUT /api/tabelas-valores/versoes/:id/ativar
// Desativa qualquer outra versão da mesma tabela antes de ativar esta —
// nunca duas versões ativas ao mesmo tempo. Não toca em nenhum Aluno: quem
// já está matriculado manteve o valor gravado na hora da matrícula.
app.put('/api/tabelas-valores/versoes/:id/ativar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const versao = await prisma.versaoTabelaValores.findFirst({
      where: { id: req.params.id, tabela: { escolaId: req.auth.escolaId } },
      select: { id: true, tabelaId: true },
    });
    if (!versao) return res.status(404).json({ erro: 'Versão não encontrada.' });

    await prisma.$transaction([
      prisma.versaoTabelaValores.updateMany({ where: { tabelaId: versao.tabelaId, ativa: true }, data: { ativa: false } }),
      prisma.versaoTabelaValores.update({ where: { id: versao.id }, data: { ativa: true } }),
    ]);
    res.json({ mensagem: 'Versão ativada. Matrículas já existentes não são afetadas.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao ativar versão.');
  }
});

// GET /api/cursos/:id/preco?planoPagamentoId=X&metodo=PIX
// Resolve o preço vigente (versão ativa da tabela do curso). metodo=null
// (ou ausente) cai no valor "qualquer forma de pagamento", se existir.
app.get('/api/cursos/:id/preco', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { planoPagamentoId, metodo } = req.query;
    if (!planoPagamentoId) return res.status(400).json({ erro: 'planoPagamentoId é obrigatório.' });

    const curso = await prisma.curso.findFirst({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      select: { id: true, nome: true, tabelaValoresId: true },
    });
    if (!curso) return res.status(404).json({ erro: 'Curso não encontrado.' });
    if (!curso.tabelaValoresId) return res.status(404).json({ erro: 'Este curso não tem tabela de valores vinculada.' });

    const versaoAtiva = await prisma.versaoTabelaValores.findFirst({
      where: { tabelaId: curso.tabelaValoresId, ativa: true },
      include: { valores: true },
    });
    if (!versaoAtiva) return res.status(404).json({ erro: 'Esta tabela ainda não tem nenhuma versão ativa.' });

    const especifico = metodo ? versaoAtiva.valores.find(v => v.planoPagamentoId === planoPagamentoId && v.metodo === metodo) : null;
    const fallback = versaoAtiva.valores.find(v => v.planoPagamentoId === planoPagamentoId && v.metodo === null);
    const encontrado = especifico || fallback;
    if (!encontrado) return res.status(404).json({ erro: 'Não há preço configurado para esse plano/forma de pagamento.' });

    res.json({ curso: curso.nome, versaoId: versaoAtiva.id, valor: encontrado.valor, metodoAplicado: encontrado.metodo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao resolver preço.' });
  }
});

// ============================================================================
// 10d. MATRÍCULA E FATURAS (Fase 2, S2.2)
//
// Matricula é aditiva: existe em paralelo ao vínculo "implícito" que Aluno
// já carrega (professorId, curso, valorMensalidade) — esse continua
// funcionando exatamente como sempre funcionou, sem nenhuma mudança. Um
// mesmo Aluno pode ter mais de uma Matricula (curso/professor diferentes na
// mesma Escola), cada uma com seu próprio conjunto de faturas.
// ============================================================================

app.get('/api/matriculas', exigirProfessor, async (req, res) => {
  try {
    const matriculas = await prisma.matricula.findMany({
      where: { professorId: req.auth.id },
      include: { aluno: { select: { nome: true } }, turma: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(matriculas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/matriculas', exigirProfessor, async (req, res) => {
  try {
    const { alunoId, valorMensalidade, diaVencimento, turmaId, planoPagamentoId, planoPersonalizadoDescricao, leadId, professorId: professorIdBody } = req.body;
    if (!alunoId || typeof valorMensalidade !== 'number' || valorMensalidade <= 0) {
      return res.status(400).json({ erro: 'alunoId e valorMensalidade (número > 0) são obrigatórios.' });
    }

    const quemPede = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true, papel: true } });
    if (!quemPede) return res.status(404).json({ erro: 'Professor não encontrado.' });
    const ehGestao = ['DONO', 'GESTOR'].includes(quemPede.papel);

    // Professor comum só matricula o próprio aluno; DONO/GESTOR pode
    // matricular qualquer aluno da Escola — a matrícula nasce vinculada ao
    // professor de fato responsável pelo aluno (aluno.professorId) por
    // padrão, mas DONO/GESTOR pode escolher outro professor da Escola no
    // body (multi-professor, INSTITUTION Sprint 5 — um mesmo aluno pode ter
    // mais de uma Matricula, cada uma com seu professor).
    const aluno = ehGestao
      ? await prisma.aluno.findFirst({ where: { id: alunoId, escolaId: quemPede.escolaId } })
      : await prisma.aluno.findFirst({ where: { id: alunoId, professorId: req.auth.id } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado ou não pertence a esta Escola.' });

    let professorId = aluno.professorId;
    if (ehGestao && professorIdBody) {
      const professorEscolhido = await prisma.professor.findFirst({ where: { id: professorIdBody, escolaId: quemPede.escolaId } });
      if (!professorEscolhido) return res.status(400).json({ erro: 'Professor não encontrado nesta Escola.' });
      professorId = professorEscolhido.id;
    }
    if (!professorId) return res.status(400).json({ erro: 'Este aluno ainda não tem professor atribuído — atribua um antes de matricular.' });

    if (turmaId) {
      const turma = await prisma.turma.findFirst({ where: { id: turmaId, escolaId: aluno.escolaId } });
      if (!turma) return res.status(400).json({ erro: 'Turma não encontrada.' });
    }
    if (planoPagamentoId) {
      const plano = await prisma.planoPagamento.findFirst({ where: { id: planoPagamentoId, escolaId: aluno.escolaId } });
      if (!plano) return res.status(400).json({ erro: 'Plano de pagamento não encontrado.' });
    }
    // Vínculo de conversão (S4.3, opcional): marca que esta matrícula nasceu
    // de um Lead, pro relatório de conversão experimental → matrícula.
    if (leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, escolaId: aluno.escolaId }, include: { matricula: true } });
      if (!lead) return res.status(400).json({ erro: 'Lead não encontrado.' });
      if (lead.matricula) return res.status(400).json({ erro: 'Esse Lead já está vinculado a outra matrícula.' });
    }

    const matricula = await prisma.matricula.create({
      data: {
        alunoId,
        professorId,
        escolaId: aluno.escolaId,
        valorMensalidade,
        diaVencimento: diaVencimento != null ? parseInt(String(diaVencimento), 10) : 10,
        turmaId: turmaId || null,
        planoPagamentoId: planoPagamentoId || null,
        planoPersonalizadoDescricao: planoPersonalizadoDescricao?.trim() || null,
        leadId: leadId || null,
      },
    });
    res.status(201).json(matricula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar matrícula.' });
  }
});

// PATCH /api/matriculas/:id — edita um vínculo aluno×curso×professor já
// existente (INSTITUTION Sprint 5). Troca de professor só por DONO/GESTOR
// (mesma regra de criação); o resto (valor, vencimento, turma, plano) vale
// pra professor dono também.
app.patch('/api/matriculas/:id', exigirProfessor, async (req, res) => {
  try {
    const quemPede = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true, papel: true } });
    if (!quemPede) return res.status(404).json({ erro: 'Professor não encontrado.' });
    const ehGestao = ['DONO', 'GESTOR'].includes(quemPede.papel);

    const matricula = ehGestao
      ? await prisma.matricula.findFirst({ where: { id: req.params.id, escolaId: quemPede.escolaId } })
      : await prisma.matricula.findFirst({ where: { id: req.params.id, professorId: req.auth.id } });
    if (!matricula) return res.status(404).json({ erro: 'Matrícula não encontrada.' });

    const { valorMensalidade, diaVencimento, turmaId, planoPagamentoId, planoPersonalizadoDescricao, professorId } = req.body;
    const data = {};
    if (valorMensalidade !== undefined) {
      if (typeof valorMensalidade !== 'number' || valorMensalidade <= 0) return res.status(400).json({ erro: 'valorMensalidade deve ser um número > 0.' });
      data.valorMensalidade = valorMensalidade;
    }
    if (diaVencimento !== undefined) data.diaVencimento = parseInt(String(diaVencimento), 10) || 10;
    if (turmaId !== undefined) {
      if (turmaId) {
        const turma = await prisma.turma.findFirst({ where: { id: turmaId, escolaId: matricula.escolaId } });
        if (!turma) return res.status(400).json({ erro: 'Turma não encontrada.' });
      }
      data.turmaId = turmaId || null;
    }
    if (planoPagamentoId !== undefined) {
      if (planoPagamentoId) {
        const plano = await prisma.planoPagamento.findFirst({ where: { id: planoPagamentoId, escolaId: matricula.escolaId } });
        if (!plano) return res.status(400).json({ erro: 'Plano de pagamento não encontrado.' });
      }
      data.planoPagamentoId = planoPagamentoId || null;
    }
    if (planoPersonalizadoDescricao !== undefined) data.planoPersonalizadoDescricao = planoPersonalizadoDescricao?.trim() || null;
    if (professorId !== undefined) {
      if (!ehGestao) return res.status(403).json({ erro: 'Só DONO/GESTOR pode trocar o professor de uma matrícula.' });
      const professorEscolhido = await prisma.professor.findFirst({ where: { id: professorId, escolaId: matricula.escolaId } });
      if (!professorEscolhido) return res.status(400).json({ erro: 'Professor não encontrado nesta Escola.' });
      data.professorId = professorEscolhido.id;
    }

    const atualizada = await prisma.matricula.update({ where: { id: matricula.id }, data });
    res.json(atualizada);
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar matrícula.');
  }
});

// DELETE /api/matriculas/:id — remove um vínculo aluno×curso×professor
// (INSTITUTION Sprint 5). Só DONO/GESTOR — remover um vínculo financeiro é
// uma decisão de gestão, não do professor individual. Se já existe Contrato
// assinado pra essa matrícula, o banco recusa via FK (RESTRICT) — convertido
// aqui numa mensagem clara em vez do 500 genérico.
app.delete('/api/matriculas/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professor) return;

    const matricula = await prisma.matricula.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!matricula) return res.status(404).json({ erro: 'Matrícula não encontrada nesta Escola.' });

    await prisma.matricula.delete({ where: { id: matricula.id } });
    res.json({ mensagem: 'Vínculo removido.' });
  } catch (err) {
    if (err?.code === 'P2003') {
      return res.status(400).json({ erro: 'Não é possível remover — existe um contrato vinculado a esta matrícula. Cancele o contrato primeiro.' });
    }
    tratarErro(err, res, 'Erro ao remover matrícula.');
  }
});

// GET /api/escola/matriculas — DONO/GESTOR vê as matrículas de TODOS os
// professores da Escola, com o status do contrato mais recente de cada uma
// (se existir), pra dar a visão de "quem falta assinar" sem abrir uma a uma.
app.get('/api/escola/matriculas', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professor) return;

    const matriculas = await prisma.matricula.findMany({
      where: { escolaId: professor.escolaId },
      include: {
        aluno: { select: { nome: true, email: true } },
        professor: { select: { nome: true } },
        turma: { select: { nome: true } },
        contratos: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(matriculas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar matrículas.' });
  }
});

app.get('/api/aluno/matriculas', exigirAluno, async (req, res) => {
  try {
    const matriculas = await prisma.matricula.findMany({
      where: { alunoId: req.auth.id },
      include: { professor: { select: { nome: true } }, turma: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(matriculas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Carrega a matrícula garantindo que quem pediu (professor OU aluno, os dois
// autenticados por token de verdade) é dono dela. DONO/GESTOR da mesma
// Escola também passam, mesmo sem ser o professor da matrícula — é o painel
// institucional cuidando de matrícula de qualquer professor da Escola.
// Devolve null (já com o status certo respondido) se não for.
async function carregarMatriculaDoDono(req, res) {
  const matricula = await prisma.matricula.findUnique({ where: { id: req.params.id } });
  if (!matricula) { res.status(404).json({ erro: 'Matrícula não encontrada.' }); return null; }

  if (req.auth.papel === 'professor') {
    if (matricula.professorId === req.auth.id) return matricula;
    const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true, papel: true } });
    const gestao = professor && ['DONO', 'GESTOR'].includes(professor.papel) && professor.escolaId === matricula.escolaId;
    if (!gestao) { res.status(404).json({ erro: 'Matrícula não encontrada.' }); return null; }
    return matricula;
  }

  if (matricula.alunoId !== req.auth.id) { res.status(404).json({ erro: 'Matrícula não encontrada.' }); return null; }
  return matricula;
}

// GET /api/matriculas/:id/faturas — faturas agrupadas por status, igual ao
// que a Emusys mostra no app do aluno (Abertas/Pagas/Em Atraso).
app.get('/api/matriculas/:id/faturas', autenticar, async (req, res) => {
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    const pagamentos = await prisma.pagamento.findMany({
      where: { matriculaId: matricula.id },
      orderBy: { vencimento: 'asc' },
    });
    const agora = new Date();
    const abertas = pagamentos.filter(p => p.status === 'PENDENTE' && p.vencimento >= agora);
    const atrasadas = pagamentos.filter(p => (p.status === 'PENDENTE' && p.vencimento < agora) || p.status === 'ATRASADO');
    const pagas = pagamentos.filter(p => p.status === 'PAGO');
    const outras = pagamentos.filter(p => !abertas.includes(p) && !atrasadas.includes(p) && !pagas.includes(p));

    res.json({ abertas, atrasadas, pagas, outras });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/matriculas/:id/faturas', exigirProfessor, async (req, res) => {
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    // S3.2: se a matrícula tem contrato, cobrança só sai depois de
    // ASSINADO. Sem contrato nenhum vinculado, comportamento não muda em
    // nada (é assim que S2.2 sempre funcionou).
    const contrato = await prisma.contrato.findFirst({ where: { matriculaId: matricula.id } });
    if (contrato && contrato.status !== 'ASSINADO') {
      return res.status(400).json({ erro: `Essa matrícula tem um contrato pendente (status: ${contrato.status}). Cobrança só sai depois do contrato assinado.` });
    }

    const { valor, vencimento } = req.body;
    if (!vencimento) return res.status(400).json({ erro: 'vencimento é obrigatório.' });
    const valorFinal = typeof valor === 'number' && valor > 0 ? valor : matricula.valorMensalidade;

    const fatura = await prisma.pagamento.create({
      data: {
        valor: valorFinal,
        vencimento: ancorarNoDia(vencimento),
        status: 'PENDENTE',
        professorId: matricula.professorId,
        alunoId: matricula.alunoId,
        matriculaId: matricula.id,
      },
    });
    res.status(201).json(fatura);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar fatura.' });
  }
});

// PUT /api/pagamentos/:id/dividir — corta uma fatura PENDENTE em N partes.
// A soma das partes precisa bater com o valor original (com tolerância de
// 1 centavo pra arredondamento). A fatura original é cancelada — nada some,
// fica no histórico marcada como CANCELADO — e as N novas nascem PENDENTE.
app.put('/api/pagamentos/:id/dividir', exigirProfessor, async (req, res) => {
  try {
    const original = await prisma.pagamento.findFirst({ where: { id: req.params.id, professorId: req.auth.id } });
    if (!original) return res.status(404).json({ erro: 'Fatura não encontrada.' });
    if (original.status !== 'PENDENTE' && original.status !== 'ATRASADO') {
      return res.status(400).json({ erro: 'Só dá pra dividir fatura em aberto.' });
    }

    const { partes } = req.body;
    if (!Array.isArray(partes) || partes.length < 2) {
      return res.status(400).json({ erro: 'partes precisa ser um array com pelo menos 2 itens.' });
    }
    for (const p of partes) {
      if (typeof p.valor !== 'number' || p.valor <= 0) {
        return res.status(400).json({ erro: 'Cada parte precisa de um valor (número > 0).' });
      }
    }
    const soma = partes.reduce((acc, p) => acc + p.valor, 0);
    if (Math.abs(soma - original.valor) > 0.01) {
      return res.status(400).json({ erro: `A soma das partes (${soma.toFixed(2)}) precisa bater com o valor original (${original.valor.toFixed(2)}).` });
    }

    const novasFaturas = await prisma.$transaction(async (tx) => {
      await tx.pagamento.update({ where: { id: original.id }, data: { status: 'CANCELADO' } });
      const criadas = [];
      for (const p of partes) {
        criadas.push(await tx.pagamento.create({
          data: {
            valor: p.valor,
            vencimento: p.vencimento ? ancorarNoDia(p.vencimento) : original.vencimento,
            status: 'PENDENTE',
            professorId: original.professorId,
            alunoId: original.alunoId,
            matriculaId: original.matriculaId,
          },
        }));
      }
      return criadas;
    });

    res.status(201).json({ mensagem: 'Fatura dividida.', faturas: novasFaturas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao dividir fatura.' });
  }
});

// GET /api/pagamentos/:id/recibo — só emite recibo de fatura já paga. Sem
// gerador de PDF nesta sprint (nenhuma outra parte do app gera PDF ainda) —
// devolve os dados estruturados prontos pra tela montar/compartilhar.
app.get('/api/pagamentos/:id/recibo', autenticar, async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: req.params.id },
      include: { aluno: { select: { nome: true } }, professor: { select: { nome: true, chavePix: true } } },
    });
    if (!pagamento) return res.status(404).json({ erro: 'Fatura não encontrada.' });
    const dono = req.auth.papel === 'professor' ? pagamento.professorId === req.auth.id : pagamento.alunoId === req.auth.id;
    if (!dono) return res.status(404).json({ erro: 'Fatura não encontrada.' });
    if (pagamento.status !== 'PAGO') return res.status(400).json({ erro: 'Só dá pra emitir recibo de fatura paga.' });

    res.json({
      numeroRecibo: pagamento.id.slice(0, 8).toUpperCase(),
      aluno: pagamento.aluno.nome,
      professor: pagamento.professor.nome,
      valor: pagamento.valor,
      metodo: pagamento.metodo,
      dataPagamento: pagamento.dataPagamento,
      emitidoEm: new Date(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar recibo.' });
  }
});

// ============================================================================
// 10e. AVALIAÇÃO / CRÉDITO DE HORAS / RESERVA DE SALA (Fase 2, S2.3)
// ============================================================================

// POST /api/aluno/avaliacoes — se vier aulaId, o professor avaliado é
// derivado da própria aula (mais confiável). Sem aulaId, precisa vir
// professorId explícito, validado contra o professor "principal" do aluno
// ou qualquer Matricula dele — evita avaliar um professor qualquer da
// Escola que nunca deu aula pra esse aluno.
app.post('/api/aluno/avaliacoes', exigirAluno, async (req, res) => {
  try {
    const { nota, comentario, aulaId } = req.body;
    let { professorId } = req.body;
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ erro: 'nota precisa ser um número inteiro de 1 a 5.' });
    }

    if (aulaId) {
      const aula = await prisma.aula.findFirst({ where: { id: aulaId, alunoId: req.auth.id } });
      if (!aula) return res.status(404).json({ erro: 'Aula não encontrada.' });
      // Antifraude (18/09/2026): só dá pra avaliar uma aula em que a
      // presença foi de fato confirmada — sem isso, bastava marcar uma
      // aula futura/pendente como alvo pra avaliar sem nunca ter assistido.
      if (aula.presenca !== 'PRESENTE') {
        return res.status(400).json({ erro: 'Só é possível avaliar aulas com presença confirmada.' });
      }
      professorId = aula.professorId;
    } else {
      if (!professorId) return res.status(400).json({ erro: 'professorId ou aulaId é obrigatório.' });
      const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { professorId: true } });
      const temMatricula = await prisma.matricula.findFirst({ where: { alunoId: req.auth.id, professorId } });
      if (aluno?.professorId !== professorId && !temMatricula) {
        return res.status(400).json({ erro: 'Esse professor não dá aula pra você.' });
      }
      // Antifraude (18/09/2026): vínculo (professorId/Matricula) sozinho não
      // prova que o aluno já teve aula de verdade — sem isso, um professor
      // mal-intencionado podia criar um aluno fake pelo próprio código de
      // convite e se autoavaliar na hora, sem nenhum histórico real.
      const temPresencaConfirmada = await prisma.aula.findFirst({
        where: { alunoId: req.auth.id, professorId, presenca: 'PRESENTE' },
        select: { id: true },
      });
      if (!temPresencaConfirmada) {
        return res.status(400).json({ erro: 'Você precisa ter pelo menos uma aula com presença confirmada pra avaliar este professor.' });
      }
    }

    const avaliacao = await prisma.avaliacao.create({
      data: { nota, comentario: comentario?.trim() || null, alunoId: req.auth.id, professorId, aulaId: aulaId || null },
    });
    res.status(201).json(avaliacao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar avaliação.' });
  }
});

app.get('/api/professor/avaliacoes', exigirProfessor, async (req, res) => {
  try {
    const avaliacoes = await prisma.avaliacao.findMany({
      where: { professorId: req.auth.id },
      include: { aluno: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const media = avaliacoes.length ? avaliacoes.reduce((acc, a) => acc + a.nota, 0) / avaliacoes.length : null;
    res.json({ media, total: avaliacoes.length, avaliacoes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/aluno/avaliacao-mensal — avaliação mensal do aluno sobre a
// Escola e o professor principal (INSTITUTION Sprint 9, briefing
// 08/09/2026). Distinta de POST /api/aluno/avaliacoes (avaliação pontual
// de uma aula específica, já existente) — esta é uma vez por mês, sempre
// sobre Aluno.professorId (o vínculo principal), e ao responder pausa a
// cobrança/lembrete até o mês seguinte em todas as Matriculas do aluno.
app.post('/api/aluno/avaliacao-mensal', exigirAluno, async (req, res) => {
  try {
    const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { professorId: true } });
    if (!aluno?.professorId) return res.status(400).json({ erro: 'Você ainda não tem professor atribuído.' });

    const { notaProfessor, notaEscola, comentario } = req.body;
    if (!Number.isInteger(notaProfessor) || notaProfessor < 1 || notaProfessor > 5 || !Number.isInteger(notaEscola) || notaEscola < 1 || notaEscola > 5) {
      return res.status(400).json({ erro: 'notaProfessor e notaEscola devem ser números inteiros de 1 a 5.' });
    }

    const agora = new Date();
    const mesReferencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    const jaAvaliouEsseMes = await prisma.avaliacao.findFirst({ where: { alunoId: req.auth.id, mesReferencia } });
    if (jaAvaliouEsseMes) return res.status(400).json({ erro: 'Você já avaliou este mês.' });

    const proximoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
    await prisma.$transaction([
      prisma.avaliacao.create({
        data: { nota: notaProfessor, notaEscola, comentario: comentario?.trim() || null, alunoId: req.auth.id, professorId: aluno.professorId, mesReferencia },
      }),
      prisma.matricula.updateMany({ where: { alunoId: req.auth.id }, data: { avaliacaoPendenteAte: proximoMes } }),
    ]);

    res.status(201).json({ mensagem: 'Obrigado pela avaliação! Sua cobrança fica pausada até o próximo mês.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao registrar avaliação mensal.');
  }
});

// ─── COORDENAÇÃO (INSTITUTION Sprint 9, briefing 08/09/2026) ─────────────

// GET /api/escola/cronograma-conteudo?cursoId= — DONO/GESTOR vê tudo;
// qualquer professor da Escola também pode ler (precisa saber o conteúdo
// vigente pra confirmar presença), mas só vê PESSOAL dos outros como
// metadado — o anexo em si é público pra quem já tem acesso à Escola,
// mesmo padrão de "sem RBAC granular" desta fase.
app.get('/api/escola/cronograma-conteudo', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { cursoId } = req.query;
    const where = { escolaId: req.auth.escolaId };
    if (cursoId) where.cursoId = cursoId;
    const cronogramas = await prisma.cronogramaConteudo.findMany({
      where,
      include: { curso: { select: { nome: true } }, professor: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(cronogramas);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar cronogramas.');
  }
});

app.post('/api/escola/cronograma-conteudo', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'coordenacao');
    if (!professorLogado) return;

    const { cursoId, tipo, professorId, anexoUrl, titulo } = req.body;
    if (!cursoId || !['UNIVERSAL', 'PESSOAL'].includes(tipo)) {
      return res.status(400).json({ erro: 'cursoId e tipo (UNIVERSAL|PESSOAL) são obrigatórios.' });
    }
    if (tipo === 'PESSOAL' && !professorId) {
      return res.status(400).json({ erro: 'professorId é obrigatório quando tipo=PESSOAL.' });
    }
    const curso = await prisma.curso.findFirst({ where: { id: cursoId, escolaId: professorLogado.escolaId } });
    if (!curso) return res.status(404).json({ erro: 'Curso não encontrado nesta Escola.' });

    const cronograma = await prisma.cronogramaConteudo.create({
      data: {
        cursoId, tipo, titulo: titulo?.trim() || null, anexoUrl: anexoUrl || null,
        professorId: tipo === 'PESSOAL' ? professorId : null,
        escolaId: professorLogado.escolaId,
      },
    });
    res.status(201).json(cronograma);
  } catch (err) {
    tratarErro(err, res, 'Erro ao criar cronograma.');
  }
});

app.delete('/api/escola/cronograma-conteudo/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'coordenacao');
    if (!professor) return;
    const { count } = await prisma.cronogramaConteudo.deleteMany({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!count) return res.status(404).json({ erro: 'Cronograma não encontrado.' });
    res.json({ mensagem: 'Cronograma removido.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao remover cronograma.');
  }
});

// GET/POST /api/escola/relatorios-aluno — coordenador solicita ao
// professor (que sobe pelo mesmo POST, autorTipo=PROFESSOR) e a própria
// coordenação também sobe direto (autorTipo=COORDENACAO).
app.get('/api/escola/relatorios-aluno', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { alunoId } = req.query;
    const where = { escolaId: req.auth.escolaId };
    if (alunoId) where.alunoId = alunoId;
    const relatorios = await prisma.relatorioAluno.findMany({ where, include: { aluno: { select: { nome: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(relatorios);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar relatórios.');
  }
});

app.post('/api/escola/relatorios-aluno', exigirProfessor, async (req, res) => {
  try {
    const quemPede = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true, papel: true } });
    if (!quemPede) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const { alunoId, descricao, anexoUrl } = req.body;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId é obrigatório.' });
    const aluno = await prisma.aluno.findFirst({ where: { id: alunoId, escolaId: quemPede.escolaId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });

    const autorTipo = ['DONO', 'GESTOR'].includes(quemPede.papel) ? 'COORDENACAO' : 'PROFESSOR';
    const relatorio = await prisma.relatorioAluno.create({
      data: { alunoId, descricao: descricao?.trim() || null, anexoUrl: anexoUrl || null, autorTipo, escolaId: quemPede.escolaId },
    });
    res.status(201).json(relatorio);
  } catch (err) {
    tratarErro(err, res, 'Erro ao criar relatório.');
  }
});

// GET /api/escola/coordenacao/resumo — sessões por curso: cronograma
// vigente (mais recente por tipo), média de avaliação (nota do professor e
// nota da escola, entre os alunos matriculados naquele curso via Turma) e
// contagem de relatórios dos alunos daquele curso.
app.get('/api/escola/coordenacao/resumo', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'coordenacao');
    if (!professor) return;

    const cursos = await prisma.curso.findMany({ where: { escolaId: professor.escolaId, ativo: true }, orderBy: { nome: 'asc' } });

    const resumo = await Promise.all(cursos.map(async (curso) => {
      const [cronogramas, matriculasDoCurso] = await Promise.all([
        prisma.cronogramaConteudo.findMany({
          where: { cursoId: curso.id },
          include: { professor: { select: { nome: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.matricula.findMany({ where: { turma: { cursoId: curso.id } }, select: { alunoId: true } }),
      ]);

      const alunoIds = [...new Set(matriculasDoCurso.map((m) => m.alunoId))];
      const avaliacoes = alunoIds.length
        ? await prisma.avaliacao.findMany({ where: { alunoId: { in: alunoIds }, mesReferencia: { not: null } }, select: { nota: true, notaEscola: true } })
        : [];
      const relatoriosCount = alunoIds.length
        ? await prisma.relatorioAluno.count({ where: { alunoId: { in: alunoIds } } })
        : 0;

      const mediaProfessor = avaliacoes.length ? avaliacoes.reduce((acc, a) => acc + a.nota, 0) / avaliacoes.length : null;
      const comNotaEscola = avaliacoes.filter((a) => a.notaEscola != null);
      const mediaEscola = comNotaEscola.length ? comNotaEscola.reduce((acc, a) => acc + (a.notaEscola || 0), 0) / comNotaEscola.length : null;

      return {
        curso: { id: curso.id, nome: curso.nome },
        cronogramaUniversal: cronogramas.find((c) => c.tipo === 'UNIVERSAL') || null,
        cronogramasPessoais: cronogramas.filter((c) => c.tipo === 'PESSOAL'),
        mediaAvaliacaoProfessor: mediaProfessor,
        mediaAvaliacaoEscola: mediaEscola,
        totalRelatorios: relatoriosCount,
      };
    }));

    res.json(resumo);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar resumo da coordenação.');
  }
});

app.get('/api/pacotes-credito', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const pacotes = await prisma.pacoteCredito.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { horas: 'asc' } });
    res.json(pacotes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/pacotes-credito', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, horas } = req.body;
    if (!nome?.trim() || typeof horas !== 'number' || horas <= 0) {
      return res.status(400).json({ erro: 'nome e horas (número > 0) são obrigatórios.' });
    }
    const pacote = await prisma.pacoteCredito.create({ data: { nome: nome.trim(), horas, escolaId: req.auth.escolaId } });
    res.status(201).json(pacote);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar pacote de crédito.' });
  }
});

// POST /api/alunos/:id/creditos — professor concede um pacote de crédito
// pro próprio aluno (mesmo modelo de confiança que já existe pra
// pagamento/comprovante: sem gateway processando isso — é um registro
// manual). "horas" fica gravado como snapshot do pacote no momento da
// concessão, igual ValorPlano snapshotta preço.
app.post('/api/alunos/:id/creditos', exigirProfessor, async (req, res) => {
  try {
    const alunoAlvo = await prisma.aluno.findUnique({ where: { id: req.params.id }, select: { professorId: true, escolaId: true } });
    if (!alunoAlvo || alunoAlvo.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aluno não encontrado.' });
    }
    const { pacoteCreditoId } = req.body;
    const pacote = await prisma.pacoteCredito.findFirst({ where: { id: pacoteCreditoId, escolaId: alunoAlvo.escolaId } });
    if (!pacote) return res.status(400).json({ erro: 'Pacote de crédito não encontrado.' });

    const compra = await prisma.compraCredito.create({
      data: { alunoId: req.params.id, pacoteCreditoId: pacote.id, horas: pacote.horas },
    });
    res.status(201).json(compra);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao conceder crédito.' });
  }
});

// Saldo é sempre computado na hora, nunca guardado — soma de crédito
// concedido menos soma de reserva ativa. Ver comentário no schema.prisma.
async function calcularSaldoCredito(tx, alunoId) {
  const [compras, reservas] = await Promise.all([
    tx.compraCredito.aggregate({ where: { alunoId }, _sum: { horas: true } }),
    tx.reservaSala.aggregate({ where: { alunoId, ativa: true }, _sum: { horas: true } }),
  ]);
  return (compras._sum.horas || 0) - (reservas._sum.horas || 0);
}

app.get('/api/aluno/creditos/saldo', exigirAluno, async (req, res) => {
  try {
    const saldo = await calcularSaldoCredito(prisma, req.auth.id);
    res.json({ saldo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/alunos/:id/creditos — professor vê o saldo e o histórico de
// crédito concedido/gasto de um aluno seu, pra decidir se concede mais
// antes de o aluno pedir. Mesmo cálculo de saldo do lado aluno.
app.get('/api/alunos/:id/creditos', exigirProfessor, async (req, res) => {
  try {
    const alunoAlvo = await prisma.aluno.findUnique({ where: { id: req.params.id }, select: { professorId: true } });
    if (!alunoAlvo || alunoAlvo.professorId !== req.auth.id) {
      return res.status(404).json({ erro: 'Aluno não encontrado.' });
    }
    const [saldo, compras, reservas] = await Promise.all([
      calcularSaldoCredito(prisma, req.params.id),
      prisma.compraCredito.findMany({
        where: { alunoId: req.params.id },
        include: { pacoteCredito: { select: { nome: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.reservaSala.findMany({
        where: { alunoId: req.params.id },
        include: { sala: { select: { nome: true } } },
        orderBy: { dataHoraInicio: 'desc' },
      }),
    ]);
    res.json({ saldo, compras, reservas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/salas', exigirAluno, async (req, res) => {
  try {
    const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
    const salas = await prisma.sala.findMany({ where: { escolaId: aluno.escolaId, ativa: true }, orderBy: { nome: 'asc' } });
    res.json(salas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/aluno/reservas — critério de pronto de S2.3: sem crédito
// suficiente, nem entra na transação. Recalcula o saldo dentro da própria
// transação (não reaproveita um valor lido antes) pra reduzir — não
// eliminar por completo, isso exigiria lock explícito — a janela de corrida
// entre duas reservas simultâneas do mesmo aluno.
app.post('/api/aluno/reservas', exigirAluno, async (req, res) => {
  try {
    const { salaId, dataHoraInicio, horas } = req.body;
    if (!salaId || !dataHoraInicio || typeof horas !== 'number' || horas <= 0) {
      return res.status(400).json({ erro: 'salaId, dataHoraInicio e horas (número > 0) são obrigatórios.' });
    }
    const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
    const sala = await prisma.sala.findFirst({ where: { id: salaId, escolaId: aluno.escolaId, ativa: true } });
    if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });

    const resultado = await prisma.$transaction(async (tx) => {
      const saldo = await calcularSaldoCredito(tx, req.auth.id);
      if (horas > saldo) {
        return { erro: `Crédito insuficiente. Saldo atual: ${saldo}h, pedido: ${horas}h.` };
      }
      const reserva = await tx.reservaSala.create({
        data: { alunoId: req.auth.id, salaId, escolaId: aluno.escolaId, dataHoraInicio: new Date(dataHoraInicio), horas },
      });
      return { reserva };
    });

    if (resultado.erro) return res.status(400).json({ erro: resultado.erro });
    res.status(201).json(resultado.reserva);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao reservar sala.' });
  }
});

app.get('/api/aluno/reservas', exigirAluno, async (req, res) => {
  try {
    const reservas = await prisma.reservaSala.findMany({
      where: { alunoId: req.auth.id },
      include: { sala: { select: { nome: true } } },
      orderBy: { dataHoraInicio: 'desc' },
    });
    res.json(reservas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PUT /api/reservas/:id/cancelar — dono (aluno) ou professor da Escola.
// Devolve a hora pro saldo automaticamente (saldo é computado excluindo
// reserva inativa, sem passo de estorno separado).
app.put('/api/reservas/:id/cancelar', autenticar, async (req, res) => {
  try {
    const reserva = await prisma.reservaSala.findUnique({ where: { id: req.params.id } });
    if (!reserva) return res.status(404).json({ erro: 'Reserva não encontrada.' });

    let autorizado = false;
    if (req.auth.papel === 'aluno' && reserva.alunoId === req.auth.id) {
      autorizado = true;
    } else if (req.auth.papel === 'professor') {
      const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
      autorizado = professor?.escolaId === reserva.escolaId;
    }
    if (!autorizado) return res.status(404).json({ erro: 'Reserva não encontrada.' });

    await prisma.reservaSala.update({ where: { id: reserva.id }, data: { ativa: false } });
    res.json({ mensagem: 'Reserva cancelada. Crédito devolvido.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao cancelar reserva.');
  }
});

app.get('/api/escola/reservas', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const reservas = await prisma.reservaSala.findMany({
      where: { escolaId: req.auth.escolaId, ativa: true },
      include: { aluno: { select: { nome: true } }, sala: { select: { nome: true } } },
      orderBy: { dataHoraInicio: 'asc' },
    });
    res.json(reservas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 10e-2. COBRANÇA AUTOMÁTICA ALUNO → ESCOLA (Fase 3, S3.1)
//
// Não confundir com a assinatura Stripe já existente (Professor.stripeCustomerId
// etc, seção CHECKOUT mais abaixo): aquela é a Escola pagando o Kav Class,
// numa Subscription na conta da própria plataforma. Esta aqui é o Aluno
// pagando a Escola, via Stripe Connect Express — cada Escola tem sua própria
// conta conectada e recebe direto (destination charge, sem
// application_fee_amount: cobrança automática é benefício incluso no Pacote
// Escola nesta sprint, não uma nova linha de receita da plataforma).
//
// Decisão registrada em 2026-08-31: Connect Express, sem taxa extra, cartão
// salvo via Checkout Session em mode:'setup' — mesmo padrão hospedado já
// usado na assinatura do professor (WebBrowser abrindo a Checkout Session,
// sem SDK nativo de pagamento dentro do app). Cobrança recorrente de
// verdade via PaymentIntent off_session (função cron mais acima), não link
// mensal reenviado na mão.
// ============================================================================

// GET /api/escola/stripe-connect/status — GESTOR/DONO. Sempre revalida
// contra o Stripe (não só a coluna local), porque onboarding pode avançar
// direto no painel do Stripe, fora do fluxo do app.
app.get('/api/escola/stripe-connect/status', async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const escola = await prisma.escola.findUnique({
      where: { id: professor.escolaId },
      select: { stripeConnectAccountId: true, stripeConnectOnboardingCompleto: true },
    });

    if (!escola.stripeConnectAccountId) {
      return res.json({ conectado: false, onboardingCompleto: false });
    }

    const conta = await stripe.accounts.retrieve(escola.stripeConnectAccountId);
    const completo = !!(conta.charges_enabled && conta.payouts_enabled);
    if (completo !== escola.stripeConnectOnboardingCompleto) {
      await prisma.escola.update({ where: { id: professor.escolaId }, data: { stripeConnectOnboardingCompleto: completo } });
    }
    res.json({
      conectado: true,
      onboardingCompleto: completo,
      chargesEnabled: !!conta.charges_enabled,
      payoutsEnabled: !!conta.payouts_enabled,
      detailsSubmitted: !!conta.details_submitted,
    });
  } catch (err) {
    console.error('[StripeConnect] Erro ao consultar status:', err.message);
    res.status(500).json({ erro: 'Erro ao consultar status da conta Stripe.' });
  }
});

// POST /api/escola/stripe-connect/iniciar — cria (se não existir) a conta
// conectada Express da Escola e devolve o link de onboarding hospedado pelo
// próprio Stripe. Reexecutável: se a conta já existe mas o onboarding não
// foi terminado, gera um novo Account Link pra continuar de onde parou.
app.post('/api/escola/stripe-connect/iniciar', async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const escola = await prisma.escola.findUnique({ where: { id: professor.escolaId } });
    let accountId = escola.stripeConnectAccountId;

    if (!accountId) {
      const conta = await stripe.accounts.create({
        type: 'express',
        country: 'BR',
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { escolaId: professor.escolaId },
      });
      accountId = conta.id;
      await prisma.escola.update({ where: { id: professor.escolaId }, data: { stripeConnectAccountId: accountId } });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `https://kav-class-1.onrender.com/stripe-connect/atualizar?escolaId=${professor.escolaId}`,
      return_url: 'https://kav-class-1.onrender.com/stripe-connect/retorno',
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || 'Erro ao iniciar conexão com Stripe.';
    console.error('[StripeConnect] Erro ao iniciar onboarding:', msg);
    res.status(500).json({ erro: msg });
  }
});

// ============================================================================
// PAYWALL / CONTEÚDO PREMIUM — Rede Social Fase 5. Reaproveita a MESMA
// conta Stripe Connect da Escola do professor (stub pessoal, se SELF
// autônomo) já usada pra cobrança automática Aluno→Escola logo abaixo —
// nenhuma infraestrutura de pagamento nova. Diferente daquele fluxo
// (cron + PaymentIntent avulso), aqui é uma stripe.subscriptions de
// verdade: o Stripe cobra o ciclo mensal sozinho, sem cron nosso.
// ============================================================================

// PUT /api/professor/premium/configurar — define/atualiza o preço mensal do
// conteúdo exclusivo. Exige a MESMA conta Stripe Connect da Escola do
// professor já onboardada (GET/POST /api/escola/stripe-connect/*, acima) —
// sem isso não tem pra onde o dinheiro do assinante ir.
app.put('/api/professor/premium/configurar', exigirProfessor, async (req, res) => {
  try {
    const { precoAssinaturaPremium } = req.body;
    const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    if (precoAssinaturaPremium !== null && precoAssinaturaPremium !== undefined) {
      const preco = Number(precoAssinaturaPremium);
      if (!(preco > 0)) return res.status(400).json({ erro: 'precoAssinaturaPremium deve ser maior que zero.' });

      const escola = await prisma.escola.findUnique({ where: { id: professor.escolaId }, select: { stripeConnectOnboardingCompleto: true } });
      if (!escola?.stripeConnectOnboardingCompleto) {
        return res.status(400).json({ erro: 'Conecte sua conta Stripe (Financeiro) antes de ativar o conteúdo premium.' });
      }
    }

    const atualizado = await prisma.professor.update({
      where: { id: req.auth.id },
      data: { precoAssinaturaPremium: precoAssinaturaPremium === null ? null : Number(precoAssinaturaPremium) },
      select: { precoAssinaturaPremium: true },
    });
    res.json({ mensagem: 'Configuração premium atualizada!', precoAssinaturaPremium: atualizado.precoAssinaturaPremium });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao configurar conteúdo premium.' });
  }
});

// POST /api/professores/:id/premium/assinar — aluno inicia assinatura do
// conteúdo premium de um professor. Sempre reaproveita/recria a MESMA linha
// AssinaturaPremium (unique [alunoId, professorId]) — reassinar depois de
// cancelar não gera duplicata.
app.post('/api/professores/:id/premium/assinar', exigirAluno, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const professor = await prisma.professor.findUnique({
      where: { id: req.params.id },
      select: { id: true, nome: true, escolaId: true, precoAssinaturaPremium: true },
    });
    if (!professor?.precoAssinaturaPremium) {
      return res.status(400).json({ erro: 'Este professor não oferece conteúdo premium.' });
    }

    const escola = await prisma.escola.findUnique({
      where: { id: professor.escolaId },
      select: { stripeConnectAccountId: true, stripeConnectOnboardingCompleto: true },
    });
    if (!escola?.stripeConnectAccountId || !escola.stripeConnectOnboardingCompleto) {
      return res.status(400).json({ erro: 'Este professor ainda não concluiu a configuração de recebimento.' });
    }

    const aluno = await prisma.aluno.findUnique({ where: { id: req.auth.id }, select: { nome: true, email: true } });

    const assinatura = await prisma.assinaturaPremium.upsert({
      where: { alunoId_professorId: { alunoId: req.auth.id, professorId: professor.id } },
      create: { alunoId: req.auth.id, professorId: professor.id, status: 'PENDENTE' },
      update: {},
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: aluno.email,
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: `Conteúdo Premium — ${professor.nome}` },
          unit_amount: Math.round(professor.precoAssinaturaPremium * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      subscription_data: {
        transfer_data: { destination: escola.stripeConnectAccountId },
      },
      metadata: { assinaturaPremiumId: assinatura.id },
      success_url: 'https://kav-class-1.onrender.com/checkout/premium-sucesso?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://kav-class-1.onrender.com/checkout/premium-cancelado',
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || 'Erro ao iniciar assinatura premium.';
    console.error('[Premium] Erro ao iniciar assinatura:', msg);
    res.status(500).json({ erro: msg });
  }
});

// POST /api/professores/:id/premium/cancelar — aluno cancela a própria
// assinatura (mantém acesso até o fim do período já pago, igual à
// assinatura Escola→Kav Class do professor).
app.post('/api/professores/:id/premium/cancelar', exigirAluno, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const assinatura = await prisma.assinaturaPremium.findUnique({
      where: { alunoId_professorId: { alunoId: req.auth.id, professorId: req.params.id } },
    });
    if (!assinatura?.stripeSubscriptionId) return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada.' });

    await stripe.subscriptions.update(assinatura.stripeSubscriptionId, { cancel_at_period_end: true });
    res.json({ mensagem: 'Assinatura cancelada. Você mantém acesso até o fim do período já pago.' });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || 'Erro ao cancelar assinatura.';
    console.error('[Premium] Erro ao cancelar:', msg);
    res.status(500).json({ erro: msg });
  }
});

// GET /api/professores/:id/premium/status — pra tela do aluno decidir se
// mostra "Assinar" ou "Assinante ativo".
app.get('/api/professores/:id/premium/status', exigirAluno, async (req, res) => {
  try {
    const assinatura = await prisma.assinaturaPremium.findUnique({
      where: { alunoId_professorId: { alunoId: req.auth.id, professorId: req.params.id } },
      select: { status: true },
    });
    res.json({ status: assinatura?.status || null, ativa: assinatura?.status === 'ATIVA' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao consultar assinatura.' });
  }
});

// GET /api/matriculas/:id/cobranca-automatica — status atual pra essa
// matrícula específica (tela do aluno/professor na ficha da matrícula).
app.get('/api/matriculas/:id/cobranca-automatica', autenticar, async (req, res) => {
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;
    res.json({
      ativa: matricula.cobrancaAutomaticaAtiva,
      gateway: matricula.gatewayCobranca,
      temCartao: !!matricula.stripePaymentMethodId,
      ultimoErro: matricula.cobrancaUltimoErro,
      ultimaTentativa: matricula.cobrancaUltimaTentativa,
    });
  } catch (err) {
    tratarErro(err, res, 'Erro ao consultar cobrança automática.');
  }
});

// POST /api/matriculas/:id/cobranca-automatica/iniciar — dono da matrícula
// (professor ou o próprio aluno) começa (ou recomeça) o cadastro de cartão.
// Devolve uma Checkout Session hospedada em mode:'setup' — nenhum dado de
// cartão passa pelo nosso backend nem pelo app.
app.post('/api/matriculas/:id/cobranca-automatica/iniciar', autenticar, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    const escola = await prisma.escola.findUnique({
      where: { id: matricula.escolaId },
      select: { stripeConnectAccountId: true, stripeConnectOnboardingCompleto: true },
    });
    if (!escola?.stripeConnectAccountId || !escola.stripeConnectOnboardingCompleto) {
      return res.status(400).json({ erro: 'A Escola ainda não concluiu a configuração de recebimento no Stripe.' });
    }

    let customerId = matricula.stripeCustomerId;
    if (!customerId) {
      const aluno = await prisma.aluno.findUnique({ where: { id: matricula.alunoId }, select: { nome: true, email: true } });
      const customer = await stripe.customers.create({
        name: aluno.nome,
        email: aluno.email,
        metadata: { matriculaId: matricula.id, escolaId: matricula.escolaId },
      });
      customerId = customer.id;
      await prisma.matricula.update({ where: { id: matricula.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: 'https://kav-class-1.onrender.com/checkout/cobranca-sucesso?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://kav-class-1.onrender.com/checkout/cobranca-cancelada',
      metadata: { matriculaId: matricula.id },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || 'Erro ao iniciar cadastro de cartão.';
    console.error('[CobrancaAutomatica] Erro ao iniciar:', msg);
    res.status(500).json({ erro: msg });
  }
});

// GET /api/matriculas/:id/cobranca-automatica/verificar/:sessionId —
// chamado pelo app ao voltar do Checkout hospedado (deep link), espelha o
// mesmo padrão de GET /checkout/verify/:sessionId da assinatura do professor.
app.get('/api/matriculas/:id/cobranca-automatica/verificar/:sessionId', autenticar, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, { expand: ['setup_intent'] });
    if (session.metadata?.matriculaId !== matricula.id) {
      return res.status(400).json({ erro: 'Sessão não corresponde a essa matrícula.' });
    }
    const setupIntent = session.setup_intent;
    if (!setupIntent || setupIntent.status !== 'succeeded') {
      return res.json({ ativo: false });
    }

    const paymentMethodId = String(setupIntent.payment_method);
    await stripe.customers.update(session.customer, { invoice_settings: { default_payment_method: paymentMethodId } });

    const atualizada = await prisma.matricula.update({
      where: { id: matricula.id },
      data: {
        cobrancaAutomaticaAtiva: true,
        stripePaymentMethodId: paymentMethodId,
        cobrancaUltimoErro: null,
      },
    });
    res.json({ ativo: true, matricula: atualizada });
  } catch (err) {
    console.error('[CobrancaAutomatica] Erro ao verificar sessão:', err.message);
    res.status(500).json({ erro: 'Erro ao verificar cadastro do cartão.' });
  }
});

// POST /api/matriculas/:id/cobranca-automatica/desativar — não apaga o
// cartão salvo no Stripe (nem cancela o customer no Asaas), só para de
// cobrar sozinho (reativar depois não precisa recadastrar cartão, a menos
// que o Customer/PaymentMethod tenha sido removido direto no painel do
// gateway). Se o gateway ativo era Asaas, cancela a Subscription de lá —
// sem isso o Asaas continuaria gerando fatura nova a cada ciclo sozinho.
app.post('/api/matriculas/:id/cobranca-automatica/desativar', autenticar, async (req, res) => {
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    if (matricula.gatewayCobranca === 'ASAAS' && matricula.asaasSubscriptionId) {
      try {
        const escola = await prisma.escola.findUnique({
          where: { id: matricula.escolaId },
          select: { asaasApiKeyCriptografada: true },
        });
        await asaasFetch(escola, `/subscriptions/${matricula.asaasSubscriptionId}`, { method: 'DELETE' });
      } catch (err) {
        console.error('[CobrancaAutomatica/Asaas] Erro ao cancelar subscription:', err.message);
      }
    }

    const atualizada = await prisma.matricula.update({
      where: { id: matricula.id },
      data: { cobrancaAutomaticaAtiva: false },
    });
    res.json({ mensagem: 'Cobrança automática desativada.', matricula: atualizada });
  } catch (err) {
    tratarErro(err, res, 'Erro ao desativar cobrança automática.');
  }
});

// GET /api/escola/cobranca-automatica/resumo — GESTOR/DONO: "Painel Resumo
// da Cobrança Automática" do roadmap, separando quem precisa de ação
// (cartão recusado/expirado na última tentativa) de quem está em dia.
app.get('/api/escola/cobranca-automatica/resumo', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const matriculas = await prisma.matricula.findMany({
      where: { escolaId: professor.escolaId, cobrancaAutomaticaAtiva: true },
      include: { aluno: { select: { nome: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const precisamDeAcao = matriculas.filter(m => !!m.cobrancaUltimoErro);
    const emDia = matriculas.filter(m => !m.cobrancaUltimoErro);

    res.json({
      totalAtivas: matriculas.length,
      precisamDeAcao: precisamDeAcao.map(m => ({
        matriculaId: m.id, alunoNome: m.aluno.nome, valorMensalidade: m.valorMensalidade,
        erro: m.cobrancaUltimoErro, ultimaTentativa: m.cobrancaUltimaTentativa, gateway: m.gatewayCobranca,
      })),
      emDia: emDia.map(m => ({
        matriculaId: m.id, alunoNome: m.aluno.nome, valorMensalidade: m.valorMensalidade, diaVencimento: m.diaVencimento, gateway: m.gatewayCobranca,
      })),
    });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar resumo de cobrança automática.');
  }
});

// GET /api/escola/cobranca-automatica/historico — Financeiro → Cobranças
// por Recorrência do roadmap: faturas geradas e cobradas pelo cron, mais
// recentes primeiro.
app.get('/api/escola/cobranca-automatica/historico', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const pagamentos = await prisma.pagamento.findMany({
      where: { viaCobrancaAutomatica: true, aluno: { escolaId: professor.escolaId } },
      include: { aluno: { select: { nome: true } }, matricula: { select: { gatewayCobranca: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(pagamentos);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar histórico de cobrança automática.');
  }
});

// ============================================================================
// 10e-3. COBRANÇA AUTOMÁTICA VIA ASAAS (Pix/Boleto/Cartão), somando ao
// Stripe Connect acima (10e-2). Cada Escola traz a própria conta Asaas (API
// Key própria) — sem subconta/split via plataforma, é a taxa do Asaas caindo
// direto sobre a Escola. Diferente do Stripe, aqui não temos cron próprio
// pra gerar/cobrar fatura: a Subscription do Asaas faz isso sozinha e avisa
// por webhook (ver POST /asaas/webhook, registrado perto do webhook Stripe,
// antes do express.json() global).
// ============================================================================

// GET /api/escola/asaas/status — GESTOR/DONO. Revalida contra o Asaas (não
// só a coluna local) chamando /myAccount, mesmo espírito do status Stripe.
app.get('/api/escola/asaas/status', async (req, res) => {
  if (!ASAAS_ENCRYPTION_KEY) return res.status(503).json({ erro: 'Serviço de pagamento (Asaas) não configurado.' });
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const escola = await prisma.escola.findUnique({
      where: { id: professor.escolaId },
      select: { asaasApiKeyCriptografada: true, asaasApiKeyUltimos4: true },
    });

    if (!escola.asaasApiKeyCriptografada) {
      return res.json({ conectado: false });
    }

    try {
      const conta = await asaasFetch(escola, '/myAccount');
      res.json({ conectado: true, nomeConta: conta.name || conta.email || null, apiKeyUltimos4: escola.asaasApiKeyUltimos4 });
    } catch (err) {
      res.json({ conectado: true, erro: 'Não foi possível validar a chave com o Asaas: ' + err.message, apiKeyUltimos4: escola.asaasApiKeyUltimos4 });
    }
  } catch (err) {
    console.error('[Asaas] Erro ao consultar status:', err.message);
    res.status(500).json({ erro: 'Erro ao consultar status da conta Asaas.' });
  }
});

// POST /api/escola/asaas/conectar — GESTOR/DONO cola a própria API Key do
// Asaas. Valida contra /myAccount ANTES de salvar (não confia sem checar).
// Gera o asaasWebhookToken na primeira conexão — a Escola cola esse valor
// no próprio painel Asaas dela (Configurações → Webhooks → token de
// autenticação), porque não temos como registrar webhook por conta de
// terceiro via API.
app.post('/api/escola/asaas/conectar', async (req, res) => {
  if (!ASAAS_ENCRYPTION_KEY) return res.status(503).json({ erro: 'Serviço de pagamento (Asaas) não configurado.' });
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const { apiKey } = req.body;
    if (!apiKey?.trim()) return res.status(400).json({ erro: 'apiKey é obrigatória.' });
    const apiKeyLimpa = apiKey.trim();

    let conta;
    try {
      conta = await asaasFetch({ asaasApiKeyCriptografada: criptografarAsaasApiKey(apiKeyLimpa) }, '/myAccount');
    } catch (err) {
      return res.status(400).json({ erro: 'Não foi possível validar essa chave com o Asaas: ' + err.message });
    }

    const escolaAtual = await prisma.escola.findUnique({ where: { id: professor.escolaId }, select: { asaasWebhookToken: true } });
    const webhookToken = escolaAtual.asaasWebhookToken || crypto.randomBytes(24).toString('hex');

    await prisma.escola.update({
      where: { id: professor.escolaId },
      data: {
        asaasApiKeyCriptografada: criptografarAsaasApiKey(apiKeyLimpa),
        asaasApiKeyUltimos4: apiKeyLimpa.slice(-4),
        asaasWebhookToken: webhookToken,
      },
    });

    res.json({
      ok: true,
      nomeConta: conta.name || conta.email || null,
      webhookUrl: 'https://kav-class-1.onrender.com/asaas/webhook',
      webhookToken,
    });
  } catch (err) {
    console.error('[Asaas] Erro ao conectar:', err.message);
    res.status(500).json({ erro: 'Erro ao conectar com o Asaas.' });
  }
});

// POST /api/escola/asaas/desconectar — bloqueia se ainda existir matrícula
// com cobrança Asaas ativa (mesmo espírito de outros gates do arquivo, ex:
// contrato pendente bloqueando fatura) — pede pra desativar as matrículas
// primeiro, senão a Subscription continuaria cobrando lá no Asaas sem
// ninguém acompanhando por aqui.
app.post('/api/escola/asaas/desconectar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const ativas = await prisma.matricula.count({
      where: { escolaId: professor.escolaId, gatewayCobranca: 'ASAAS', cobrancaAutomaticaAtiva: true },
    });
    if (ativas > 0) {
      return res.status(400).json({ erro: `Existem ${ativas} matrícula(s) com cobrança via Asaas ativa. Desative-as antes de desconectar.` });
    }

    await prisma.escola.update({
      where: { id: professor.escolaId },
      data: { asaasApiKeyCriptografada: null, asaasApiKeyUltimos4: null },
    });
    res.json({ mensagem: 'Asaas desconectado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao desconectar o Asaas.');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// FISCAL — categoria nova no INSTITUTION (Sprints 27/28, briefing
// 24/09/2026): "escola exija que ele emita a nota fiscal pra receber o
// pagamento, que pelo sistema ela já faça tudo automatizado". Duas
// direções: Escola emite pro Aluno (esta seção) e Professor emite pra
// Escola (seção seguinte, mais abaixo perto da folha de pagamento).
// ═══════════════════════════════════════════════════════════════════════

// POST /api/escola/fiscal/notaas/cadastrar-empresa — dá de alta a Escola
// como empresa fiscal sob a NOSSA organização Notaas (26/09/2026): a escola
// nunca precisa ter conta própria na Notaas, só informa os dados fiscais
// dela e sobe o certificado digital A1 (.pfx) do próprio CNPJ (exigência
// legal de assinatura da nota — não elimina isso, só elimina a burocracia
// de abrir conta lá).
app.post('/api/escola/fiscal/notaas/cadastrar-empresa', async (req, res) => {
  if (!ASAAS_ENCRYPTION_KEY) return res.status(503).json({ erro: 'Serviço fiscal não configurado nesta instância.' });
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;

    const {
      razaoSocial, cnpj, inscricaoMunicipal, inscricaoEstadual, regimeTributario, codigoMunicipio,
      certificadoBase64, certificadoNomeArquivo, senhaCertificado,
    } = req.body;
    if (!razaoSocial?.trim() || !cnpj?.trim() || !codigoMunicipio?.trim()) {
      return res.status(400).json({ erro: 'razaoSocial, cnpj e codigoMunicipio são obrigatórios.' });
    }
    if (!certificadoBase64 || !senhaCertificado) {
      return res.status(400).json({ erro: 'Envie o certificado digital A1 (.pfx) e a senha dele.' });
    }

    const escolaAtual = await prisma.escola.findUnique({ where: { id: professor.escolaId }, select: { nome: true, notaasWebhookToken: true } });
    const webhookToken = escolaAtual.notaasWebhookToken || crypto.randomBytes(24).toString('hex');

    let resultado;
    try {
      resultado = await criarEmpresaFiscalNotaas({
        nomeProjeto: `escola-${professor.escolaId}`,
        cnpj: cnpj.trim(), razaoSocial: razaoSocial.trim(),
        inscricaoMunicipal: inscricaoMunicipal?.trim() || undefined,
        inscricaoEstadual: inscricaoEstadual?.trim() || undefined,
        regimeTributario: regimeTributario?.trim() || undefined,
        codigoMunicipio: codigoMunicipio.trim(),
        certificadoBase64, certificadoNomeArquivo, senhaCertificado,
      });
      const apiKeyCriptografada = criptografarNotaasApiKey(resultado.apiKey);
      await registrarWebhookNotaas(apiKeyCriptografada, webhookToken);

      await prisma.escola.update({
        where: { id: professor.escolaId },
        data: {
          razaoSocial: razaoSocial.trim(), cnpj: cnpj.trim(),
          inscricaoMunicipal: inscricaoMunicipal?.trim() || null,
          inscricaoEstadual: inscricaoEstadual?.trim() || null,
          regimeTributario: regimeTributario?.trim() || null,
          codigoMunicipio: codigoMunicipio.trim(),
          notaasOrgProjectId: resultado.projetoId,
          notaasApiKeyCriptografada: apiKeyCriptografada,
          notaasApiKeyUltimos4: resultado.apiKey.slice(-4),
          notaasWebhookToken: webhookToken,
          notaasCertificadoNomeArquivo: resultado.certificadoNomeArquivo,
          notaasCertificadoValidoAte: resultado.certificadoValidoAte ? new Date(resultado.certificadoValidoAte) : null,
        },
      });
    } catch (err) {
      return res.status(err.status && err.status < 500 ? 400 : 502).json({ erro: 'Não foi possível cadastrar a empresa fiscal na Notaas: ' + err.message });
    }

    res.json({ ok: true, mensagem: 'Empresa fiscal cadastrada! A escola já pode emitir notas.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao cadastrar empresa fiscal.');
  }
});

app.post('/api/escola/fiscal/notaas/desconectar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;
    await prisma.escola.update({
      where: { id: professor.escolaId },
      data: { notaasApiKeyCriptografada: null, notaasApiKeyUltimos4: null, notaasOrgProjectId: null, notaasCertificadoNomeArquivo: null, notaasCertificadoValidoAte: null },
    });
    res.json({ mensagem: 'Notaas desconectado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao desconectar a Notaas.');
  }
});

app.get('/api/escola/fiscal/configuracao', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;
    const escola = await prisma.escola.findUnique({
      where: { id: professor.escolaId },
      select: {
        razaoSocial: true, cnpj: true, inscricaoMunicipal: true, inscricaoEstadual: true, regimeTributario: true, codigoMunicipio: true,
        notaasCodigoServicoPadrao: true, notaasAliquotaIssPadrao: true,
        notaasApiKeyUltimos4: true, notaasCertificadoNomeArquivo: true, notaasCertificadoValidoAte: true,
        exigeNotaProfessor: true,
      },
    });
    res.json({ ...escola, notaasConectado: !!escola.notaasApiKeyUltimos4, fiscalDisponivel: NOTAAS_FISCAL_DISPONIVEL });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar configuração fiscal.');
  }
});

app.put('/api/escola/fiscal/configuracao', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;
    const { notaasCodigoServicoPadrao, notaasAliquotaIssPadrao, exigeNotaProfessor } = req.body;
    const data = {};
    if (notaasCodigoServicoPadrao !== undefined) data.notaasCodigoServicoPadrao = notaasCodigoServicoPadrao?.trim() || null;
    if (notaasAliquotaIssPadrao !== undefined) data.notaasAliquotaIssPadrao = notaasAliquotaIssPadrao === null ? null : Number(notaasAliquotaIssPadrao);
    if (typeof exigeNotaProfessor === 'boolean') data.exigeNotaProfessor = exigeNotaProfessor;
    await prisma.escola.update({ where: { id: professor.escolaId }, data });
    res.json({ mensagem: 'Configuração fiscal atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar configuração fiscal.');
  }
});

// GET /api/escola/fiscal/pendentes — pagamentos já PAGOs que ainda não têm
// nota emitida (aba "Pendentes" da categoria Fiscal).
app.get('/api/escola/fiscal/pendentes', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;
    const pendentes = await prisma.pagamento.findMany({
      where: { professor: { escolaId: professor.escolaId }, status: 'PAGO', notaFiscal: null },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataPagamento: 'desc' },
      take: 200,
    });
    res.json(pendentes);
  } catch (err) {
    tratarErro(err, res, 'Erro ao listar pagamentos pendentes de nota.');
  }
});

app.get('/api/escola/fiscal/notas', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;
    const notas = await prisma.notaFiscal.findMany({
      where: { escolaId: professor.escolaId },
      include: {
        pagamento: { select: { id: true, valor: true, aluno: { select: { nome: true } } } },
        folhaPagamento: { select: { id: true, mes: true, ano: true, professor: { select: { nome: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notas);
  } catch (err) {
    tratarErro(err, res, 'Erro ao listar notas fiscais.');
  }
});

// POST /api/escola/pagamentos/:id/emitir-nota — emissão manual (a escola
// escolhe quais pagamentos viram nota, botão por botão) — diferente da
// emissão automática do professor pra escola (mais abaixo), que dispara
// sozinha ao fechar a folha. Emitir nota fiscal de verdade tem consequência
// tributária real, então esta direção fica sempre como ação explícita da
// escola, nunca automática por padrão.
app.post('/api/escola/pagamentos/:id/emitir-nota', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'fiscal');
    if (!professor) return;

    const escola = await prisma.escola.findUnique({
      where: { id: professor.escolaId },
      select: { nome: true, notaasApiKeyCriptografada: true, notaasCodigoServicoPadrao: true, notaasAliquotaIssPadrao: true },
    });
    if (!escola?.notaasApiKeyCriptografada) return res.status(400).json({ erro: 'Conecte a Notaas em Fiscal → Configurações antes de emitir notas.' });

    const pagamento = await prisma.pagamento.findFirst({
      where: { id: req.params.id, professor: { escolaId: professor.escolaId } },
      include: {
        aluno: { select: { nome: true, cpf: true, email: true, responsavel: { select: { nome: true, cpf: true, email: true } } } },
        notaFiscal: true,
      },
    });
    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado nesta Escola.' });
    if (pagamento.notaFiscal) return res.status(400).json({ erro: 'Esse pagamento já tem nota fiscal.' });

    const { codigoServico, descricaoServico } = req.body;
    const codigo = codigoServico?.trim() || escola.notaasCodigoServicoPadrao;
    if (!codigo) return res.status(400).json({ erro: 'Informe o código de serviço (ou configure um padrão em Fiscal → Configurações).' });

    // Responsável financeiro tem prioridade sobre o próprio aluno (é quem
    // efetivamente paga, quando existe — ver ResponsavelFinanceiro).
    const tomadorNome = pagamento.aluno.responsavel?.nome || pagamento.aluno.nome;
    const tomadorDocumento = pagamento.aluno.responsavel?.cpf || pagamento.aluno.cpf;
    const tomadorEmail = pagamento.aluno.responsavel?.email || pagamento.aluno.email;

    const notaFiscal = await prisma.notaFiscal.create({
      data: { tipo: 'ALUNO_PARA_ESCOLA', valor: pagamento.valor, escolaId: professor.escolaId, pagamentoId: pagamento.id },
    });

    try {
      // ⚠️ campo "cnpj" no tomador é o único documentado publicamente pra
      // identificação fiscal de quem recebe a nota — não confirmado se a
      // Notaas espera um campo "cpf" separado pra pessoa física. Validar
      // contra sandbox real antes de confiar cego (ver runbook).
      const resposta = await notaasFetch(escola.notaasApiKeyCriptografada, '/emitir', {
        method: 'POST',
        headers: { 'Idempotency-Key': notaFiscal.id },
        body: JSON.stringify({
          tomador: { nome: tomadorNome, cnpj: tomadorDocumento || undefined, email: tomadorEmail || undefined },
          servico: { codigo, descricao: descricaoServico?.trim() || 'Mensalidade de curso' },
          valores: { total: pagamento.valor, aliquotaIss: escola.notaasAliquotaIssPadrao || undefined },
        }),
      });
      await prisma.notaFiscal.update({ where: { id: notaFiscal.id }, data: { notaasInvoiceId: resposta.invoiceId } });
      res.status(201).json({ mensagem: 'Nota em processamento — o status atualiza sozinho quando a Notaas confirmar (webhook).', notaFiscalId: notaFiscal.id });
    } catch (err) {
      await prisma.notaFiscal.update({ where: { id: notaFiscal.id }, data: { status: 'ERRO', erro: err.message } });
      res.status(err.status || 500).json({ erro: 'Erro ao emitir nota: ' + err.message });
    }
  } catch (err) {
    tratarErro(err, res, 'Erro ao emitir nota fiscal.');
  }
});

// ─── Fiscal do professor (Sprint 28) — quando a Escola exige nota pra
// liberar o pagamento, é o professor quem fatura a Escola com o PRÓPRIO
// Notaas (CNPJ próprio, MEI/PJ) — nunca o da Escola.

app.get('/api/professor/fiscal', exigirProfessor, async (req, res) => {
  try {
    const professor = await prisma.professor.findUnique({
      where: { id: req.auth.id },
      select: {
        razaoSocial: true, cnpj: true, inscricaoMunicipal: true, inscricaoEstadual: true, regimeTributario: true, codigoMunicipio: true,
        notaasApiKeyUltimos4: true, notaasCodigoServicoPadrao: true, notaasAliquotaIssPadrao: true,
        notaasCertificadoNomeArquivo: true, notaasCertificadoValidoAte: true,
        escola: { select: { exigeNotaProfessor: true, nome: true } },
      },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    const notas = await prisma.notaFiscal.findMany({
      where: { professorId: req.auth.id, tipo: 'PROFESSOR_PARA_ESCOLA' },
      include: { folhaPagamento: { select: { mes: true, ano: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      ...professor,
      notaasConectado: !!professor.notaasApiKeyUltimos4,
      fiscalDisponivel: NOTAAS_FISCAL_DISPONIVEL,
      exigidoPelaEscola: professor.escola.exigeNotaProfessor,
      escolaNome: professor.escola.nome,
      notas,
    });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar dados fiscais.');
  }
});

app.put('/api/professor/fiscal/configuracao', exigirProfessor, async (req, res) => {
  try {
    const { notaasCodigoServicoPadrao, notaasAliquotaIssPadrao } = req.body;
    const data = {};
    if (notaasCodigoServicoPadrao !== undefined) data.notaasCodigoServicoPadrao = notaasCodigoServicoPadrao?.trim() || null;
    if (notaasAliquotaIssPadrao !== undefined) data.notaasAliquotaIssPadrao = notaasAliquotaIssPadrao === null ? null : Number(notaasAliquotaIssPadrao);
    await prisma.professor.update({ where: { id: req.auth.id }, data });
    res.json({ mensagem: 'Configuração fiscal atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar configuração fiscal.');
  }
});

// POST /api/professor/fiscal/notaas/cadastrar-empresa — mesmo modelo da
// Escola (26/09/2026): o professor informa os PRÓPRIOS dados fiscais
// (CNPJ MEI/PJ) e sobe o PRÓPRIO certificado A1 — a KAV CLASS cadastra o
// projeto sob a nossa organização Notaas, o professor nunca abre conta lá.
app.post('/api/professor/fiscal/notaas/cadastrar-empresa', exigirProfessor, async (req, res) => {
  if (!ASAAS_ENCRYPTION_KEY) return res.status(503).json({ erro: 'Serviço fiscal não configurado nesta instância.' });
  try {
    const {
      razaoSocial, cnpj, inscricaoMunicipal, inscricaoEstadual, regimeTributario, codigoMunicipio,
      certificadoBase64, certificadoNomeArquivo, senhaCertificado,
    } = req.body;
    if (!razaoSocial?.trim() || !cnpj?.trim() || !codigoMunicipio?.trim()) {
      return res.status(400).json({ erro: 'razaoSocial, cnpj e codigoMunicipio são obrigatórios.' });
    }
    if (!certificadoBase64 || !senhaCertificado) {
      return res.status(400).json({ erro: 'Envie o certificado digital A1 (.pfx) e a senha dele.' });
    }

    const professorAtual = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { notaasWebhookToken: true } });
    const webhookToken = professorAtual.notaasWebhookToken || crypto.randomBytes(24).toString('hex');

    let resultado;
    try {
      resultado = await criarEmpresaFiscalNotaas({
        nomeProjeto: `professor-${req.auth.id}`,
        cnpj: cnpj.trim(), razaoSocial: razaoSocial.trim(),
        inscricaoMunicipal: inscricaoMunicipal?.trim() || undefined,
        inscricaoEstadual: inscricaoEstadual?.trim() || undefined,
        regimeTributario: regimeTributario?.trim() || undefined,
        codigoMunicipio: codigoMunicipio.trim(),
        certificadoBase64, certificadoNomeArquivo, senhaCertificado,
      });
      const apiKeyCriptografada = criptografarNotaasApiKey(resultado.apiKey);
      await registrarWebhookNotaas(apiKeyCriptografada, webhookToken);

      await prisma.professor.update({
        where: { id: req.auth.id },
        data: {
          razaoSocial: razaoSocial.trim(), cnpj: cnpj.trim(),
          inscricaoMunicipal: inscricaoMunicipal?.trim() || null,
          inscricaoEstadual: inscricaoEstadual?.trim() || null,
          regimeTributario: regimeTributario?.trim() || null,
          codigoMunicipio: codigoMunicipio.trim(),
          notaasOrgProjectId: resultado.projetoId,
          notaasApiKeyCriptografada: apiKeyCriptografada,
          notaasApiKeyUltimos4: resultado.apiKey.slice(-4),
          notaasWebhookToken: webhookToken,
          notaasCertificadoNomeArquivo: resultado.certificadoNomeArquivo,
          notaasCertificadoValidoAte: resultado.certificadoValidoAte ? new Date(resultado.certificadoValidoAte) : null,
        },
      });
    } catch (err) {
      return res.status(err.status && err.status < 500 ? 400 : 502).json({ erro: 'Não foi possível cadastrar sua empresa fiscal na Notaas: ' + err.message });
    }

    res.json({ ok: true, mensagem: 'Empresa fiscal cadastrada! Suas notas pra escola agora saem automaticamente.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao cadastrar empresa fiscal.');
  }
});

app.post('/api/professor/fiscal/notaas/desconectar', exigirProfessor, async (req, res) => {
  try {
    await prisma.professor.update({
      where: { id: req.auth.id },
      data: { notaasApiKeyCriptografada: null, notaasApiKeyUltimos4: null, notaasOrgProjectId: null, notaasCertificadoNomeArquivo: null, notaasCertificadoValidoAte: null },
    });
    res.json({ mensagem: 'Notaas desconectado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao desconectar a Notaas.');
  }
});

// Emissão automática da nota professor→Escola (chamada de dentro de
// PUT /api/escola/folha-pagamento/:id/status quando a folha fecha, ver mais
// abaixo). Não bloqueia o fechamento da folha se o professor ainda não
// conectou a Notaas — registra a pendência com erro claro e avisa o
// professor por push, em vez de travar o financeiro da escola inteira.
async function emitirNotaFolhaPagamento(folha) {
  const jaExiste = await prisma.notaFiscal.findUnique({ where: { folhaPagamentoId: folha.id } });
  if (jaExiste) return;

  const valor = folha.valorAjustado ?? folha.valorCalculado;
  const notaFiscal = await prisma.notaFiscal.create({
    data: { tipo: 'PROFESSOR_PARA_ESCOLA', valor, escolaId: folha.escolaId, professorId: folha.professorId, folhaPagamentoId: folha.id },
  });

  if (!folha.professor.notaasApiKeyCriptografada) {
    await prisma.notaFiscal.update({ where: { id: notaFiscal.id }, data: { status: 'ERRO', erro: 'Professor ainda não conectou a própria conta Notaas.' } });
    if (folha.professor.expoPushToken) {
      enviarPushNotificacao(
        folha.professor.expoPushToken,
        'Nota fiscal pendente',
        'A escola fechou sua folha de pagamento, mas você ainda não conectou sua conta Notaas. Conecte em Fiscal pra receber.',
        { tipo: 'NOTA_FISCAL_PENDENTE', folhaPagamentoId: folha.id }
      ).catch((err) => console.error('[Push] Falha ao notificar nota fiscal pendente:', err.message));
    }
    return;
  }
  if (!folha.professor.notaasCodigoServicoPadrao) {
    await prisma.notaFiscal.update({ where: { id: notaFiscal.id }, data: { status: 'ERRO', erro: 'Professor não configurou um código de serviço padrão.' } });
    return;
  }

  try {
    const resposta = await notaasFetch(folha.professor.notaasApiKeyCriptografada, '/emitir', {
      method: 'POST',
      headers: { 'Idempotency-Key': notaFiscal.id },
      body: JSON.stringify({
        tomador: { nome: folha.escola.nome, cnpj: folha.escola.cnpj || undefined },
        servico: { codigo: folha.professor.notaasCodigoServicoPadrao, descricao: `Aulas ministradas — ${String(folha.mes).padStart(2, '0')}/${folha.ano}` },
        valores: { total: valor, aliquotaIss: folha.professor.notaasAliquotaIssPadrao || undefined },
      }),
    });
    await prisma.notaFiscal.update({ where: { id: notaFiscal.id }, data: { notaasInvoiceId: resposta.invoiceId } });
  } catch (err) {
    await prisma.notaFiscal.update({ where: { id: notaFiscal.id }, data: { status: 'ERRO', erro: err.message } });
  }
}

// POST /api/matriculas/:id/cobranca-automatica/asaas/iniciar — dono da
// matrícula (professor/GESTOR/DONO ou o próprio aluno) ativa cobrança
// recorrente via Asaas. Cria (ou reaproveita) o Customer e a Subscription
// no Asaas — o próprio Asaas passa a gerar a fatura de cada ciclo sozinho,
// sem cron nosso (diferente do Stripe, ver 10e-2 acima).
app.post('/api/matriculas/:id/cobranca-automatica/asaas/iniciar', autenticar, async (req, res) => {
  if (!ASAAS_ENCRYPTION_KEY) return res.status(503).json({ erro: 'Serviço de pagamento (Asaas) não configurado.' });
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    // Mesmo gate de S3.2 usado em POST /api/matriculas/:id/faturas e no cron
    // do Stripe (server.js ~3662, ~789): sem isso, ativar cobrança via Asaas
    // cria uma Subscription de verdade — diferente do Stripe, aqui não tem
    // cron no meio pra pegar esse gate depois, a cobrança sai na hora.
    const contrato = await prisma.contrato.findFirst({ where: { matriculaId: matricula.id } });
    if (contrato && contrato.status !== 'ASSINADO') {
      return res.status(400).json({ erro: `Essa matrícula tem um contrato pendente (status: ${contrato.status}). Cobrança só sai depois do contrato assinado.` });
    }

    const billingType = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'].includes(req.body?.billingType)
      ? req.body.billingType
      : 'UNDEFINED';

    const escola = await prisma.escola.findUnique({
      where: { id: matricula.escolaId },
      select: { asaasApiKeyCriptografada: true },
    });
    if (!escola?.asaasApiKeyCriptografada) {
      return res.status(400).json({ erro: 'A Escola ainda não conectou uma conta Asaas.' });
    }

    const aluno = await prisma.aluno.findUnique({
      where: { id: matricula.alunoId },
      select: { nome: true, email: true, telefone: true, responsavel: { select: { cpf: true, nome: true, email: true } } },
    });
    const cpf = aluno?.responsavel?.cpf?.replace(/\D/g, '');
    if (!cpf) {
      return res.status(400).json({ erro: 'Cadastre o CPF do responsável financeiro do aluno antes de ativar a cobrança via Asaas — peça pro professor ou pra secretaria da escola preencherem na ficha do aluno.' });
    }

    let customerId = matricula.asaasCustomerId;
    if (!customerId) {
      const customer = await asaasFetch(escola, '/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: aluno.responsavel?.nome || aluno.nome,
          cpfCnpj: cpf,
          email: aluno.responsavel?.email || aluno.email,
          mobilePhone: aluno.telefone || undefined,
          externalReference: matricula.id,
        }),
      });
      customerId = customer.id;
    }

    const hoje = new Date();
    const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diaAlvo = Math.min(matricula.diaVencimento || 10, ultimoDiaDoMes);
    let proximoVencimento = new Date(hoje.getFullYear(), hoje.getMonth(), diaAlvo);
    if (proximoVencimento < hoje) proximoVencimento = new Date(hoje.getFullYear(), hoje.getMonth() + 1, diaAlvo);
    const nextDueDate = proximoVencimento.toISOString().slice(0, 10);

    const subscription = await asaasFetch(escola, '/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType,
        value: matricula.valorMensalidade,
        nextDueDate,
        cycle: 'MONTHLY',
        description: `Mensalidade — matrícula ${matricula.id}`,
        externalReference: matricula.id,
      }),
    });

    await prisma.matricula.update({
      where: { id: matricula.id },
      data: {
        gatewayCobranca: 'ASAAS',
        asaasCustomerId: customerId,
        asaasSubscriptionId: subscription.id,
        cobrancaAutomaticaAtiva: true,
        cobrancaUltimoErro: null,
      },
    });

    let faturaAtual = null;
    try {
      const faturas = await asaasFetch(escola, `/payments?subscription=${subscription.id}&limit=1`);
      faturaAtual = faturas?.data?.[0] || null;
    } catch (err) {
      console.error('[CobrancaAutomatica/Asaas] Erro ao buscar 1ª fatura:', err.message);
    }

    res.json({
      ativo: true,
      invoiceUrl: faturaAtual?.invoiceUrl || null,
    });
  } catch (err) {
    const mensagem = err.message || 'Erro ao ativar cobrança via Asaas.';
    console.error('[CobrancaAutomatica/Asaas] Erro ao iniciar:', mensagem);
    res.status(err.status && err.status < 500 ? err.status : 500).json({ erro: mensagem });
  }
});

// ============================================================================
// 10f. CONTRATO DIGITAL (Fase 3, S3.2)
//
// IMPORTANTE: isto é confirmação por código enviado por e-mail, o mesmo
// modelo de confiança que já existe em TokenRedefinicaoSenha e
// ConviteProfessor — NÃO é assinatura eletrônica com validade jurídica
// plena (ICP-Brasil, carimbo de tempo). Integrar um parceiro tipo
// Clicksign/D4Sign pra isso fica registrado como decisão de negócio em
// aberto no roadmap, não é suposição silenciosa. O que isso já resolve de
// verdade: cobrança só sai depois que as duas partes confirmaram (ver o
// gate em POST /api/matriculas/:id/faturas, algumas telas acima).
// ============================================================================

async function enviarEmailContrato(destinatario, escolaNome, codigo) {
  // Checa antes de carregar o módulo — sem isso, um require() que trava
  // (visto em sandbox local) prende a chamada mesmo sem credencial nenhuma
  // configurada, quando o certo é falhar rápido e claro.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Variáveis EMAIL_USER e EMAIL_PASS não configuradas no servidor.');
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  await transporter.sendMail({
    from: `"KAV Class" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: `Contrato de matrícula – ${escolaNome}`,
    html: `<h2>Contrato de matrícula</h2><p><b>${escolaNome}</b> te enviou um contrato de matrícula pra assinar.</p><p>No app, use o código abaixo pra revisar e confirmar:</p><h1 style="letter-spacing:6px">${codigo}</h1>`,
  });
}

// POST /api/matriculas/:id/contrato — professor gera e envia o contrato.
app.post('/api/matriculas/:id/contrato', exigirProfessor, async (req, res) => {
  try {
    const matricula = await carregarMatriculaDoDono(req, res);
    if (!matricula) return;

    const { testemunhas } = req.body;
    const [aluno, escola] = await Promise.all([
      prisma.aluno.findUnique({
        where: { id: matricula.alunoId },
        select: { nome: true, email: true, expoPushToken: true, responsavel: { select: { nome: true, email: true } } },
      }),
      prisma.escola.findUnique({ where: { id: matricula.escolaId }, select: { nome: true } }),
    ]);
    // Manda pro e-mail do responsável se houver um cadastrado (S1.1); sem
    // isso, cai no e-mail do próprio aluno (caso CONTRATANTE, é a mesma pessoa).
    const destinatario = aluno?.responsavel?.email || aluno?.email;

    const codigo = gerarCodigoConvite();
    const contrato = await prisma.contrato.create({
      data: {
        token: codigo,
        testemunhas: Array.isArray(testemunhas) ? testemunhas.filter(t => typeof t === 'string' && t.trim()) : [],
        matriculaId: matricula.id,
        escolaId: matricula.escolaId,
      },
    });

    let emailEnviado = true;
    try {
      await enviarEmailContrato(destinatario, escola?.nome || 'Escola', codigo);
    } catch (err) {
      emailEnviado = false;
      console.error('[Contrato] Falha ao enviar e-mail (código segue válido):', err.message);
    }

    // Push além do e-mail, se o aluno já tiver conta no app (o contrato em
    // si é assinado por token público, sem exigir login — auditoria
    // INSTITUTION, 11/09/2026).
    if (aluno?.expoPushToken) {
      enviarPushNotificacao(aluno.expoPushToken, 'Contrato pra assinar', `${escola?.nome || 'A escola'} te enviou um contrato de matrícula.`, { tipo: 'CONTRATO_NOVO' })
        .catch((err) => console.error('[Push] Falha ao notificar contrato novo:', err.message));
    }

    res.status(201).json({
      mensagem: emailEnviado ? 'Contrato enviado por e-mail.' : 'Contrato criado. Compartilhe o código manualmente — o e-mail não pôde ser enviado.',
      contrato,
      emailEnviado,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar contrato.' });
  }
});

// GET /api/contratos/:id?token=X — consulta pública (o responsável não tem
// necessariamente conta no app) pra revisar antes de assinar.
app.get('/api/contratos/:id', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ erro: 'token é obrigatório.' });

    const contrato = await prisma.contrato.findFirst({
      where: { id: req.params.id, token: String(token).toUpperCase().trim() },
      include: {
        matricula: {
          select: {
            valorMensalidade: true,
            aluno: { select: { nome: true } },
            professor: { select: { nome: true } },
          },
        },
        escola: { select: { nome: true } },
      },
    });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado ou código incorreto.' });
    res.json(contrato);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/contratos/:id/assinar-responsavel — pública, o token é a prova
// de identidade (mesmo padrão de /api/escola/convites/aceitar).
app.post('/api/contratos/:id/assinar-responsavel', async (req, res) => {
  try {
    const { token, nome, cpf } = req.body;
    if (!token || !nome?.trim()) return res.status(400).json({ erro: 'token e nome são obrigatórios.' });

    const contrato = await prisma.contrato.findUnique({ where: { id: req.params.id } });
    if (!contrato || contrato.token !== String(token).toUpperCase().trim()) {
      return res.status(404).json({ erro: 'Contrato não encontrado ou código incorreto.' });
    }
    if (contrato.status !== 'ENVIADO') {
      return res.status(400).json({ erro: `Contrato já está em status ${contrato.status} — não dá mais pra assinar essa etapa.` });
    }

    const atualizado = await prisma.contrato.update({
      where: { id: contrato.id },
      data: {
        nomeAssinanteResponsavel: nome.trim(),
        cpfAssinanteResponsavel: cpf?.trim() || null,
        assinadoPeloResponsavelEm: new Date(),
        status: 'PREENCHIDO',
      },
    });
    res.json({ mensagem: 'Assinado! Aguardando confirmação da escola.', contrato: atualizado });
  } catch (err) {
    tratarErro(err, res, 'Erro ao assinar contrato.');
  }
});

// POST /api/contratos/:id/assinar-representante — só DONO/GESTOR (é a
// Escola assinando, não qualquer professor) e só depois que o responsável
// já assinou a própria parte.
app.post('/api/contratos/:id/assinar-representante', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const contrato = await prisma.contrato.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    if (contrato.status !== 'PREENCHIDO') {
      return res.status(400).json({ erro: 'O responsável ainda não assinou a parte dele.' });
    }

    const { nomeRepresentante } = req.body;
    const atualizado = await prisma.contrato.update({
      where: { id: contrato.id },
      data: {
        nomeRepresentanteEscola: nomeRepresentante?.trim() || professor.nome,
        assinadoPeloRepresentanteEm: new Date(),
        status: 'ASSINADO',
      },
    });
    res.json({ mensagem: 'Contrato assinado! Cobrança liberada pra essa matrícula.', contrato: atualizado });
  } catch (err) {
    tratarErro(err, res, 'Erro ao assinar contrato.');
  }
});

app.put('/api/contratos/:id/cancelar', exigirProfessor, async (req, res) => {
  try {
    const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
    const { count } = await prisma.contrato.updateMany({
      where: { id: req.params.id, escolaId: professor?.escolaId, status: { not: 'ASSINADO' } },
      data: { status: 'CANCELADO' },
    });
    if (!count) return res.status(404).json({ erro: 'Contrato não encontrado, ou já está assinado (não dá pra cancelar).' });
    res.json({ mensagem: 'Contrato cancelado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao cancelar contrato.');
  }
});

// ============================================================================
// 10g. BACKOFFICE FINANCEIRO MÍNIMO (Fase 3, S3.3)
//
// Versão enxuta do módulo de caixa da Emusys — sem tesouraria, sem
// conciliação bancária, sem repasse de cartão. Só o necessário pra escola
// não precisar de planilha paralela pro que já é dinheiro de verdade
// (lançamento avulso, fechamento do dia, contas a pagar).
// ============================================================================

// "YYYY-MM-DD" puro é interpretado pelo JS como meia-noite UTC, não meia-
// noite local — em qualquer fuso negativo (Brasil inteiro) isso cai no dia
// anterior assim que passa por getFullYear()/getDate() (que já leem em
// hora local). Por isso não dá pra só fazer `new Date(str)` e confiar:
// parseamos o "YYYY-MM-DD" manualmente pra ancorar no dia certo.
function ancorarNoDia(data) {
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [ano, mes, dia] = data.split('-').map(Number);
    return new Date(ano, mes - 1, dia);
  }
  return new Date(data);
}
function inicioDoDia(data) {
  const d = ancorarNoDia(data);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function fimDoDia(data) {
  const d = ancorarNoDia(data);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

app.get('/api/caixa/lancamentos', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const dataRef = req.query.data || new Date();
    const lancamentos = await prisma.lancamentoCaixa.findMany({
      where: { escolaId: req.auth.escolaId, data: { gte: inicioDoDia(dataRef), lte: fimDoDia(dataRef) } },
      orderBy: { data: 'asc' },
    });
    res.json(lancamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/caixa/lancamentos', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { tipo, descricao, valor, data } = req.body;
    if (!['ENTRADA', 'SAIDA'].includes(tipo) || !descricao?.trim() || typeof valor !== 'number' || valor <= 0) {
      return res.status(400).json({ erro: 'tipo (ENTRADA|SAIDA), descricao e valor (número > 0) são obrigatórios.' });
    }
    // Se "data" vier só "YYYY-MM-DD" (sem hora), ancora no meio-dia local em
    // vez de deixar o parser tratar como meia-noite UTC — que em qualquer
    // fuso do Brasil cai no dia anterior (ver inicioDoDia/fimDoDia acima).
    const dataLancamento = data
      ? (/^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T12:00:00`) : new Date(data))
      : new Date();
    const lancamento = await prisma.lancamentoCaixa.create({
      data: { tipo, descricao: descricao.trim(), valor, data: dataLancamento, escolaId: req.auth.escolaId },
    });
    res.status(201).json(lancamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar lançamento.' });
  }
});

// POST /api/caixa/fechamento — fecha o dia. Saldo inicial vem do
// saldoFinal do fechamento anterior (0 se nunca fechou antes) — é uma
// foto congelada no momento do fechamento, não recalcula depois.
app.post('/api/caixa/fechamento', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const dataRef = req.body.data || new Date();
    const inicio = inicioDoDia(dataRef);
    const fim = fimDoDia(dataRef);

    const jaFechado = await prisma.fechamentoCaixa.findUnique({ where: { escolaId_data: { escolaId, data: inicio } } });
    if (jaFechado) return res.status(400).json({ erro: 'Esse dia já foi fechado.' });

    const fechamento = await prisma.$transaction(async (tx) => {
      // Precisa ser o fechamento cronologicamente ANTERIOR ao dia sendo
      // fechado agora (data < inicio), não só "o mais recente que existe"
      // — sem esse filtro, fechar um dia atrasado depois de já ter fechado
      // um dia futuro (ex.: acerto de backlog) puxaria o saldo errado.
      const ultimoFechamento = await tx.fechamentoCaixa.findFirst({ where: { escolaId, data: { lt: inicio } }, orderBy: { data: 'desc' } });
      const saldoInicial = ultimoFechamento?.saldoFinal ?? 0;

      const lancamentos = await tx.lancamentoCaixa.findMany({ where: { escolaId, data: { gte: inicio, lte: fim } } });
      const totalEntradas = lancamentos.filter(l => l.tipo === 'ENTRADA').reduce((acc, l) => acc + l.valor, 0);
      const totalSaidas = lancamentos.filter(l => l.tipo === 'SAIDA').reduce((acc, l) => acc + l.valor, 0);
      const saldoFinal = saldoInicial + totalEntradas - totalSaidas;

      return tx.fechamentoCaixa.create({
        data: { data: inicio, saldoInicial, totalEntradas, totalSaidas, saldoFinal, escolaId },
      });
    });
    res.status(201).json(fechamento);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fechar caixa.' });
  }
});

app.get('/api/caixa/fechamentos', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const fechamentos = await prisma.fechamentoCaixa.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { data: 'desc' } });
    res.json(fechamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/contas-pagar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const contas = await prisma.contaPagar.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { vencimento: 'asc' } });
    res.json(contas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/contas-pagar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { descricao, valor, vencimento } = req.body;
    if (!descricao?.trim() || typeof valor !== 'number' || valor <= 0 || !vencimento) {
      return res.status(400).json({ erro: 'descricao, valor (número > 0) e vencimento são obrigatórios.' });
    }
    const conta = await prisma.contaPagar.create({
      data: { descricao: descricao.trim(), valor, vencimento: ancorarNoDia(vencimento), escolaId: req.auth.escolaId },
    });
    res.status(201).json(conta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar conta a pagar.' });
  }
});

// PUT /api/contas-pagar/:id/pagar — marca como paga E gera o lançamento de
// saída no caixa na mesma transação, pra "saldo bater com o financeiro do
// app" nunca depender de alguém lembrar de lançar as duas coisas separado.
app.put('/api/contas-pagar/:id/pagar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const conta = await prisma.contaPagar.findFirst({ where: { id: req.params.id, escolaId: req.auth.escolaId } });
    if (!conta) return res.status(404).json({ erro: 'Conta a pagar não encontrada.' });
    if (conta.paga) return res.status(400).json({ erro: 'Essa conta já está paga.' });

    const resultado = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.contaPagar.update({ where: { id: conta.id }, data: { paga: true, pagoEm: new Date() } });
      const lancamento = await tx.lancamentoCaixa.create({
        data: {
          tipo: 'SAIDA',
          descricao: `Pagamento: ${conta.descricao}`,
          valor: conta.valor,
          escolaId: conta.escolaId,
          contaPagarId: conta.id,
        },
      });
      return { atualizada, lancamento };
    });
    res.json({ mensagem: 'Conta paga e lançada no caixa.', ...resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao pagar conta.' });
  }
});

// GET /api/escola/dre?mes=9&ano=2026 — DRE simplificado do mês: cruza
// mensalidade de aluno paga (Pagamento) com o caixa avulso (LancamentoCaixa,
// que já inclui as ContaPagar pagas via /contas-pagar/:id/pagar — mesmo
// lançamento, sem contar nada em dobro). "Simplificado" porque não tem
// plano de contas nem categoria — é receita x despesa do mês, o suficiente
// pra tirar a escola da planilha paralela sem construir um ERP contábil.
// Cálculo do DRE em si, fatorado (INSTITUTION Sprint 8, briefing 08/09/2026)
// pra ser reaproveitado pela rota JSON já existente e pelas exportações
// PDF/Excel novas, sem duplicar a lógica. Estendido nesta sprint pra somar
// DespesaFixa (Sprint 7) nas despesas — antes só entrava LancamentoCaixa.
async function calcularDre(escolaId, mes, ano) {
  const inicio = new Date(ano, mes, 1, 0, 0, 0, 0);
  const fim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);

  const [mensalidadesPagas, lancamentos, contasPendentes, despesasFixas] = await Promise.all([
    prisma.pagamento.findMany({
      where: { professor: { escolaId }, status: 'PAGO', dataPagamento: { gte: inicio, lte: fim } },
      select: { valor: true },
    }),
    prisma.lancamentoCaixa.findMany({ where: { escolaId, data: { gte: inicio, lte: fim } }, orderBy: { data: 'desc' } }),
    prisma.contaPagar.findMany({ where: { escolaId, paga: false, vencimento: { lte: fim } }, orderBy: { vencimento: 'asc' } }),
    prisma.despesaFixa.findMany({ where: { escolaId, ativa: true }, orderBy: { descricao: 'asc' } }),
  ]);

  const receitaMensalidades = mensalidadesPagas.reduce((acc, p) => acc + p.valor, 0);
  const receitaAvulsa = lancamentos.filter((l) => l.tipo === 'ENTRADA').reduce((acc, l) => acc + l.valor, 0);
  const despesasCaixa = lancamentos.filter((l) => l.tipo === 'SAIDA').reduce((acc, l) => acc + l.valor, 0);
  const despesasFixasTotal = despesasFixas.reduce((acc, d) => acc + d.valor, 0);
  const despesas = despesasCaixa + despesasFixasTotal;
  const receitaTotal = receitaMensalidades + receitaAvulsa;

  return {
    periodo: { mes: mes + 1, ano },
    receita: { mensalidades: receitaMensalidades, avulsa: receitaAvulsa, total: receitaTotal },
    despesas: { caixa: despesasCaixa, fixas: despesasFixasTotal, total: despesas },
    resultado: receitaTotal - despesas,
    lancamentos,
    contasPendentes,
    despesasFixas,
  };
}

app.get('/api/escola/dre', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const agora = new Date();
    const mes = req.query.mes ? parseInt(String(req.query.mes), 10) - 1 : agora.getMonth();
    const ano = req.query.ano ? parseInt(String(req.query.ano), 10) : agora.getFullYear();

    res.json(await calcularDre(professor.escolaId, mes, ano));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar DRE.' });
  }
});

// ─── RELATÓRIO PDF/EXCEL + PAGAMENTOS (INSTITUTION Sprint 8, briefing 08/09/2026) ───
// Importante — motivo jurídico explícito do usuário: o relatório NUNCA cita
// "KAV Class" em lugar nenhum (nome do arquivo, cabeçalho, rodapé). Um
// problema jurídico da escola não deve envolver a plataforma.
const NOMES_MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function validarMesAno(req, res) {
  const mes = parseInt(req.params.mes, 10);
  const ano = parseInt(req.params.ano, 10);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) {
    res.status(400).json({ erro: 'mes (1-12) e ano na URL são obrigatórios e devem ser números válidos.' });
    return null;
  }
  return { mes, ano };
}

// GET /api/escola/dre/:mes/:ano/pdf — relatório mensal formatado, com logo
// da escola no topo quando cadastrado (Perfil da Instituição, Sprint 1).
app.get('/api/escola/dre/:mes/:ano/pdf', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;
    const periodo = validarMesAno(req, res);
    if (!periodo) return;

    const [dre, escola] = await Promise.all([
      calcularDre(professor.escolaId, periodo.mes - 1, periodo.ano),
      prisma.escola.findUnique({ where: { id: professor.escolaId }, select: { nome: true, logoUrl: true } }),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-financeiro-${periodo.mes}-${periodo.ano}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    if (escola?.logoUrl) {
      try {
        const respLogo = await fetch(escola.logoUrl);
        if (respLogo.ok) {
          const bufferLogo = Buffer.from(await respLogo.arrayBuffer());
          doc.image(bufferLogo, 50, 45, { fit: [70, 70] });
          doc.x = 130; doc.y = 50; // texto ao lado do logo, em vez de embaixo
        }
      } catch (err) {
        console.error('[Relatório PDF] Falha ao baixar logo (segue sem logo):', err.message);
      }
    }

    doc.fontSize(18).fillColor('#101828').text(escola?.nome || 'Relatório Financeiro');
    doc.fontSize(11).fillColor('#555').text(`Relatório financeiro — ${NOMES_MESES_PT[periodo.mes - 1]}/${periodo.ano}`);
    doc.x = 50;
    doc.moveDown(2);
    doc.fillColor('#101828');

    doc.fontSize(14).text('Receitas', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(12).text(`Mensalidades pagas: R$ ${dre.receita.mensalidades.toFixed(2).replace('.', ',')}`);
    doc.text(`Receita avulsa (caixa): R$ ${dre.receita.avulsa.toFixed(2).replace('.', ',')}`);
    doc.moveDown(0.3);
    doc.fillColor('#0a7a3d').fontSize(13).text(`Total de receitas: R$ ${dre.receita.total.toFixed(2).replace('.', ',')}`);

    doc.moveDown(1.2);
    doc.fillColor('#101828').fontSize(14).text('Despesas', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(12).text(`Despesas fixas: R$ ${dre.despesas.fixas.toFixed(2).replace('.', ',')}`);
    doc.text(`Despesas avulsas (caixa): R$ ${dre.despesas.caixa.toFixed(2).replace('.', ',')}`);
    doc.moveDown(0.3);
    doc.fillColor('#B00020').fontSize(13).text(`Total de despesas: R$ ${dre.despesas.total.toFixed(2).replace('.', ',')}`);

    doc.moveDown(1.5);
    doc.fillColor(dre.resultado >= 0 ? '#0a7a3d' : '#B00020').fontSize(16)
      .text(`Resultado do mês: R$ ${dre.resultado.toFixed(2).replace('.', ',')}`);

    if (dre.lancamentos.length > 0) {
      doc.moveDown(1.5);
      doc.fillColor('#101828').fontSize(14).text('Lançamentos avulsos do mês', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10);
      for (const l of dre.lancamentos) {
        const sinal = l.tipo === 'ENTRADA' ? '+' : '−';
        doc.fillColor(l.tipo === 'ENTRADA' ? '#0a7a3d' : '#B00020')
          .text(`${new Date(l.data).toLocaleDateString('pt-BR')} — ${l.descricao}: ${sinal} R$ ${Number(l.valor).toFixed(2).replace('.', ',')}`);
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar relatório em PDF.' });
  }
});

// GET /api/escola/dre/:mes/:ano/excel — mesma planilha, em Excel.
app.get('/api/escola/dre/:mes/:ano/excel', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;
    const periodo = validarMesAno(req, res);
    if (!periodo) return;

    const [dre, escola] = await Promise.all([
      calcularDre(professor.escolaId, periodo.mes - 1, periodo.ano),
      prisma.escola.findUnique({ where: { id: professor.escolaId }, select: { nome: true } }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = escola?.nome || 'Relatório Financeiro';
    const planilha = workbook.addWorksheet(`${NOMES_MESES_PT[periodo.mes - 1]} ${periodo.ano}`);

    planilha.columns = [{ width: 32 }, { width: 18 }];
    planilha.addRow([escola?.nome || 'Relatório Financeiro']).font = { bold: true, size: 14 };
    planilha.addRow([`Relatório financeiro — ${NOMES_MESES_PT[periodo.mes - 1]}/${periodo.ano}`]);
    planilha.addRow([]);

    planilha.addRow(['Receitas']).font = { bold: true };
    planilha.addRow(['Mensalidades pagas', dre.receita.mensalidades]);
    planilha.addRow(['Receita avulsa (caixa)', dre.receita.avulsa]);
    planilha.addRow(['Total de receitas', dre.receita.total]).font = { bold: true };
    planilha.addRow([]);

    planilha.addRow(['Despesas']).font = { bold: true };
    planilha.addRow(['Despesas fixas', dre.despesas.fixas]);
    planilha.addRow(['Despesas avulsas (caixa)', dre.despesas.caixa]);
    planilha.addRow(['Total de despesas', dre.despesas.total]).font = { bold: true };
    planilha.addRow([]);

    planilha.addRow(['Resultado do mês', dre.resultado]).font = { bold: true, size: 12 };
    planilha.addRow([]);

    if (dre.lancamentos.length > 0) {
      planilha.addRow(['Lançamentos avulsos do mês']).font = { bold: true };
      planilha.addRow(['Data', 'Descrição', 'Tipo', 'Valor']);
      for (const l of dre.lancamentos) {
        planilha.addRow([new Date(l.data).toLocaleDateString('pt-BR'), l.descricao, l.tipo, l.valor]);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-financeiro-${periodo.mes}-${periodo.ano}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar relatório em Excel.' });
  }
});

// GET /api/escola/pagamentos-status — "a pulsação financeira da empresa":
// 3 listas a partir de Pagamento (inadimplentes/pagos/em dia). Reusa a
// mesma definição de inadimplente do KPI do Painel (Sprint 3): pelo menos
// um Pagamento ATRASADO. "Pagos" = pagamento mais recente com status PAGO
// no mês corrente; "Em dia" = tem pendência mas ainda dentro do vencimento.
app.get('/api/escola/pagamentos-status', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

    const alunos = await prisma.aluno.findMany({
      where: { escolaId: professor.escolaId, status: 'ATIVO' },
      select: {
        id: true, nome: true, telefone: true,
        responsavel: { select: { telefone: true } },
        pagamentos: { select: { status: true, valor: true, vencimento: true, dataPagamento: true }, orderBy: { vencimento: 'desc' }, take: 5 },
      },
    });

    const inadimplentes = [];
    const pagos = [];
    const emDia = [];
    for (const aluno of alunos) {
      const telefone = aluno.telefone || aluno.responsavel?.telefone || null;
      const item = { id: aluno.id, nome: aluno.nome, telefone };
      if (aluno.pagamentos.some((p) => p.status === 'ATRASADO')) {
        inadimplentes.push(item);
      } else if (aluno.pagamentos.some((p) => p.status === 'PAGO' && p.dataPagamento && new Date(p.dataPagamento) >= inicioMes && new Date(p.dataPagamento) <= fimMes)) {
        pagos.push(item);
      } else if (aluno.pagamentos.length > 0) {
        emDia.push(item);
      }
    }

    res.json({ inadimplentes, pagos, emDia });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar status de pagamentos.');
  }
});

// ─── FINANCEIRO I (INSTITUTION Sprint 7, briefing 08/09/2026) ────────────

// GET /api/escola/faturamento-atual — "valor em caixa daquele mês,
// contabilizado via API da Stripe". Decisão de escopo: em vez de chamar a
// API do Stripe ao vivo a cada carregamento do Painel, somamos Pagamento
// com status PAGO no mês corrente — é a mesma fonte de verdade que o DRE
// acima já usa, e que já é sincronizada pelo webhook/cron de cobrança
// automática do Stripe Connect (S3.1). Evita depender de uma chamada de
// rede externa toda vez que a tela abre, sem perder a exatidão do número.
app.get('/api/escola/faturamento-atual', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

    const pagos = await prisma.pagamento.findMany({
      where: { professor: { escolaId: professor.escolaId }, status: 'PAGO', dataPagamento: { gte: inicio, lte: fim } },
      select: { valor: true },
    });
    const total = pagos.reduce((acc, p) => acc + p.valor, 0);
    res.json({ periodo: { mes: agora.getMonth() + 1, ano: agora.getFullYear() }, total });
  } catch (err) {
    tratarErro(err, res, 'Erro ao calcular o faturamento atual.');
  }
});

// Cálculo automático = nº de aulas com presença confirmada no mês ×
// Escola.valorPorAula (ou nº de alunos ativos × valorPorAula, se
// tipoRemuneracaoProfessor=POR_ALUNO_MES). Reposição paga no mês em que a
// aula efetivamente ocorreu, nunca duplicada: cada Aula tem uma única
// dataHora (a da ocorrência real), então isso já é automático — não existe
// um segundo registro "original" pra contar em dobro.
//
// Repasse de aula (INSTITUTION Sprint 12, briefing 22/09/2026): quando a
// escola marca `Aula.professorSubstitutoId`, o valor daquela aula específica
// passa a contar pro professor substituto, não pro dono original da grade —
// por isso o filtro abaixo é um OR: "sou o dono E não houve substituição" OU
// "fui eu quem substituiu". Só afeta o modo POR_AULA; POR_ALUNO_MES paga por
// base de alunos ativos, não por aula individual, então repasse não se aplica.
async function calcularOuAtualizarFolha(professorId, escolaId, mes, ano) {
  const inicio = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const fim = new Date(ano, mes, 0, 23, 59, 59, 999);
  const escola = await prisma.escola.findUnique({ where: { id: escolaId }, select: { valorPorAula: true, tipoRemuneracaoProfessor: true } });
  const valorBase = escola?.valorPorAula || 0;

  let valorCalculado = 0;
  if (escola?.tipoRemuneracaoProfessor === 'POR_ALUNO_MES') {
    const totalAlunos = await prisma.aluno.count({ where: { professorId, status: 'ATIVO' } });
    valorCalculado = totalAlunos * valorBase;
  } else {
    const totalAulas = await prisma.aula.count({
      where: {
        presenca: 'PRESENTE',
        dataHora: { gte: inicio, lte: fim },
        OR: [
          { professorId, professorSubstitutoId: null },
          { professorSubstitutoId: professorId },
        ],
      },
    });
    valorCalculado = totalAulas * valorBase;
  }

  return prisma.folhaPagamentoProfessor.upsert({
    where: { professorId_mes_ano: { professorId, mes, ano } },
    update: { valorCalculado },
    create: { professorId, escolaId, mes, ano, valorCalculado },
  });
}

// GET /api/escola/folha-pagamento?mes=&ano= — recalcula (upsert) a folha de
// todo professor da Escola pro mês pedido (default mês corrente) e devolve
// a lista. valorAjustado/comprovantes/status de folhas já existentes são
// preservados — só valorCalculado é sempre recalculado na leitura.
app.get('/api/escola/folha-pagamento', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const agora = new Date();
    const mes = req.query.mes ? parseInt(String(req.query.mes), 10) : agora.getMonth() + 1;
    const ano = req.query.ano ? parseInt(String(req.query.ano), 10) : agora.getFullYear();

    const professores = await prisma.professor.findMany({ where: { escolaId: professor.escolaId }, select: { id: true, nome: true } });
    const folhas = await Promise.all(professores.map((p) => calcularOuAtualizarFolha(p.id, professor.escolaId, mes, ano)));
    res.json(folhas.map((f, i) => ({ ...f, professor: professores[i] })));
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar a folha de pagamento.');
  }
});

// PUT /api/escola/folha-pagamento/:id/ajustar — campo de edição manual pela
// escola, quando necessário (briefing: "campo de edição manual").
app.put('/api/escola/folha-pagamento/:id/ajustar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const { valorAjustado } = req.body;
    if (valorAjustado !== null && (typeof valorAjustado !== 'number' || valorAjustado < 0)) {
      return res.status(400).json({ erro: 'valorAjustado deve ser um número ≥ 0, ou null pra remover o ajuste.' });
    }
    const { count } = await prisma.folhaPagamentoProfessor.updateMany({
      where: { id: req.params.id, escolaId: professor.escolaId },
      data: { valorAjustado },
    });
    if (!count) return res.status(404).json({ erro: 'Folha não encontrada.' });
    res.json({ mensagem: 'Valor ajustado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao ajustar valor.');
  }
});

// POST /api/escola/folha-pagamento/:id/comprovantes — até 3 URLs (upload de
// arquivo continua sendo campo de texto, mesma decisão já registrada em
// outras sprints por falta de storage integrado).
app.post('/api/escola/folha-pagamento/:id/comprovantes', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const folha = await prisma.folhaPagamentoProfessor.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!folha) return res.status(404).json({ erro: 'Folha não encontrada.' });

    const { url } = req.body;
    if (!url?.trim()) return res.status(400).json({ erro: 'url é obrigatória.' });
    if (folha.comprovantes.length >= 3) return res.status(400).json({ erro: 'Máximo de 3 comprovantes por folha.' });

    const atualizada = await prisma.folhaPagamentoProfessor.update({
      where: { id: folha.id },
      data: { comprovantes: [...folha.comprovantes, url.trim()] },
    });
    res.json(atualizada);
  } catch (err) {
    tratarErro(err, res, 'Erro ao anexar comprovante.');
  }
});

// PUT /api/escola/folha-pagamento/:id/status — abre/fecha a folha do mês.
// Fiscal (INSTITUTION Sprint 28, briefing 24/09/2026): fechar a folha, com
// Escola.exigeNotaProfessor=true, dispara emissão automática da nota do
// professor pra Escola — "que pelo sistema ela já faça tudo automatizado",
// pedido explícito do usuário. Não bloqueia o fechamento se a emissão falhar
// (ver emitirNotaFolhaPagamento) — financeiro da escola não pode travar por
// um professor que ainda não conectou a própria conta Notaas.
app.put('/api/escola/folha-pagamento/:id/status', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const { status } = req.body;
    if (!['ABERTA', 'FECHADA'].includes(status)) return res.status(400).json({ erro: 'status deve ser ABERTA ou FECHADA.' });
    const { count } = await prisma.folhaPagamentoProfessor.updateMany({
      where: { id: req.params.id, escolaId: professor.escolaId },
      data: { status },
    });
    if (!count) return res.status(404).json({ erro: 'Folha não encontrada.' });

    if (status === 'FECHADA') {
      const folha = await prisma.folhaPagamentoProfessor.findUnique({
        where: { id: req.params.id },
        include: {
          professor: { select: { id: true, notaasApiKeyCriptografada: true, notaasCodigoServicoPadrao: true, notaasAliquotaIssPadrao: true, expoPushToken: true } },
          escola: { select: { exigeNotaProfessor: true, nome: true, cnpj: true } },
        },
      });
      if (folha?.escola.exigeNotaProfessor) {
        emitirNotaFolhaPagamento(folha).catch((err) => console.error('[Fiscal] Falha ao emitir nota automática da folha:', err.message));
      }
    }

    res.json({ mensagem: status === 'FECHADA' ? 'Folha fechada.' : 'Folha reaberta.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar status da folha.');
  }
});

// GET /api/professor/folha-pagamento?mes=&ano= — réplica no login do
// professor (briefing: "esses dados também aparecem no login do professor,
// seção financeiro"). Só a própria folha, sem valorAjustado/comprovantes
// escondidos — o professor vê exatamente o que a escola vê sobre ele.
app.get('/api/professor/folha-pagamento', exigirProfessor, async (req, res) => {
  try {
    const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const agora = new Date();
    const mes = req.query.mes ? parseInt(String(req.query.mes), 10) : agora.getMonth() + 1;
    const ano = req.query.ano ? parseInt(String(req.query.ano), 10) : agora.getFullYear();

    const folha = await calcularOuAtualizarFolha(req.auth.id, professor.escolaId, mes, ano);

    // estimativaRestanteMes (briefing INSTITUTION: "estimativa de valor a
    // receber com base na grade de alunos e valor por aluno") — só faz
    // sentido no modo POR_AULA e só pro mês corrente (projeção de aulas já
    // agendadas e ainda não ocorridas). No modo POR_ALUNO_MES,
    // valorCalculado já É a estimativa (nº de alunos ativos × valor), sem
    // nada "a mais" pra projetar; em meses passados/futuros não há "restante".
    let estimativaRestanteMes = null;
    const ehMesAtual = ano === agora.getFullYear() && mes === agora.getMonth() + 1;
    if (ehMesAtual) {
      const escola = await prisma.escola.findUnique({
        where: { id: professor.escolaId },
        select: { valorPorAula: true, tipoRemuneracaoProfessor: true },
      });
      if (escola?.tipoRemuneracaoProfessor === 'POR_AULA') {
        const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999);
        const aulasRestantes = await prisma.aula.count({
          where: { professorId: req.auth.id, status: 'AGENDADA', dataHora: { gte: agora, lte: fimMes } },
        });
        estimativaRestanteMes = aulasRestantes * (escola.valorPorAula || 0);
      }
    }

    res.json({ ...folha, estimativaRestanteMes });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar sua folha de pagamento.');
  }
});

// ─── DESPESAS FIXAS (INSTITUTION Sprint 7, briefing 08/09/2026) ──────────
app.get('/api/escola/despesas-fixas', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;
    const despesas = await prisma.despesaFixa.findMany({ where: { escolaId: professor.escolaId }, orderBy: { descricao: 'asc' } });
    res.json(despesas);
  } catch (err) {
    tratarErro(err, res, 'Erro ao listar despesas fixas.');
  }
});

app.post('/api/escola/despesas-fixas', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;
    const { descricao, valor } = req.body;
    if (!descricao?.trim() || typeof valor !== 'number' || valor <= 0) {
      return res.status(400).json({ erro: 'descricao e valor (número > 0) são obrigatórios.' });
    }
    const despesa = await prisma.despesaFixa.create({ data: { descricao: descricao.trim(), valor, escolaId: professor.escolaId } });
    res.status(201).json(despesa);
  } catch (err) {
    tratarErro(err, res, 'Erro ao criar despesa fixa.');
  }
});

app.put('/api/escola/despesas-fixas/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;
    const { descricao, valor, ativa } = req.body;
    const data = {};
    if (descricao !== undefined) data.descricao = descricao.trim();
    if (valor !== undefined) data.valor = valor;
    if (typeof ativa === 'boolean') data.ativa = ativa;
    const { count } = await prisma.despesaFixa.updateMany({ where: { id: req.params.id, escolaId: professor.escolaId }, data });
    if (!count) return res.status(404).json({ erro: 'Despesa fixa não encontrada.' });
    res.json({ mensagem: 'Despesa fixa atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar despesa fixa.');
  }
});

app.delete('/api/escola/despesas-fixas/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;
    const { count } = await prisma.despesaFixa.deleteMany({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!count) return res.status(404).json({ erro: 'Despesa fixa não encontrada.' });
    res.json({ mensagem: 'Despesa fixa removida.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao remover despesa fixa.');
  }
});

// ============================================================================
// 10h. CRM DE LEADS (Fase 4, S4.1)
//
// "Sem refresh manual" no critério de pronto do roadmap é atendido pelo
// mesmo padrão que toda outra tela deste app já usa: refetch ao focar a
// tela (useFocusEffect). Notificação em tempo real via websocket/push fica
// fora de escopo desta sprint — registrado aqui, não é suposição silenciosa.
// ============================================================================

app.get('/api/estagios-funil', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const estagios = await prisma.estagioFunil.findMany({ where: { escolaId: req.auth.escolaId, ativo: true }, orderBy: { ordem: 'asc' } });
    res.json(estagios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/estagios-funil', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, ordem } = req.body;
    if (!nome?.trim() || !Number.isInteger(ordem)) {
      return res.status(400).json({ erro: 'nome e ordem (número inteiro) são obrigatórios.' });
    }
    const estagio = await prisma.estagioFunil.create({ data: { nome: nome.trim(), ordem, escolaId: req.auth.escolaId } });
    res.status(201).json(estagio);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar estágio.' });
  }
});

app.get('/api/leads', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const arquivado = req.query.arquivado === 'true';
    const leads = await prisma.lead.findMany({
      where: { escolaId: req.auth.escolaId, arquivado },
      include: { estagio: true, professor: { select: { nome: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/leads', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, telefone, email, origem, estagioId, professorId } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    const escolaId = req.auth.escolaId;

    let estagioFinal = estagioId;
    if (estagioFinal) {
      const estagio = await prisma.estagioFunil.findFirst({ where: { id: estagioFinal, escolaId } });
      if (!estagio) return res.status(400).json({ erro: 'Estágio não encontrado.' });
    } else {
      // Sem estágio informado, cai no primeiro da fila (menor ordem).
      const primeiro = await prisma.estagioFunil.findFirst({ where: { escolaId, ativo: true }, orderBy: { ordem: 'asc' } });
      if (!primeiro) return res.status(400).json({ erro: 'Essa Escola ainda não tem nenhum estágio de funil configurado.' });
      estagioFinal = primeiro.id;
    }

    if (professorId) {
      const professor = await prisma.professor.findFirst({ where: { id: professorId, escolaId } });
      if (!professor) return res.status(400).json({ erro: 'Professor não encontrado.' });
    }

    const lead = await prisma.lead.create({
      data: {
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        email: email?.trim() || null,
        origem: origem?.trim() || null,
        estagioId: estagioFinal,
        professorId: professorId || null,
        escolaId,
      },
      include: { estagio: true },
    });
    res.status(201).json(lead);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar lead.' });
  }
});

app.put('/api/leads/:id/estagio', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { estagioId } = req.body;
    const escolaId = req.auth.escolaId;
    const estagio = await prisma.estagioFunil.findFirst({ where: { id: estagioId, escolaId } });
    if (!estagio) return res.status(400).json({ erro: 'Estágio não encontrado.' });

    const { count } = await prisma.lead.updateMany({ where: { id: req.params.id, escolaId }, data: { estagioId } });
    if (!count) return res.status(404).json({ erro: 'Lead não encontrado.' });
    res.json({ mensagem: `Lead movido para "${estagio.nome}".` });
  } catch (err) {
    tratarErro(err, res, 'Erro ao mover lead.');
  }
});

app.put('/api/leads/:id/arquivar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { motivo } = req.body;
    const { count } = await prisma.lead.updateMany({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      data: { arquivado: true, motivoArquivamento: motivo?.trim() || null },
    });
    if (!count) return res.status(404).json({ erro: 'Lead não encontrado.' });
    res.json({ mensagem: 'Lead arquivado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao arquivar lead.');
  }
});

app.put('/api/leads/:id/desarquivar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { count } = await prisma.lead.updateMany({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      data: { arquivado: false, motivoArquivamento: null },
    });
    if (!count) return res.status(404).json({ erro: 'Lead não encontrado.' });
    res.json({ mensagem: 'Lead desarquivado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao desarquivar lead.');
  }
});

app.post('/api/leads/:id/tarefas', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, escolaId: req.auth.escolaId } });
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

    const { descricao, dataPrevista, responsavelId } = req.body;
    if (!descricao?.trim() || !dataPrevista) {
      return res.status(400).json({ erro: 'descricao e dataPrevista são obrigatórios.' });
    }
    const tarefa = await prisma.tarefaLead.create({
      data: {
        descricao: descricao.trim(),
        dataPrevista: ancorarNoDia(dataPrevista),
        leadId: lead.id,
        responsavelId: responsavelId || req.auth.id,
        escolaId: req.auth.escolaId,
      },
    });
    res.status(201).json(tarefa);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar tarefa.' });
  }
});

// GET /api/tarefas-lead — tarefas pendentes da Escola, pra tela inicial do
// gestor (ver comentário sobre "sem refresh manual" no topo da seção).
app.get('/api/tarefas-lead', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const concluida = req.query.concluida === 'true';
    const tarefas = await prisma.tarefaLead.findMany({
      where: { escolaId: req.auth.escolaId, concluida },
      include: { lead: { select: { nome: true } }, responsavel: { select: { nome: true } } },
      orderBy: { dataPrevista: 'asc' },
    });
    res.json(tarefas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/tarefas-lead/:id/concluir', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { count } = await prisma.tarefaLead.updateMany({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      data: { concluida: true, concluidaEm: new Date() },
    });
    if (!count) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    res.json({ mensagem: 'Tarefa concluída.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao concluir tarefa.');
  }
});

// GET /api/funil/resumo — contagem de leads por estágio + total de tarefas
// pendentes, pensado pra alimentar a tela inicial do gestor num tiro só.
app.get('/api/funil/resumo', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const [estagios, tarefasPendentes] = await Promise.all([
      prisma.estagioFunil.findMany({
        where: { escolaId, ativo: true },
        orderBy: { ordem: 'asc' },
        include: { _count: { select: { leads: { where: { arquivado: false } } } } },
      }),
      prisma.tarefaLead.count({ where: { escolaId, concluida: false } }),
    ]);
    res.json({
      estagios: estagios.map(e => ({ id: e.id, nome: e.nome, ordem: e.ordem, totalLeads: e._count.leads })),
      tarefasPendentes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 10i. CAPTAÇÃO DE LEADS (Fase 4, S4.2)
//
// Duas rotas públicas (sem login, sem app) atendem os dois casos do
// roadmap: (a) link de auto-cadastro pra um Lead JÁ existente completar os
// próprios dados, e (b) link reutilizável de captação (formulário
// embutível ou agendamento de aula experimental) que cria leads NOVOS.
//
// O "agendamento de aula experimental" aqui é capturado como Lead + uma
// TarefaLead de follow-up ("Confirmar aula experimental") — formalizar
// isso como uma entidade própria (Aula-teste vinculada a Lead, com relatório
// de conversão) é escopo explícito de S4.3, não desta sprint.
// ============================================================================

const EMAIL_REGEX_PUBLICO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/leads/:id/link-cadastro — professor gera (ou reaproveita) o
// link público pra ESTE lead completar o próprio cadastro.
app.post('/api/leads/:id/link-cadastro', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, escolaId: req.auth.escolaId } });
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

    const token = lead.tokenPublico || gerarTokenPublico();
    if (!lead.tokenPublico) {
      await prisma.lead.update({ where: { id: lead.id }, data: { tokenPublico: token } });
    }
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar link.' });
  }
});

app.get('/api/links-captacao', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const links = await prisma.linkCaptacao.findMany({
      where: { escolaId: req.auth.escolaId },
      include: { professor: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(links);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/links-captacao', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { tipo, professorId } = req.body;
    if (!['CADASTRO', 'AGENDAMENTO_EXPERIMENTAL'].includes(tipo)) {
      return res.status(400).json({ erro: 'tipo deve ser CADASTRO ou AGENDAMENTO_EXPERIMENTAL.' });
    }
    const escolaId = req.auth.escolaId;
    if (professorId) {
      const professor = await prisma.professor.findFirst({ where: { id: professorId, escolaId } });
      if (!professor) return res.status(400).json({ erro: 'Professor não encontrado.' });
    }
    const link = await prisma.linkCaptacao.create({
      data: { token: gerarTokenPublico(), tipo, professorId: professorId || null, escolaId },
    });
    res.status(201).json(link);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar link.' });
  }
});

app.put('/api/links-captacao/:id/desativar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { count } = await prisma.linkCaptacao.updateMany({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      data: { ativo: false },
    });
    if (!count) return res.status(404).json({ erro: 'Link não encontrado.' });
    res.json({ mensagem: 'Link desativado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao desativar link.');
  }
});

app.put('/api/links-captacao/:id/reativar', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { count } = await prisma.linkCaptacao.updateMany({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      data: { ativo: true },
    });
    if (!count) return res.status(404).json({ erro: 'Link não encontrado.' });
    res.json({ mensagem: 'Link reativado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao reativar link.');
  }
});

// ─── Rotas públicas — sem autenticação, o token é a única credencial ──────

// GET /api/publico/lead/:token — dados mínimos pra saudar a pessoa antes
// dela preencher o próprio contato.
app.get('/api/publico/lead/:token', limitarTaxaPublica(30, 10 * 60 * 1000), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { tokenPublico: req.params.token },
      select: { nome: true, telefone: true, email: true, escola: { select: { nome: true } } },
    });
    if (!lead) return res.status(404).json({ erro: 'Link inválido.' });
    res.json(lead);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PUT /api/publico/lead/:token — a própria pessoa completa telefone/email.
// Só esses dois campos — nome e estágio continuam controlados pela Escola.
app.put('/api/publico/lead/:token', limitarTaxaPublica(10, 10 * 60 * 1000), async (req, res) => {
  try {
    const { telefone, email } = req.body;
    if (email && !EMAIL_REGEX_PUBLICO.test(String(email).trim())) {
      return res.status(400).json({ erro: 'E-mail inválido.' });
    }
    const dados = {};
    if (telefone?.trim()) dados.telefone = telefone.trim();
    if (email?.trim()) dados.email = email.trim().toLowerCase();
    if (!Object.keys(dados).length) return res.status(400).json({ erro: 'Informe telefone e/ou e-mail.' });

    const { count } = await prisma.lead.updateMany({ where: { tokenPublico: req.params.token }, data: dados });
    if (!count) return res.status(404).json({ erro: 'Link inválido.' });
    res.json({ mensagem: 'Dados atualizados. Obrigado!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/publico/captacao/:token — o app/site consulta antes de mostrar o
// formulário certo (cadastro simples ou agendamento de experimental).
app.get('/api/publico/captacao/:token', limitarTaxaPublica(30, 10 * 60 * 1000), async (req, res) => {
  try {
    const link = await prisma.linkCaptacao.findUnique({
      where: { token: req.params.token },
      select: { tipo: true, ativo: true, escola: { select: { nome: true, whatsapp: true } } },
    });
    if (!link || !link.ativo) return res.status(404).json({ erro: 'Link inválido ou desativado.' });
    // whatsapp (INSTITUTION Sprint 19, briefing 22/09/2026) — v1 recomendada
    // do funil de captação → WhatsApp: sem API paga, o formulário continua
    // hospedado pelo próprio KAV (não redireciona pra landing externa —
    // decisão registrada no briefing), mas a página de sucesso oferece um
    // link wa.me pré-preenchido pra quem respondeu confirmar o contato com
    // a escola num toque. Sem número configurado, a página só some com o
    // botão (ver GET /captacao/:token abaixo).
    res.json({ tipo: link.tipo, escolaNome: link.escola.nome, escolaWhatsapp: link.escola.whatsapp || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/publico/captacao/:token — cria o lead novo. Pra links do tipo
// AGENDAMENTO_EXPERIMENTAL, "mensagem" vira automaticamente uma TarefaLead
// de follow-up pro professor confirmar (ver nota de escopo no topo da seção).
app.post('/api/publico/captacao/:token', limitarTaxaPublica(10, 10 * 60 * 1000), async (req, res) => {
  try {
    const link = await prisma.linkCaptacao.findUnique({ where: { token: req.params.token } });
    if (!link || !link.ativo) return res.status(404).json({ erro: 'Link inválido ou desativado.' });

    const { nome, telefone, email, mensagem } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    if (email && !EMAIL_REGEX_PUBLICO.test(String(email).trim())) {
      return res.status(400).json({ erro: 'E-mail inválido.' });
    }

    const primeiroEstagio = await prisma.estagioFunil.findFirst({
      where: { escolaId: link.escolaId, ativo: true },
      orderBy: { ordem: 'asc' },
    });
    if (!primeiroEstagio) {
      return res.status(503).json({ erro: 'Essa Escola ainda não configurou o funil de captação. Tente novamente mais tarde.' });
    }

    const origem = link.tipo === 'AGENDAMENTO_EXPERIMENTAL' ? 'Agendamento de aula experimental' : 'Formulário público';
    const lead = await prisma.lead.create({
      data: {
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        origem,
        estagioId: primeiroEstagio.id,
        professorId: link.professorId,
        escolaId: link.escolaId,
      },
    });

    if (link.tipo === 'AGENDAMENTO_EXPERIMENTAL') {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      await prisma.tarefaLead.create({
        data: {
          descricao: mensagem?.trim()
            ? `Confirmar aula experimental — ${mensagem.trim()}`
            : 'Confirmar aula experimental agendada pelo link público.',
          dataPrevista: amanha,
          leadId: lead.id,
          responsavelId: link.professorId,
          escolaId: link.escolaId,
        },
      });
    }

    res.status(201).json({ mensagem: 'Recebido! Em breve alguém da escola entra em contato.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar contato.' });
  }
});

// ─── Páginas públicas (HTML) ───────────────────────────────────────────────
//
// Decisão de escopo, registrada aqui (não é suposição silenciosa): o app
// Expo não tem deploy web (render.yaml só publica este backend), então
// "alguém sem conta e sem app" precisa de uma página de verdade servida por
// algo que já está no ar — este mesmo serviço Express. São páginas HTML
// simples, sem build, sem dependência nova, feitas pra funcionar tanto
// acessadas direto quanto embutidas via <iframe> (o "formulário embutível"
// do roadmap). Uma versão com a marca da Escola fica pra depois, sem
// mudar o contrato da API pública usada aqui.

const ESTILO_PAGINA_PUBLICA = `
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:420px;margin:48px auto;padding:0 20px;color:#111}
  h1{font-size:20px;margin-bottom:4px}
  p.sub{color:#666;font-size:14px;margin-top:0;margin-bottom:24px}
  input,textarea{width:100%;padding:12px;margin-bottom:12px;border:1px solid #D0D8DC;border-radius:8px;font-size:15px;font-family:inherit}
  textarea{resize:vertical;min-height:70px}
  button{width:100%;padding:14px;background:#000;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  #msg{margin-top:16px;font-size:14px;line-height:1.4}
  #msg.erro{color:#B00020}
  #msg.ok{color:#1B7A3D}
`;

// GET /captacao/:token — página do link reutilizável (formulário embutível
// ou agendamento de aula experimental).
app.get('/captacao/:token', limitarTaxaPublica(60, 10 * 60 * 1000), (req, res) => {
  const token = String(req.params.token);
  res.type('html').send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fale com a escola</title><style>${ESTILO_PAGINA_PUBLICA}</style></head>
<body>
  <div id="carregando">Carregando...</div>
  <div id="conteudo" style="display:none">
    <h1 id="titulo"></h1>
    <p class="sub" id="subtitulo"></p>
    <form id="form">
      <input id="nome" placeholder="Seu nome" required>
      <input id="telefone" placeholder="Telefone / WhatsApp">
      <input id="email" type="email" placeholder="E-mail">
      <textarea id="mensagem" style="display:none" placeholder="Alguma preferência de dia/horário?"></textarea>
      <button type="submit" id="btn">Enviar</button>
    </form>
    <div id="msg"></div>
  </div>
  <div id="whatsappBox" style="display:none;margin-top:14px">
    <a id="linkWhatsapp" target="_blank" rel="noopener" style="display:block;text-align:center;padding:14px;background:#25D366;color:#fff;border-radius:8px;font-weight:bold;text-decoration:none">Confirmar pelo WhatsApp</a>
  </div>
  <script>
    const TOKEN = ${JSON.stringify(token)};
    let escolaNome = '';
    let escolaWhatsapp = null;
    fetch('/api/publico/captacao/' + TOKEN)
      .then(function(r){ if(!r.ok) throw new Error('Link inválido ou desativado.'); return r.json(); })
      .then(function(link){
        document.getElementById('carregando').style.display = 'none';
        document.getElementById('conteudo').style.display = 'block';
        document.getElementById('titulo').textContent = link.escolaNome;
        escolaNome = link.escolaNome;
        escolaWhatsapp = link.escolaWhatsapp;
        if (link.tipo === 'AGENDAMENTO_EXPERIMENTAL') {
          document.getElementById('subtitulo').textContent = 'Quer agendar uma aula experimental? Deixe seu contato.';
          document.getElementById('mensagem').style.display = 'block';
        } else {
          document.getElementById('subtitulo').textContent = 'Deixe seu contato que alguém da escola te chama.';
        }
      })
      .catch(function(e){
        document.getElementById('carregando').textContent = e.message || 'Não foi possível carregar.';
      });

    document.getElementById('form').addEventListener('submit', function(ev){
      ev.preventDefault();
      const btn = document.getElementById('btn');
      const msg = document.getElementById('msg');
      const nome = document.getElementById('nome').value;
      btn.disabled = true; msg.textContent = ''; msg.className = '';
      fetch('/api/publico/captacao/' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome,
          telefone: document.getElementById('telefone').value,
          email: document.getElementById('email').value,
          mensagem: document.getElementById('mensagem').value,
        }),
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, dados: d }; }); })
        .then(function(res){
          if (!res.ok) { msg.textContent = res.dados.erro || 'Não foi possível enviar.'; msg.className = 'erro'; btn.disabled = false; return; }
          msg.textContent = res.dados.mensagem;
          msg.className = 'ok';
          document.getElementById('form').style.display = 'none';
          // v1 do funil → WhatsApp (Sprint 19, briefing 22/09/2026): sem
          // número configurado pela escola, o botão simplesmente não
          // aparece — não bloqueia nem esconde a mensagem de sucesso.
          if (escolaWhatsapp) {
            const texto = 'Ola! Sou ' + nome + ' e acabei de preencher o formulario de contato de ' + escolaNome + '.';
            document.getElementById('linkWhatsapp').href = 'https://wa.me/' + escolaWhatsapp.replace(/\\D/g, '') + '?text=' + encodeURIComponent(texto);
            document.getElementById('whatsappBox').style.display = 'block';
          }
        })
        .catch(function(){ msg.textContent = 'Sem conexão. Tente novamente.'; msg.className = 'erro'; btn.disabled = false; });
    });
  </script>
</body></html>`);
});

// GET /cadastro-lead/:token — página do link individual de um Lead já
// existente completar o próprio telefone/e-mail.
app.get('/cadastro-lead/:token', limitarTaxaPublica(60, 10 * 60 * 1000), (req, res) => {
  const token = String(req.params.token);
  res.type('html').send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Complete seu cadastro</title><style>${ESTILO_PAGINA_PUBLICA}</style></head>
<body>
  <div id="carregando">Carregando...</div>
  <div id="conteudo" style="display:none">
    <h1 id="titulo"></h1>
    <p class="sub" id="subtitulo"></p>
    <form id="form">
      <input id="telefone" placeholder="Telefone / WhatsApp">
      <input id="email" type="email" placeholder="E-mail">
      <button type="submit" id="btn">Salvar</button>
    </form>
    <div id="msg"></div>
  </div>
  <script>
    const TOKEN = ${JSON.stringify(token)};
    fetch('/api/publico/lead/' + TOKEN)
      .then(function(r){ if(!r.ok) throw new Error('Link inválido.'); return r.json(); })
      .then(function(lead){
        document.getElementById('carregando').style.display = 'none';
        document.getElementById('conteudo').style.display = 'block';
        document.getElementById('titulo').textContent = 'Olá, ' + lead.nome + '!';
        document.getElementById('subtitulo').textContent = (lead.escola && lead.escola.nome ? lead.escola.nome + ' pediu ' : 'Pedimos ') + 'pra você completar seu contato.';
        if (lead.telefone) document.getElementById('telefone').value = lead.telefone;
        if (lead.email) document.getElementById('email').value = lead.email;
      })
      .catch(function(e){
        document.getElementById('carregando').textContent = e.message || 'Não foi possível carregar.';
      });

    document.getElementById('form').addEventListener('submit', function(ev){
      ev.preventDefault();
      const btn = document.getElementById('btn');
      const msg = document.getElementById('msg');
      btn.disabled = true; msg.textContent = ''; msg.className = '';
      fetch('/api/publico/lead/' + TOKEN, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: document.getElementById('telefone').value,
          email: document.getElementById('email').value,
        }),
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, dados: d }; }); })
        .then(function(res){
          if (!res.ok) { msg.textContent = res.dados.erro || 'Não foi possível salvar.'; msg.className = 'erro'; btn.disabled = false; return; }
          msg.textContent = res.dados.mensagem;
          msg.className = 'ok';
          document.getElementById('form').style.display = 'none';
        })
        .catch(function(){ msg.textContent = 'Sem conexão. Tente novamente.'; msg.className = 'erro'; btn.disabled = false; });
    });
  </script>
</body></html>`);
});

// ============================================================================
// 10j. AULA EXPERIMENTAL + CONVERSÃO (Fase 4, S4.3)
//
// Fecha o funil: aula-teste vinculada a um Lead (ele ainda não é Aluno).
// A "conversão" não é um campo próprio — é derivada em tempo de consulta,
// olhando se o Lead ganhou uma Matricula (Matricula.leadId, vinculada em
// POST /api/matriculas) depois da dataHora da experimental, respeitando a
// regra configurável da Escola (Escola.regraConversaoExperimental).
// ============================================================================

// POST /api/leads/:id/aula-experimental — professor agenda a aula-teste.
app.post('/api/leads/:id/aula-experimental', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, escolaId } });
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

    const { dataHora, cursoId, professorId, observacao } = req.body;
    if (!dataHora || isNaN(new Date(dataHora).getTime())) {
      return res.status(400).json({ erro: 'dataHora é obrigatória e precisa ser uma data válida.' });
    }
    if (cursoId) {
      const curso = await prisma.curso.findFirst({ where: { id: cursoId, escolaId } });
      if (!curso) return res.status(400).json({ erro: 'Curso não encontrado.' });
    }
    if (professorId) {
      const professor = await prisma.professor.findFirst({ where: { id: professorId, escolaId } });
      if (!professor) return res.status(400).json({ erro: 'Professor não encontrado.' });
    }

    const aula = await prisma.aulaExperimental.create({
      data: {
        dataHora: new Date(dataHora),
        cursoId: cursoId || null,
        professorId: professorId || req.auth.id,
        observacao: observacao?.trim() || null,
        leadId: lead.id,
        escolaId,
      },
    });
    res.status(201).json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao agendar aula experimental.' });
  }
});

app.get('/api/aulas-experimentais', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const where = { escolaId };
    if (req.query.status) where.status = req.query.status;
    // apenasMeu=1 (INSTITUTION Sprint 11, briefing 08/09/2026): usado pelo
    // app mobile do professor (checkin-presenca.tsx) pra ver só as próprias
    // experimentais — o painel da escola (captacao.tsx) continua vendo
    // todas, sem esse filtro, comportamento inalterado.
    if (req.query.apenasMeu === '1') where.professorId = req.auth.id;
    const aulas = await prisma.aulaExperimental.findMany({
      where,
      include: {
        lead: { select: { nome: true, telefone: true } },
        curso: { select: { nome: true } },
        professor: { select: { nome: true } },
      },
      orderBy: { dataHora: 'asc' },
    });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/aulas-experimentais/:id/status', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['AGENDADA', 'REALIZADA', 'NAO_COMPARECEU', 'CANCELADA'].includes(status)) {
      return res.status(400).json({ erro: 'status inválido.' });
    }
    const { count } = await prisma.aulaExperimental.updateMany({
      where: { id: req.params.id, escolaId: req.auth.escolaId },
      data: { status },
    });
    if (!count) return res.status(404).json({ erro: 'Aula experimental não encontrada.' });
    res.json({ mensagem: 'Status atualizado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar status.');
  }
});

// PUT /api/aulas-experimentais/:id/checkin-biometrico — presença da
// experimental via biometria no app do professor (INSTITUTION Sprint 11,
// briefing 08/09/2026). AulaExperimental não é uma Aula (Lead ainda não é
// Aluno), por isso não reusa POST /api/aulas/:id/checkin-professor —
// mesma ideia (biometria já validada no app antes de chamar), rota própria
// porque o model é outro.
app.put('/api/aulas-experimentais/:id/checkin-biometrico', exigirProfessor, async (req, res) => {
  try {
    const { count } = await prisma.aulaExperimental.updateMany({
      where: { id: req.params.id, professorId: req.auth.id },
      data: { status: 'REALIZADA' },
    });
    if (!count) return res.status(404).json({ erro: 'Aula experimental não encontrada.' });
    res.json({ mensagem: 'Presença da experimental confirmada!' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao confirmar presença da experimental.');
  }
});

// PUT /api/escola/regra-conversao — só DONO/GESTOR, é uma configuração da
// Escola como um todo, não de uma aula/lead específico.
app.put('/api/escola/regra-conversao', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'captacao');
    if (!professor) return;
    const { regra } = req.body;
    if (!['QUALQUER_MATRICULA', 'MESMO_CURSO_PROFESSOR'].includes(regra)) {
      return res.status(400).json({ erro: 'regra deve ser QUALQUER_MATRICULA ou MESMO_CURSO_PROFESSOR.' });
    }
    await prisma.escola.update({ where: { id: professor.escolaId }, data: { regraConversaoExperimental: regra } });
    res.json({ mensagem: 'Regra de conversão atualizada.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar regra.' });
  }
});

// GET /api/relatorios/conversao-experimental?de=&ate= — o critério de
// pronto do roadmap: taxa de conversão experimental → matrícula por período.
app.get('/api/relatorios/conversao-experimental', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const { de, ate } = req.query;
    const where = { escolaId };
    if (de || ate) {
      where.dataHora = {};
      if (de) where.dataHora.gte = inicioDoDia(de);
      if (ate) where.dataHora.lte = fimDoDia(ate);
    }

    const [escola, experimentais] = await Promise.all([
      prisma.escola.findUnique({ where: { id: escolaId }, select: { regraConversaoExperimental: true } }),
      prisma.aulaExperimental.findMany({
        where,
        include: {
          lead: {
            include: {
              matricula: { include: { turma: { select: { cursoId: true } } } },
            },
          },
        },
        orderBy: { dataHora: 'asc' },
      }),
    ]);

    let convertidas = 0;
    const detalhes = experimentais.map((exp) => {
      const matricula = exp.lead.matricula;
      let convertida = false;
      if (matricula && matricula.createdAt >= exp.dataHora) {
        if (escola.regraConversaoExperimental === 'QUALQUER_MATRICULA') {
          convertida = true;
        } else {
          const mesmoProfessor = !exp.professorId || matricula.professorId === exp.professorId;
          const mesmoCurso = !exp.cursoId || matricula.turma?.cursoId === exp.cursoId;
          convertida = mesmoProfessor && mesmoCurso;
        }
      }
      if (convertida) convertidas++;
      return {
        leadNome: exp.lead.nome,
        dataHora: exp.dataHora,
        status: exp.status,
        convertida,
        dataConversao: convertida ? matricula.createdAt : null,
      };
    });

    res.json({
      totalExperimentais: experimentais.length,
      convertidas,
      taxaConversao: experimentais.length ? Math.round((convertidas / experimentais.length) * 1000) / 10 : 0,
      regra: escola.regraConversaoExperimental,
      detalhes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/escola/metricas/faturamento?ano=YYYY (S5.2) — painel de métricas
// do GESTOR: faturamento e inadimplência mês a mês, com o ano anterior junto
// pra comparação de períodos direto no mesmo payload. Pagamento não tem
// escolaId próprio (ver schema) — escopa pela Escola do Aluno, que é
// denormalizada exatamente pra isso.
app.get('/api/escola/metricas/faturamento', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'relatorios');
    if (!professor) return;
    const escolaId = professor.escolaId;

    const anoBase = parseInt(req.query.ano, 10) || new Date().getFullYear();
    const anoAnterior = anoBase - 1;

    const inicio = new Date(anoAnterior, 0, 1, 0, 0, 0, 0);
    const fim = new Date(anoBase, 11, 31, 23, 59, 59, 999);

    const pagamentos = await prisma.pagamento.findMany({
      where: {
        aluno: { escolaId },
        OR: [
          { status: 'PAGO', dataPagamento: { gte: inicio, lte: fim } },
          { status: 'ATRASADO', vencimento: { gte: inicio, lte: fim } },
        ],
      },
      select: { valor: true, status: true, dataPagamento: true, vencimento: true },
    });

    const montarMeses = (ano) => {
      const meses = [];
      for (let mes = 0; mes < 12; mes++) {
        const pagos = pagamentos.filter(p =>
          p.status === 'PAGO' && p.dataPagamento &&
          p.dataPagamento.getFullYear() === ano && p.dataPagamento.getMonth() === mes
        );
        const atrasados = pagamentos.filter(p =>
          p.status === 'ATRASADO' &&
          p.vencimento.getFullYear() === ano && p.vencimento.getMonth() === mes
        );
        meses.push({
          mes: mes + 1,
          faturamento: pagos.reduce((acc, p) => acc + Number(p.valor), 0),
          quantidadePagamentos: pagos.length,
          inadimplencia: atrasados.reduce((acc, p) => acc + Number(p.valor), 0),
          quantidadeAtrasados: atrasados.length,
        });
      }
      return meses;
    };

    res.json({
      anoBase,
      anoAnterior,
      meses: montarMeses(anoBase),
      mesesAnoAnterior: montarMeses(anoAnterior),
    });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar métricas de faturamento.');
  }
});

// GET /api/escola/metricas/faturamento/detalhe?ano=&mes=&tipo= (S5.2) —
// drill-down: a lista de alunos por trás do número de um mês específico do
// painel acima. tipo=faturamento (padrão) usa dataPagamento; tipo=inadimplencia
// usa vencimento, espelhando exatamente o agrupamento feito no endpoint acima.
app.get('/api/escola/metricas/faturamento/detalhe', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'relatorios');
    if (!professor) return;
    const escolaId = professor.escolaId;

    const ano = parseInt(req.query.ano, 10);
    const mes = parseInt(req.query.mes, 10);
    const tipo = req.query.tipo === 'inadimplencia' ? 'inadimplencia' : 'faturamento';
    if (!ano || !mes || mes < 1 || mes > 12) {
      return res.status(400).json({ erro: 'Informe ano e mes (1-12) válidos.' });
    }

    const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999);

    const where = tipo === 'inadimplencia'
      ? { aluno: { escolaId }, status: 'ATRASADO', vencimento: { gte: inicioMes, lte: fimMes } }
      : { aluno: { escolaId }, status: 'PAGO', dataPagamento: { gte: inicioMes, lte: fimMes } };

    const pagamentos = await prisma.pagamento.findMany({
      where,
      include: { aluno: { select: { nome: true } }, professor: { select: { nome: true } } },
      orderBy: tipo === 'inadimplencia' ? { vencimento: 'asc' } : { dataPagamento: 'asc' },
    });

    res.json(pagamentos.map(p => ({
      id: p.id,
      alunoNome: p.aluno.nome,
      professorNome: p.professor.nome,
      valor: p.valor,
      status: p.status,
      metodo: p.metodo,
      dataPagamento: p.dataPagamento,
      vencimento: p.vencimento,
    })));
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar detalhe do mês.');
  }
});

// ============================================================================
// 10k. AGENDA GERAL DA ESCOLA + CALENDÁRIO LETIVO (Fase 1, S1.4)
//
// Retomada depois de ter ficado pendente quando a Fase 1 original "terminou"
// (S1.1–S1.3 concluídas, S1.4 pulada sem registro) — achado revisando o
// roadmap antes de seguir pra Fase 5, já que S5.2 e S5.3 dependem dela.
//
// "Agenda respeita automaticamente" o calendário é aplicado no único ponto
// de criação de aula avulsa que existe hoje (POST /api/aulas, seção 11,
// logo abaixo). Não existe neste código um motor que gera Aula
// automaticamente a partir de Turma/Matricula em uma rotina/cron — cada
// Aula nasce como um registro concreto criado por essa rota — então não há
// outro lugar pra "respeitar" o calendário além desse. Ver runbook de S1.4
// pra essa decisão de escopo (inclusive por que não mexi nas rotas de
// reposição já em produção, S2.1).
// ============================================================================

// GET /api/escola/calendario — qualquer professor da Escola pode consultar
// (útil pra saber que dia evitar antes de tentar agendar).
app.get('/api/escola/calendario', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const dias = await prisma.diaNaoLetivo.findMany({
      where: { escolaId: req.auth.escolaId },
      include: { cursos: { include: { curso: { select: { id: true, nome: true } } } } },
      orderBy: { data: 'asc' },
    });
    res.json(dias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

const TIPOS_DIA_NAO_LETIVO = ['FERIADO', 'RECESSO', 'PALESTRA', 'PASSEIO', 'FESTIVAL', 'APRESENTACAO', 'FERIAS'];

// POST /api/escola/calendario — só DONO/GESTOR: é uma configuração da
// Escola como um todo, não de um professor específico. Estendida
// (INSTITUTION Sprint 10, briefing 08/09/2026) com dataFim (evento em
// intervalo, ex.: "Férias de julho") e cursosIds (quais cursos o evento
// afeta — vazio/omitido = escola inteira, igual ao comportamento de antes).
app.post('/api/escola/calendario', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'calendario');
    if (!professor) return;
    const { data, dataFim, descricao, tipo, cursosIds } = req.body;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !descricao?.trim()) {
      return res.status(400).json({ erro: 'data (YYYY-MM-DD) e descricao são obrigatórios.' });
    }
    if (tipo && !TIPOS_DIA_NAO_LETIVO.includes(tipo)) {
      return res.status(400).json({ erro: `tipo deve ser um de: ${TIPOS_DIA_NAO_LETIVO.join(', ')}.` });
    }
    if (dataFim && !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
      return res.status(400).json({ erro: 'dataFim, se enviada, deve ser YYYY-MM-DD.' });
    }
    if (Array.isArray(cursosIds) && cursosIds.length > 0) {
      const cursosValidos = await prisma.curso.count({ where: { id: { in: cursosIds }, escolaId: professor.escolaId } });
      if (cursosValidos !== cursosIds.length) return res.status(400).json({ erro: 'Um ou mais cursos não pertencem a esta Escola.' });
    }

    const dia = await prisma.diaNaoLetivo.create({
      data: {
        data: ancorarNoDia(data),
        dataFim: dataFim ? ancorarNoDia(dataFim) : null,
        descricao: descricao.trim(),
        tipo: tipo || 'FERIADO',
        escolaId: professor.escolaId,
        cursos: Array.isArray(cursosIds) && cursosIds.length > 0
          ? { create: cursosIds.map((cursoId) => ({ cursoId })) }
          : undefined,
      },
      include: { cursos: { include: { curso: { select: { id: true, nome: true } } } } },
    });
    res.status(201).json(dia);
  } catch (err) {
    if (err?.code === 'P2002') return res.status(400).json({ erro: 'Essa data já está no calendário.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar dia não-letivo.' });
  }
});

app.delete('/api/escola/calendario/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'calendario');
    if (!professor) return;
    const { count } = await prisma.diaNaoLetivo.deleteMany({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!count) return res.status(404).json({ erro: 'Não encontrado.' });
    res.json({ mensagem: 'Removido do calendário.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao remover.');
  }
});

// GET /api/escola/agenda — visão de grade completa da Escola, escopo
// GESTOR (é o que o roadmap pede: ver todo mundo, não só o próprio
// professor). Agrupar por professor ou por sala é feito no cliente — a
// resposta já vem com professor/sala/aluno/turma inclusos pra isso.
app.get('/api/escola/agenda', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'calendario');
    if (!professor) return;
    const { de, ate } = req.query;
    const where = { professor: { escolaId: professor.escolaId } };
    if (de || ate) {
      where.dataHora = {};
      if (de) where.dataHora.gte = inicioDoDia(de);
      if (ate) where.dataHora.lte = fimDoDia(ate);
    }
    const aulas = await prisma.aula.findMany({
      where,
      include: {
        professor: { select: { nome: true } },
        aluno: { select: { nome: true } },
        sala: { select: { nome: true } },
        turma: { select: { nome: true } },
      },
      orderBy: { dataHora: 'asc' },
    });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Carrega a Aula garantindo que pertence à Escola de quem está pedindo (via
// DONO/GESTOR) — usada pelas três ações inline abaixo.
async function carregarAulaDaEscola(req, res) {
  const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'calendario');
  if (!professor) return null;
  const aula = await prisma.aula.findFirst({ where: { id: req.params.id, professor: { escolaId: professor.escolaId } } });
  if (!aula) { res.status(404).json({ erro: 'Aula não encontrada.' }); return null; }
  return { aula, professor };
}

app.put('/api/aulas/:id/trocar-professor', async (req, res) => {
  try {
    const carregado = await carregarAulaDaEscola(req, res);
    if (!carregado) return;
    const { professorId } = req.body;
    const novoProfessor = await prisma.professor.findFirst({ where: { id: professorId, escolaId: carregado.professor.escolaId } });
    if (!novoProfessor) return res.status(400).json({ erro: 'Professor não encontrado.' });
    await prisma.aula.update({ where: { id: carregado.aula.id }, data: { professorId } });
    res.json({ mensagem: `Aula transferida para ${novoProfessor.nome}.` });
  } catch (err) {
    tratarErro(err, res, 'Erro ao trocar professor.');
  }
});

app.put('/api/aulas/:id/trocar-sala', async (req, res) => {
  try {
    const carregado = await carregarAulaDaEscola(req, res);
    if (!carregado) return;
    const { salaId } = req.body;
    if (salaId) {
      const sala = await prisma.sala.findFirst({ where: { id: salaId, escolaId: carregado.professor.escolaId } });
      if (!sala) return res.status(400).json({ erro: 'Sala não encontrada.' });
    }
    await prisma.aula.update({ where: { id: carregado.aula.id }, data: { salaId: salaId || null } });
    res.json({ mensagem: 'Sala atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao trocar sala.');
  }
});

// PUT /api/aulas/:id/cancelar — GESTOR cancela direto, sem precisar abrir o
// app do professor original (critério de pronto do roadmap). Com
// comReposicao=true, já nasce a solicitação de reposição (fluxo PROFESSOR
// de S2.1 — o aluno ainda confirma a data, igual sempre foi).
app.put('/api/aulas/:id/cancelar', async (req, res) => {
  try {
    const carregado = await carregarAulaDaEscola(req, res);
    if (!carregado) return;
    const { comReposicao, dataProposta, motivo } = req.body;
    if (comReposicao && (!dataProposta?.trim() || !motivo?.trim())) {
      return res.status(400).json({ erro: 'Com reposição, dataProposta e motivo são obrigatórios.' });
    }

    await prisma.aula.update({ where: { id: carregado.aula.id }, data: { status: 'CANCELADA' } });

    let reposicao = null;
    if (comReposicao) {
      reposicao = await prisma.reposicao.create({
        data: {
          professorId: carregado.aula.professorId,
          alunoId: carregado.aula.alunoId,
          dataOriginal: carregado.aula.dataHora.toISOString().slice(0, 10),
          dataProposta: dataProposta.trim(),
          motivo: motivo.trim(),
          origem: 'PROFESSOR',
        },
      });
    }
    res.json({ mensagem: comReposicao ? 'Aula cancelada e reposição proposta.' : 'Aula cancelada.', reposicao });
  } catch (err) {
    tratarErro(err, res, 'Erro ao cancelar aula.');
  }
});

// ============================================================================
// 10l. COMUNICADOS EM ESCALA (Fase 5, S5.1)
//
// Broadcast por e-mail escopado pela Escola inteira — não existia nada
// parecido antes desta sprint (Mensagem é 1:1 professor↔aluno; Notificacao
// é push só pro professor). RASCUNHO edita/apaga livre; ENVIADO é
// definitivo — sem rota de "desenviar" ou reabrir edição, de propósito
// (é o critério de pronto do roadmap). Reenviar de verdade é sempre via
// "duplicar" (cria um novo RASCUNHO), nunca reabrindo o original.
// ============================================================================

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function enviarEmailComunicado(destinatario, titulo, corpo, escolaNome) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Variáveis EMAIL_USER e EMAIL_PASS não configuradas no servidor.');
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  await transporter.sendMail({
    from: `"${escolaNome}" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: titulo,
    html: `<h2>${escaparHtml(titulo)}</h2><p>${escaparHtml(corpo).replace(/\n/g, '<br>')}</p><p style="color:#999;font-size:12px;margin-top:24px">Enviado por ${escaparHtml(escolaNome)} via KAV Class.</p>`,
  });
}

// Calcula os destinatários a partir do público escolhido — não é uma
// seleção manual (mantém o recurso simples: "manda pra Escola toda").
// Pra ALUNOS, segue o mesmo critério já usado em Contrato (S3.2): manda
// pro e-mail do responsável quando existe, senão pro do próprio aluno.
async function coletarDestinatariosComunicado(escolaId, publico) {
  const destinatarios = [];
  if (publico === 'ALUNOS' || publico === 'TODOS') {
    const alunos = await prisma.aluno.findMany({
      where: { escolaId },
      select: { id: true, nome: true, email: true, expoPushToken: true, responsavel: { select: { nome: true, email: true } } },
    });
    for (const a of alunos) {
      destinatarios.push({
        nome: a.responsavel?.nome || a.nome, email: a.responsavel?.email || a.email, tipo: 'ALUNO',
        alunoId: a.id, expoPushToken: a.expoPushToken,
      });
    }
  }
  if (publico === 'PROFESSORES' || publico === 'TODOS') {
    const professores = await prisma.professor.findMany({ where: { escolaId }, select: { nome: true, email: true } });
    for (const p of professores) destinatarios.push({ nome: p.nome, email: p.email, tipo: 'PROFESSOR' });
  }
  return destinatarios;
}

app.get('/api/comunicados', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const comunicados = await prisma.comunicado.findMany({
      where: { escolaId: professor.escolaId },
      include: { autor: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(comunicados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/comunicados', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const { titulo, corpo, publico } = req.body;
    if (!titulo?.trim() || !corpo?.trim()) {
      return res.status(400).json({ erro: 'titulo e corpo são obrigatórios.' });
    }
    if (!['ALUNOS', 'PROFESSORES', 'TODOS'].includes(publico)) {
      return res.status(400).json({ erro: 'publico deve ser ALUNOS, PROFESSORES ou TODOS.' });
    }
    const comunicado = await prisma.comunicado.create({
      data: { titulo: titulo.trim(), corpo: corpo.trim(), publico, escolaId: professor.escolaId, autorId: professor.id },
    });
    res.status(201).json(comunicado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar comunicado.' });
  }
});

app.put('/api/comunicados/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const { titulo, corpo, publico } = req.body;
    const dados = {};
    if (titulo?.trim()) dados.titulo = titulo.trim();
    if (corpo?.trim()) dados.corpo = corpo.trim();
    if (publico) {
      if (!['ALUNOS', 'PROFESSORES', 'TODOS'].includes(publico)) return res.status(400).json({ erro: 'publico inválido.' });
      dados.publico = publico;
    }
    const { count } = await prisma.comunicado.updateMany({
      where: { id: req.params.id, escolaId: professor.escolaId, status: 'RASCUNHO' },
      data: dados,
    });
    if (!count) return res.status(404).json({ erro: 'Comunicado não encontrado, ou já foi enviado (não dá mais pra editar).' });
    res.json({ mensagem: 'Comunicado atualizado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar.');
  }
});

app.delete('/api/comunicados/:id', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const { count } = await prisma.comunicado.deleteMany({ where: { id: req.params.id, escolaId: professor.escolaId, status: 'RASCUNHO' } });
    if (!count) return res.status(404).json({ erro: 'Comunicado não encontrado, ou já foi enviado (não dá mais pra apagar).' });
    res.json({ mensagem: 'Rascunho apagado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao apagar.');
  }
});

app.post('/api/comunicados/:id/duplicar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const original = await prisma.comunicado.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!original) return res.status(404).json({ erro: 'Comunicado não encontrado.' });
    const copia = await prisma.comunicado.create({
      data: { titulo: original.titulo, corpo: original.corpo, publico: original.publico, escolaId: professor.escolaId, autorId: professor.id },
    });
    res.status(201).json(copia);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao duplicar.' });
  }
});

// POST /api/comunicados/:id/enviar — irreversível: transição RASCUNHO →
// ENVIADO só acontece se der pra tentar mandar de verdade (credencial de
// e-mail configurada). Sucesso/falha por destinatário fica registrado em
// EnvioComunicado mesmo assim — "enviado" aqui é sobre a tentativa ter
// sido disparada, não sobre 100% de entrega (um e-mail inválido de um
// aluno não deve travar o broadcast pros outros).
app.post('/api/comunicados/:id/enviar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const comunicado = await prisma.comunicado.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!comunicado) return res.status(404).json({ erro: 'Comunicado não encontrado.' });
    if (comunicado.status === 'ENVIADO') {
      return res.status(400).json({ erro: 'Esse comunicado já foi enviado. Use "duplicar" pra criar um novo rascunho.' });
    }
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(503).json({ erro: 'E-mail não está configurado no servidor.' });
    }

    const destinatarios = await coletarDestinatariosComunicado(professor.escolaId, comunicado.publico);
    if (!destinatarios.length) {
      return res.status(400).json({ erro: 'Nenhum destinatário encontrado pra esse público.' });
    }

    const envios = [];
    for (const dest of destinatarios) {
      try {
        await enviarEmailComunicado(dest.email, comunicado.titulo, comunicado.corpo, professor.escola.nome);
        envios.push({ destinatarioNome: dest.nome, destinatarioEmail: dest.email, destinatarioTipo: dest.tipo, sucesso: true, comunicadoId: comunicado.id, alunoId: dest.alunoId || null });
      } catch (err) {
        envios.push({ destinatarioNome: dest.nome, destinatarioEmail: dest.email, destinatarioTipo: dest.tipo, sucesso: false, erro: err.message, comunicadoId: comunicado.id, alunoId: dest.alunoId || null });
      }

      // Push pro app do aluno (INSTITUTION Sprint 11, briefing 08/09/2026) —
      // além do e-mail já disparado acima. Silencioso se o aluno não tiver
      // token (nunca abriu o app) — não afeta o resultado do e-mail.
      if (dest.tipo === 'ALUNO' && dest.expoPushToken) {
        enviarPushNotificacao(dest.expoPushToken, comunicado.titulo, comunicado.corpo, { tipo: 'COMUNICADO', comunicadoId: comunicado.id })
          .catch((err) => console.error('[Comunicado] Falha ao enviar push (e-mail segue independente):', err.message));
      }
    }

    await prisma.$transaction([
      prisma.envioComunicado.createMany({ data: envios }),
      prisma.comunicado.update({ where: { id: comunicado.id }, data: { status: 'ENVIADO', enviadoEm: new Date() } }),
    ]);

    const sucesso = envios.filter((e) => e.sucesso).length;
    res.json({ mensagem: `Comunicado enviado: ${sucesso}/${envios.length} e-mails entregues.`, totalDestinatarios: envios.length, sucesso });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar comunicado.' });
  }
});

app.get('/api/comunicados/:id/envios', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'comunicados');
    if (!professor) return;
    const comunicado = await prisma.comunicado.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId } });
    if (!comunicado) return res.status(404).json({ erro: 'Comunicado não encontrado.' });
    const envios = await prisma.envioComunicado.findMany({ where: { comunicadoId: comunicado.id }, orderBy: { createdAt: 'asc' } });
    res.json(envios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/aluno/comunicados — comunicados recebidos pelo próprio aluno,
// mais recentes primeiro (INSTITUTION Sprint 11, briefing 08/09/2026). É a
// tela/consulta que falta pro aluno "ver" o comunicado, além do push.
app.get('/api/aluno/comunicados', exigirAluno, async (req, res) => {
  try {
    const envios = await prisma.envioComunicado.findMany({
      where: { alunoId: req.auth.id },
      include: { comunicado: { select: { id: true, titulo: true, corpo: true, enviadoEm: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(envios);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar comunicados.');
  }
});

// PUT /api/aluno/comunicados/:envioId/lido — marca como lido ao abrir.
app.put('/api/aluno/comunicados/:envioId/lido', exigirAluno, async (req, res) => {
  try {
    const { count } = await prisma.envioComunicado.updateMany({
      where: { id: req.params.envioId, alunoId: req.auth.id, lidoEm: null },
      data: { lidoEm: new Date() },
    });
    res.json({ mensagem: count ? 'Marcado como lido.' : 'Já estava lido.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao marcar como lido.');
  }
});

// ============================================================================
// 10m. ESTOQUE SIMPLES + RENOVAÇÃO EM LOTE (Fase 5, S5.5)
//
// Três itens de cauda longa do roadmap, sem dependência forte entre si —
// o link de aula online ficou junto de POST /api/aulas (seção 11, logo
// abaixo) por já morar ali. Aqui: estoque de produtos e renovação em lote.
// ============================================================================

app.get('/api/produtos', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { nome: 'asc' } });
    res.json(produtos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/produtos', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const { nome, descricao, quantidadeInicial, categoria, valorCusto, valorVenda, estoqueMinimo } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'nome é obrigatório.' });
    const inicial = Number.isInteger(quantidadeInicial) && quantidadeInicial >= 0 ? quantidadeInicial : 0;
    const produto = await prisma.produto.create({
      data: {
        nome: nome.trim(),
        descricao: descricao?.trim() || null,
        quantidadeEstoque: inicial,
        escolaId: req.auth.escolaId,
        categoria: categoria?.trim() || null,
        valorCusto: valorCusto != null ? Number(valorCusto) : null,
        valorVenda: valorVenda != null ? Number(valorVenda) : null,
        estoqueMinimo: estoqueMinimo != null ? Number(estoqueMinimo) : null,
      },
    });
    res.status(201).json(produto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar produto.' });
  }
});

app.patch('/api/produtos/:id', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const { nome, descricao, ativo, categoria, valorCusto, valorVenda, estoqueMinimo } = req.body;
    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (categoria !== undefined) dados.categoria = categoria?.trim() || null;
    if (valorCusto !== undefined) dados.valorCusto = valorCusto === null ? null : Number(valorCusto);
    if (valorVenda !== undefined) dados.valorVenda = valorVenda === null ? null : Number(valorVenda);
    if (estoqueMinimo !== undefined) dados.estoqueMinimo = estoqueMinimo === null ? null : Number(estoqueMinimo);
    if (descricao !== undefined) dados.descricao = descricao?.trim() || null;
    if (typeof ativo === 'boolean') dados.ativo = ativo;
    const { count } = await prisma.produto.updateMany({ where: { id: req.params.id, escolaId: req.auth.escolaId }, data: dados });
    if (!count) return res.status(404).json({ erro: 'Produto não encontrado.' });
    res.json({ mensagem: 'Produto atualizado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar produto.');
  }
});

// POST /api/produtos/:id/movimentacoes — cada movimentação atualiza o
// saldo (Produto.quantidadeEstoque) na hora, dentro de uma transação —
// "simples" não quer dizer recalculado do zero a cada consulta.
app.post('/api/produtos/:id/movimentacoes', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const escolaId = req.auth.escolaId;
    const produto = await prisma.produto.findFirst({ where: { id: req.params.id, escolaId } });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });

    const { tipo, quantidade, alunoId, observacao } = req.body;
    if (!['ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO'].includes(tipo)) {
      return res.status(400).json({ erro: 'tipo deve ser ENTRADA, SAIDA, EMPRESTIMO ou DEVOLUCAO.' });
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return res.status(400).json({ erro: 'quantidade deve ser um número inteiro maior que zero.' });
    }
    if ((tipo === 'EMPRESTIMO' || tipo === 'DEVOLUCAO') && !alunoId) {
      return res.status(400).json({ erro: 'alunoId é obrigatório pra empréstimo/devolução.' });
    }
    if (alunoId) {
      const aluno = await prisma.aluno.findFirst({ where: { id: alunoId, escolaId } });
      if (!aluno) return res.status(400).json({ erro: 'Aluno não encontrado.' });
    }

    const saida = tipo === 'SAIDA' || tipo === 'EMPRESTIMO';
    if (saida && produto.quantidadeEstoque < quantidade) {
      return res.status(400).json({ erro: `Estoque insuficiente — só há ${produto.quantidadeEstoque} unidade(s).` });
    }
    const delta = saida ? -quantidade : quantidade;

    const [movimentacao] = await prisma.$transaction([
      prisma.movimentacaoEstoque.create({
        data: { tipo, quantidade, observacao: observacao?.trim() || null, produtoId: produto.id, alunoId: alunoId || null, escolaId },
      }),
      prisma.produto.update({ where: { id: produto.id }, data: { quantidadeEstoque: { increment: delta } } }),
    ]);
    res.status(201).json(movimentacao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar movimentação.' });
  }
});

app.get('/api/produtos/:id/movimentacoes', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({ where: { id: req.params.id, escolaId: req.auth.escolaId } });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });
    const movimentacoes = await prisma.movimentacaoEstoque.findMany({
      where: { produtoId: produto.id },
      include: { aluno: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(movimentacoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/estoque/emprestimos-ativos — derivado, não um registro formal
// de "empréstimo aberto": soma EMPRESTIMO menos DEVOLUCAO por produto+aluno,
// só devolve quem ainda está com saldo positivo (ver comentário no schema).
app.get('/api/estoque/emprestimos-ativos', exigirProfessor, exigirModuloEscola('recursos'), async (req, res) => {
  try {
    const movimentacoes = await prisma.movimentacaoEstoque.findMany({
      where: { escolaId: req.auth.escolaId, tipo: { in: ['EMPRESTIMO', 'DEVOLUCAO'] }, alunoId: { not: null } },
      include: { produto: { select: { nome: true } }, aluno: { select: { nome: true } } },
    });
    const saldos = new Map();
    for (const m of movimentacoes) {
      const chave = `${m.produtoId}:${m.alunoId}`;
      const atual = saldos.get(chave) || { produtoNome: m.produto.nome, alunoNome: m.aluno.nome, saldo: 0 };
      atual.saldo += m.tipo === 'EMPRESTIMO' ? m.quantidade : -m.quantidade;
      saldos.set(chave, atual);
    }
    const ativos = [...saldos.values()].filter((s) => s.saldo > 0);
    res.json(ativos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/renovacoes/vencendo?dias=30 — mesma fórmula de "fim de contrato"
// de sempre (dataInicio + tempoContrato meses), mas migrada de Aluno pra
// Matricula (auditoria INSTITUTION, 11/09/2026): a fonte real do financeiro
// institution (cobrança automática, faturas, contrato digital) já é
// Matricula desde a Sprint 5, e um Aluno pode ter mais de uma Matricula
// ativa (multi-professor) — "renovar o Aluno" não fazia mais sentido como
// conceito único. Inclui quem já venceu (diasRestantes negativo), não só o
// futuro — é quem mais precisa de ação do GESTOR.
app.get('/api/renovacoes/vencendo', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;
    const dias = Number.isInteger(parseInt(req.query.dias, 10)) ? parseInt(req.query.dias, 10) : 30;

    const matriculas = await prisma.matricula.findMany({
      where: { escolaId: professor.escolaId, status: 'ATIVO', tempoContrato: { not: null } },
      select: {
        id: true, valorMensalidade: true, tempoContrato: true, dataInicio: true,
        aluno: { select: { id: true, nome: true, expoPushToken: true } },
        professor: { select: { id: true, nome: true } },
      },
    });

    const hoje = new Date();
    const vencendo = matriculas
      .map((m) => {
        const fimContrato = new Date(m.dataInicio);
        fimContrato.setMonth(fimContrato.getMonth() + m.tempoContrato);
        const diasRestantes = Math.ceil((fimContrato - hoje) / 86400000);
        return { ...m, fimContrato, diasRestantes };
      })
      .filter((m) => m.diasRestantes <= dias)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    res.json(vencendo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/renovacoes/lote — critério de pronto do roadmap: GESTOR renova
// várias matrículas de uma vez, ajustando o valor (já com desconto
// aplicado, se houver) individualmente antes de confirmar. Renovar =
// reiniciar a contagem do contrato a partir de hoje. Tolerante a falha por
// item — uma matrícula com dado inconsistente não derruba a renovação das
// outras (mesmo padrão de resiliência já usado no envio de Comunicados, S5.1).
//
// Migrado de Aluno pra Matricula (auditoria INSTITUTION, 11/09/2026) — ver
// comentário de GET /api/renovacoes/vencendo acima. Continua fora de
// escopo, de propósito, gerar Pagamento/fatura nova aqui: isso já é
// responsabilidade da cobrança automática/manual existente, baseada em
// Matricula.diaVencimento/valorMensalidade. Renovação aqui só estende a
// janela do contrato e atualiza o valor.
app.post('/api/renovacoes/lote', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;
    const { renovacoes } = req.body;
    if (!Array.isArray(renovacoes) || !renovacoes.length) {
      return res.status(400).json({ erro: 'renovacoes deve ser uma lista não vazia.' });
    }

    const resultados = [];
    for (const item of renovacoes) {
      try {
        const { matriculaId, novoValorMensalidade, novoTempoContrato } = item;
        if (typeof novoValorMensalidade !== 'number' || novoValorMensalidade <= 0) {
          resultados.push({ matriculaId, sucesso: false, erro: 'novoValorMensalidade inválido.' });
          continue;
        }
        const matricula = await prisma.matricula.findFirst({ where: { id: matriculaId, escolaId: professor.escolaId } });
        if (!matricula) {
          resultados.push({ matriculaId, sucesso: false, erro: 'Matrícula não encontrada.' });
          continue;
        }
        await prisma.matricula.update({
          where: { id: matriculaId },
          data: {
            valorMensalidade: novoValorMensalidade,
            tempoContrato: Number.isInteger(novoTempoContrato) && novoTempoContrato > 0 ? novoTempoContrato : matricula.tempoContrato,
            dataInicio: new Date(),
          },
        });
        resultados.push({ matriculaId, sucesso: true });
      } catch (err) {
        resultados.push({ matriculaId: item?.matriculaId, sucesso: false, erro: 'Erro interno.' });
      }
    }

    const sucesso = resultados.filter((r) => r.sucesso).length;
    res.json({ mensagem: `${sucesso}/${resultados.length} matrícula(s) renovada(s).`, resultados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao renovar em lote.' });
  }
});

// ============================================================================
// 11. AGENDAMENTO AVULSO DE AULA
// ============================================================================

app.post('/api/aulas', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const { alunosIds, diaSemana, horario, curso, linkOnline } = req.body;
    if (!Array.isArray(alunosIds) || alunosIds.length === 0) {
      return res.status(400).json({ erro: 'alunosIds é obrigatório.' });
    }

    // Todos os alunos precisam ser mesmo deste professor — sem isso, dava
    // pra agendar aula "amarrando" o id de um aluno de outro professor.
    const alunosDoProfessor = await prisma.aluno.count({ where: { id: { in: alunosIds }, professorId } });
    if (alunosDoProfessor !== alunosIds.length) {
      return res.status(400).json({ erro: 'Um ou mais alunos não pertencem a este professor.' });
    }

    const horarioFinal = horario || '08:00';
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(horarioFinal)) {
      return res.status(400).json({ erro: 'horario inválido. Use o formato HH:MM.' });
    }
    const [horas, minutos] = horarioFinal.split(':').map(Number);
    const hoje = new Date();
    const dataAula = new Date(hoje);
    const diaAlvo = diaSemana ?? 1;
    const diff = (diaAlvo - dataAula.getDay() + 7) % 7 || 7;
    dataAula.setDate(dataAula.getDate() + diff);

    // Calendário da Escola (S1.4): checado ANTES de setUTCHours() abaixo,
    // com os mesmos componentes de data locais que o resto desta rota já
    // usa pra decidir "que dia é esse" — sem herdar (nem criar de novo) a
    // conversão de fuso que essa rota já faz, que é só pro horário, não
    // pro dia calendário.
    // Cronograma (ex-Calendário, INSTITUTION Sprint 10, briefing 08/09/2026):
    // estendido de "data única" pra intervalo (dataFim) e de "escola
    // inteira" pra "cursos afetados". Limitação registrada, não escondida:
    // Aluno.curso é campo de texto livre (legado, pré-Matricula/Curso
    // estruturado — ver comentário no model Curso), então o cruzamento
    // curso-do-aluno × curso-do-evento é por nome (case-insensitive), não
    // por relação de banco. Evento sem curso vinculado continua bloqueando
    // a escola inteira, como sempre foi.
    const dataAlvo = new Date(dataAula.getFullYear(), dataAula.getMonth(), dataAula.getDate());
    const professorEscola = await prisma.professor.findUnique({ where: { id: professorId }, select: { escolaId: true } });
    const eventosDoDia = await prisma.diaNaoLetivo.findMany({
      where: {
        escolaId: professorEscola.escolaId,
        data: { lte: dataAlvo },
        OR: [{ dataFim: null, data: dataAlvo }, { dataFim: { gte: dataAlvo } }],
      },
      include: { cursos: { include: { curso: { select: { nome: true } } } } },
    });

    if (eventosDoDia.length > 0) {
      const alunosDoLote = await prisma.aluno.findMany({ where: { id: { in: alunosIds } }, select: { curso: true } });
      const cursosDosAlunos = new Set(alunosDoLote.map((a) => (a.curso || '').trim().toLowerCase()).filter(Boolean));

      const eventoBloqueando = eventosDoDia.find((evento) => {
        if (evento.cursos.length === 0) return true; // escola inteira
        return evento.cursos.some((c) => cursosDosAlunos.has(c.curso.nome.trim().toLowerCase()));
      });

      if (eventoBloqueando) {
        const nomeTipo = { FERIADO: 'feriado', RECESSO: 'recesso', PALESTRA: 'palestra', PASSEIO: 'passeio', FESTIVAL: 'festival', APRESENTACAO: 'apresentação', FERIAS: 'férias' }[eventoBloqueando.tipo] || 'evento';
        return res.status(400).json({ erro: `${dataAula.toLocaleDateString('pt-BR')} é ${nomeTipo} (${eventoBloqueando.descricao}) — escolha outra data.` });
      }
    }

    dataAula.setUTCHours(horas + 3, minutos, 0, 0);

    const aulasParaCriar = alunosIds.map((alunoId) => ({
      dataHora: new Date(dataAula),
      status: 'AGENDADA',
      tipo: alunosIds.length > 1 ? 'GRUPO' : 'REGULAR',
      tema: curso || null,
      linkOnline: linkOnline?.trim() || null,
      professorId,
      alunoId,
    }));

    await prisma.aula.createMany({ data: aulasParaCriar });
    res.status(201).json({ mensagem: 'Aula(s) agendada(s)!', aulasGeradas: aulasParaCriar.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao agendar aula.' });
  }
});

// PUT /api/aulas/:id/link-online — professor cola (ou apaga, mandando "")
// o link da aula online (Fase 5, S5.5). Não é geração automática via
// Google Calendar API — o professor cria o link no Meet (ou qualquer
// outro serviço) fora do app e só cola aqui; o app mostra o botão de
// entrar quando o campo está preenchido.
app.put('/api/aulas/:id/link-online', exigirProfessor, async (req, res) => {
  try {
    const { linkOnline } = req.body;
    const { count } = await prisma.aula.updateMany({
      where: { id: req.params.id, professorId: req.auth.id },
      data: { linkOnline: linkOnline?.trim() || null },
    });
    if (!count) return res.status(404).json({ erro: 'Aula não encontrada.' });
    res.json({ mensagem: linkOnline?.trim() ? 'Link salvo.' : 'Link removido.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao salvar link.');
  }
});

// ============================================================================
// 12. RELATÓRIOS
// ============================================================================

// GET /api/relatorios/aulas-sem-presenca (S2.1)
// "Faltas duplas" da Emusys: aulas cujo horário já passou e ninguém
// registrou presença de nenhum dos dois lados (presenca IS NULL) — útil
// pra auditar aula que simplesmente não aconteceu e não foi tratada.
app.get('/api/relatorios/aulas-sem-presenca', exigirProfessor, async (req, res) => {
  try {
    const aulas = await prisma.aula.findMany({
      where: { professorId: req.auth.id, dataHora: { lt: new Date() }, presenca: null },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'desc' },
    });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/relatorios', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;

    const hoje = new Date();

    // Faturamento total (pagamentos PAGO)
    const pagamentosPagos = await prisma.pagamento.findMany({
      where: { professorId, status: 'PAGO' },
      select: { valor: true, dataPagamento: true },
    });
    const faturamentoAtual = pagamentosPagos.reduce((acc, p) => acc + Number(p.valor), 0);

    // Gráfico: últimos 6 meses
    const maxMensal = pagamentosPagos.reduce((max, p) => {
      const v = Number(p.valor);
      return v > max ? v : max;
    }, 1);

    const grafico = [];
    const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mes = ref.getMonth();
      const ano = ref.getFullYear();
      const total = pagamentosPagos
        .filter(p => {
          const d = p.dataPagamento ? new Date(p.dataPagamento) : null;
          return d && d.getMonth() === mes && d.getFullYear() === ano;
        })
        .reduce((acc, p) => acc + Number(p.valor), 0);
      const percentual = Math.max(Math.round((total / maxMensal) * 100), 5);
      grafico.push({ mes: MESES_PT[mes], valor: total, altura: `${percentual}%` });
    }

    // Faltas: alunos com ausências nos últimos 30 dias
    const trintaDiasAtras = new Date(hoje);
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const aulasComFalta = await prisma.aula.findMany({
      where: {
        professorId,
        presenca: 'AUSENCIA_ALUNO',
        dataHora: { gte: trintaDiasAtras },
      },
      include: { aluno: { select: { id: true, nome: true } } },
    });

    const faltasPorAluno = {};
    for (const aula of aulasComFalta) {
      const id = aula.aluno.id;
      if (!faltasPorAluno[id]) faltasPorAluno[id] = { id, nome: aula.aluno.nome, faltas: 0 };
      faltasPorAluno[id].faltas++;
    }

    const faltas = Object.values(faltasPorAluno).map(a => ({
      ...a,
      status: a.faltas === 0 ? 'Excelente' : a.faltas <= 1 ? 'Bom' : 'Atenção',
    }));

    // "Alunos em risco" (ideia nova, sem modelo novo): junta 3 sinais que já
    // existem espalhados — 2+ faltas em 30 dias, pagamento atrasado, ou
    // nenhuma aula futura agendada — pra não precisar abrir 3 telas
    // diferentes pra notar que um aluno pode estar prestes a cancelar.
    const [alunosAtivos, pagamentosAtrasados, aulasFuturas] = await Promise.all([
      prisma.aluno.findMany({ where: { professorId, status: 'ATIVO' }, select: { id: true, nome: true } }),
      prisma.pagamento.findMany({ where: { professorId, status: 'ATRASADO' }, select: { alunoId: true } }),
      prisma.aula.findMany({
        where: { professorId, dataHora: { gte: hoje }, status: { not: 'CANCELADA' } },
        select: { alunoId: true },
      }),
    ]);
    const idsComAtraso = new Set(pagamentosAtrasados.map(p => p.alunoId));
    const idsComAulaFutura = new Set(aulasFuturas.map(a => a.alunoId));

    const alunosEmRisco = alunosAtivos
      .map(a => {
        const motivos = [];
        const qtdFaltas = faltasPorAluno[a.id]?.faltas || 0;
        if (qtdFaltas >= 2) motivos.push(`${qtdFaltas} faltas nos últimos 30 dias`);
        if (idsComAtraso.has(a.id)) motivos.push('Pagamento atrasado');
        if (!idsComAulaFutura.has(a.id)) motivos.push('Sem aula futura agendada');
        return { id: a.id, nome: a.nome, motivos };
      })
      .filter(a => a.motivos.length > 0);

    res.json({ faturamentoAtual, grafico, faltas, alunosEmRisco });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});
// ─── CHECKOUT REDIRECTS (Stripe exige HTTPS; estas páginas redirecionam ao deep link) ──
app.get('/checkout/sucesso', (req, res) => {
  const { session_id } = req.query;
  // IDs de sessão do Stripe são sempre alfanuméricos/underscore — qualquer
  // outra coisa aqui é reinterpolada direto num <script>, então descarta em
  // vez de refletir sem escapar (evita XSS refletido nessa página de redirect).
  const sessionIdSeguro = typeof session_id === 'string' && /^[A-Za-z0-9_]+$/.test(session_id) ? session_id : null;
  const qs = sessionIdSeguro ? `?session_id=${sessionIdSeguro}` : '';
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=kavclass://pagamento-sucesso${qs}">
</head><body><script>window.location="kavclass://pagamento-sucesso${qs}";</script>
<p>Redirecionando para o aplicativo...</p></body></html>`);
});

app.get('/checkout/cancelado', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=kavclass://pagamento-cancelado">
</head><body><script>window.location="kavclass://pagamento-cancelado";</script>
<p>Redirecionando para o aplicativo...</p></body></html>`);
});

// ─── REDIRECTS: COBRANÇA AUTOMÁTICA ALUNO → ESCOLA (S3.1) ───────────────────
app.get('/checkout/cobranca-sucesso', (req, res) => {
  const { session_id } = req.query;
  const sessionIdSeguro = typeof session_id === 'string' && /^[A-Za-z0-9_]+$/.test(session_id) ? session_id : null;
  const qs = sessionIdSeguro ? `?session_id=${sessionIdSeguro}` : '';
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=kavclass://cobranca-automatica-sucesso${qs}">
</head><body><script>window.location="kavclass://cobranca-automatica-sucesso${qs}";</script>
<p>Redirecionando para o aplicativo...</p></body></html>`);
});

app.get('/checkout/cobranca-cancelada', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=kavclass://cobranca-automatica-cancelada">
</head><body><script>window.location="kavclass://cobranca-automatica-cancelada";</script>
<p>Redirecionando para o aplicativo...</p></body></html>`);
});

// ─── REDIRECTS: ONBOARDING STRIPE CONNECT DA ESCOLA (S3.1) ──────────────────
// Mesmo destino nos dois casos: o app reconsulta o status ao ganhar foco,
// não precisa diferenciar "voltou terminado" de "voltou pra continuar depois".
app.get('/stripe-connect/retorno', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=kavclass://stripe-connect-retorno">
</head><body><script>window.location="kavclass://stripe-connect-retorno";</script>
<p>Redirecionando para o aplicativo...</p></body></html>`);
});

app.get('/stripe-connect/atualizar', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=kavclass://stripe-connect-retorno">
</head><body><script>window.location="kavclass://stripe-connect-retorno";</script>
<p>Redirecionando para o aplicativo...</p></body></html>`);
});

// ─── CHECKOUT: ASSINATURA KAV CLASS ─────────────────────────────────────────
// Planos em 2 níveis (Rede Social — planos/captação, 18/09/2026): BASICO só
// ferramentas de gestão (SaaS), COMPLETO soma a Rede Social (busca pública,
// avaliações, ranking). Substituem os planos antigos pro/premium/one-time
// (produtos/preços novos criados no Stripe em 18/09/2026, price_ids abaixo).
const STRIPE_PRICE_IDS = {
  professor_basico:   'price_1UH31eRZkemiSVh6ZRM0RoAU',
  professor_completo: 'price_1UH31eRZkemiSVh62f0Pi1Y8',
  escola_basico:       'price_1UH31fRZkemiSVh6zjD5u0tq',
  escola_completo:     'price_1UH31gRZkemiSVh6ZRO4CfER',
};

// plano ('professor_basico'|'professor_completo'|'escola_basico'|'escola_completo')
// → { tipoConta, nivel } usado pra decidir o que atualizar no banco após o
// pagamento (Professor.nivelPlano ou Escola.nivelPlano).
function decompoePlano(plano) {
  const tipoConta = plano.startsWith('escola_') ? 'escola' : 'professor';
  const nivel = plano.endsWith('_completo') ? 'COMPLETO' : 'BASICO';
  return { tipoConta, nivel };
}

// Aplica o resultado de um pagamento confirmado (chamado tanto pelo polling
// de /checkout/verify quanto pelo webhook checkout.session.completed — os
// dois caminhos existem porque nem todo device volta a rodar o app a tempo
// do webhook, e nem todo ambiente tem STRIPE_WEBHOOK_SECRET configurado).
// Idempotente: rodar duas vezes com a mesma session não duplica nada, só
// reescreve os mesmos campos.
async function ativarAssinaturaPosCheckout(session) {
  const professorId = session.client_reference_id;
  const plano = session.metadata?.plano;
  if (!professorId || !plano || !STRIPE_PRICE_IDS[plano]) return null;

  const { tipoConta, nivel } = decompoePlano(plano);

  const professor = await prisma.professor.update({
    where: { id: professorId },
    data: {
      ...(session.customer ? { stripeCustomerId: String(session.customer) } : {}),
      stripeSessionId: session.id,
      assinaturaStatus: 'ATIVO',
      // Escola: quem paga é o DONO, mas o nível (Básico/Completo) que abre
      // busca/avaliações públicas é o da Escola inteira, não da vitrine
      // pessoal deste Professor — por isso só grava nivelPlano aqui quando
      // for de fato um plano de professor.
      ...(tipoConta === 'professor' ? { nivelPlano: nivel } : {}),
    },
    select: { id: true, escolaId: true, codigoConvite: true, nome: true, assinaturaStatus: true },
  });

  if (tipoConta === 'escola') {
    await prisma.escola.update({ where: { id: professor.escolaId }, data: { nivelPlano: nivel } });
  }

  return professor;
}

app.post('/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ erro: 'Serviço de pagamento não configurado. Contate o suporte.' });
  }
  try {
    const { professorId, email, plano = 'professor_basico', nome, senha, telefone, cursos, fotoUrl } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const priceId = STRIPE_PRICE_IDS[plano];
    if (!priceId) return res.status(400).json({ erro: 'Plano inválido.' });
    const { tipoConta } = decompoePlano(plano);

    const emailNorm = email.toLowerCase().trim();
    let pid = professorId;

    if (pid) {
      // Rota semi-pública (roda antes/ao redor do login) — não dá pra exigir
      // JWT aqui sem quebrar o fluxo de "teste venceu, escolha um plano".
      // Mas aceitar um professorId puro sem checar nada permitiria ativar a
      // assinatura de qualquer um só sabendo o UUID. Exigir que o e-mail bata
      // com o dono daquele id fecha isso sem mudar o fluxo pra quem já sabe
      // o próprio e-mail (o caso normal).
      const existente = await prisma.professor.findUnique({
        where: { id: pid },
        select: { email: true, assinaturaStatus: true, papel: true, escola: { select: { pacote: true } } },
      });
      if (!existente || existente.email !== emailNorm) {
        return res.status(404).json({ erro: 'Professor não encontrado.' });
      }
      if (existente.assinaturaStatus === 'ATIVO' || existente.assinaturaStatus === 'VITALICIO') {
        return res.status(400).json({ erro: 'Este e-mail já possui uma assinatura ativa.' });
      }
      // Checkout de Escola (S18.09.2026): quem paga tem que ser de fato o
      // DONO de uma instituição já cadastrada (POST /api/escola/cadastro) —
      // um professor comum tentando comprar plano de Escola (ou vice-versa)
      // cai aqui, não no Stripe.
      if (tipoConta === 'escola' && (existente.papel !== 'DONO' || existente.escola?.pacote !== 'PACOTE_ESCOLA')) {
        return res.status(400).json({ erro: 'Esta conta não é uma Escola cadastrada.' });
      }
      if (tipoConta === 'professor' && existente.escola?.pacote === 'PACOTE_ESCOLA' && existente.papel === 'DONO') {
        return res.status(400).json({ erro: 'Esta conta é uma Escola — escolha um plano de Escola.' });
      }
    } else if (tipoConta === 'escola') {
      // Não existe criação de Escola pelo checkout — a instituição já nasce
      // via POST /api/escola/cadastro (com teste grátis). Chegar aqui sem
      // professorId só faz sentido pro professorId ser sempre enviado.
      return res.status(400).json({ erro: 'professorId é obrigatório para o plano de Escola.' });
    } else {
      let prof = await prisma.professor.findFirst({ where: { email: emailNorm }, orderBy: { createdAt: 'asc' } });

      if (!prof) {
        // Novo professor: cria com status PENDENTE aguardando pagamento
        if (!nome || !senha) {
          return res.status(400).json({ erro: 'Dados de cadastro incompletos. Volte e preencha o formulário.' });
        }
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);
        const contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome: nome.trim(), fotoUrl: fotoUrl || null });
        prof = await prisma.professor.create({
          data: {
            nome: nome.trim(),
            email: emailNorm,
            senha: senhaHash,
            // conta:{connect}, não contaId escalar (ver comentário em
            // /api/professores/cadastro).
            conta: contaId ? { connect: { id: contaId } } : undefined,
            telefone: telefone || null,
            cursos: Array.isArray(cursos) ? cursos : [],
            codigoConvite: gerarCodigoConvite(),
            assinaturaStatus: 'PENDENTE',
            fotoUrl: fotoUrl || null,
            // Toda conta nova é dona da própria Escola de 1 pessoa (Pacote Professor
            // por padrão) — ver docs/roadmap-escola.md, Fase 0.
            escola: { create: { nome: nome.trim() } },
          },
        });
      } else if (prof.assinaturaStatus === 'ATIVO' || prof.assinaturaStatus === 'VITALICIO') {
        return res.status(400).json({ erro: 'Este e-mail já possui uma assinatura ativa.' });
      }

      pid = prof.id;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: emailNorm,
      client_reference_id: pid,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: 'https://kav-class-1.onrender.com/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://kav-class-1.onrender.com/checkout/cancelado',
      metadata: { professorId: pid, plano },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const msg = error?.raw?.message || error?.message || 'Erro ao gerar sessão de pagamento.';
    console.error('[Checkout] Erro no Stripe:', msg);
    res.status(500).json({ erro: msg });
  }
});

// ─── VERIFICAR E ATIVAR SESSÃO DE CHECKOUT ───────────────────────────────────
app.get('/checkout/verify/:sessionId', async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status !== 'paid') {
      return res.json({ ativo: false });
    }

    if (!session.client_reference_id) return res.json({ ativo: true });

    const prof = await ativarAssinaturaPosCheckout(session);
    res.json({ ativo: true, professor: prof });
  } catch (err) {
    console.error('[Verify] Erro ao verificar sessão:', err.message);
    res.status(500).json({ erro: 'Erro ao verificar pagamento.' });
  }
});

// ─── STATUS DE ASSINATURA DO PROFESSOR ───────────────────────────────────────
app.get('/api/professor/assinatura/:professorId', exigirProfessor, async (req, res) => {
  try {
    const professor = await prisma.professor.findUnique({
      where: { id: req.auth.id },
      select: {
        assinaturaStatus: true,
        assinaturaFim: true,
        stripeCustomerId: true,
        email: true,
        codigoConvite: true,
        modalidadeEnsino: true,
        escola: { select: { pacote: true, modalidadeEnsino: true } },
      },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    const pacote = professor.escola?.pacote || 'PACOTE_PROFESSOR';
    res.json({
      assinaturaStatus: professor.assinaturaStatus,
      assinaturaFim: professor.assinaturaFim,
      stripeCustomerId: professor.stripeCustomerId,
      email: professor.email,
      codigoConvite: professor.codigoConvite,
      pacote,
      modalidadeEnsino: pacote === 'PACOTE_ESCOLA' ? (professor.escola?.modalidadeEnsino || []) : professor.modalidadeEnsino,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ─── CANCELAR ASSINATURA (mantém acesso até o fim do período já pago) ───────
app.post('/api/professor/assinatura/cancelar', exigirProfessor, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Serviço de pagamento não configurado.' });
  try {
    const professorId = req.auth.id;

    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: { assinaturaStatus: true, stripeCustomerId: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    if (professor.assinaturaStatus !== 'ATIVO' || !professor.stripeCustomerId) {
      return res.status(400).json({ erro: 'Não há assinatura ativa para cancelar.' });
    }

    const assinaturas = await stripe.subscriptions.list({
      customer: professor.stripeCustomerId,
      status: 'active',
      limit: 1,
    });
    const assinatura = assinaturas.data[0];
    if (!assinatura) return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada no Stripe.' });

    const atualizada = await stripe.subscriptions.update(assinatura.id, { cancel_at_period_end: true });
    const cancelaEm = atualizada.current_period_end ? new Date(atualizada.current_period_end * 1000) : null;

    if (cancelaEm) {
      await prisma.professor.update({ where: { id: professorId }, data: { assinaturaFim: cancelaEm } });
    }

    res.json({
      mensagem: 'Assinatura cancelada. Você mantém acesso até o fim do período já pago.',
      cancelaEm,
    });
  } catch (err) {
    console.error('[Assinatura] Erro ao cancelar:', err.message);
    res.status(500).json({ erro: 'Erro ao cancelar assinatura.' });
  }
});

// POST /api/professor/self/ativar — Rede Social Fase 1, Step 2. Professor
// filiado a uma Escola institucional (PACOTE_ESCOLA) que quer também atuar
// como SELF autônomo (aparecer em busca de aula particular, ter alunos
// próprios). Não reaproveita a linha institucional: cria uma SEGUNDA linha
// Professor, presa à mesma Conta (contaId), dona de uma Escola stub pessoal
// nova (PACOTE_PROFESSOR) — o mesmíssimo padrão que já existe pra todo
// professor autônomo (escola: { create: { nome } }, ver /api/professores/
// cadastro). A linha institucional nunca é tocada: continua com seu próprio
// assinaturaStatus (normalmente ATIVO de graça, por já fazer parte de uma
// Escola paga — server.js, comentário em /api/escola/convites/aceitar) —
// a linha SELF nova começa em TESTE, com o mesmo trial de 15 dias de
// qualquer professor autônomo novo, e vive seu próprio ciclo de assinatura
// dali pra frente (Stripe, /api/professor/assinatura/*), sem herdar nada.
app.post('/api/professor/self/ativar', exigirProfessor, async (req, res) => {
  try {
    if (!MULTI_VINCULO_HABILITADO) {
      return res.status(403).json({ erro: 'Recurso ainda não disponível.' });
    }

    const institucional = await prisma.professor.findUnique({ where: { id: req.auth.id } });
    if (!institucional) return res.status(404).json({ erro: 'Professor não encontrado.' });
    if (!institucional.contaId) {
      return res.status(400).json({ erro: 'Sua conta ainda não foi migrada para o novo login. Fale com o suporte.' });
    }

    const jaTemSelf = await prisma.professor.findFirst({
      where: { contaId: institucional.contaId, escola: { pacote: 'PACOTE_PROFESSOR' } },
    });
    if (jaTemSelf) return res.status(400).json({ erro: 'Você já tem uma prática SELF ativa.' });

    const { cursos } = req.body;
    const selfProfessor = await prisma.professor.create({
      data: {
        nome: institucional.nome,
        email: institucional.email,
        // conta:{connect}, não contaId escalar (ver comentário em
        // /api/professores/cadastro).
        conta: { connect: { id: institucional.contaId } },
        senha: null, // login sempre via Conta a partir daqui (sincronizarConta já manteve Conta.senha em dia)
        fotoUrl: institucional.fotoUrl,
        telefone: institucional.telefone,
        cursos: Array.isArray(cursos) && cursos.length ? cursos : (institucional.cursos || []),
        codigoConvite: gerarCodigoConvite(),
        assinaturaStatus: 'TESTE',
        assinaturaFim: new Date(Date.now() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000),
        escola: { create: { nome: institucional.nome } },
      },
    });

    const token = jwt.sign({ id: selfProfessor.id, papel: 'professor', contaId: institucional.contaId }, SEGREDO_JWT, { expiresIn: '7d' });
    res.status(201).json({
      mensagem: 'SELF ativado! Teste grátis de 15 dias.',
      token,
      usuario: { id: selfProfessor.id, nome: selfProfessor.nome, papel: 'professor' },
      codigoConvite: selfProfessor.codigoConvite,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao ativar SELF.' });
  }
});

// ============================================================================
// 13. ESCOLA / GESTOR (Fase 0)
//
// Autenticação real (jwt.verify de verdade) — diferente do resto da API, que
// confia no professorId/alunoId mandado pelo cliente sem checar o token
// (falha de autorização pré-existente, fora do escopo desta sprint: ver
// docs/migrations/s0-2-escola-gestor-runbook.md). As rotas abaixo usam o id
// de dentro do token, nunca o que vier solto em query/body.
// ============================================================================

// Devolve o professorId autenticado, ou responde o erro certo (401/403) e
// devolve null. Usada pelas rotas de Escola/Gestor, que precisam do id antes
// de decidir se seguem (não dá pra usar o middleware `exigirProfessor` direto
// porque essas rotas ainda checam o papel dentro da Escola depois).
function autenticarProfessor(req, res) {
  const payload = _decodificarToken(req, res);
  if (!payload) return null;
  if (payload.papel !== 'professor') {
    res.status(403).json({ erro: 'Acesso restrito a professores.' });
    return null;
  }
  return payload.id;
}

// Autentica e carrega o Professor + Escola, garantindo que o papel dele na
// Escola está entre os permitidos pra essa rota. Devolve null (já com o
// status certo respondido) se qualquer checagem falhar.
// `chaveModulo` (INSTITUTION, 21/09/2026 — persona Secretaria): quando
// informado, SECRETARIA também passa (além de quem já está em
// papeisPermitidos), mas só se a chave estiver em
// professor.permissoesSecretaria — a chave é a mesma de `chave` em
// NAV_ESCOLA (frontend). Chamada sem esse argumento (a esmagadora maioria
// das 69 chamadas existentes) mantém o comportamento de sempre: SECRETARIA
// nunca passa, DONO/GESTOR passam se estiverem em papeisPermitidos — zero
// mudança de comportamento pra quem já usava o sistema antes desta persona
// existir.
async function exigirPapelNaEscola(req, res, papeisPermitidos, chaveModulo) {
  const professorId = autenticarProfessor(req, res);
  if (!professorId) return null;

  const professor = await prisma.professor.findUnique({
    where: { id: professorId },
    select: {
      id: true,
      nome: true,
      papel: true,
      escolaId: true,
      permissoesSecretaria: true,
      // Sprint 1 (INSTITUTION, briefing 08/09/2026): logoUrl/email/horarioFuncionamento/
      // valorPorAula/tipoRemuneracaoProfessor/diaFechamento adicionados aqui —
      // sem isso, GET /api/escola/perfil (que lê professor.escola.*) sempre
      // devolvia esses campos undefined, mesmo já gravados no banco pelo PUT.
      // bio/cidade/estado/modalidadeEnsino adicionados aqui pelo mesmo motivo do
      // comentário acima: sem estar neste select, GET /api/escola/perfil devolve
      // esses campos sempre undefined mesmo já gravados pelo PUT.
      escola: { select: { id: true, nome: true, pacote: true, codigoConvite: true, logoUrl: true, email: true, horarioFuncionamento: true, valorPorAula: true, tipoRemuneracaoProfessor: true, diaFechamento: true, bio: true, cidade: true, estado: true, modalidadeEnsino: true, whatsapp: true } },
    },
  });
  if (!professor) {
    res.status(404).json({ erro: 'Professor não encontrado.' });
    return null;
  }

  const papelPermitidoDireto = papeisPermitidos.includes(professor.papel);
  // Generalizado pra FUNCIONARIO (INSTITUTION Sprint 16, briefing
  // 22/09/2026) — permissoesSecretaria (nome do campo preservado) agora
  // vale igual pras duas personas de staff não-professor.
  const papelPermitidoPorFuncao = chaveModulo && ['SECRETARIA', 'FUNCIONARIO'].includes(professor.papel)
    && (professor.permissoesSecretaria || []).includes(chaveModulo);
  if (!papelPermitidoDireto && !papelPermitidoPorFuncao) {
    res.status(403).json({ erro: 'Você não tem permissão para acessar isso.' });
    return null;
  }
  return professor;
}

// GET /api/escola/professores — DONO/GESTOR vê todo mundo da própria Escola.
app.get('/api/escola/professores', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'equipe');
    if (!professor) return;

    const professores = await prisma.professor.findMany({
      // ativoNaEscola: true — professor desligado (soft delete) some da
      // lista da Equipe, mas continua intacto no banco (auditoria
      // INSTITUTION, 11/09/2026). papel not in [SECRETARIA, FUNCIONARIO] —
      // esse staff tem aba própria (GET /api/escola/secretarias, Sprint 16
      // generalizada pra FUNCIONARIO), fora da Equipe.
      where: { escolaId: professor.escolaId, ativoNaEscola: true, papel: { notIn: ['SECRETARIA', 'FUNCIONARIO'] } },
      select: { id: true, nome: true, email: true, papel: true, fotoUrl: true, telefone: true, dataNascimento: true, contratoUrl: true, cpf: true, endereco: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(professores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar professores.' });
  }
});

// GET /api/escola/alunos — DONO/GESTOR vê os alunos de todos os professores
// da própria Escola (as rotas de professor individual continuam escopadas só
// pelos alunos dele, sem mudança nenhuma).
app.get('/api/escola/alunos', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professor) return;

    const alunos = await prisma.aluno.findMany({
      where: { escolaId: professor.escolaId },
      select: {
        id: true, nome: true, email: true, status: true, curso: true, fotoUrl: true,
        telefone: true, dataNascimento: true, tempoContrato: true, dataInicioContrato: true,
        contratoUrl: true, cpf: true, endereco: true, vinculoResponsavel: true,
        responsavel: { select: { id: true, nome: true, cpf: true, email: true, telefone: true } },
        professor: { select: { id: true, nome: true } },
        matriculas: {
          select: {
            id: true, valorMensalidade: true, diaVencimento: true, status: true,
            planoPersonalizadoDescricao: true,
            professor: { select: { id: true, nome: true } },
            turma: { select: { id: true, nome: true, curso: { select: { id: true, nome: true } } } },
            planoPagamento: { select: { id: true, nome: true } },
            contratos: { select: { id: true, status: true, token: true, nomeAssinanteResponsavel: true, nomeRepresentanteEscola: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { nome: 'asc' },
    });
    res.json(alunos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar alunos.' });
  }
});

// GET /api/escola/perfil — dados da Escola pro painel do DONO/GESTOR.
app.get('/api/escola/perfil', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'configuracoes');
    if (!professor) return;

    res.json({
      id: professor.escola.id,
      nome: professor.escola.nome,
      pacote: professor.escola.pacote,
      logoUrl: professor.escola.logoUrl,
      email: professor.escola.email,
      horarioFuncionamento: professor.escola.horarioFuncionamento,
      valorPorAula: professor.escola.valorPorAula,
      tipoRemuneracaoProfessor: professor.escola.tipoRemuneracaoProfessor,
      diaFechamento: professor.escola.diaFechamento,
      bio: professor.escola.bio,
      cidade: professor.escola.cidade,
      estado: professor.escola.estado,
      modalidadeEnsino: professor.escola.modalidadeEnsino,
      whatsapp: professor.escola.whatsapp,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar perfil da Escola.' });
  }
});

// PUT /api/escola/perfil — Perfil da Instituição (INSTITUTION Sprint 1,
// briefing 08/09/2026): DONO/GESTOR edita os dados da própria Escola.
// tipoRemuneracaoProfessor + valorPorAula são a base do cálculo de
// pagamento de professor (Sprint 7) — v1 global por Escola, sem regra por
// professor individual (isso fica pra RegraPagamentoProfessor de S8.3,
// quando a Fase 7/RBAC estiver pronta).
app.put('/api/escola/perfil', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'configuracoes');
    if (!professor) return;

    const {
      nome, logoUrl, email, horarioFuncionamento, valorPorAula, tipoRemuneracaoProfessor, diaFechamento,
      bio, cidade, estado, modalidadeEnsino, whatsapp,
    } = req.body;

    const data = {};
    if (nome !== undefined) {
      if (!nome?.trim()) return res.status(400).json({ erro: 'nome não pode ficar vazio.' });
      data.nome = nome.trim();
    }
    if (logoUrl !== undefined) data.logoUrl = logoUrl || null;
    if (email !== undefined) data.email = email?.trim() || null;
    if (horarioFuncionamento !== undefined) data.horarioFuncionamento = horarioFuncionamento;
    // Perfil vitrine (Rede Social Fase 3) — visível em /api/escolas/:id/perfil-publico.
    if (bio !== undefined) data.bio = bio?.trim() || null;
    if (cidade !== undefined) data.cidade = cidade?.trim() || null;
    if (estado !== undefined) data.estado = estado?.trim().toUpperCase() || null;
    if (whatsapp !== undefined) data.whatsapp = whatsapp?.replace(/\D/g, '') || null;
    if (modalidadeEnsino !== undefined) {
      const valores = Array.isArray(modalidadeEnsino) ? modalidadeEnsino : [];
      if (!valores.length || !valores.every((m) => ['PRESENCIAL', 'REMOTO', 'ONLINE'].includes(m))) {
        return res.status(400).json({ erro: 'modalidadeEnsino inválido — use PRESENCIAL, REMOTO e/ou ONLINE.' });
      }
      data.modalidadeEnsino = valores;
    }
    if (valorPorAula !== undefined) data.valorPorAula = valorPorAula === null ? null : Number(valorPorAula);
    if (tipoRemuneracaoProfessor !== undefined) {
      if (!['POR_AULA', 'POR_ALUNO_MES'].includes(tipoRemuneracaoProfessor)) {
        return res.status(400).json({ erro: 'tipoRemuneracaoProfessor inválido.' });
      }
      data.tipoRemuneracaoProfessor = tipoRemuneracaoProfessor;
    }
    if (diaFechamento !== undefined) data.diaFechamento = diaFechamento === null ? null : Number(diaFechamento);

    const atualizada = await prisma.escola.update({ where: { id: professor.escolaId }, data });
    res.json({ mensagem: 'Perfil da Instituição atualizado!', escola: atualizada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil da Escola.' });
  }
});

// PATCH /api/escola/alunos/:id/atribuir-professor — DONO/GESTOR atribui um
// professor a um aluno que entrou pelo código da Escola (S6.1) e ainda não
// tem professorId. A partir daqui o próprio professor segue o fluxo normal
// (POST /api/configurar-aluno) pra ativar horário/cobrança.
app.patch('/api/escola/alunos/:id/atribuir-professor', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const { professorId } = req.body;
    if (!professorId) return res.status(400).json({ erro: 'professorId é obrigatório.' });

    const aluno = await prisma.aluno.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });
    if (aluno.professorId) return res.status(400).json({ erro: 'Este aluno já tem professor atribuído.' });

    const professorAlvo = await prisma.professor.findFirst({ where: { id: professorId, escolaId: professorLogado.escolaId } });
    if (!professorAlvo) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const atualizado = await prisma.aluno.update({
      where: { id: aluno.id },
      data: { professorId: professorAlvo.id },
      select: { id: true, nome: true, professor: { select: { id: true, nome: true } } },
    });

    // Avisa o professor recém-atribuído (auditoria INSTITUTION, 11/09/2026)
    // — antes disso só descobria abrindo a lista de alunos manualmente.
    if (professorAlvo.expoPushToken) {
      enviarPushNotificacao(professorAlvo.expoPushToken, 'Novo aluno atribuído', `${aluno.nome} foi atribuído a você.`, { tipo: 'NOVO_ALUNO' })
        .catch((err) => console.error('[Push] Falha ao notificar professor atribuído:', err.message));
    }

    res.json({ mensagem: 'Professor atribuído! Ele já pode configurar horário e cobrança deste aluno.', aluno: atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atribuir professor.' });
  }
});

// POST /api/escola/professores/criar — DONO/GESTOR cria a conta do
// professor na hora, com senha definida ali mesmo (fluxo institucional,
// sem depender do professor abrir e-mail e aceitar convite — ver
// /api/escola/convites pro fluxo por e-mail que continua existindo).
app.post('/api/escola/professores/criar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    if (professor.escola.pacote !== 'PACOTE_ESCOLA') {
      return res.status(403).json({ erro: 'Criar professores é um recurso do Pacote Escola.' });
    }

    const {
      nome, email, senha, papel, telefone, contatoEmergencia,
      dataNascimento, dataPagamento, contratoUrl, cursos, fotoUrl, permissoesSecretaria, cargo,
      cpf, endereco,
    } = req.body;
    if (!nome?.trim() || !email?.trim() || !senha) {
      return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });
    }
    if (senha.length < 6) return res.status(400).json({ erro: 'senha: mínimo 6 caracteres.' });

    const emailNorm = email.toLowerCase().trim();
    if (await prisma.professor.findFirst({ where: { email: emailNorm } })) {
      return res.status(400).json({ erro: 'Já existe uma conta com esse e-mail.' });
    }

    // nunca cria DONO por aqui. FUNCIONARIO (Sprint 16, briefing 22/09/2026)
    // é o cadastro genérico de qualquer segmento/associado além de
    // "secretária" — mesmo mecanismo de permissoesSecretaria, só muda o
    // papel e ganha um `cargo` livre (rótulo, não controla acesso).
    const papelNovo = papel === 'GESTOR' ? 'GESTOR' : papel === 'SECRETARIA' ? 'SECRETARIA' : papel === 'FUNCIONARIO' ? 'FUNCIONARIO' : 'PROFESSOR';
    let permissoesValidas = [];
    if (papelNovo === 'SECRETARIA' || papelNovo === 'FUNCIONARIO') {
      const pedidas = Array.isArray(permissoesSecretaria) ? permissoesSecretaria : [];
      permissoesValidas = pedidas.filter((p) => CHAVES_PERMISSAO_SECRETARIA.includes(p));
    }
    const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
    const contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome: nome.trim(), fotoUrl: fotoUrl || null });

    const novoProfessor = await prisma.professor.create({
      data: {
        nome: nome.trim(),
        email: emailNorm,
        senha: senhaHash,
        contaId,
        telefone: telefone?.trim() || null,
        contatoEmergencia: contatoEmergencia?.trim() || null,
        dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
        dataPagamento: dataPagamento === undefined || dataPagamento === null ? null : Number(dataPagamento),
        contratoUrl: contratoUrl || null,
        cursos: Array.isArray(cursos) ? cursos : (cursos ? [cursos] : []),
        fotoUrl: fotoUrl || null,
        codigoConvite: gerarCodigoConvite(),
        assinaturaStatus: 'ATIVO', // parte de uma Escola já paga
        escolaId: professor.escolaId,
        papel: papelNovo,
        permissoesSecretaria: permissoesValidas,
        cargo: papelNovo === 'FUNCIONARIO' ? (cargo?.trim() || null) : null,
        cpf: cpf?.trim() || null,
        endereco: endereco?.trim() || null,
      },
      select: {
        id: true, nome: true, email: true, papel: true, telefone: true,
        contatoEmergencia: true, dataNascimento: true, dataPagamento: true,
        contratoUrl: true, cursos: true, fotoUrl: true, createdAt: true, permissoesSecretaria: true, cargo: true,
        cpf: true, endereco: true,
      },
    });

    const rotuloPapel = papelNovo === 'SECRETARIA' ? 'Secretaria criada!' : papelNovo === 'FUNCIONARIO' ? 'Funcionário criado!' : 'Professor criado!';
    res.status(201).json({ mensagem: rotuloPapel, professor: novoProfessor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar professor.' });
  }
});

// Chaves válidas de permissoesSecretaria — mesma `chave` dos itens de
// Gestão/Crescimento/Operação/Instituição em NAV_ESCOLA (frontend). Social
// e Painel ficam sempre visíveis pra qualquer papel, por isso não entram
// aqui (ver components/institution/SidebarNavGrupos.tsx).
const CHAVES_PERMISSAO_SECRETARIA = [
  'equipe', 'alunos', 'logistica', 'reposicoes', 'coordenacao', 'calendario', 'chats',
  'captacao', 'comunicados',
  'recursos', 'financeiro', 'relatorios',
  'fiscal',
  'configuracoes',
];

// GET /api/escola/secretarias — DONO/GESTOR lista o staff não-professor da
// própria Escola (Sprint Secretaria, 21/09/2026; generalizado pra
// FUNCIONARIO no Sprint 16, briefing 22/09/2026 — "qualquer funcionário ou
// associado", não só secretária), com as permissões atuais de cada um.
app.get('/api/escola/secretarias', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const secretarias = await prisma.professor.findMany({
      where: { escolaId: professor.escolaId, papel: { in: ['SECRETARIA', 'FUNCIONARIO'] }, ativoNaEscola: true },
      select: { id: true, nome: true, email: true, fotoUrl: true, papel: true, cargo: true, permissoesSecretaria: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ secretarias, chavesDisponiveis: CHAVES_PERMISSAO_SECRETARIA });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar secretarias.' });
  }
});

// PUT /api/escola/secretarias/:id/permissoes — DONO/GESTOR ajusta o
// limitador de acesso por função de uma pessoa do staff (secretária ou
// funcionário genérico).
app.put('/api/escola/secretarias/:id/permissoes', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const alvo = await prisma.professor.findFirst({ where: { id: req.params.id, escolaId: professor.escolaId, papel: { in: ['SECRETARIA', 'FUNCIONARIO'] } } });
    if (!alvo) return res.status(404).json({ erro: 'Funcionário não encontrado nesta Escola.' });

    const pedidas = Array.isArray(req.body.permissoesSecretaria) ? req.body.permissoesSecretaria : [];
    const permissoesValidas = pedidas.filter((p) => CHAVES_PERMISSAO_SECRETARIA.includes(p));

    const atualizada = await prisma.professor.update({
      where: { id: alvo.id },
      data: { permissoesSecretaria: permissoesValidas },
      select: { id: true, nome: true, email: true, permissoesSecretaria: true },
    });
    res.json({ mensagem: 'Permissões atualizadas!', secretaria: atualizada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar permissões.' });
  }
});

// Quantos DONO/GESTOR ativos sobram na Escola, sem contar um professor
// específico (quem está sendo rebaixado/removido) — usado pra impedir que a
// escola fique sem ninguém com acesso de gestão (auditoria INSTITUTION,
// 11/09/2026).
async function contarGestaoAtiva(escolaId, excluindoProfessorId) {
  return prisma.professor.count({
    where: { escolaId, ativoNaEscola: true, papel: { in: ['DONO', 'GESTOR'] }, NOT: { id: excluindoProfessorId } },
  });
}

// PUT /api/escola/professores/:id — DONO/GESTOR edita o cadastro completo
// de um professor da própria Escola (INSTITUTION Sprint 1, briefing
// 08/09/2026). Sem troca de e-mail/senha aqui de propósito — segue o
// mesmo padrão de PUT /api/professor/perfil (autoatendimento), que já
// cuida da própria senha do professor.
//
// `papel` (auditoria INSTITUTION, 11/09/2026): só alterna PROFESSOR↔GESTOR
// — nunca promove a DONO por aqui (DONO só nasce na criação da Escola,
// decisão consciente pra não ter "transferência de titularidade" pela
// Equipe) nem edita quem já é DONO. Rebaixar o último GESTOR sem sobrar
// outro DONO/GESTOR ativo é bloqueado — a escola nunca pode ficar sem
// ninguém com acesso de gestão.
app.put('/api/escola/professores/:id', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    const alvo = await prisma.professor.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!alvo) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const {
      nome, telefone, contatoEmergencia, dataNascimento,
      dataPagamento, contratoUrl, cursos, fotoUrl, papel, cpf, endereco,
    } = req.body;

    const data = {};
    if (nome !== undefined) {
      if (!nome?.trim()) return res.status(400).json({ erro: 'nome não pode ficar vazio.' });
      data.nome = nome.trim();
    }
    if (telefone !== undefined) data.telefone = telefone?.trim() || null;
    if (contatoEmergencia !== undefined) data.contatoEmergencia = contatoEmergencia?.trim() || null;
    if (dataNascimento !== undefined) data.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
    if (dataPagamento !== undefined) data.dataPagamento = dataPagamento === null ? null : Number(dataPagamento);
    if (contratoUrl !== undefined) data.contratoUrl = contratoUrl || null;
    if (cursos !== undefined) data.cursos = Array.isArray(cursos) ? cursos : (cursos ? [cursos] : []);
    if (fotoUrl !== undefined) data.fotoUrl = fotoUrl || null;
    if (cpf !== undefined) data.cpf = cpf?.trim() || null;
    if (endereco !== undefined) data.endereco = endereco?.trim() || null;

    if (papel !== undefined) {
      if (!['PROFESSOR', 'GESTOR'].includes(papel)) {
        return res.status(400).json({ erro: 'papel só pode ser PROFESSOR ou GESTOR por aqui.' });
      }
      if (alvo.papel === 'DONO') {
        return res.status(400).json({ erro: 'O papel do DONO não pode ser alterado por aqui.' });
      }
      if (alvo.papel === 'GESTOR' && papel === 'PROFESSOR') {
        const restam = await contarGestaoAtiva(professorLogado.escolaId, alvo.id);
        if (restam === 0) {
          return res.status(400).json({ erro: 'Não é possível rebaixar: precisa sobrar pelo menos um DONO/GESTOR ativo na escola.' });
        }
      }
      data.papel = papel;
    }

    const atualizado = await prisma.professor.update({
      where: { id: alvo.id },
      data,
      select: {
        id: true, nome: true, email: true, papel: true, telefone: true,
        contatoEmergencia: true, dataNascimento: true, dataPagamento: true,
        contratoUrl: true, cursos: true, fotoUrl: true, cpf: true, endereco: true,
      },
    });

    res.json({ mensagem: 'Professor atualizado!', professor: atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar professor.' });
  }
});

// DELETE /api/escola/professores/:id — DONO/GESTOR desliga um professor da
// Equipe (auditoria INSTITUTION, 11/09/2026). Soft delete só
// (ativoNaEscola=false): professorId é obrigatório em 11 tabelas (Aula,
// Matricula, Pagamento, Avaliacao, FolhaPagamentoProfessor etc), apagar a
// linha de verdade quebraria todo o histórico. Bloqueia auto-remoção e
// remover o último DONO/GESTOR ativo — mesmas travas do PUT acima.
app.delete('/api/escola/professores/:id', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    if (req.params.id === professorLogado.id) {
      return res.status(400).json({ erro: 'Você não pode se remover da equipe.' });
    }

    const alvo = await prisma.professor.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId, ativoNaEscola: true } });
    if (!alvo) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    if (['DONO', 'GESTOR'].includes(alvo.papel)) {
      const restam = await contarGestaoAtiva(professorLogado.escolaId, alvo.id);
      if (restam === 0) {
        return res.status(400).json({ erro: 'Não é possível remover: precisa sobrar pelo menos um DONO/GESTOR ativo na escola.' });
      }
    }

    await prisma.professor.update({ where: { id: alvo.id }, data: { ativoNaEscola: false } });
    res.json({ mensagem: 'Professor desligado da escola.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover professor.' });
  }
});

// ─── DISPONIBILIDADE DO PROFESSOR (INSTITUTION Sprint 1, briefing 08/09/2026) ───
// Grade semanal recorrente: DONO/GESTOR marca em quais dias/horas o
// professor pode dar aula (mais 1-2 pausas de café/almoço). É a regra
// global que, a partir daqui, restringe quais horários ficam clicáveis
// pra marcar aula desse professor (aplicado no frontend de Equipe/Logística
// — não faz sentido travar isso a nível de banco).
app.get('/api/escola/professores/:id/disponibilidade', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'equipe');
    if (!professorLogado) return;

    const alvo = await prisma.professor.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!alvo) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const slots = await prisma.disponibilidadeProfessor.findMany({
      where: { professorId: alvo.id },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar disponibilidade.' });
  }
});

// GET /api/escola/professores/:id/ocupacao-semanal — overlay de "em aula"
// pra grade visual (INSTITUTION Sprint 14, briefing 22/09/2026). Em vez de
// varrer todas as ocorrências futuras (uma aula recorrente existe pré-
// gerada por meses, ver gerarAulasRecorrentes), olha só os próximos 7 dias
// — como a recorrência é semanal/quinzenal/mensal alinhada ao dia da
// semana, essa janela já mostra 1 ocorrência representativa por dia/hora
// ocupado no ciclo semanal atual.
// getDay()/getHours() dependem do fuso do processo Node — em produção
// (Render) isso pode não ser America/Sao_Paulo. Extrai dia-da-semana (0=Dom)
// e hora locais via Intl, mesmo padrão de correção de fuso já usado em
// outras rotas (ex. verificarAulasAmanha, toLocaleTimeString com timeZone
// explícito). Compartilhado por qualquer rota que amostre ocupação semanal
// a partir de instâncias de Aula (professor, sala — INSTITUTION Sprint 26,
// briefing 23/09/2026).
const DIAS_INTL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function diaHoraLocal(data) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(data);
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const diaSemana = DIAS_INTL.indexOf(partes.find((p) => p.type === 'weekday')?.value || 'Sun');
  return { diaSemana, hora };
}

app.get('/api/escola/professores/:id/ocupacao-semanal', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'equipe');
    if (!professorLogado) return;

    const alvo = await prisma.professor.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!alvo) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const inicio = new Date();
    const fim = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const aulas = await prisma.aula.findMany({
      where: { professorId: alvo.id, status: { not: 'CANCELADA' }, dataHora: { gte: inicio, lte: fim } },
      include: { aluno: { select: { nome: true } } },
    });

    res.json(aulas.map((a) => ({ ...diaHoraLocal(a.dataHora), alunoNome: a.aluno.nome })));
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar ocupação semanal.');
  }
});

// PUT /api/escola/professores/:id/disponibilidade — substitui a grade
// inteira do professor de uma vez (o formulário de equipe.tsx manda o
// estado completo da planilha 7×24 a cada salvamento, mesmo padrão já
// usado em outras telas do painel pra listas pequenas e editadas em bloco).
app.put('/api/escola/professores/:id/disponibilidade', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'equipe');
    if (!professorLogado) return;

    const alvo = await prisma.professor.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!alvo) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ erro: 'slots deve ser uma lista.' });
    for (const s of slots) {
      if (
        typeof s.diaSemana !== 'number' || s.diaSemana < 0 || s.diaSemana > 6 ||
        !s.horaInicio || !s.horaFim || !['DISPONIVEL', 'PAUSA'].includes(s.tipo)
      ) {
        return res.status(400).json({ erro: 'Cada slot precisa de diaSemana (0-6), horaInicio, horaFim e tipo válidos.' });
      }
    }

    await prisma.$transaction([
      prisma.disponibilidadeProfessor.deleteMany({ where: { professorId: alvo.id } }),
      prisma.disponibilidadeProfessor.createMany({
        data: slots.map((s) => ({
          professorId: alvo.id,
          diaSemana: s.diaSemana,
          horaInicio: s.horaInicio,
          horaFim: s.horaFim,
          tipo: s.tipo,
        })),
      }),
    ]);

    const atualizado = await prisma.disponibilidadeProfessor.findMany({
      where: { professorId: alvo.id },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
    res.json(atualizado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar disponibilidade.' });
  }
});

// ─── CHAT DA TURMA (INSTITUTION Sprint 4, briefing 08/09/2026) ───────────
// Quem pode ler/postar: o próprio professor, um aluno ATIVO dele sem
// mensalidade ATRASADO (mesma fonte de verdade do KPI "Inadimplentes" do
// Painel, ver Sprint 3), ou DONO/GESTOR da mesma Escola (só leitura — a
// escola acompanha a conversa, não participa como terceira voz).
async function resolverAcessoChatTurma(req, res, professorId) {
  const payload = _decodificarToken(req, res);
  if (!payload) return null;

  const professorDaTurma = await prisma.professor.findUnique({ where: { id: professorId } });
  if (!professorDaTurma) { res.status(404).json({ erro: 'Professor não encontrado.' }); return null; }

  if (payload.papel === 'professor' && payload.id === professorId) {
    return { podePostar: true, comoAutorTipo: 'PROFESSOR', comoAutorId: payload.id };
  }

  if (payload.papel === 'professor') {
    // Não é o dono da turma — só pode ser DONO/GESTOR da mesma Escola, olhando.
    const solicitante = await prisma.professor.findUnique({ where: { id: payload.id } });
    if (solicitante && solicitante.escolaId === professorDaTurma.escolaId && ['DONO', 'GESTOR'].includes(solicitante.papel)) {
      return { podePostar: false, comoAutorTipo: null, comoAutorId: null };
    }
    res.status(403).json({ erro: 'Você não faz parte desta turma.' });
    return null;
  }

  if (payload.papel === 'aluno') {
    const aluno = await prisma.aluno.findUnique({ where: { id: payload.id } });
    if (!aluno || aluno.professorId !== professorId || aluno.status !== 'ATIVO') {
      res.status(403).json({ erro: 'Você não faz parte desta turma.' });
      return null;
    }
    const temAtraso = await prisma.pagamento.findFirst({ where: { alunoId: aluno.id, status: 'ATRASADO' } });
    if (temAtraso) {
      res.status(403).json({ erro: 'Regularize sua mensalidade pra acessar o chat da turma.' });
      return null;
    }
    return { podePostar: true, comoAutorTipo: 'ALUNO', comoAutorId: aluno.id };
  }

  res.status(403).json({ erro: 'Acesso negado.' });
  return null;
}

// ─── GRUPO INTERNO DOS PROFESSORES (INSTITUTION Sprint 17, briefing
// 22/09/2026) ───────────────────────────────────────────────────────────
// Distinto do chat da turma logo abaixo (professor↔alunos dele): aqui é um
// grupo só entre a equipe (DONO/GESTOR/PROFESSOR) da mesma Escola. Sem
// `chaveModulo` em exigirPapelNaEscola de propósito — SECRETARIA/
// FUNCIONARIO nunca entram aqui, nem com permissão liberada (é "grupo dos
// professores", não um módulo de gestão configurável).

app.get('/api/escola/mensagens-equipe', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR', 'PROFESSOR']);
    if (!professor) return;

    const mensagens = await prisma.mensagemEquipe.findMany({
      where: { escolaId: professor.escolaId },
      include: { autor: { select: { id: true, nome: true } } },
      orderBy: [{ fixado: 'desc' }, { createdAt: 'asc' }],
    });
    res.json(mensagens);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar o grupo da equipe.');
  }
});

app.post('/api/escola/mensagens-equipe', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR', 'PROFESSOR']);
    if (!professor) return;

    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ erro: 'texto é obrigatório.' });

    const mensagem = await prisma.mensagemEquipe.create({
      data: { texto: texto.trim(), escolaId: professor.escolaId, autorId: professor.id },
      include: { autor: { select: { id: true, nome: true } } },
    });
    res.status(201).json(mensagem);
  } catch (err) {
    tratarErro(err, res, 'Erro ao enviar mensagem.');
  }
});

// PUT /api/escola/mensagens-equipe/:id/fixar — só DONO/GESTOR fixa/desfixa
// (ex.: link fixo de aula ao vivo via Meet, pedido explícito do usuário).
app.put('/api/escola/mensagens-equipe/:id/fixar', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const { fixado } = req.body;
    if (typeof fixado !== 'boolean') return res.status(400).json({ erro: 'fixado deve ser true ou false.' });

    const { count } = await prisma.mensagemEquipe.updateMany({
      where: { id: req.params.id, escolaId: professor.escolaId },
      data: { fixado },
    });
    if (!count) return res.status(404).json({ erro: 'Mensagem não encontrada nesta Escola.' });
    res.json({ mensagem: fixado ? 'Mensagem fixada.' : 'Mensagem desafixada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao fixar mensagem.');
  }
});

app.get('/api/professores/:id/chat-turma', async (req, res) => {
  try {
    const acesso = await resolverAcessoChatTurma(req, res, req.params.id);
    if (!acesso) return;

    const mensagens = await prisma.mensagemTurma.findMany({
      where: { professorId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(mensagens);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar o chat da turma.');
  }
});

// Só texto e links — de propósito, sem upload de mídia (regra explícita do
// briefing: "só texto e links, nada de mídia").
app.post('/api/professores/:id/chat-turma', async (req, res) => {
  try {
    const acesso = await resolverAcessoChatTurma(req, res, req.params.id);
    if (!acesso) return;
    if (!acesso.podePostar) return res.status(403).json({ erro: 'A Escola só acompanha esta conversa — quem participa é o professor e os alunos dele.' });

    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ erro: 'texto é obrigatório.' });

    const mensagem = await prisma.mensagemTurma.create({
      data: {
        texto: texto.trim(),
        autorTipo: acesso.comoAutorTipo,
        autorId: acesso.comoAutorId,
        professorId: req.params.id,
      },
    });
    res.status(201).json(mensagem);
  } catch (err) {
    tratarErro(err, res, 'Erro ao enviar mensagem.');
  }
});

// GET /api/escola/chats-turma — aba "Chats das Turmas": a Secretaria/gestão
// enxerga, numa lista só, todas as turmas (uma por professor) com sinal de
// atividade (última mensagem + total), sem precisar entrar professor por
// professor em Equipe. Mesma regra de acesso somente-leitura de
// resolverAcessoChatTurma, mas agregada pra escola inteira de uma vez.
app.get('/api/escola/chats-turma', async (req, res) => {
  try {
    const gestor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'chats');
    if (!gestor) return;

    const professores = await prisma.professor.findMany({
      where: { escolaId: gestor.escolaId },
      select: { id: true, nome: true, fotoUrl: true },
      orderBy: { nome: 'asc' },
    });

    const resumo = await Promise.all(professores.map(async (prof) => {
      const [ultimaMensagem, totalMensagens, alunosAtivos] = await Promise.all([
        prisma.mensagemTurma.findFirst({
          where: { professorId: prof.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.mensagemTurma.count({ where: { professorId: prof.id } }),
        prisma.aluno.count({ where: { professorId: prof.id, status: 'ATIVO' } }),
      ]);

      let autorUltimaMensagem = null;
      if (ultimaMensagem) {
        if (ultimaMensagem.autorTipo === 'PROFESSOR') {
          autorUltimaMensagem = prof.nome;
        } else {
          const aluno = await prisma.aluno.findUnique({ where: { id: ultimaMensagem.autorId }, select: { nome: true } });
          autorUltimaMensagem = aluno?.nome || 'Aluno';
        }
      }

      return {
        professorId: prof.id,
        nomeProfessor: prof.nome,
        fotoProfessor: prof.fotoUrl,
        alunosAtivos,
        totalMensagens,
        ultimaMensagem: ultimaMensagem ? {
          texto: ultimaMensagem.texto,
          autorTipo: ultimaMensagem.autorTipo,
          autor: autorUltimaMensagem,
          createdAt: ultimaMensagem.createdAt,
        } : null,
      };
    }));

    resumo.sort((a, b) => {
      const dataA = a.ultimaMensagem?.createdAt ? new Date(a.ultimaMensagem.createdAt).getTime() : 0;
      const dataB = b.ultimaMensagem?.createdAt ? new Date(b.ultimaMensagem.createdAt).getTime() : 0;
      return dataB - dataA;
    });

    res.json(resumo);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar os chats das turmas.');
  }
});

// POST /api/escola/alunos/criar — DONO/GESTOR cadastra o aluno direto,
// vinculado a um professor já existente da própria Escola (equivalente
// institucional do fluxo de "código de convite" que o aluno usaria sozinho
// em /api/alunos/cadastro).
app.post('/api/escola/alunos/criar', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const {
      nome, email, senha, professorId, telefone, curso,
      dataNascimento, tempoContrato, dataInicioContrato, contratoUrl, responsavel,
      cpf, endereco, fotoUrl,
    } = req.body;
    if (!nome?.trim() || !email?.trim() || !senha || !professorId) {
      return res.status(400).json({ erro: 'nome, email, senha e professorId são obrigatórios.' });
    }
    if (senha.length < 6) return res.status(400).json({ erro: 'senha: mínimo 6 caracteres.' });

    const professorDaTurma = await prisma.professor.findFirst({
      where: { id: professorId, escolaId: professorLogado.escolaId },
    });
    if (!professorDaTurma) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const emailNorm = email.toLowerCase().trim();
    // findFirst, não findUnique: email deixou de ser único sozinho (Rede
    // Social Fase 1, Step 2). Mantém a rejeição de e-mail duplicado em
    // qualquer escola de propósito aqui: diferente de /api/alunos/cadastro
    // (onde o próprio aluno prova a senha da Conta existente antes de
    // anexar um vínculo novo), aqui é um DONO/GESTOR cadastrando em nome de
    // outra pessoa — sem prova de identidade, não é seguro anexar
    // silenciosamente um aluno de outra Escola a esta.
    if (await prisma.aluno.findFirst({ where: { email: emailNorm } })) {
      return res.status(400).json({ erro: 'Já existe uma conta com esse e-mail.' });
    }

    const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
    const contaId = await sincronizarConta(emailNorm, { senha: senhaHash, nome: nome.trim() });
    const novoAluno = await prisma.$transaction(async (tx) => {
      const aluno = await tx.aluno.create({
        data: {
          nome: nome.trim(),
          email: emailNorm,
          senha: senhaHash,
          contaId,
          telefone: telefone?.trim() || null,
          curso: curso?.trim() || null,
          dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
          tempoContrato: tempoContrato != null ? Number(tempoContrato) : null,
          dataInicioContrato: dataInicioContrato ? new Date(dataInicioContrato) : null,
          contratoUrl: contratoUrl || null,
          cpf: cpf?.trim() || null,
          endereco: endereco?.trim() || null,
          fotoUrl: fotoUrl || null,
          professorId: professorDaTurma.id,
          escolaId: professorLogado.escolaId,
          status: 'PENDENTE',
        },
      });
      if (responsavel?.nome?.trim()) {
        const resp = await tx.responsavelFinanceiro.create({
          data: {
            nome: responsavel.nome.trim(),
            cpf: responsavel.cpf?.trim() || null,
            email: responsavel.email?.toLowerCase().trim() || null,
            telefone: responsavel.telefone?.trim() || null,
            escolaId: professorLogado.escolaId,
          },
        });
        await tx.aluno.update({
          where: { id: aluno.id },
          data: { responsavelId: resp.id, vinculoResponsavel: responsavel.vinculo === 'DEPENDENTE' ? 'DEPENDENTE' : 'CONTRATANTE' },
        });
      }
      return tx.aluno.findUnique({ where: { id: aluno.id }, select: { id: true, nome: true, email: true, status: true, createdAt: true } });
    });

    res.status(201).json({ mensagem: 'Aluno criado!', aluno: novoAluno });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar aluno.' });
  }
});

// ─── "Puxar" conta existente pra virar aluno (INSTITUTION Sprint 25,
// briefing 23/09/2026) — em vez de recadastrar do zero alguém que já usa o
// KAV Class (como professor ou aluno de outra escola), a escola convida
// pelo e-mail; a pessoa confirma antes de qualquer coisa virar Aluno de
// verdade (Aluno só é criado no aceite, nunca antes). Reaproveita o mesmo
// flag de rollout do multi-vínculo (MULTI_VINCULO_HABILITADO) já usado em
// /api/alunos/cadastro — é o mesmo tipo de operação (uma Conta ganhando
// mais um vínculo de Aluno em outra Escola), só que iniciada pela escola em
// vez de pela própria pessoa.

// POST /api/escola/alunos/convidar-conta — DONO/GESTOR busca a Conta pelo
// e-mail e cria o convite. Não cria Aluno nenhum ainda.
app.post('/api/escola/alunos/convidar-conta', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    if (!MULTI_VINCULO_HABILITADO) {
      return res.status(400).json({ erro: 'Recurso ainda não habilitado nesta instância.' });
    }

    const { email, professorId, curso } = req.body;
    if (!email?.trim() || !professorId) {
      return res.status(400).json({ erro: 'email e professorId são obrigatórios.' });
    }

    const professorDaTurma = await prisma.professor.findFirst({ where: { id: professorId, escolaId: professorLogado.escolaId } });
    if (!professorDaTurma) return res.status(404).json({ erro: 'Professor não encontrado nesta Escola.' });

    const emailNorm = email.toLowerCase().trim();
    const conta = await prisma.conta.findUnique({ where: { email: emailNorm } });
    if (!conta) {
      return res.status(404).json({ erro: 'Nenhum usuário do KAV Class encontrado com esse e-mail. Cadastre normalmente em vez de convidar.' });
    }

    if (await prisma.aluno.findFirst({ where: { email: emailNorm, escolaId: professorLogado.escolaId } })) {
      return res.status(400).json({ erro: 'Esse e-mail já é aluno desta Escola.' });
    }
    if (await prisma.conviteAlunoConta.findFirst({ where: { contaId: conta.id, escolaId: professorLogado.escolaId, status: 'PENDENTE' } })) {
      return res.status(400).json({ erro: 'Já existe um convite pendente pra essa pessoa nesta Escola.' });
    }

    const convite = await prisma.conviteAlunoConta.create({
      data: {
        token: gerarTokenPublico(),
        contaId: conta.id,
        escolaId: professorLogado.escolaId,
        professorId: professorDaTurma.id,
        curso: curso?.trim() || null,
      },
    });

    // Notifica em qualquer vínculo existente da Conta (professor ou aluno de
    // outra escola) que já tenha token de push salvo — é o "notifique via
    // app" pedido pelo usuário. Sem vínculo com push, o convite continua
    // válido (ela pode abrir o link mesmo assim), só não chega notificação.
    const [professoresDaConta, alunosDaConta] = await Promise.all([
      prisma.professor.findMany({ where: { contaId: conta.id, expoPushToken: { not: null } }, select: { expoPushToken: true } }),
      prisma.aluno.findMany({ where: { contaId: conta.id, expoPushToken: { not: null } }, select: { expoPushToken: true } }),
    ]);
    const escolaNome = (await prisma.escola.findUnique({ where: { id: professorLogado.escolaId }, select: { nome: true } }))?.nome || 'Uma escola';
    for (const p of [...professoresDaConta, ...alunosDaConta]) {
      enviarPushNotificacao(
        p.expoPushToken,
        'Convite pra ser aluno',
        `${escolaNome} quer te adicionar como aluno. Abra o app pra confirmar.`,
        { tipo: 'CONVITE_ALUNO_CONTA', token: convite.token }
      ).catch((err) => console.error('[Push] Falha ao notificar convite de aluno:', err.message));
    }

    res.status(201).json({ mensagem: 'Convite enviado! Aguardando confirmação da pessoa.', convite });
  } catch (err) {
    tratarErro(err, res, 'Erro ao convidar conta existente.');
  }
});

// GET /api/escola/convites-aluno — DONO/GESTOR acompanha os convites já
// enviados (pendente/aceito/recusado) pela própria Escola.
app.get('/api/escola/convites-aluno', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const convites = await prisma.conviteAlunoConta.findMany({
      where: { escolaId: professorLogado.escolaId },
      include: { conta: { select: { nome: true, email: true } }, professor: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(convites);
  } catch (err) {
    tratarErro(err, res, 'Erro ao listar convites.');
  }
});

// ─── Rotas públicas do convite — o token é a credencial, mesmo padrão já
// usado em LinkCaptacao (S4.2). Não exige estar logado nesta Escola: quem
// recebe o convite pode nunca ter tido vínculo nenhum com ela antes.

// GET /api/publico/convite-aluno/:token — dados mínimos pra mostrar a tela
// de confirmação antes de aceitar/recusar.
app.get('/api/publico/convite-aluno/:token', limitarTaxaPublica(30, 10 * 60 * 1000), async (req, res) => {
  try {
    const convite = await prisma.conviteAlunoConta.findUnique({
      where: { token: req.params.token },
      select: {
        status: true,
        curso: true,
        conta: { select: { nome: true } },
        escola: { select: { nome: true } },
        professor: { select: { nome: true } },
      },
    });
    if (!convite) return res.status(404).json({ erro: 'Convite inválido.' });
    res.json(convite);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/publico/convite-aluno/:token/aceitar — { aceitar: boolean }. Se
// aceitar=true, cria o Aluno de verdade e já devolve um token de login
// (JWT) direto pra esse vínculo novo — não depende de USAR_CONTA_NO_LOGIN
// nem de já ter uma sessão prévia nesta Escola.
app.post('/api/publico/convite-aluno/:token/aceitar', limitarTaxaPublica(10, 10 * 60 * 1000), async (req, res) => {
  try {
    const { aceitar } = req.body;
    if (typeof aceitar !== 'boolean') return res.status(400).json({ erro: 'aceitar deve ser true ou false.' });

    const convite = await prisma.conviteAlunoConta.findUnique({
      where: { token: req.params.token },
      include: { conta: true, escola: { select: { nome: true } } },
    });
    if (!convite || convite.status !== 'PENDENTE') {
      return res.status(404).json({ erro: 'Convite inválido ou já respondido.' });
    }

    if (!aceitar) {
      await prisma.conviteAlunoConta.update({ where: { id: convite.id }, data: { status: 'RECUSADO', respondidoEm: new Date() } });
      return res.json({ mensagem: 'Convite recusado.' });
    }

    // Checagem de corrida: mesmo e-mail pode ter sido cadastrado nesta
    // Escola por outro caminho entre o convite e o aceite.
    if (await prisma.aluno.findFirst({ where: { email: convite.conta.email, escolaId: convite.escolaId } })) {
      return res.status(400).json({ erro: 'Esse e-mail já é aluno desta Escola.' });
    }

    const novoAluno = await prisma.$transaction(async (tx) => {
      const aluno = await tx.aluno.create({
        data: {
          nome: convite.conta.nome || 'Aluno',
          email: convite.conta.email,
          senha: convite.conta.senha,
          contaId: convite.contaId,
          professorId: convite.professorId,
          escolaId: convite.escolaId,
          curso: convite.curso,
          fotoUrl: convite.conta.fotoUrl,
          status: 'PENDENTE',
        },
      });
      await tx.conviteAlunoConta.update({
        where: { id: convite.id },
        data: { status: 'ACEITO', respondidoEm: new Date(), alunoId: aluno.id },
      });
      return aluno;
    });

    const token = jwt.sign({ id: novoAluno.id, papel: 'aluno', contaId: convite.contaId }, SEGREDO_JWT, { expiresIn: '7d' });
    res.json({
      mensagem: `Pronto! Você agora é aluno de ${convite.escola.nome}.`,
      token,
      aluno: { id: novoAluno.id, nome: novoAluno.nome },
    });
  } catch (err) {
    tratarErro(err, res, 'Erro ao responder convite.');
  }
});

// PUT /api/escola/alunos/:id — ficha 100% editável (INSTITUTION Sprint 5,
// briefing 08/09/2026). Cobre os dados "de sempre" do aluno; os vínculos de
// curso/professor adicionais (multi-curso/multi-professor) são geridos à
// parte via POST/PATCH/DELETE /api/matriculas — Aluno.professorId/curso
// continuam sendo o vínculo principal (decisão de arquitetura já validada:
// menor risco, reaproveita Matricula que já existe pra isso).
app.put('/api/escola/alunos/:id', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const alunoAlvo = await prisma.aluno.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!alunoAlvo) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });

    const {
      nome, email, novaSenha, telefone, curso, professorId,
      dataNascimento, tempoContrato, dataInicioContrato, contratoUrl, responsavel,
      cpf, endereco, fotoUrl,
    } = req.body;

    const data = {};
    if (nome !== undefined) {
      if (!nome?.trim()) return res.status(400).json({ erro: 'nome não pode ficar vazio.' });
      data.nome = nome.trim();
    }
    if (email !== undefined && email?.trim()) {
      const emailNorm = email.toLowerCase().trim();
      if (emailNorm !== alunoAlvo.email) {
        // Escopado por escolaId (Rede Social Fase 1, Step 2): o mesmo e-mail
        // pode legitimamente já ser aluno em OUTRA escola/professor — só
        // bloqueia se já existir outro aluno com esse e-mail NESTA escola.
        const existente = await prisma.aluno.findFirst({ where: { email: emailNorm, escolaId: alunoAlvo.escolaId } });
        if (existente) return res.status(400).json({ erro: 'Já existe uma conta com esse e-mail nesta Escola.' });
      }
      data.email = emailNorm;
    }
    if (novaSenha) {
      if (novaSenha.length < 6) return res.status(400).json({ erro: 'novaSenha: mínimo 6 caracteres.' });
      data.senha = await bcrypt.hash(novaSenha, await bcrypt.genSalt(10));
    }
    if (telefone !== undefined) data.telefone = telefone?.trim() || null;
    if (curso !== undefined) data.curso = curso?.trim() || null;
    if (dataNascimento !== undefined) data.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
    if (tempoContrato !== undefined) data.tempoContrato = tempoContrato === null ? null : Number(tempoContrato);
    if (dataInicioContrato !== undefined) data.dataInicioContrato = dataInicioContrato ? new Date(dataInicioContrato) : null;
    if (contratoUrl !== undefined) data.contratoUrl = contratoUrl || null;
    if (cpf !== undefined) data.cpf = cpf?.trim() || null;
    if (endereco !== undefined) data.endereco = endereco?.trim() || null;
    if (fotoUrl !== undefined) data.fotoUrl = fotoUrl || null;
    if (professorId !== undefined) {
      if (professorId) {
        const professorAlvo = await prisma.professor.findFirst({ where: { id: professorId, escolaId: professorLogado.escolaId } });
        if (!professorAlvo) return res.status(400).json({ erro: 'Professor não encontrado nesta Escola.' });
      }
      data.professorId = professorId || null;
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      if (responsavel) {
        if (alunoAlvo.responsavelId) {
          await tx.responsavelFinanceiro.update({
            where: { id: alunoAlvo.responsavelId },
            data: {
              nome: responsavel.nome?.trim() || undefined,
              cpf: responsavel.cpf?.trim() || null,
              email: responsavel.email?.toLowerCase().trim() || null,
              telefone: responsavel.telefone?.trim() || null,
            },
          });
          data.vinculoResponsavel = responsavel.vinculo === 'DEPENDENTE' ? 'DEPENDENTE' : 'CONTRATANTE';
        } else if (responsavel.nome?.trim()) {
          const resp = await tx.responsavelFinanceiro.create({
            data: {
              nome: responsavel.nome.trim(),
              cpf: responsavel.cpf?.trim() || null,
              email: responsavel.email?.toLowerCase().trim() || null,
              telefone: responsavel.telefone?.trim() || null,
              escolaId: professorLogado.escolaId,
            },
          });
          data.responsavelId = resp.id;
          data.vinculoResponsavel = responsavel.vinculo === 'DEPENDENTE' ? 'DEPENDENTE' : 'CONTRATANTE';
        }
      }
      return tx.aluno.update({
        where: { id: alunoAlvo.id },
        data,
        select: {
          id: true, nome: true, email: true, telefone: true, curso: true, status: true,
          dataNascimento: true, tempoContrato: true, dataInicioContrato: true, contratoUrl: true,
          cpf: true, endereco: true, fotoUrl: true,
          vinculoResponsavel: true, responsavel: true, professor: { select: { id: true, nome: true } },
        },
      });
    });

    if (data.senha) await sincronizarConta(atualizado.email, { senha: data.senha });
    res.json({ mensagem: 'Aluno atualizado!', aluno: atualizado });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar aluno.');
  }
});

// ─── Modal do aluno: histórico completo (INSTITUTION Sprint 22, briefing
// 23/09/2026) — "não seria interessante apenas a configuração, mas todo o
// histórico do aluno também". 3 rotas novas, todas escopadas por Escola,
// pra alimentar as abas Histórico/Conteúdos/Pagamentos do modal
// (Relatórios reaproveita GET /api/escola/relatorios-aluno?alunoId=, que já
// existia e já aceitava esse filtro).

// GET /api/escola/alunos/:id/historico-aulas — todas as aulas do aluno,
// mais recente primeiro. Aula tipo=REPOSICAO vem com `repondoAula` (a aula
// original perdida, via Reposicao.aulaReposicaoId) pra a tela mostrar "de
// que dia essa reposição está pagando" (pedido explícito do usuário).
app.get('/api/escola/alunos/:id/historico-aulas', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const aluno = await prisma.aluno.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });

    const aulas = await prisma.aula.findMany({
      where: { alunoId: aluno.id },
      include: {
        professor: { select: { nome: true } },
        professorSubstituto: { select: { nome: true } },
        reposicaoQueRepresenta: { select: { aulaOriginal: { select: { dataHora: true } } } },
      },
      orderBy: { dataHora: 'desc' },
    });

    res.json(aulas.map((a) => ({
      id: a.id,
      dataHora: a.dataHora,
      tipo: a.tipo,
      status: a.status,
      presenca: a.presenca,
      decisaoReposicao: a.decisaoReposicao,
      assuntoTratado: a.assuntoTratado,
      professorNome: a.professorSubstituto?.nome || a.professor.nome,
      repondoAulaDe: a.reposicaoQueRepresenta?.aulaOriginal?.dataHora || null,
    })));
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar histórico de aulas.');
  }
});

// GET /api/escola/alunos/:id/materiais — todo material que esse aluno
// específico já recebeu. Antes só existia GET /api/aluno/materiais (o
// próprio aluno vendo os dele) — faltava a visão da escola por aluno.
app.get('/api/escola/alunos/:id/materiais', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const aluno = await prisma.aluno.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });

    const materiais = await prisma.material.findMany({
      where: { alunoId: aluno.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(materiais);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar materiais.');
  }
});

// GET /api/escola/alunos/:id/pagamentos — histórico de faturas do aluno,
// mais recente primeiro. Complementa GET /api/escola/pagamentos-status
// (que já existia, mas agrega TODOS os alunos de uma vez pra tela
// Financeiro) com a visão de um aluno específico dentro do modal dele.
app.get('/api/escola/alunos/:id/pagamentos', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const aluno = await prisma.aluno.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });

    const pagamentos = await prisma.pagamento.findMany({
      where: { alunoId: aluno.id },
      orderBy: { vencimento: 'desc' },
    });
    res.json(pagamentos);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar pagamentos.');
  }
});

// GET /api/escola/alunos/:id/relatorio-pdf?periodo=mensal|bimestral|semestral|anual&mes=&ano=
// (INSTITUTION Sprint 24, briefing 23/09/2026) — relatório do aluno pronto
// pra enviar aos pais ou ao próprio aluno. Reaproveita o mesmo padrão do
// relatório financeiro (Sprint 8): logo da escola no topo, **nunca** cita
// "KAV Class" (mesmo motivo jurídico já registrado — problema da escola não
// deve envolver a plataforma).
const DURACAO_MESES_PERIODO = { mensal: 1, bimestral: 2, semestral: 6, anual: 12 };

app.get('/api/escola/alunos/:id/relatorio-pdf', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'alunos');
    if (!professorLogado) return;

    const periodo = ['mensal', 'bimestral', 'semestral', 'anual'].includes(req.query.periodo) ? req.query.periodo : 'mensal';
    const duracaoMeses = DURACAO_MESES_PERIODO[periodo];
    const agora = new Date();
    const mes = req.query.mes ? parseInt(String(req.query.mes), 10) : agora.getMonth() + 1;
    const ano = req.query.ano ? parseInt(String(req.query.ano), 10) : agora.getFullYear();
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) {
      return res.status(400).json({ erro: 'mes (1-12) e ano devem ser números válidos.' });
    }

    const inicio = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const fim = new Date(ano, mes - 1 + duracaoMeses, 0, 23, 59, 59, 999);

    const [aluno, escola] = await Promise.all([
      prisma.aluno.findFirst({
        where: { id: req.params.id, escolaId: professorLogado.escolaId },
        select: { nome: true, status: true, professor: { select: { nome: true } } },
      }),
      prisma.escola.findUnique({ where: { id: professorLogado.escolaId }, select: { nome: true, logoUrl: true } }),
    ]);
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });

    const [aulas, pagamentos, relatorios] = await Promise.all([
      prisma.aula.findMany({ where: { alunoId: req.params.id, dataHora: { gte: inicio, lte: fim } }, orderBy: { dataHora: 'asc' } }),
      prisma.pagamento.findMany({ where: { alunoId: req.params.id, vencimento: { gte: inicio, lte: fim } }, orderBy: { vencimento: 'asc' } }),
      prisma.relatorioAluno.findMany({ where: { alunoId: req.params.id, createdAt: { gte: inicio, lte: fim } }, orderBy: { createdAt: 'asc' } }),
    ]);

    const presencas = aulas.filter((a) => a.presenca === 'PRESENTE').length;
    const faltasParaRepor = aulas.filter((a) => (a.presenca === 'AUSENCIA_ALUNO' || a.presenca === 'AUSENCIA_PROFESSOR') && a.decisaoReposicao).length;
    const faltasInjustificadas = aulas.filter((a) => (a.presenca === 'AUSENCIA_ALUNO' || a.presenca === 'AUSENCIA_PROFESSOR') && a.decisaoReposicao === false).length;
    const reposicoesFeitas = aulas.filter((a) => a.tipo === 'REPOSICAO' && a.presenca === 'PRESENTE').length;

    const ROTULO_PERIODO = { mensal: 'Mensal', bimestral: 'Bimestral', semestral: 'Semestral', anual: 'Anual' };
    const periodoTexto = `${inicio.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${aluno.nome.replace(/\s+/g, '-').toLowerCase()}-${periodo}-${mes}-${ano}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    if (escola?.logoUrl) {
      try {
        const respLogo = await fetch(escola.logoUrl);
        if (respLogo.ok) {
          const bufferLogo = Buffer.from(await respLogo.arrayBuffer());
          doc.image(bufferLogo, 50, 45, { fit: [70, 70] });
          doc.x = 130; doc.y = 50;
        }
      } catch (err) {
        console.error('[Relatório do aluno PDF] Falha ao baixar logo (segue sem logo):', err.message);
      }
    }

    doc.fontSize(18).fillColor('#101828').text(escola?.nome || 'Relatório do Aluno');
    doc.fontSize(11).fillColor('#555').text(`Relatório ${ROTULO_PERIODO[periodo]} — ${periodoTexto}`);
    doc.x = 50;
    doc.moveDown(1.5);

    doc.fillColor('#101828').fontSize(14).text(aluno.nome, { underline: true });
    doc.fontSize(11).fillColor('#555').text(`Professor: ${aluno.professor?.nome || '—'} · Status: ${aluno.status}`);
    doc.moveDown(1.2);

    doc.fillColor('#101828').fontSize(13).text('Frequência no período', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor('#0a7a3d').text(`Presenças: ${presencas}`);
    doc.fillColor('#B8860B').text(`Faltas com reposição: ${faltasParaRepor}`);
    doc.fillColor('#B00020').text(`Faltas injustificadas: ${faltasInjustificadas}`);
    doc.fillColor('#0275D8').text(`Reposições realizadas: ${reposicoesFeitas}`);
    doc.moveDown(1.2);

    doc.fillColor('#101828').fontSize(13).text('Pagamentos no período', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10);
    if (pagamentos.length === 0) {
      doc.fillColor('#555').text('Nenhuma fatura no período.');
    } else {
      for (const p of pagamentos) {
        const cor = p.status === 'PAGO' ? '#0a7a3d' : p.status === 'ATRASADO' ? '#B00020' : '#B8860B';
        doc.fillColor(cor).text(`${new Date(p.vencimento).toLocaleDateString('pt-BR')} — R$ ${Number(p.valor).toFixed(2).replace('.', ',')} — ${p.status}`);
      }
    }
    doc.moveDown(1.2);

    doc.fillColor('#101828').fontSize(13).text('Relatórios da coordenação/professor', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#555');
    if (relatorios.length === 0) {
      doc.text('Nenhum relatório registrado no período.');
    } else {
      for (const r of relatorios) {
        doc.text(`${new Date(r.createdAt).toLocaleDateString('pt-BR')} (${r.autorTipo === 'COORDENACAO' ? 'Coordenação' : 'Professor'}): ${r.descricao || '—'}`);
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar relatório do aluno em PDF.' });
  }
});

// GET /api/escola/reposicoes — pedidos de reposição (origem ALUNO) já
// autorizados pelo professor, aguardando a Escola finalizar (S2.1).
app.get('/api/escola/reposicoes', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const reposicoes = await prisma.reposicao.findMany({
      where: { origem: 'ALUNO', status: 'AUTORIZADA', professor: { escolaId: professor.escolaId } },
      include: { aluno: { select: { nome: true } }, professor: { select: { nome: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(reposicoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar reposições.' });
  }
});

// ─── PAINEL — Grade de hoje + KPIs reformulados (INSTITUTION Sprint 3, briefing 08/09/2026) ───

// GET /api/escola/grade-hoje — professores com aula hoje, cada um com a
// lista de aulas do dia (aluno, horário, status de presença dupla e
// decisão de reposição — Sprint 2). A grade de disponibilidade em si
// continua vindo de GET /api/escola/professores/:id/disponibilidade
// (Sprint 1), buscada sob demanda quando a escola abre o modal de um
// professor específico — não duplicada aqui.
app.get('/api/escola/grade-hoje', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(); fimDia.setHours(23, 59, 59, 999);

    const [aulasHoje, experimentaisHoje] = await Promise.all([
      prisma.aula.findMany({
        where: {
          dataHora: { gte: inicioDia, lte: fimDia },
          professor: { escolaId: professor.escolaId },
        },
        include: {
          aluno: { select: { id: true, nome: true } },
          professor: { select: { id: true, nome: true } },
          professorSubstituto: { select: { id: true, nome: true } },
        },
        orderBy: { dataHora: 'asc' },
      }),
      // Experimentais aparecem na Grade de hoje (INSTITUTION Sprint 11,
      // briefing 08/09/2026) por já terem professorId+dataHora — ajuste de
      // leitura, sem schema novo. Só as com professor já atribuído entram
      // (Lead sem professor não tem "onde" aparecer na grade de ninguém).
      prisma.aulaExperimental.findMany({
        where: {
          dataHora: { gte: inicioDia, lte: fimDia },
          escolaId: professor.escolaId,
          professorId: { not: null },
        },
        include: { lead: { select: { id: true, nome: true } }, professor: { select: { id: true, nome: true } } },
        orderBy: { dataHora: 'asc' },
      }),
    ]);

    const porProfessor = new Map();
    for (const aula of aulasHoje) {
      if (!porProfessor.has(aula.professorId)) {
        porProfessor.set(aula.professorId, { professorId: aula.professorId, nome: aula.professor.nome, aulas: [] });
      }
      porProfessor.get(aula.professorId).aulas.push({
        id: aula.id,
        dataHora: aula.dataHora,
        aluno: aula.aluno,
        presenca: aula.presenca,
        presencaProfessorEm: aula.presencaProfessorEm,
        presencaAlunoEm: aula.presencaAlunoEm,
        decisaoReposicao: aula.decisaoReposicao,
        professorSubstituto: aula.professorSubstituto,
        confirmacaoAlunoResposta: aula.confirmacaoAlunoResposta,
      });
    }
    for (const exp of experimentaisHoje) {
      if (!porProfessor.has(exp.professorId)) {
        porProfessor.set(exp.professorId, { professorId: exp.professorId, nome: exp.professor.nome, aulas: [] });
      }
      porProfessor.get(exp.professorId).aulas.push({
        id: exp.id,
        dataHora: exp.dataHora,
        aluno: { id: exp.lead.id, nome: `${exp.lead.nome} (experimental)` },
        presenca: exp.status === 'REALIZADA' ? 'PRESENTE' : null,
        presencaProfessorEm: exp.status === 'REALIZADA' ? exp.updatedAt : null,
        presencaAlunoEm: null,
        decisaoReposicao: null,
        professorSubstituto: null,
        confirmacaoAlunoResposta: null,
        experimental: true,
      });
    }

    const resultado = Array.from(porProfessor.values());
    for (const p of resultado) p.aulas.sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
    res.json(resultado);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar a grade de hoje.');
  }
});

// GET /api/escola/inadimplentes — alunos da Escola com pelo menos uma
// mensalidade ATRASADO. Fonte única de verdade pro KPI "Inadimplentes" do
// Painel e pra sub-aba Pagamentos do Financeiro (Sprint 8) — evita duas
// definições diferentes de "inadimplente" convivendo no mesmo produto.
app.get('/api/escola/inadimplentes', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'financeiro');
    if (!professor) return;

    const pagamentosAtrasados = await prisma.pagamento.findMany({
      where: { status: 'ATRASADO', aluno: { escolaId: professor.escolaId } },
      select: { aluno: { select: { id: true, nome: true, telefone: true, responsavel: { select: { telefone: true } } } } },
      distinct: ['alunoId'],
    });

    res.json(pagamentosAtrasados.map((p) => p.aluno));
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar inadimplentes.');
  }
});

// GET /api/escola/aulas-para-reposicao — aulas marcadas como pendentes de
// reposição (enum PresencaAula.PENDENTE_REPOSICAO, já existente) ou com
// decisaoReposicao=true (Sprint 2), últimos 60 dias. É a lista que
// substitui o antigo KPI numérico "Acompanhamentos pendentes".
app.get('/api/escola/aulas-para-reposicao', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const desde = new Date(); desde.setDate(desde.getDate() - 60);

    const aulas = await prisma.aula.findMany({
      where: {
        professor: { escolaId: professor.escolaId },
        dataHora: { gte: desde },
        OR: [{ presenca: 'PENDENTE_REPOSICAO' }, { decisaoReposicao: true }],
      },
      include: { aluno: { select: { nome: true } }, professor: { select: { nome: true } } },
      orderBy: { dataHora: 'desc' },
    });
    res.json(aulas);
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar aulas pendentes de reposição.');
  }
});

// POST /api/escola/alunos/:id/notificar-vencimento — botão "notificar" da
// lista de Matrículas vencendo do Painel.
app.post('/api/escola/alunos/:id/notificar-vencimento', async (req, res) => {
  try {
    const professorLogado = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professorLogado) return;

    const aluno = await prisma.aluno.findFirst({ where: { id: req.params.id, escolaId: professorLogado.escolaId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado nesta Escola.' });
    if (!aluno.expoPushToken) return res.status(400).json({ erro: 'Este aluno não tem notificações habilitadas no app.' });

    await enviarPushNotificacao(
      aluno.expoPushToken,
      'Seu contrato está vencendo',
      'Fale com a secretaria da sua escola pra renovar sua matrícula.',
      { tipo: 'CONTRATO_EXPIRANDO' }
    );
    res.json({ mensagem: `Notificação enviada pra ${aluno.nome}.` });
  } catch (err) {
    tratarErro(err, res, 'Erro ao notificar aluno.');
  }
});

// ─── LOGÍSTICA (INSTITUTION Sprint 6, briefing 08/09/2026) ───────────────
// Grade diária sala×horário×turma. Não é motor de recorrência novo: reusa
// exatamente o que já existe — Turma.salaId é o "padrão" (mudar ele via
// PATCH /api/turmas/:id, rota já existente do Catálogo, é o que o briefing
// chama de "fica salva pras próximas semanas"); Aula.salaId por aula
// individual é o que já existe também (PUT /api/aulas/:id/trocar-sala,
// S1.4) e cobre o "só hoje". Esta rota é só leitura agregada, agrupável por
// sala, pra dar a visão de grade que faltava.
app.get('/api/escola/logistica/grade', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'logistica');
    if (!professor) return;

    const dataBase = req.query.data ? new Date(`${req.query.data}T00:00:00`) : new Date();
    const inicioDia = new Date(dataBase); inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(dataBase); fimDia.setHours(23, 59, 59, 999);

    const [aulas, salas] = await Promise.all([
      prisma.aula.findMany({
        where: { dataHora: { gte: inicioDia, lte: fimDia }, professor: { escolaId: professor.escolaId } },
        include: {
          aluno: { select: { nome: true } },
          professor: { select: { nome: true } },
          turma: { select: { id: true, nome: true, curso: { select: { nome: true } } } },
          sala: { select: { id: true, nome: true } },
        },
        orderBy: { dataHora: 'asc' },
      }),
      prisma.sala.findMany({ where: { escolaId: professor.escolaId, ativa: true }, orderBy: { nome: 'asc' } }),
    ]);

    res.json({ salas, aulas });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar a grade de logística.');
  }
});

// GET /api/escola/logistica/grade-semanal — planilha de horários por sala
// (INSTITUTION Sprint 26, briefing 23/09/2026), no formato pedido pelo
// usuário (referência: planilha manual que a escola já usava — uma grade
// Seg-Sáb × hora por sala, não um dia específico). Mesma técnica de
// amostragem já usada em ocupacao-semanal: como a recorrência é semanal/
// quinzenal/mensal alinhada ao dia da semana, olhar só os próximos 7 dias
// já mostra 1 ocorrência representativa por dia/hora ocupado no ciclo
// vigente, sem precisar varrer todas as aulas futuras já geradas.
app.get('/api/escola/logistica/grade-semanal', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR'], 'logistica');
    if (!professor) return;

    const inicio = new Date();
    const fim = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [salas, aulas] = await Promise.all([
      prisma.sala.findMany({ where: { escolaId: professor.escolaId, ativa: true }, orderBy: { nome: 'asc' } }),
      prisma.aula.findMany({
        where: { salaId: { not: null }, status: { not: 'CANCELADA' }, dataHora: { gte: inicio, lte: fim }, professor: { escolaId: professor.escolaId } },
        include: { aluno: { select: { nome: true } }, professor: { select: { nome: true } }, turma: { select: { id: true, nome: true } } },
      }),
    ]);

    // Mesmo formato de objeto Aula da rota diária (/grade) de propósito —
    // o frontend reaproveita literalmente o mesmo fluxo de "trocar sala"
    // (abrirTrocaSala/salvarTroca) nos dois formatos de grade, sem duplicar
    // lógica só porque a fonte da amostra é diferente.
    const ocupacao = aulas.map((a) => ({
      ...diaHoraLocal(a.dataHora),
      id: a.id,
      dataHora: a.dataHora,
      salaId: a.salaId,
      sala: { id: a.salaId },
      turma: a.turma,
      aluno: { nome: a.aluno.nome },
      professor: { nome: a.professor.nome },
    }));

    res.json({ salas, ocupacao });
  } catch (err) {
    tratarErro(err, res, 'Erro ao carregar a grade semanal das salas.');
  }
});

// ============================================================================
// 14. ADMIN — RESET DE SENHA SEM E-MAIL
// ============================================================================

// POST /api/admin/reset-senha
// Body: { adminSecret, email, novaSenha }
// Permite ao administrador redefinir a senha de qualquer usuário diretamente,
// sem depender do fluxo de e-mail (útil quando EMAIL_USER/PASS não estão configurados).
app.post('/api/admin/reset-senha', async (req, res) => {
  try {
    const { adminSecret, email, novaSenha } = req.body;
    const secret = process.env.ADMIN_SECRET;

    if (!secret || adminSecret !== secret) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }
    if (!email || !novaSenha) {
      return res.status(400).json({ erro: 'email e novaSenha são obrigatórios.' });
    }
    if (novaSenha.length < 6) {
      return res.status(400).json({ erro: 'novaSenha deve ter no mínimo 6 caracteres.' });
    }

    const emailNorm = email.toLowerCase().trim();
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(novaSenha, salt);

    // findFirst/updateMany, não findUnique/update: email deixou de ser único
    // sozinho (Rede Social Fase 1, Step 2) — reseta TODAS as linhas com esse
    // e-mail (dual-write, igual ao resto do arquivo).
    const prof = await prisma.professor.findFirst({ where: { email: emailNorm } });
    if (prof) {
      await prisma.professor.updateMany({ where: { email: emailNorm }, data: { senha: hash } });
      await sincronizarConta(emailNorm, { senha: hash });
      return res.json({ mensagem: 'Senha do professor redefinida com sucesso.' });
    }

    const aluno = await prisma.aluno.findFirst({ where: { email: emailNorm } });
    if (aluno) {
      await prisma.aluno.updateMany({ where: { email: emailNorm }, data: { senha: hash } });
      await sincronizarConta(emailNorm, { senha: hash });
      return res.json({ mensagem: 'Senha do aluno redefinida com sucesso.' });
    }

    return res.status(404).json({ erro: 'Usuário não encontrado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/admin/escola/pacote
// Body: { adminSecret, email, pacote }
// O Pacote Escola é vendido sob consulta (mesmo modelo observado na Emusys
// pra escolas — ver docs/roadmap-escola.md), não é self-serve por checkout.
// Depois de fechar comercialmente, o time interno ativa por aqui: acha a
// Escola pelo e-mail do DONO e troca o pacote assinado.
app.post('/api/admin/escola/pacote', async (req, res) => {
  try {
    const { adminSecret, email, pacote } = req.body;
    const secret = process.env.ADMIN_SECRET;

    if (!secret || adminSecret !== secret) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }
    if (!email || !['PACOTE_PROFESSOR', 'PACOTE_ESCOLA'].includes(pacote)) {
      return res.status(400).json({ erro: 'email e pacote (PACOTE_PROFESSOR|PACOTE_ESCOLA) são obrigatórios.' });
    }

    // findFirst, não findUnique: email deixou de ser único sozinho (Rede
    // Social Fase 1, Step 2). Rota interna (ADMIN_SECRET), uso manual pelo
    // time — se esse e-mail tiver mais de um vínculo DONO (ex.: institucional
    // + SELF), pega o mais antigo; em caso de ambiguidade real, resolver
    // manualmente passando o e-mail exato daquela Escola específica.
    const dono = await prisma.professor.findFirst({ where: { email: email.toLowerCase().trim() }, orderBy: { createdAt: 'asc' } });
    if (!dono) return res.status(404).json({ erro: 'Professor não encontrado.' });
    if (dono.papel !== 'DONO') {
      return res.status(400).json({ erro: 'Esse e-mail não é DONO de nenhuma escola — use o e-mail de quem criou a conta original.' });
    }

    const escola = await prisma.escola.update({ where: { id: dono.escolaId }, data: { pacote } });
    res.json({ mensagem: `Escola "${escola.nome}" agora está no ${pacote}.`, escola });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar pacote.' });
  }
});

// ============================================================================
// TRATAMENTO DE ERRO GLOBAL (mantém o contrato "sempre JSON" da API)
// ============================================================================

// Rota não mapeada — em vez da página HTML padrão do Express.
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// Rede de segurança para qualquer erro que escape do try/catch de uma rota
// (ex.: JSON malformado no body, lançado pelo próprio express.json()).
app.use((err, req, res, _next) => {
  console.error('[Erro não tratado]', err);
  res.status(err.status || 500).json({ erro: 'Erro interno do servidor.' });
});

// ============================================================================
// 15. LIGANDO O MOTOR
// ============================================================================
const PORT = process.env.PORT || 3000;

async function garantirColunasStripe() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "assinaturaStatus" TEXT NOT NULL DEFAULT 'INATIVO';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "assinaturaFim" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "stripeSessionId" TEXT;
    `);
    console.log('[DB] Colunas Stripe verificadas/criadas com sucesso.');
  } catch (err) {
    console.error('[DB] Erro ao garantir colunas Stripe:', err.message);
  }
}

async function iniciarServidor() {
  await garantirColunasStripe();
  try {
    await prisma.$connect();
    console.log('[DB] Conexão com o banco de dados estabelecida.');
  } catch (err) {
    console.error('[DB] Falha ao conectar ao banco:', err.message);
  }
  app.listen(PORT, () => console.log(`Servidor KAV Class rodando na porta ${PORT}`));
}

// Só conecta no banco e sobe o servidor quando este arquivo é executado
// diretamente (`node server.js`, inclusive via `npm start`) — quando é
// importado (ex.: pelos testes com supertest), quem exige o módulo decide
// se/quando conectar. Sem essa guarda, `require('./server')` num teste
// bateria direto no Postgres de produção e tentaria abrir a porta de novo.
if (require.main === module) {
  iniciarServidor();
}

module.exports = app;
