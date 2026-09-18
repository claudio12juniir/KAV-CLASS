// Rede Social — DM aberto (18/09/2026). Cobre:
//   1. Qualquer professor ou aluno pode mandar mensagem pra qualquer outro,
//      sem exigir vínculo/matrícula (diferente do antigo Mensagem 1:1).
//   2. Não dá pra mandar mensagem pra si mesmo.
//   3. GET sem conversa ainda devolve lista vazia, não 404.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: { findUnique: jest.fn() },
    aluno: { findUnique: jest.fn() },
    conversaDireta: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    mensagemDireta: { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
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

describe('POST /api/mensagens/conversas/:tipo/:id', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).post('/api/mensagens/conversas/professor/prof-1').send({ texto: 'oi' });
    expect(resposta.status).toBe(401);
  });

  test('não deixa mandar mensagem pra si mesmo', async () => {
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });
    const resposta = await request(app)
      .post('/api/mensagens/conversas/professor/prof-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'oi' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.conversaDireta.upsert).not.toHaveBeenCalled();
  });

  test('aluno manda mensagem pra um professor sem nenhum vínculo — funciona (DM aberto)', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue(null);
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-9', nome: 'Fulano', fotoUrl: null, expoPushToken: null });
    prismaMock.conversaDireta.upsert.mockResolvedValue({ id: 'conversa-1' });
    prismaMock.mensagemDireta.create.mockResolvedValue({ id: 'msg-1', texto: 'Oi, professor!', createdAt: new Date() });
    const token = assinarToken({ id: 'aluno-5', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/mensagens/conversas/professor/prof-9')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'Oi, professor!' });

    expect(resposta.status).toBe(201);
    const chave = prismaMock.conversaDireta.upsert.mock.calls[0][0];
    // ALUNO:aluno-5 vs PROFESSOR:prof-9 — "ALUNO:..." vem primeiro na ordenação.
    expect(chave.where.participanteATipo_participanteAId_participanteBTipo_participanteBId).toEqual({
      participanteATipo: 'ALUNO', participanteAId: 'aluno-5', participanteBTipo: 'PROFESSOR', participanteBId: 'prof-9',
    });
    expect(prismaMock.mensagemDireta.create).toHaveBeenCalledWith({
      data: { conversaId: 'conversa-1', autorTipo: 'ALUNO', autorId: 'aluno-5', texto: 'Oi, professor!' },
    });
  });

  test('destinatário inexistente: 404', async () => {
    prismaMock.professor.findUnique.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-5', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/mensagens/conversas/professor/nao-existe')
      .set('Authorization', `Bearer ${token}`)
      .send({ texto: 'oi' });

    expect(resposta.status).toBe(404);
  });
});

describe('GET /api/mensagens/conversas/:tipo/:id', () => {
  test('sem conversa ainda: devolve lista vazia, não 404', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-9', nome: 'Fulano', fotoUrl: null, expoPushToken: null });
    prismaMock.conversaDireta.findUnique.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-5', papel: 'aluno' });

    const resposta = await request(app)
      .get('/api/mensagens/conversas/professor/prof-9')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ conversaId: null, mensagens: [], proximoCursor: null, outro: { tipo: 'professor', id: 'prof-9', nome: 'Fulano', fotoUrl: null } });
  });
});

describe('GET /api/mensagens/conversas', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).get('/api/mensagens/conversas');
    expect(resposta.status).toBe(401);
  });

  test('lista conversas de quem está logado, dos dois lados do par', async () => {
    prismaMock.conversaDireta.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    await request(app).get('/api/mensagens/conversas').set('Authorization', `Bearer ${token}`);

    const where = prismaMock.conversaDireta.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { participanteATipo: 'PROFESSOR', participanteAId: 'prof-1' },
      { participanteBTipo: 'PROFESSOR', participanteBId: 'prof-1' },
    ]);
  });
});
