// Fase 6 (S6.2) — trava um invariante de segurança: um Professor só entra
// numa Escola de terceiros com um convite válido (ConviteProfessor) ou sendo
// criado diretamente por um DONO/GESTOR daquela Escola. Nenhum payload de
// autocadastro público deve conseguir anexar um professor a um escolaId
// arbitrário.
//
// O Prisma é mockado por inteiro — nenhum teste aqui toca o banco real. Ver
// server.js: `module.exports = app` só conecta no banco quando executado
// diretamente (`require.main === module`), então importar o app aqui é seguro.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    escola: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conviteProfessor: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    aluno: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((fn) => fn(prismaMock)),
    $executeRawUnsafe: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => prismaMock), __prismaMock: prismaMock };
});

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../server');
const { __prismaMock: prismaMock } = require('@prisma/client');

const assinarToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/professores/cadastro — autocadastro público de professor', () => {
  test('sempre cria uma Escola própria nova, ignorando qualquer escolaId enviado no payload', async () => {
    prismaMock.professor.findUnique.mockResolvedValue(null); // e-mail livre
    prismaMock.professor.create.mockResolvedValue({
      id: 'novo-prof-id',
      nome: 'Fulano',
      codigoConvite: 'KAV-TEST',
    });

    const escolaAlheiaId = 'id-de-uma-escola-de-terceiro';
    const resposta = await request(app)
      .post('/api/professores/cadastro')
      .send({
        nome: 'Fulano de Tal',
        email: 'fulano@teste.com',
        senha: 'senha123',
        // Campos que um atacante poderia tentar injetar pra entrar numa
        // Escola já existente sem convite.
        escolaId: escolaAlheiaId,
        escola: { connect: { id: escolaAlheiaId } },
        papel: 'DONO',
      });

    expect(resposta.status).toBe(201);
    expect(prismaMock.professor.create).toHaveBeenCalledTimes(1);

    const dadosCriados = prismaMock.professor.create.mock.calls[0][0].data;
    // A única forma de vincular Escola nesta rota é criar uma nova — nunca
    // conectar a uma existente por id vindo do corpo da requisição.
    expect(dadosCriados.escola).toEqual({ create: { nome: 'Fulano de Tal' } });
    expect(dadosCriados.escolaId).toBeUndefined();
    expect(JSON.stringify(dadosCriados)).not.toContain(escolaAlheiaId);
  });
});

describe('POST /api/escola/convites/aceitar — professor só entra em Escola existente com convite válido', () => {
  test('rejeita código de convite inexistente e não cria professor nenhum', async () => {
    prismaMock.conviteProfessor.findUnique.mockResolvedValue(null);

    const resposta = await request(app)
      .post('/api/escola/convites/aceitar')
      .send({ nome: 'Invasor', email: 'invasor@teste.com', senha: 'senha123', codigo: 'CODIGO-INVENTADO' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('rejeita quando o e-mail informado não é o mesmo do convite', async () => {
    prismaMock.conviteProfessor.findUnique.mockResolvedValue({
      id: 'convite-1',
      email: 'convidado@escola.com',
      token: 'CODIGO-VALIDO',
      papel: 'PROFESSOR',
      escolaId: 'escola-legitima-id',
      aceitoEm: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const resposta = await request(app)
      .post('/api/escola/convites/aceitar')
      .send({ nome: 'Invasor', email: 'outro@teste.com', senha: 'senha123', codigo: 'CODIGO-VALIDO' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('rejeita convite expirado mesmo com e-mail e código corretos', async () => {
    prismaMock.conviteProfessor.findUnique.mockResolvedValue({
      id: 'convite-2',
      email: 'convidado@escola.com',
      token: 'CODIGO-VENCIDO',
      papel: 'PROFESSOR',
      escolaId: 'escola-legitima-id',
      aceitoEm: null,
      expiresAt: new Date(Date.now() - 60_000), // já expirou
    });

    const resposta = await request(app)
      .post('/api/escola/convites/aceitar')
      .send({ nome: 'Convidado', email: 'convidado@escola.com', senha: 'senha123', codigo: 'CODIGO-VENCIDO' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('aceita convite válido e vincula o professor exatamente à Escola do convite', async () => {
    prismaMock.conviteProfessor.findUnique.mockResolvedValue({
      id: 'convite-3',
      email: 'convidado@escola.com',
      token: 'CODIGO-OK',
      papel: 'PROFESSOR',
      escolaId: 'escola-legitima-id',
      aceitoEm: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.professor.findUnique.mockResolvedValue(null);
    prismaMock.professor.create.mockResolvedValue({ id: 'prof-novo', nome: 'Convidado' });
    prismaMock.conviteProfessor.update.mockResolvedValue({});

    const resposta = await request(app)
      .post('/api/escola/convites/aceitar')
      .send({ nome: 'Convidado', email: 'convidado@escola.com', senha: 'senha123', codigo: 'CODIGO-OK' });

    expect(resposta.status).toBe(201);
    const dadosCriados = prismaMock.professor.create.mock.calls[0][0].data;
    expect(dadosCriados.escolaId).toBe('escola-legitima-id');
  });
});

describe('POST /api/escola/professores/criar — criação direta exige DONO/GESTOR da própria Escola', () => {
  test('sem token de autenticação, recusa e não cria professor', async () => {
    const resposta = await request(app)
      .post('/api/escola/professores/criar')
      .send({ nome: 'Novo Professor', email: 'novo@escola.com', senha: 'senha123' });

    expect(resposta.status).toBe(401);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('professor comum (papel PROFESSOR, não DONO/GESTOR) não consegue criar outro professor', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({
      id: 'prof-comum',
      nome: 'Professor Comum',
      papel: 'PROFESSOR',
      escolaId: 'escola-legitima-id',
      escola: { id: 'escola-legitima-id', nome: 'Escola X', pacote: 'PACOTE_ESCOLA', codigoConvite: null },
    });

    const token = assinarToken({ id: 'prof-comum', papel: 'professor' });
    const resposta = await request(app)
      .post('/api/escola/professores/criar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Novo Professor', email: 'novo@escola.com', senha: 'senha123' });

    expect(resposta.status).toBe(403);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('DONO da Escola cria professor vinculado exatamente à própria escolaId', async () => {
    prismaMock.professor.findUnique
      .mockResolvedValueOnce({
        id: 'dono-1',
        nome: 'Dona da Escola',
        papel: 'DONO',
        escolaId: 'escola-legitima-id',
        escola: { id: 'escola-legitima-id', nome: 'Escola X', pacote: 'PACOTE_ESCOLA', codigoConvite: null },
      })
      .mockResolvedValueOnce(null); // checagem de e-mail já em uso
    prismaMock.professor.create.mockResolvedValue({
      id: 'prof-criado', nome: 'Novo Professor', email: 'novo@escola.com', papel: 'PROFESSOR', createdAt: new Date(),
    });

    const token = assinarToken({ id: 'dono-1', papel: 'professor' });
    const resposta = await request(app)
      .post('/api/escola/professores/criar')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Novo Professor', email: 'novo@escola.com', senha: 'senha123' });

    expect(resposta.status).toBe(201);
    const dadosCriados = prismaMock.professor.create.mock.calls[0][0].data;
    expect(dadosCriados.escolaId).toBe('escola-legitima-id');
    expect(dadosCriados.papel).toBe('PROFESSOR');
  });
});
