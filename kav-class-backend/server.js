require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

const SEGREDO_JWT = process.env.JWT_SECRET || "kav_class_super_secreto_2026";

// Mapeamento dias da semana (índice 0-6 → nome PT-BR)
const NOMES_DIAS = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

app.use(cors());
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
    res.status(201).json({ mensagem: 'Professor criado!', codigoConvite: novoProfessor.codigoConvite });
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

    const proximasAulas = await prisma.aula.findMany({
      where: { professorId, dataHora: { gte: new Date() } },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
      take: 5,
    });

    res.json({
      nome: professor.nome,
      codigoConvite: professor.codigoConvite || 'KAV-NOVO',
      aulasHoje: proximasAulas,
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
      include: { aulas: { where: { dataHora: { lte: new Date() } }, orderBy: { dataHora: 'desc' }, take: 10 } },
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
      data: { alunoId, texto, remetente: 'aluno' },
      include: { aluno: { select: { nome: true } } },
    });
    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ============================================================================
// 6. LIGANDO O MOTOR
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor KAV Class rodando na porta ${PORT}`));
