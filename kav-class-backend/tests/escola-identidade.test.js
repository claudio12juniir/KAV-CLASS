// Fase 6 (S6.2) — trava um invariante de segurança: um Professor só entra
// numa Escola de terceiros sendo criado diretamente por um DONO/GESTOR
// daquela Escola (convite por código foi removido do lado INSTITUTION —
// segue existindo só como código pessoal do professor autônomo/SELF).
// Nenhum payload de autocadastro público deve conseguir anexar um professor
// a um escolaId arbitrário.
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
    prismaMock.professor.findFirst.mockResolvedValue(null); // e-mail livre
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
    prismaMock.professor.findUnique.mockResolvedValueOnce({
      id: 'dono-1',
      nome: 'Dona da Escola',
      papel: 'DONO',
      escolaId: 'escola-legitima-id',
      escola: { id: 'escola-legitima-id', nome: 'Escola X', pacote: 'PACOTE_ESCOLA', codigoConvite: null },
    });
    prismaMock.professor.findFirst.mockResolvedValueOnce(null); // checagem de e-mail já em uso
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
