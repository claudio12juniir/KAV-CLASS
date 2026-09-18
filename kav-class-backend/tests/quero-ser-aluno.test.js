// "Quero ser aluno" self-service (Rede Social, 18/09/2026) — pedido do
// usuário: virar aluno sem código de convite, podendo ser de várias
// instituições. Antifraude: isto vira um Lead (nunca um Aluno/Matricula
// direto), com rate-limit e sem duplicar interesse repetido no mesmo lugar.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: { findFirst: jest.fn() },
    escola: { findFirst: jest.fn() },
    aluno: { findUnique: jest.fn() },
    conta: { findUnique: jest.fn() },
    lead: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    estagioFunil: { findFirst: jest.fn() },
    tarefaLead: { create: jest.fn() },
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

describe('POST /api/professores/:id/quero-ser-aluno', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).post('/api/professores/prof-1/quero-ser-aluno');
    expect(resposta.status).toBe(401);
  });

  test('professor não visível na busca: 404, não revela nada', async () => {
    prismaMock.professor.findFirst.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-x/quero-ser-aluno')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(404);
  });

  test('sem estágio de funil configurado: 503, não cria Lead', async () => {
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-1' });
    prismaMock.aluno.findUnique.mockResolvedValue({ nome: 'Aluno QA', email: 'aluno@teste.com', telefone: null });
    prismaMock.lead.count.mockResolvedValue(0);
    prismaMock.lead.findFirst.mockResolvedValue(null);
    prismaMock.estagioFunil.findFirst.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/quero-ser-aluno')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(503);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
  });

  test('sucesso: cria Lead + TarefaLead, nunca um Aluno/Matricula', async () => {
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-1' });
    prismaMock.aluno.findUnique.mockResolvedValue({ nome: 'Aluno QA', email: 'aluno@teste.com', telefone: '11999999999' });
    prismaMock.lead.count.mockResolvedValue(0);
    prismaMock.lead.findFirst.mockResolvedValue(null);
    prismaMock.estagioFunil.findFirst.mockResolvedValue({ id: 'estagio-1' });
    prismaMock.lead.create.mockResolvedValue({ id: 'lead-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/quero-ser-aluno')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(201);
    expect(prismaMock.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ professorId: 'prof-1', escolaId: 'escola-1', email: 'aluno@teste.com' }),
    });
    expect(prismaMock.tarefaLead.create).toHaveBeenCalled();
  });

  test('já demonstrou interesse ali: não duplica o Lead', async () => {
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-1' });
    prismaMock.aluno.findUnique.mockResolvedValue({ nome: 'Aluno QA', email: 'aluno@teste.com', telefone: null });
    prismaMock.lead.count.mockResolvedValue(0);
    prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-existente' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/quero-ser-aluno')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
  });

  test('limite diário atingido: recusa com 429', async () => {
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-1' });
    prismaMock.aluno.findUnique.mockResolvedValue({ nome: 'Aluno QA', email: 'aluno@teste.com', telefone: null });
    prismaMock.lead.count.mockResolvedValue(5);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/quero-ser-aluno')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(429);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
  });
});
