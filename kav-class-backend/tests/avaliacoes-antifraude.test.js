// Antifraude (Rede Social, 18/09/2026): avaliação exige presença confirmada,
// não só vínculo/matrícula — sem isso, um professor mal-intencionado podia
// criar um aluno fake pelo próprio código de convite e se autoavaliar com
// 5 estrelas sem nenhum histórico real de aula.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    aula: { findFirst: jest.fn() },
    aluno: { findUnique: jest.fn() },
    matricula: { findFirst: jest.fn() },
    avaliacao: { create: jest.fn() },
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

describe('POST /api/aluno/avaliacoes — antifraude por presença', () => {
  test('com aulaId de aula sem presença confirmada: recusa com 400', async () => {
    prismaMock.aula.findFirst.mockResolvedValue({ id: 'aula-1', alunoId: 'aluno-1', professorId: 'prof-1', presenca: 'PENDENTE_REPOSICAO' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/aluno/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 5, aulaId: 'aula-1' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.avaliacao.create).not.toHaveBeenCalled();
  });

  test('com aulaId de aula com presença PRESENTE: aceita', async () => {
    prismaMock.aula.findFirst.mockResolvedValue({ id: 'aula-1', alunoId: 'aluno-1', professorId: 'prof-1', presenca: 'PRESENTE' });
    prismaMock.avaliacao.create.mockResolvedValue({ id: 'av-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/aluno/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 5, aulaId: 'aula-1' });

    expect(resposta.status).toBe(201);
  });

  test('sem aulaId, vínculo existe mas nenhuma aula com presença confirmada: recusa com 400', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue({ professorId: 'prof-1' });
    prismaMock.matricula.findFirst.mockResolvedValue(null);
    prismaMock.aula.findFirst.mockResolvedValue(null); // nenhuma aula PRESENTE
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/aluno/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 5, professorId: 'prof-1' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.avaliacao.create).not.toHaveBeenCalled();
  });

  test('sem aulaId, vínculo existe e há aula com presença confirmada: aceita', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue({ professorId: 'prof-1' });
    prismaMock.matricula.findFirst.mockResolvedValue(null);
    prismaMock.aula.findFirst.mockResolvedValue({ id: 'aula-9' });
    prismaMock.avaliacao.create.mockResolvedValue({ id: 'av-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/aluno/avaliacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 5, professorId: 'prof-1' });

    expect(resposta.status).toBe(201);
    expect(prismaMock.aula.findFirst).toHaveBeenCalledWith({
      where: { alunoId: 'aluno-1', professorId: 'prof-1', presenca: 'PRESENTE' },
      select: { id: true },
    });
  });
});
