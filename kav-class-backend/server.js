require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { OAuth2Client } = require('google-auth-library');
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

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
  req.auth = { id: payload.id, papel: payload.papel }; // papel: 'professor' | 'aluno' (tipo de conta — não confundir com o papel DONO/GESTOR/PROFESSOR da Escola)
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
      const professorId = session.client_reference_id;
      const plano = session.metadata?.plano;
      if (professorId) {
        await prisma.professor.update({
          where: { id: professorId },
          data: {
            ...(session.customer ? { stripeCustomerId: String(session.customer) } : {}),
            stripeSessionId: session.id,
            assinaturaStatus: plano === 'one-time' ? 'VITALICIO' : 'ATIVO',
          },
        });
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
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await prisma.professor.updateMany({
        where: { stripeCustomerId: sub.customer },
        data: { assinaturaStatus: 'CANCELADO' },
      });
    }
  } catch (err) {
    console.error('[Webhook] Erro ao processar evento:', err);
  }

  res.json({ received: true });
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
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `KAV-${r}`;
}

function gerarOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  const nodemailer = require('nodemailer');
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Variáveis EMAIL_USER e EMAIL_PASS não configuradas no servidor.');
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
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
// 1. ROTAS PÚBLICAS
// ============================================================================

app.get('/ping', (_req, res) => res.json({ mensagem: 'Backend do KAV Class está online!' }));

// Duração do período de teste grátis oferecido a professores novos.
const DIAS_TESTE_GRATIS = 15;

app.post('/api/professores/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, cursos, fotoUrl } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    if (await prisma.professor.findUnique({ where: { email: emailNorm } }))
      return res.status(400).json({ erro: 'E-mail já em uso.' });

    const salt = await bcrypt.genSalt(10);
    const novoProfessor = await prisma.professor.create({
      data: {
        nome,
        email: emailNorm,
        telefone: telefone || null,
        senha: await bcrypt.hash(senha, salt),
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

    const token = jwt.sign({ id: novoProfessor.id, papel: 'professor' }, SEGREDO_JWT, { expiresIn: '7d' });
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

    if (await prisma.aluno.findUnique({ where: { email: email.toLowerCase().trim() } }))
      return res.status(400).json({ erro: 'E-mail já em uso.' });

    const professor = await prisma.professor.findFirst({ where: { codigoConvite: codigoConvite.toUpperCase().trim() } });
    if (!professor) return res.status(404).json({ erro: 'Código de convite inválido.' });

    // A idade decide o vínculo do responsável financeiro (Emusys: "nome do
    // aluno e do responsável, se menor de idade"). Sem dataNascimento válida,
    // não dá pra saber a idade — nesse caso o aluno fica sem responsável
    // formal por ora, igual ao comportamento de antes desta sprint.
    const dataNascParsed = parseDataNascimento(dataNascimento);
    const menorDeIdade = dataNascParsed ? calcularIdadeAnos(dataNascParsed) < 18 : false;

    if (menorDeIdade && !responsavel?.nome?.trim()) {
      return res.status(400).json({ erro: 'Aluno menor de idade: informe o nome do responsável financeiro.' });
    }

    const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));

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
          : { nome, cpf: null, email: email.toLowerCase().trim(), telefone: telefone || null };

        const respCriado = await tx.responsavelFinanceiro.create({
          data: { ...dadosResponsavel, escolaId: professor.escolaId },
        });
        responsavelId = respCriado.id;
        vinculoResponsavel = menorDeIdade ? 'DEPENDENTE' : 'CONTRATANTE';
      }

      return tx.aluno.create({
        data: {
          nome,
          telefone: telefone || null,
          dataNascimento: dataNascParsed,
          email: email.toLowerCase().trim(),
          senha: senhaHash,
          professorId: professor.id,
          // Aluno herda a Escola do professor que gerou o código de convite.
          escolaId: professor.escolaId,
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
    return {
      erro: testeVencido
        ? 'Seu período de teste grátis de 15 dias terminou. Escolha um plano para continuar.'
        : 'Sua conta ainda não possui uma assinatura ativa. Selecione um plano para continuar.',
      assinaturaStatus: status,
      professorId: professor.id,
      email: professor.email,
      codigoConvite: professor.codigoConvite,
    };
  }
  return null;
}

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'email e senha são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    let usuario = await prisma.professor.findUnique({ where: { email: emailNorm } });
    let papel = 'professor';
    if (!usuario) { usuario = await prisma.aluno.findUnique({ where: { email: emailNorm } }); papel = 'aluno'; }
    if (!usuario) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    if (!await bcrypt.compare(senha, usuario.senha)) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    if (papel === 'professor') {
      const bloqueio = await checarBloqueioAssinaturaProfessor(usuario);
      if (bloqueio) return res.status(403).json(bloqueio);
    }

    const token = jwt.sign({ id: usuario.id, papel }, SEGREDO_JWT, { expiresIn: '7d' });
    res.json({ mensagem: 'Login realizado!', token, usuario: { id: usuario.id, nome: usuario.nome, papel } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
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

    if (papel === 'professor') {
      const bloqueio = await checarBloqueioAssinaturaProfessor(usuario);
      if (bloqueio) return res.status(403).json(bloqueio);
    }

    const token = jwt.sign({ id: usuario.id, papel }, SEGREDO_JWT, { expiresIn: '7d' });
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
      const professor = await prisma.professor.findFirst({ where: { codigoConvite: codigoConvite.toUpperCase().trim() } });
      if (!professor) return res.status(404).json({ erro: 'Código de convite inválido.' });

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
          data: { ...dadosResponsavel, escolaId: professor.escolaId },
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
            professorId: professor.id,
            // Aluno herda a Escola do professor que gerou o código de convite.
            escolaId: professor.escolaId,
            status: 'PENDENTE',
            responsavelId: respCriado.id,
            vinculoResponsavel: menorDeIdade ? 'DEPENDENTE' : 'CONTRATANTE',
          },
        });
      });
    }

    const token = jwt.sign({ id: usuario.id, papel }, SEGREDO_JWT, { expiresIn: '7d' });
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

    const encontrado = await prisma.professor.findUnique({ where: { email } }) ||
                       await prisma.aluno.findUnique({ where: { email } });

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
    if (await prisma.professor.findUnique({ where: { email: emailNorm } })) {
      await prisma.professor.update({ where: { email: emailNorm }, data: { senha: hash } });
    } else {
      await prisma.aluno.update({ where: { email: emailNorm }, data: { senha: hash } });
    }
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
        papel: true, escola: { select: { pacote: true } },
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
    const { nome, telefone, chavePix, linkPagamentoCartao, fotoUrl, senhaAtual, novaSenha } = req.body;

    const professor = await prisma.professor.findUnique({ where: { id: professorId } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (telefone?.trim()) dados.telefone = telefone.trim();
    if (chavePix !== undefined) dados.chavePix = chavePix.trim() || null;
    if (linkPagamentoCartao !== undefined) dados.linkPagamentoCartao = linkPagamentoCartao.trim() || null;
    if (fotoUrl !== undefined) dados.fotoUrl = fotoUrl || null;

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
      },
    });
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
      select: { status: true, tempoContrato: true, dataInicioContrato: true },
    });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    if (aluno.status === 'PENDENTE') return res.json({ pendente: true });
    if (aluno.status === 'INATIVO') return res.json({ inativo: true });

    const agora = new Date();

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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
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
        professor: { select: { nome: true, telefone: true } },
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

app.get('/api/aluno/mensagens', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const msgs = await prisma.mensagem.findMany({
      where: { alunoId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/aluno/mensagens', exigirAluno, async (req, res) => {
  try {
    const alunoId = req.auth.id;
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: 'texto obrigatório.' });

    const msg = await prisma.mensagem.create({
      data: { alunoId, texto, remetente: alunoId },
      include: { aluno: { select: { nome: true, professorId: true } } },
    });

    const professor = await prisma.professor.findUnique({
      where: { id: msg.aluno.professorId },
      select: { expoPushToken: true },
    });
    if (professor?.expoPushToken) {
      await enviarPushNotificacao(professor.expoPushToken, 'Nova mensagem', `${msg.aluno.nome} enviou uma mensagem.`, { tipo: 'NOVA_MENSAGEM', alunoId });
    }

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 7. MURAL DA TURMA (CHAT EM GRUPO)
// ============================================================================

// GET /api/mural — professor vê o mural da própria turma; aluno vê o mural
// do professor dele. Quem manda é req.auth (token), nunca query solta.
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

    const alunos = await prisma.aluno.findMany({ where: { professorId }, select: { id: true } });
    const alunoIds = alunos.map(a => a.id);

    const [msgsAlunos, msgsProf] = await Promise.all([
      prisma.mensagem.findMany({
        where: { alunoId: { in: alunoIds }, remetente: { not: 'professor' } },
        include: { aluno: { select: { nome: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.mensagem.findMany({
        where: { professorId, remetente: 'professor' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const todas = [
      ...msgsAlunos.map(m => ({ id: m.id, texto: m.texto, remetente: m.remetente, nome: m.aluno?.nome ?? 'Aluno', createdAt: m.createdAt })),
      ...msgsProf.map(m => ({ id: m.id, texto: m.texto, remetente: 'professor', nome: 'Professor(a)', createdAt: m.createdAt })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json(todas);
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
// 8. ROTAS DE MENSAGENS DIRETAS DO PROFESSOR (legado)
// ============================================================================

// Professor vê o histórico de chat com um aluno específico
app.get('/api/professor/mensagens/:alunoId', exigirProfessor, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const professorId = req.auth.id;

    // Garante que o aluno pertence ao professor
    const aluno = await prisma.aluno.findFirst({ where: { id: alunoId, professorId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado ou não pertence a este professor.' });

    const msgs = await prisma.mensagem.findMany({
      where: { alunoId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Professor envia mensagem para um aluno
app.post('/api/professor/mensagens', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const { alunoId, texto } = req.body;
    if (!alunoId || !texto) return res.status(400).json({ erro: 'alunoId e texto são obrigatórios.' });

    const aluno = await prisma.aluno.findFirst({ where: { id: alunoId, professorId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado ou não pertence a este professor.' });

    const msg = await prisma.mensagem.create({
      data: { alunoId, texto, remetente: 'professor' },
    });

    // Notifica o aluno
    if (aluno.expoPushToken) {
      const professor = await prisma.professor.findUnique({ where: { id: professorId }, select: { nome: true } });
      await enviarPushNotificacao(aluno.expoPushToken, 'Nova mensagem', `${professor?.nome ?? 'Seu professor'} enviou uma mensagem.`, { tipo: 'NOVA_MENSAGEM', alunoId });
    }

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 8. ROTAS DE REPOSIÇÕES DO PROFESSOR
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

    res.json({ mensagem: 'Presença registrada!', aula });
  } catch (err) {
    tratarErro(err, res, 'Erro interno.');
  }
});

app.post('/api/aulas/:id/material', exigirProfessor, async (req, res) => {
  try {
    const { titulo, tipo, conteudo, url } = req.body;
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
      const { titulo, tipo, conteudo, url } = item;
      if (!titulo || !tipo) {
        return Promise.reject(new Error(`Item sem título ou tipo: ${JSON.stringify(item)}`));
      }
      return prisma.material.create({
        data: {
          titulo,
          tipo: tipo.toUpperCase(),
          conteudo: conteudo || null,
          url: url || null,
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
    const { nome, ativo } = req.body;
    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (typeof ativo === 'boolean') dados.ativo = ativo;
    const { count } = await prisma.curso.updateMany({ where: { id: req.params.id, escolaId: req.auth.escolaId }, data: dados });
    if (!count) return res.status(404).json({ erro: 'Curso não encontrado.' });
    res.json({ mensagem: 'Curso atualizado.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar curso.');
  }
});

app.get('/api/salas', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const salas = await prisma.sala.findMany({ where: { escolaId: req.auth.escolaId }, orderBy: { nome: 'asc' } });
    res.json(salas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/salas', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
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

app.patch('/api/salas/:id', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
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

app.post('/api/turmas', exigirProfessor, carregarEscolaDoProfessor, async (req, res) => {
  try {
    const { nome, cursoId, salaId, limiteAlunos } = req.body;
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

    const limite = limiteAlunos != null ? parseInt(String(limiteAlunos), 10) : null;
    const turma = await prisma.turma.create({
      data: {
        nome: nome.trim(),
        cursoId,
        salaId: salaId || null,
        limiteAlunos: Number.isFinite(limite) ? limite : null,
        professorId: req.auth.id,
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

app.patch('/api/turmas/:id', exigirProfessor, async (req, res) => {
  try {
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
        const professor = await prisma.professor.findUnique({ where: { id: req.auth.id }, select: { escolaId: true } });
        const sala = await prisma.sala.findFirst({ where: { id: salaId, escolaId: professor?.escolaId } });
        if (!sala) return res.status(400).json({ erro: 'Sala não encontrada.' });
      }
      dados.salaId = salaId || null;
    }

    const { count } = await prisma.turma.updateMany({
      where: { id: req.params.id, professorId: req.auth.id },
      data: dados,
    });
    if (!count) return res.status(404).json({ erro: 'Turma não encontrada.' });
    res.json({ mensagem: 'Turma atualizada.' });
  } catch (err) {
    tratarErro(err, res, 'Erro ao atualizar turma.');
  }
});

// ============================================================================
// 11. AGENDAMENTO AVULSO DE AULA
// ============================================================================

app.post('/api/aulas', exigirProfessor, async (req, res) => {
  try {
    const professorId = req.auth.id;
    const { alunosIds, diaSemana, horario, curso } = req.body;
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
    dataAula.setUTCHours(horas + 3, minutos, 0, 0);

    const aulasParaCriar = alunosIds.map((alunoId) => ({
      dataHora: new Date(dataAula),
      status: 'AGENDADA',
      tipo: alunosIds.length > 1 ? 'GRUPO' : 'REGULAR',
      tema: curso || null,
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

// ============================================================================
// 12. RELATÓRIOS
// ============================================================================

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

    res.json({ faturamentoAtual, grafico, faltas });
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

// ─── CHECKOUT: ASSINATURA KAV CLASS ─────────────────────────────────────────
// plano: 'pro' | 'premium' | 'one-time'
const STRIPE_PRICE_IDS = {
  pro:        'price_1TPwgLRZkemiSVh6S0ASUKP8',
  premium:    'price_1TPwl5RZkemiSVh6mbLU2lk4',
  'one-time': 'price_1TPwmURZkemiSVh6NPET9vEz',
};

app.post('/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ erro: 'Serviço de pagamento não configurado. Contate o suporte.' });
  }
  try {
    const { professorId, email, plano = 'pro', nome, senha, telefone, cursos, fotoUrl } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const priceId = STRIPE_PRICE_IDS[plano];
    if (!priceId) return res.status(400).json({ erro: 'Plano inválido.' });

    const emailNorm = email.toLowerCase().trim();
    let pid = professorId;

    if (pid) {
      // Rota semi-pública (roda antes/ao redor do login) — não dá pra exigir
      // JWT aqui sem quebrar o fluxo de "teste venceu, escolha um plano".
      // Mas aceitar um professorId puro sem checar nada permitiria ativar a
      // assinatura de qualquer um só sabendo o UUID. Exigir que o e-mail bata
      // com o dono daquele id fecha isso sem mudar o fluxo pra quem já sabe
      // o próprio e-mail (o caso normal).
      const existente = await prisma.professor.findUnique({ where: { id: pid }, select: { email: true, assinaturaStatus: true } });
      if (!existente || existente.email !== emailNorm) {
        return res.status(404).json({ erro: 'Professor não encontrado.' });
      }
      if (existente.assinaturaStatus === 'ATIVO' || existente.assinaturaStatus === 'VITALICIO') {
        return res.status(400).json({ erro: 'Este e-mail já possui uma assinatura ativa.' });
      }
    } else {
      let prof = await prisma.professor.findUnique({ where: { email: emailNorm } });

      if (!prof) {
        // Novo professor: cria com status PENDENTE aguardando pagamento
        if (!nome || !senha) {
          return res.status(400).json({ erro: 'Dados de cadastro incompletos. Volte e preencha o formulário.' });
        }
        const salt = await bcrypt.genSalt(10);
        prof = await prisma.professor.create({
          data: {
            nome: nome.trim(),
            email: emailNorm,
            senha: await bcrypt.hash(senha, salt),
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
      mode: plano === 'one-time' ? 'payment' : 'subscription',
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

    const professorId = session.client_reference_id;
    const plano = session.metadata?.plano;

    if (!professorId) return res.json({ ativo: true });

    const prof = await prisma.professor.update({
      where: { id: professorId },
      data: {
        ...(session.customer ? { stripeCustomerId: String(session.customer) } : {}),
        stripeSessionId: session.id,
        assinaturaStatus: plano === 'one-time' ? 'VITALICIO' : 'ATIVO',
      },
      select: { codigoConvite: true, nome: true, assinaturaStatus: true },
    });

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
      },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    res.json(professor);
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
async function exigirPapelNaEscola(req, res, papeisPermitidos) {
  const professorId = autenticarProfessor(req, res);
  if (!professorId) return null;

  const professor = await prisma.professor.findUnique({
    where: { id: professorId },
    select: {
      id: true,
      nome: true,
      papel: true,
      escolaId: true,
      escola: { select: { id: true, nome: true, pacote: true } },
    },
  });
  if (!professor) {
    res.status(404).json({ erro: 'Professor não encontrado.' });
    return null;
  }
  if (!papeisPermitidos.includes(professor.papel)) {
    res.status(403).json({ erro: 'Você não tem permissão para acessar isso.' });
    return null;
  }
  return professor;
}

async function enviarEmailConviteProfessor(destinatario, escolaNome, codigo) {
  const nodemailer = require('nodemailer');
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Variáveis EMAIL_USER e EMAIL_PASS não configuradas no servidor.');
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"KAV Class" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: `Convite para dar aula em ${escolaNome} – KAV Class`,
    html: `<h2>Você foi convidado</h2><p><b>${escolaNome}</b> te convidou pra dar aula pelo KAV Class.</p><p>No app, toque em "Entrar com convite de escola" e use o código abaixo (válido por 7 dias):</p><h1 style="letter-spacing:6px">${codigo}</h1>`,
  });
}

// POST /api/escola/convites — DONO ou GESTOR convida um professor pra
// própria Escola. Só existe pra quem já está no Pacote Escola: no Pacote
// Professor não há conceito de "convidar outro professor pra mesma escola".
app.post('/api/escola/convites', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    if (professor.escola.pacote !== 'PACOTE_ESCOLA') {
      return res.status(403).json({
        erro: 'Convidar outro professor é um recurso do Pacote Escola. Fale com a gente pra migrar de plano.',
      });
    }

    const { email, papel } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });
    const papelConvite = papel === 'GESTOR' ? 'GESTOR' : 'PROFESSOR'; // nunca cria DONO por convite

    const emailNorm = email.toLowerCase().trim();
    if (await prisma.professor.findUnique({ where: { email: emailNorm } }))
      return res.status(400).json({ erro: 'Já existe uma conta de professor com esse e-mail.' });

    const codigo = gerarCodigoConvite();
    await prisma.conviteProfessor.create({
      data: {
        email: emailNorm,
        token: codigo,
        papel: papelConvite,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        escolaId: professor.escolaId,
      },
    });

    let emailEnviado = true;
    try {
      await enviarEmailConviteProfessor(emailNorm, professor.escola.nome, codigo);
    } catch (err) {
      emailEnviado = false; // sem EMAIL_USER/PASS configurado, por exemplo — o código já foi gerado, quem convidou compartilha na mão
      console.error('[Convite] Falha ao enviar e-mail (código segue válido):', err.message);
    }

    res.status(201).json({
      mensagem: emailEnviado ? 'Convite enviado por e-mail.' : 'Convite criado. Compartilhe o código manualmente — o e-mail não pôde ser enviado.',
      codigo,
      emailEnviado,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar convite.' });
  }
});

// POST /api/escola/convites/aceitar — mesmo padrão de /api/alunos/cadastro
// (código digitado no próprio formulário de cadastro), só que pra um
// Professor entrar numa Escola já existente em vez de criar a sua própria.
app.post('/api/escola/convites/aceitar', async (req, res) => {
  try {
    const { nome, email, senha, telefone, cursos, fotoUrl, codigo } = req.body;
    if (!nome || !email || !senha || !codigo)
      return res.status(400).json({ erro: 'nome, email, senha e codigo são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    const convite = await prisma.conviteProfessor.findUnique({ where: { token: codigo.toUpperCase().trim() } });
    if (!convite || convite.aceitoEm || convite.expiresAt < new Date())
      return res.status(400).json({ erro: 'Código de convite inválido ou expirado.' });
    if (convite.email !== emailNorm)
      return res.status(400).json({ erro: 'Esse convite foi feito para outro e-mail.' });

    if (await prisma.professor.findUnique({ where: { email: emailNorm } }))
      return res.status(400).json({ erro: 'E-mail já em uso.' });

    const salt = await bcrypt.genSalt(10);
    const novoProfessor = await prisma.professor.create({
      data: {
        nome,
        email: emailNorm,
        telefone: telefone || null,
        senha: await bcrypt.hash(senha, salt),
        cursos: Array.isArray(cursos) ? cursos : (cursos ? [cursos] : []),
        codigoConvite: gerarCodigoConvite(), // esse aqui é o convite dele pros próprios alunos, não tem relação com o convite de escola
        fotoUrl: fotoUrl || null,
        assinaturaStatus: 'ATIVO', // faz parte de uma Escola já paga — não entra no fluxo de teste grátis individual
        escolaId: convite.escolaId,
        papel: convite.papel,
      },
    });
    await prisma.conviteProfessor.update({ where: { id: convite.id }, data: { aceitoEm: new Date() } });

    const token = jwt.sign({ id: novoProfessor.id, papel: 'professor' }, SEGREDO_JWT, { expiresIn: '7d' });
    res.status(201).json({
      mensagem: 'Bem-vindo à equipe!',
      token,
      usuario: { id: novoProfessor.id, nome: novoProfessor.nome, papel: 'professor' },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao aceitar convite.' });
  }
});

// GET /api/escola/professores — DONO/GESTOR vê todo mundo da própria Escola.
app.get('/api/escola/professores', async (req, res) => {
  try {
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const professores = await prisma.professor.findMany({
      where: { escolaId: professor.escolaId },
      select: { id: true, nome: true, email: true, papel: true, fotoUrl: true, telefone: true, createdAt: true },
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
    const professor = await exigirPapelNaEscola(req, res, ['DONO', 'GESTOR']);
    if (!professor) return;

    const alunos = await prisma.aluno.findMany({
      where: { escolaId: professor.escolaId },
      select: {
        id: true, nome: true, email: true, status: true, curso: true, fotoUrl: true,
        professor: { select: { id: true, nome: true } },
      },
      orderBy: { nome: 'asc' },
    });
    res.json(alunos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar alunos.' });
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

    const prof = await prisma.professor.findUnique({ where: { email: emailNorm } });
    if (prof) {
      await prisma.professor.update({ where: { email: emailNorm }, data: { senha: hash } });
      return res.json({ mensagem: 'Senha do professor redefinida com sucesso.' });
    }

    const aluno = await prisma.aluno.findUnique({ where: { email: emailNorm } });
    if (aluno) {
      await prisma.aluno.update({ where: { email: emailNorm }, data: { senha: hash } });
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

    const dono = await prisma.professor.findUnique({ where: { email: email.toLowerCase().trim() } });
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

garantirColunasStripe().then(async () => {
  try {
    await prisma.$connect();
    console.log('[DB] Conexão com o banco de dados estabelecida.');
  } catch (err) {
    console.error('[DB] Falha ao conectar ao banco:', err.message);
  }
  app.listen(PORT, () => console.log(`Servidor KAV Class rodando na porta ${PORT}`));
});
