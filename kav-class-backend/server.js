require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const prisma = new PrismaClient();
const app = express();

const SEGREDO_JWT = process.env.JWT_SECRET || "kav_class_super_secreto_2026";

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

app.use(express.json());

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function gerarCodigoConvite() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `KAV-${r}`;
}

function gerarOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  dataAtual.setHours(horas, minutos, 0, 0);

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
  try {
    const nodemailer = require('nodemailer');
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error('E-mail não configurado');
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
  } catch {
    console.log(`[DEV] Código de reset para ${destinatario}: ${codigo}`);
  }
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
// 1. ROTAS PÚBLICAS
// ============================================================================

app.get('/ping', (_req, res) => res.json({ mensagem: 'Backend do KAV Class está online!' }));

app.post('/api/professores/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, cursos } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });

    const salt = await bcrypt.genSalt(10);
    const novoProfessor = await prisma.professor.create({
      data: {
        nome,
        email: email.toLowerCase().trim(),
        telefone: telefone || null,
        senha: await bcrypt.hash(senha, salt),
        cursos: Array.isArray(cursos) ? cursos : (cursos ? [cursos] : []),
        codigoConvite: gerarCodigoConvite(),
      },
    });
    res.status(201).json({ mensagem: 'Professor criado!', codigoConvite: novoProfessor.codigoConvite, professorId: novoProfessor.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar professor.' });
  }
});

app.post('/api/alunos/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, codigoConvite } = req.body;
    if (!nome || !email || !senha || !codigoConvite) return res.status(400).json({ erro: 'nome, email, senha e codigoConvite são obrigatórios.' });

    if (await prisma.aluno.findUnique({ where: { email: email.toLowerCase().trim() } }))
      return res.status(400).json({ erro: 'E-mail já em uso.' });

    const professor = await prisma.professor.findFirst({ where: { codigoConvite: codigoConvite.toUpperCase().trim() } });
    if (!professor) return res.status(404).json({ erro: 'Código de convite inválido.' });

    const salt = await bcrypt.genSalt(10);
    const novoAluno = await prisma.aluno.create({
      data: {
        nome,
        telefone: telefone || null,
        email: email.toLowerCase().trim(),
        senha: await bcrypt.hash(senha, salt),
        professorId: professor.id,
        status: 'PENDENTE',
      },
    });
    res.status(201).json({ mensagem: 'Aluno cadastrado!', aluno: { id: novoAluno.id, nome: novoAluno.nome } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

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

    if (papel === 'professor' &&
        (usuario.assinaturaStatus === 'PENDENTE' || usuario.assinaturaStatus === 'INATIVO')) {
      return res.status(403).json({
        erro: 'Sua conta ainda não possui uma assinatura ativa. Selecione um plano para continuar.',
        assinaturaStatus: usuario.assinaturaStatus,
        professorId: usuario.id,
        email: usuario.email,
        codigoConvite: usuario.codigoConvite,
      });
    }

    const token = jwt.sign({ id: usuario.id, papel }, SEGREDO_JWT, { expiresIn: '7d' });
    res.json({ mensagem: 'Login realizado!', token, usuario: { id: usuario.id, nome: usuario.nome, papel } });
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
    res.json({ mensagem: 'Enviado.' });
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

app.post('/api/push-token', async (req, res) => {
  try {
    const { userId, papel, expoPushToken } = req.body;
    if (!userId || !papel || !expoPushToken) return res.status(400).json({ erro: 'userId, papel e expoPushToken são obrigatórios.' });

    if (papel === 'professor') {
      await prisma.professor.update({ where: { id: userId }, data: { expoPushToken } });
    } else {
      await prisma.aluno.update({ where: { id: userId }, data: { expoPushToken } });
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

app.get('/api/dashboard', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });

    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: { codigoConvite: true, nome: true },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
    const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);

    const aulasHoje = await prisma.aula.findMany({
      where: { professorId, dataHora: { gte: inicioHoje, lte: fimHoje } },
      include: { aluno: { select: { nome: true, id: true } } },
      orderBy: { dataHora: 'asc' },
    });

    res.json({
      nome: professor.nome,
      codigoConvite: professor.codigoConvite || 'KAV-NOVO',
      aulasHoje,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/alunos-pendentes', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const alunos = await prisma.aluno.findMany({
      where: { professorId, status: 'PENDENTE' },
      select: { id: true, nome: true, email: true, telefone: true, createdAt: true },
    });
    res.json(alunos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/configurar-aluno', async (req, res) => {
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

    // FIX: parse explícito para garantir que strings numéricas ("1") virem Int
    const diaSemanaRaw = diaSemana ?? diaSemanaAula;
    const diaSemanaNum = diaSemanaRaw != null ? parseInt(String(diaSemanaRaw), 10) : null;

    const diaVenc = parseInt(String(diaCobranca ?? diaVencimento ?? '10'), 10);
    const recorr = recorrencia ?? recorrenciaAula ?? 'SEMANAL';
    const meses = parseInt(String(tempoContrato ?? '6'), 10);
    const hora = horarioAula ?? '08:00';
    const diaNome = (diaSemanaNum != null && !isNaN(diaSemanaNum)) ? NOMES_DIAS[diaSemanaNum] : (diaSemanaRaw ?? null);

    const dataInicio = new Date();

    await prisma.aula.deleteMany({ where: { alunoId, status: 'AGENDADA', dataHora: { gte: dataInicio } } });

    const aluno = await prisma.aluno.update({
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
      await prisma.aula.createMany({ data: novasAulas });
    }

    await prisma.pagamento.deleteMany({ where: { alunoId, status: 'PENDENTE', vencimento: { gte: dataInicio } } });

    const pagamentos = [];
    const valorFinal = parseFloat(String(valorMensalidade));
    const mesesFinal = isNaN(meses) ? 6 : meses;
    for (let i = 0; i < mesesFinal; i++) {
      const venc = new Date(dataInicio);
      venc.setMonth(venc.getMonth() + i);
      venc.setDate(isNaN(diaVenc) ? 10 : diaVenc);
      pagamentos.push({
        valor: valorFinal,
        vencimento: venc,
        status: 'PENDENTE',
        alunoId,
        professorId: aluno.professorId,
      });
    }
    if (pagamentos.length > 0) await prisma.pagamento.createMany({ data: pagamentos });

    // Notifica o aluno que o contrato foi ativado
    if (aluno.expoPushToken) {
      await enviarPushNotificacao(
        aluno.expoPushToken,
        'Contrato Ativado!',
        'Seu contrato foi configurado pelo professor. Acesse o app para ver suas aulas.',
        { tipo: 'CONTRATO_ATIVADO' }
      );
    }

    // Cria notificação interna para o professor confirmar a ativação
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

    res.json({
      mensagem: 'Aluno configurado!',
      aulasGeradas: novasAulas.length,
      cobrancasGeradas: pagamentos.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao configurar aluno.' });
  }
});

app.delete('/api/alunos/:id/cancelar', async (req, res) => {
  try {
    await prisma.aluno.update({ where: { id: req.params.id }, data: { status: 'INATIVO' } });
    res.json({ mensagem: 'Cadastro cancelado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar.' });
  }
});

app.get('/api/meus-alunos', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const alunos = await prisma.aluno.findMany({
      where: { professorId },
      include: {
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

app.get('/api/aulas', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const aulas = await prisma.aula.findMany({
      where: { professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
    });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/pagamentos', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const pagamentos = await prisma.pagamento.findMany({
      where: { professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { vencimento: 'asc' },
    });
    res.json(pagamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/pagamentos/:id/aprovar', async (req, res) => {
  try {
    const p = await prisma.pagamento.update({
      where: { id: req.params.id },
      data: { status: 'PAGO', dataPagamento: new Date() },
    });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao aprovar.' });
  }
});

app.post('/api/pagamentos/:id/notificar-vencimento', async (req, res) => {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where: { id: req.params.id },
      include: { aluno: { select: { nome: true, expoPushToken: true } } },
    });
    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
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

app.get('/api/calendario', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });

    // FIX: parseInt explícito — req.query retorna strings, new Date() precisa de Number
    const ano = parseInt(req.query.ano, 10);
    const mes = parseInt(req.query.mes, 10);

    if (isNaN(ano) || isNaN(mes)) return res.status(400).json({ erro: 'ano e mes devem ser números.' });

    const aulas = await prisma.aula.findMany({
      where: {
        professorId,
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

app.get('/api/professor/perfil', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: {
        id: true, nome: true, email: true, telefone: true,
        cursos: true, codigoConvite: true, chavePix: true,
        linkPagamentoCartao: true, createdAt: true,
      },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    res.json(professor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/professor/perfil', async (req, res) => {
  try {
    const { professorId, nome, telefone, chavePix, linkPagamentoCartao, senhaAtual, novaSenha } = req.body;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });

    const professor = await prisma.professor.findUnique({ where: { id: professorId } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (telefone?.trim()) dados.telefone = telefone.trim();
    if (chavePix !== undefined) dados.chavePix = chavePix.trim() || null;
    if (linkPagamentoCartao !== undefined) dados.linkPagamentoCartao = linkPagamentoCartao.trim() || null;

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
        cursos: true, codigoConvite: true, chavePix: true, linkPagamentoCartao: true,
      },
    });
    res.json({ mensagem: 'Perfil atualizado!', professor: atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/professor/notificacoes', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
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

app.put('/api/professor/notificacoes/:id/lida', async (req, res) => {
  try {
    await prisma.notificacao.update({ where: { id: req.params.id }, data: { lida: true } });
    res.json({ mensagem: 'Marcada como lida.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/professor/notificacoes/todas-lidas', async (req, res) => {
  try {
    const { professorId } = req.body;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    await prisma.notificacao.updateMany({ where: { professorId, lida: false }, data: { lida: true } });
    res.json({ mensagem: 'Todas as notificações marcadas como lidas.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 5. ROTAS DO ALUNO
// ============================================================================

app.get('/api/aluno/dashboard', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });

    const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { status: true } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    if (aluno.status === 'PENDENTE') return res.json({ pendente: true, aulas: [] });

    const aulas = await prisma.aula.findMany({
      where: { alunoId, dataHora: { gte: new Date() } },
      include: { professor: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
      take: 5,
    });
    res.json({ pendente: false, aulas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/perfil', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      select: {
        id: true, nome: true, email: true, telefone: true, curso: true,
        status: true, valorMensalidade: true, diaVencimento: true,
        recorrenciaAula: true, diaSemanaAula: true, horarioAula: true,
        tempoContrato: true, dataInicioContrato: true, createdAt: true,
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

app.put('/api/aluno/perfil', async (req, res) => {
  try {
    const { alunoId, nome, telefone, senhaAtual, novaSenha } = req.body;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });

    const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    const dados = {};
    if (nome?.trim()) dados.nome = nome.trim();
    if (telefone?.trim()) dados.telefone = telefone.trim();

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
      select: { id: true, nome: true, email: true, telefone: true },
    });
    res.json({ mensagem: 'Perfil atualizado!', aluno: atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/professor-config', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
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

app.get('/api/aluno/pagamentos', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
    const pagamentos = await prisma.pagamento.findMany({ where: { alunoId }, orderBy: { vencimento: 'asc' } });
    res.json(pagamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.put('/api/aluno/pagamentos/:id/comprovante', async (req, res) => {
  try {
    const { comprovanteUrl } = req.body;
    if (!comprovanteUrl) return res.status(400).json({ erro: 'comprovanteUrl obrigatório.' });
    const p = await prisma.pagamento.update({
      where: { id: req.params.id },
      data: { comprovanteUrl, status: 'EM_ANALISE' },
    });
    res.json({ mensagem: 'Comprovante enviado!', pagamento: p });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/materiais', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
    const aulas = await prisma.aula.findMany({
      where: { alunoId },
      include: { materiais: true },
      orderBy: { dataHora: 'desc' },
    });
    res.json(aulas.filter(a => a.materiais.length > 0));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/reposicoes', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
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

app.post('/api/reposicoes/:id/confirmar', async (req, res) => {
  try {
    const r = await prisma.reposicao.update({ where: { id: req.params.id }, data: { status: 'CONFIRMADA' } });
    res.json({ mensagem: 'Reposição confirmada!', reposicao: r });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/reposicoes/:id/solicitar-outro', async (req, res) => {
  try {
    const r = await prisma.reposicao.update({ where: { id: req.params.id }, data: { status: 'SOLICITANDO_OUTRO' } });
    res.json({ mensagem: 'Solicitação enviada ao professor.', reposicao: r });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.get('/api/aluno/mensagens', async (req, res) => {
  try {
    const { alunoId } = req.query;
    if (!alunoId) return res.status(400).json({ erro: 'alunoId obrigatório.' });
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

app.post('/api/aluno/mensagens', async (req, res) => {
  try {
    const { alunoId, texto } = req.body;
    if (!alunoId || !texto) return res.status(400).json({ erro: 'alunoId e texto obrigatórios.' });

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

// GET /api/mural?professorId=X  ou  /api/mural?alunoId=X
app.get('/api/mural', async (req, res) => {
  try {
    let { professorId, alunoId } = req.query;

    if (!professorId && alunoId) {
      const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { professorId: true } });
      if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
      professorId = aluno.professorId;
    }
    if (!professorId) return res.status(400).json({ erro: 'professorId ou alunoId obrigatório.' });

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
app.post('/api/mural', async (req, res) => {
  try {
    const { professorId, texto } = req.body;
    if (!professorId || !texto) return res.status(400).json({ erro: 'professorId e texto obrigatórios.' });

    const professor = await prisma.professor.findUnique({ where: { id: professorId }, select: { id: true, nome: true } });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });

    const msg = await prisma.mensagem.create({
      data: { professorId, texto, remetente: 'professor' },
    });

    // Notifica todos os alunos ativos
    const alunos = await prisma.aluno.findMany({
      where: { professorId, status: 'ATIVO' },
      select: { expoPushToken: true },
    });
    for (const aluno of alunos) {
      if (aluno.expoPushToken) {
        await enviarPushNotificacao(aluno.expoPushToken, `${professor.nome}`, texto, { tipo: 'NOVA_MENSAGEM' });
      }
    }

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
app.get('/api/professor/mensagens/:alunoId', async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });

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
app.post('/api/professor/mensagens', async (req, res) => {
  try {
    const { professorId, alunoId, texto } = req.body;
    if (!professorId || !alunoId || !texto) return res.status(400).json({ erro: 'professorId, alunoId e texto são obrigatórios.' });

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
app.post('/api/reposicoes', async (req, res) => {
  try {
    const { professorId, alunoId, dataOriginal, dataProposta, motivo } = req.body;
    if (!professorId || !alunoId || !dataProposta || !motivo) {
      return res.status(400).json({ erro: 'professorId, alunoId, dataProposta e motivo são obrigatórios.' });
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

// Professor vê todas as reposições dos seus alunos
app.get('/api/professor/reposicoes', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const reposicoes = await prisma.reposicao.findMany({
      where: { professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reposicoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Professor define nova data depois que aluno solicitou outro horário
app.put('/api/reposicoes/:id/nova-data', async (req, res) => {
  try {
    const { dataProposta } = req.body;
    if (!dataProposta) return res.status(400).json({ erro: 'dataProposta obrigatório.' });

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
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 9. REGISTRO DE PRESENÇA E CONTEÚDO
// ============================================================================

app.post('/api/aulas/:id/registrar-presenca', async (req, res) => {
  try {
    const { presenca, professorId } = req.body;
    const validos = ['PRESENTE', 'AUSENCIA_PROFESSOR', 'AUSENCIA_ALUNO', 'PENDENTE_REPOSICAO'];
    if (!presenca || !validos.includes(presenca)) {
      return res.status(400).json({ erro: 'presenca inválida. Use: ' + validos.join(', ') });
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
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

app.post('/api/aulas/:id/material', async (req, res) => {
  try {
    const { titulo, tipo, conteudo, url, professorId } = req.body;
    if (!titulo || !tipo || !professorId) {
      return res.status(400).json({ erro: 'titulo, tipo e professorId são obrigatórios.' });
    }

    const aula = await prisma.aula.findUnique({ where: { id: req.params.id } });
    if (!aula) return res.status(404).json({ erro: 'Aula não encontrada.' });

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

// ============================================================================
// 10. CURSOS DO PROFESSOR
// ============================================================================

app.get('/api/meus-cursos', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });
    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
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
// 11. AGENDAMENTO AVULSO DE AULA
// ============================================================================

app.post('/api/aulas', async (req, res) => {
  try {
    const { professorId, alunosIds, diaSemana, horario, curso } = req.body;
    if (!professorId || !Array.isArray(alunosIds) || alunosIds.length === 0) {
      return res.status(400).json({ erro: 'professorId e alunosIds são obrigatórios.' });
    }

    const [horas, minutos] = (horario || '08:00').split(':').map(Number);
    const hoje = new Date();
    const dataAula = new Date(hoje);
    const diaAlvo = diaSemana ?? 1;
    const diff = (diaAlvo - dataAula.getDay() + 7) % 7 || 7;
    dataAula.setDate(dataAula.getDate() + diff);
    dataAula.setHours(horas, minutos, 0, 0);

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

app.get('/api/relatorios', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'professorId obrigatório.' });

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
  const qs = session_id ? `?session_id=${session_id}` : '';
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
    const { professorId, email, plano = 'pro', nome, senha, telefone, cursos } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const priceId = STRIPE_PRICE_IDS[plano];
    if (!priceId) return res.status(400).json({ erro: 'Plano inválido.' });

    const emailNorm = email.toLowerCase().trim();
    let pid = professorId;

    if (!pid) {
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
app.get('/api/professor/assinatura/:professorId', async (req, res) => {
  try {
    const { professorId } = req.params;
    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: {
        assinaturaStatus: true,
        assinaturaFim: true,
        stripeCustomerId: true,
      },
    });
    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado.' });
    res.json(professor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 13. LIGANDO O MOTOR
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor KAV Class rodando na porta ${PORT}`));
