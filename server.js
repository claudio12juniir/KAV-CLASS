const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

// Middlewares (Para o backend entender JSON e aceitar o App)
app.use(cors());
app.use(express.json());

// ─── ROTA DE TESTE ──────────────────────────────────────────────
app.get('/ping', (req, res) => {
  res.json({ mensagem: 'Backend do KAV Class está online! 🚀' });
});

//─── ROTA DE CADASTRO DE PROFESSOR (CORRIGIDA) ──────────────────
app.post('/api/professores/cadastro', async (req, res) => {
  try {
    // 1. Pegamos apenas o que importa (ignoramos dataNascimento se vier do App)
    const { nome, email, senha, telefone, cursos } = req.body;

    // 2. Garantimos que "cursos" seja uma lista (Array), mesmo se o app mandar um texto
    let cursosFormatados = [];
    if (Array.isArray(cursos)) {
      cursosFormatados = cursos;
    } else if (typeof cursos === 'string') {
      cursosFormatados = [cursos]; // Transforma "Bateria" em ["Bateria"]
    }

    // 3. Criptografar a senha (Padrão de segurança)
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    // 4. Salvar no Supabase EXATAMENTE como o Schema pede
    const novoProfessor = await prisma.professor.create({
      data: {
        nome: nome,
        email: email,
        senha: senhaHash,
        telefone: telefone,
        cursos: cursosFormatados,
      }
    });

    res.status(201).json({ 
      mensagem: 'Professor criado com sucesso!', 
      professor: novoProfessor 
    });

  } catch (error) {
    // 🚨 O SEGREDO ESTÁ AQUI: Isso vai forçar o erro a aparecer nos Logs do Render!
    console.error("ERRO NO CADASTRO DE PROFESSOR:", error); 
    res.status(500).json({ erro: 'Erro interno no servidor' });
  }
});
// ─── LIGANDO O MOTOR ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor KAV Class rodando na porta ${PORT}`);
});


const jwt = require('jsonwebtoken'); // Adicione isso lá no topo do arquivo junto com os outros 'require'

const SEGREDO_JWT = "kav_class_super_secreto_2026"; // Na vida real isso vai para o .env

// ─── ROTA DE LOGIN (PROFESSOR E ALUNO) ──────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    // 1. Procura o usuário (Primeiro tenta achar um Professor)
    let usuario = await prisma.professor.findUnique({ where: { email } });
    let papel = 'professor';

    // Se não for professor, tenta achar como Aluno (quando criarmos a tabela)
    if (!usuario) {
      usuario = await prisma.aluno.findUnique({ where: { email } });
      papel = 'aluno';
    }

    // Se ainda não achou ninguém, o e-mail não existe
    if (!usuario) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // 2. Compara a senha digitada com a senha criptografada do banco
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // 3. Gera o Crachá (Token JWT)
    const token = jwt.sign(
      { id: usuario.id, papel: papel }, 
      SEGREDO_JWT, 
      { expiresIn: '7d' } // O login dura 7 dias
    );

    // 4. Devolve o sucesso para o App
    res.json({
      mensagem: 'Login realizado com sucesso!',
      token: token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        papel: papel
      }
    });

  } catch (erro) {
    console.error("Erro no login:", erro);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

app.get('/api/alunos', async (req, res) => {
  // O middleware de segurança vai dar-nos o professorId do token
  const professorId = req.usuario.id; 
  
  const alunos = await prisma.aluno.findMany({
    where: { professorId },
    include: { historico: true }
  });
  res.json(alunos);
});

// ROTA: Buscar todas as aulas do professor logado
app.get('/api/aulas', async (req, res) => {
  try {
    // No futuro, usaremos um middleware para pegar o id do token
    // Por agora, podes passar via Query para testar rápido
    const { professorId } = req.query; 

    const aulas = await prisma.aula.findMany({
      where: { professorId: professorId },
      include: {
        aluno: {
          select: { nome: true }
        }
      },
      orderBy: { dataHora: 'asc' }
    });

    res.json(aulas);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar agenda.' });
  }
});

// ─── ROTAS DO FINANCEIRO ─────────────────────────────────────────

// 1. Buscar todas as mensalidades/pagamentos do professor
app.get('/api/pagamentos', async (req, res) => {
  try {
    const { professorId } = req.query; // No futuro pegaremos do Token

    const pagamentos = await prisma.pagamento.findMany({
      where: { professorId: professorId },
      include: {
        aluno: { select: { nome: true } } // Traz o nome do aluno junto
      },
      orderBy: { vencimento: 'asc' }
    });

    res.json(pagamentos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar o financeiro.' });
  }
});

// 2. Marcar uma mensalidade como "PAGA"
app.put('/api/pagamentos/:id/aprovar', async (req, res) => {
  try {
    const { id } = req.params;
    
    const pagamentoAtualizado = await prisma.pagamento.update({
      where: { id: id },
      data: { 
        status: 'PAGO', 
        dataPagamento: new Date() // Salva o dia e hora exatos do recebimento
      }
    });

    res.json(pagamentoAtualizado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao aprovar pagamento.' });
  }
});

// ─── ROTA DE RELATÓRIOS ─────────────────────────────────────────
app.get('/api/relatorios', async (req, res) => {
  try {
    const { professorId } = req.query; // No futuro, vem do Token JWT

    // 1. Busca todo o dinheiro real recebido pelo professor
    const pagamentosPagos = await prisma.pagamento.findMany({
      where: { professorId: professorId, status: 'PAGO' }
    });

    // 2. Soma o total
    const faturamentoAtual = pagamentosPagos.reduce((acc, curr) => acc + curr.valor, 0);

    // 3. Devolve para o App (com uma simulação de crescimento nos meses anteriores para o gráfico não ficar vazio no início)
    res.json({
      faturamentoAtual: faturamentoAtual,
      grafico: [
        { mes: 'Jan', valor: faturamentoAtual * 0.4, altura: '40%' },
        { mes: 'Fev', valor: faturamentoAtual * 0.6, altura: '60%' },
        { mes: 'Mar', valor: faturamentoAtual * 0.8, altura: '80%' },
        { mes: 'Abr', valor: faturamentoAtual, altura: '100%' } 
      ],
      faltas: [
        { id: '1', nome: 'João Pedro', faltas: 0, status: 'Excelente' },
        { id: '2', nome: 'Lucas Silva', faltas: 4, status: 'Alerta' }
      ]
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao gerar relatórios.' });
  }
});

// ─── ROTA DO DASHBOARD (RESUMO DO DIA) ──────────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    const { professorId } = req.query;

    // 1. Procurar as aulas (para simplificar o teste, vamos puxar as próximas 5 aulas agendadas)
    const proximasAulas = await prisma.aula.findMany({
      where: { professorId: professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
      take: 5
    });

    // 2. Procurar pagamentos pendentes ou atrasados para gerar alertas
    const pagamentosPendentes = await prisma.pagamento.findMany({
      where: { 
        professorId: professorId,
        status: { in: ['PENDENTE', 'ATRASADO'] }
      },
      include: { aluno: { select: { nome: true } } }
    });

    // 3. Montar os avisos (Notificações)
    const alertas = pagamentosPendentes.map(p => ({
      id: p.id,
      texto: `Cobrança pendente: ${p.aluno.nome} (R$ ${p.valor})`,
      tipo: 'financeiro'
    }));

    res.json({
      aulasHoje: proximasAulas,
      alertas: alertas
    });

  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o dashboard.' });
  }
});

// ─── ROTA DE ALUNOS E HISTÓRICO ─────────────────────────────────
app.get('/api/meus-alunos', async (req, res) => {
  try {
    const { professorId } = req.query;

    const alunos = await prisma.aluno.findMany({
      where: { professorId: professorId },
      include: {
        aulas: {
          // Traz as aulas antigas para servir de "Histórico"
          where: { dataHora: { lte: new Date() } },
          orderBy: { dataHora: 'desc' },
          take: 10
        }
      }
    });

    res.json(alunos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar a lista de alunos.' });
  }
});

// ─── ROTA DE CALENDÁRIO MENSAL ──────────────────────────────────
app.get('/api/calendario', async (req, res) => {
  try {
    const { professorId, mes, ano } = req.query; // Ex: mes=4, ano=2026

    // Calcula o primeiro e o último segundo do mês
    const inicioMes = new Date(ano, mes - 1, 1);
    const fimMes = new Date(ano, mes, 0, 23, 59, 59);

    const aulas = await prisma.aula.findMany({
      where: {
        professorId: professorId,
        dataHora: {
          gte: inicioMes,
          lte: fimMes
        }
      },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' }
    });

    res.json(aulas);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o calendário.' });
  }
});

// ─── ROTAS DE REPOSIÇÃO ─────────────────────────────────────────

// 1. Buscar todas as reposições do professor
app.get('/api/reposicoes', async (req, res) => {
  try {
    const { professorId } = req.query;
    const reposicoes = await prisma.reposicao.findMany({
      where: { professorId: professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reposicoes);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar reposições.' });
  }
});

// 2. Criar um novo pedido de reposição
app.post('/api/reposicoes', async (req, res) => {
  try {
    const { professorId, alunoId, dataOriginal, dataProposta, motivo } = req.body;
    const novaReposicao = await prisma.reposicao.create({
      data: {
        professorId,
        alunoId,
        dataOriginal,
        dataProposta,
        motivo,
        status: 'AGUARDANDO'
      }
    });
    res.status(201).json(novaReposicao);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao solicitar reposição.' });
  }
});

// ─── ROTA DE CADASTRO DE ALUNO (COM CÓDIGO DE CONVITE) ──────────
app.post('/api/alunos/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, codigoConvite } = req.body;

    // 1. Verifica se o e-mail já existe
    const alunoExiste = await prisma.aluno.findUnique({ where: { email } });
    if (alunoExiste) {
      return res.status(400).json({ erro: 'Este e-mail já está em uso.' });
    }

    // 2. Busca o professor dono do código de convite (Ex: KAV-4X9P)
    const professor = await prisma.professor.findFirst({
      where: { codigoConvite: codigoConvite.toUpperCase() }
    });

    if (!professor) {
      return res.status(404).json({ erro: 'Código de convite inválido ou professor não encontrado.' });
    }

    // 3. Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    // 4. Cria o aluno amarrado ao ID do professor
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

app.get('/api/dashboard', async (req, res) => {
  try {
    const { professorId } = req.query;

    // Buscamos os dados do professor para pegar o código
    const professor = await prisma.professor.findUnique({
      where: { id: professorId },
      select: { codigoConvite: true }
    });

    const proximasAulas = await prisma.aula.findMany({
      where: { professorId: professorId },
      include: { aluno: { select: { nome: true } } },
      orderBy: { dataHora: 'asc' },
      take: 5
    });

    const pagamentosPendentes = await prisma.pagamento.findMany({
      where: { 
        professorId: professorId,
        status: { in: ['PENDENTE', 'ATRASADO'] }
      },
      include: { aluno: { select: { nome: true } } }
    });

    const alertas = pagamentosPendentes.map(p => ({
      id: p.id,
      texto: `Cobrança pendente: ${p.aluno.nome} (R$ ${p.valor})`,
      tipo: 'financeiro'
    }));

    res.json({
      codigoConvite: professor?.codigoConvite || "N/A", // <-- Enviamos o código aqui
      aulasHoje: proximasAulas,
      alertas: alertas
    });

  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o dashboard.' });
  }
});

// ─── ROTA: DASHBOARD DO ALUNO ──────────────────────────────
app.get('/api/aluno/dashboard', async (req, res) => {
  try {
    const { alunoId } = req.query;
    
    const proximasAulas = await prisma.aula.findMany({
      where: { alunoId: alunoId },
      include: { professor: { select: { nome: true } } }, // Puxa o nome do professor
      orderBy: { dataHora: 'asc' },
      take: 5
    });

    res.json({ aulas: proximasAulas });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o dashboard do aluno.' });
  }
});

// ─── ROTAS DO ALUNO: FINANCEIRO E MURAL ────────────────────────

// 1. Buscar os pagamentos específicos do aluno
app.get('/api/aluno/pagamentos', async (req, res) => {
  try {
    const { alunoId } = req.query;
    const pagamentos = await prisma.pagamento.findMany({
      where: { alunoId: alunoId },
      orderBy: { dataVencimento: 'asc' }
    });
    res.json(pagamentos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o financeiro.' });
  }
});

// 2. Buscar o mural do professor vinculado a este aluno
app.get('/api/aluno/mensagens', async (req, res) => {
  try {
    const { alunoId } = req.query;
    
    // Primeiro, descobre quem é o professor deste aluno
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      select: { professorId: true }
    });

    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    // Depois, busca as mensagens do mural daquele professor
    const mensagens = await prisma.mensagem.findMany({
      where: { professorId: aluno.professorId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(mensagens);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar o mural.' });
  }
});

// ─── ROTA ALUNO: ENVIAR MENSAGEM NO MURAL ──────────────────────
app.post('/api/aluno/mensagens', async (req, res) => {
  try {
    const { alunoId, texto } = req.body;
    
    // 1. Descobre quem é o aluno e de quem ele é aluno
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId }
    });

    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    // 2. Grava a mensagem no mural do professor
    const novaMensagem = await prisma.mensagem.create({
      data: {
        professorId: aluno.professorId,
        texto: texto,
        remetente: aluno.id, // O ID do aluno identifica que foi ele
        nome: aluno.nome
      }
    });

    res.status(201).json(novaMensagem);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

// ─── ROTA ALUNO: MATERIAIS DIDÁTICOS ─────────────────────────
app.get('/api/aluno/materiais', async (req, res) => {
  try {
    const { alunoId } = req.query;

    // Busca as aulas do aluno que já aconteceram ou que têm materiais
    const aulas = await prisma.aula.findMany({
      where: { 
        alunoId: alunoId,
      },
      include: { 
        materiais: true // Puxa os anexos junto com a aula
      },
      orderBy: { dataHora: 'desc' } // Da mais recente para a mais antiga
    });

    // Filtra para mandar para o app apenas aulas que tenham materiais anexados
    const aulasComMateriais = aulas.filter(aula => aula.materiais.length > 0);

    res.json(aulasComMateriais);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao carregar os materiais.' });
  }
});