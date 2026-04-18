const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); 
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

const SEGREDO_JWT = "kav_class_super_secreto_2026"; // Na vida real isso vai para o .env

// Middlewares
app.use(cors());
app.use(express.json());

// Função para gerar um código tipo KAV-A1B2
function gerarCodigoConvite() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let resultado = '';
  for (let i = 0; i < 4; i++) {
    resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return `KAV-${resultado}`;
}

// ============================================================================
// 1. ROTAS PÚBLICAS (TESTE, LOGIN E CADASTROS)
// ============================================================================

app.get('/ping', (req, res) => {
  res.json({ mensagem: 'Backend do KAV Class está online! 🚀' });
});

app.post('/api/professores/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, cursos } = req.body;
    const codigoUnico = gerarCodigoConvite();
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoProfessor = await prisma.professor.create({
      data: {
        nome,
        email,
        senha: senhaHash,
        telefone,
        cursos: Array.isArray(cursos) ? cursos : [cursos],
        codigoConvite: codigoUnico
      }
    });

    res.status(201).json({ 
      mensagem: 'Professor criado com sucesso!', 
      codigoConvite: novoProfessor.codigoConvite 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao criar professor' });
  }
});

app.post('/api/alunos/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, codigoConvite } = req.body;

    const alunoExiste = await prisma.aluno.findUnique({ where: { email } });
    if (alunoExiste) return res.status(400).json({ erro: 'Este e-mail já está em uso.' });

    const professor = await prisma.professor.findFirst({
      where: { codigoConvite: codigoConvite.toUpperCase() }
    });

    if (!professor) return res.status(404).json({ erro: 'Código de convite inválido ou professor não encontrado.' });

    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    const novoAluno = await prisma.aluno.create({
      data: {
        nome,
        email: email.toLowerCase(),
        senha: senhaCriptografada,
        telefone,
        professorId: professor.id 
      }
    });

    res.status(201).json({
      mensagem: 'Aluno cadastrado com sucesso!',
      aluno: { id: novoAluno.id, nome: novoAluno.nome }
    });
  } catch (erro) {
    console.error("Erro no cadastro de aluno:", erro);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    let usuario = await prisma.professor.findUnique({ where: { email } });
    let papel = 'professor';

    if (!usuario) {
      usuario = await prisma.aluno.findUnique({ where: { email } });
      papel = 'aluno';
    }

    if (!usuario) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const token = jwt.sign({ id: usuario.id, papel: papel }, SEGREDO_JWT, { expiresIn: '7d' });

    res.json({
      mensagem: 'Login realizado com sucesso!',
      token: token,
      usuario: { id: usuario.id, nome: usuario.nome, papel: papel }
    });
  } catch (erro) {
    console.error("Erro no login:", erro);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});


// ============================================================================
// 2. ROTAS DO PROFESSOR
// ============================================================================

// Dashboard Unificado (Código, Aulas e Alertas)
app.get('/api/dashboard', async (req, res) => {
  try {
    const { professorId } = req.query;
    if (!professorId) return res.status(400).json({ erro: 'ID do professor não fornecido' });

    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: { codigoConvite: true, nome: true }
    });

    if (!professor) return res.status(404).json({ erro: 'Professor não encontrado' });

    const proximasAulas = await prisma.aula.findMany({
      where: { professorId: professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
      take: 5
    });

    const pagamentosPendentes = await prisma.pagamento.findMany({
      where: { professorId: professorId, status: { in: ['PENDENTE', 'ATRASADO'] } },
      include: { aluno: { select: { nome: true } } }
    });

    const alertas = pagamentosPendentes.map(p => ({
      id: p.id,
      texto: `Cobrança pendente: ${p.aluno.nome} (R$ ${p.valor})`,
      tipo: 'financeiro'
    }));

    res.json({
      nome: professor.nome,
      codigoConvite: professor.codigoConvite || "KAV-NOVO", 
      aulasHoje: proximasAulas,
      alertas: alertas
    });
  } catch (error) {
    console.error("Erro ao carregar Dashboard:", error);
    res.status(500).json({ erro: 'Erro interno ao carregar dados' });
  }
});

app.get('/api/meus-alunos', async (req, res) => {
  try {
    const { professorId } = req.query;
    const alunos = await prisma.aluno.findMany({
      where: { professorId: professorId },
      include: {
        aulas: { where: { dataHora: { lte: new Date() } }, orderBy: { dataHora: 'desc' }, take: 10 }
      }
    });
    res.json(alunos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar a lista de alunos.' });
  }
});

app.get('/api/aulas', async (req, res) => {
  try {
    const { professorId } = req.query; 
    const aulas = await prisma.aula.findMany({
      where: { professorId: professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' }
    });
    res.json(aulas);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar agenda.' });
  }
});

app.get('/api/pagamentos', async (req, res) => {
  try {
    const { professorId } = req.query;
    const pagamentos = await prisma.pagamento.findMany({
      where: { professorId: professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { vencimento: 'asc' }
    });
    res.json(pagamentos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar o financeiro.' });
  }
});

app.put('/api/pagamentos/:id/aprovar', async (req, res) => {
  try {
    const { id } = req.params;
    const pagamentoAtualizado = await prisma.pagamento.update({
      where: { id: id },
      data: { status: 'PAGO', dataPagamento: new Date() }
    });
    res.json(pagamentoAtualizado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao aprovar pagamento.' });
  }
});

app.get('/api/calendario', async (req, res) => {
  try {
    const { professorId, mes, ano } = req.query;
    const inicioMes = new Date(ano, mes - 1, 1);
    const fimMes = new Date(ano, mes, 0, 23, 59, 59);

    const aulas = await prisma.aula.findMany({
      where: { professorId: professorId, dataHora: { gte: inicioMes, lte: fimMes } },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' }
    });
    res.json(aulas);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o calendário.' });
  }
});


// ============================================================================
// 3. ROTAS DO ALUNO
// ============================================================================

app.get('/api/aluno/dashboard', async (req, res) => {
  try {
    const { alunoId } = req.query;
    const proximasAulas = await prisma.aula.findMany({
      where: { alunoId: alunoId },
      include: { professor: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
      take: 5
    });
    res.json({ aulas: proximasAulas });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o dashboard do aluno.' });
  }
});

app.get('/api/aluno/pagamentos', async (req, res) => {
  try {
    const { alunoId } = req.query;
    const pagamentos = await prisma.pagamento.findMany({
      where: { alunoId: alunoId },
      orderBy: { vencimento: 'asc' }
    });
    res.json(pagamentos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o financeiro.' });
  }
});

app.get('/api/aluno/materiais', async (req, res) => {
  try {
    const { alunoId } = req.query;
    const aulas = await prisma.aula.findMany({
      where: { alunoId: alunoId },
      include: { materiais: true },
      orderBy: { dataHora: 'desc' }
    });
    const aulasComMateriais = aulas.filter(aula => aula.materiais.length > 0);
    res.json(aulasComMateriais);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar os materiais.' });
  }
});

// ============================================================================
// 4. LIGANDO O MOTOR (Sempre no final do arquivo!)
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor KAV Class rodando na porta ${PORT}`);
});