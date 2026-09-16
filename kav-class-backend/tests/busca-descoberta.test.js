// Rede Social Fase 3 — busca/descoberta e perfil público. Cobre:
//
//   1. Rotas de busca exigem estar logado (qualquer papel, inclusive Conta
//      neutra) mas nunca papel específico — exigirProfessor/exigirAluno
//      bloqueariam justamente o caso de uso central (usuário neutro
//      explorando antes de virar aluno de alguém).
//   2. Filtro de busca de professor sempre inclui visivelBuscaSelf:true —
//      é o gate de monetização SELF, não pode vazar professor institucional
//      sem SELF pago pra busca de aula particular.
//   3. Perfil público devolve 404 (não 403) quando o alvo não está
//      elegível, pra não revelar se o id existe.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    escola: { findMany: jest.fn(), findFirst: jest.fn() },
    curso: { findMany: jest.fn() },
    avaliacao: { aggregate: jest.fn() },
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

describe('GET /api/busca/professores', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).get('/api/busca/professores');
    expect(resposta.status).toBe(401);
  });

  test('Conta neutra (papel "conta", sem vínculo) consegue buscar', async () => {
    prismaMock.professor.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });

    const resposta = await request(app)
      .get('/api/busca/professores')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.professores).toEqual([]);
  });

  test('filtro sempre inclui visivelBuscaSelf:true, mesmo sem query params', async () => {
    prismaMock.professor.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    await request(app).get('/api/busca/professores').set('Authorization', `Bearer ${token}`);

    const where = prismaMock.professor.findMany.mock.calls[0][0].where;
    expect(where.visivelBuscaSelf).toBe(true);
  });

  test('aplica filtros de curso/cidade/estado/q recebidos na query', async () => {
    prismaMock.professor.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    await request(app)
      .get('/api/busca/professores?curso=Viol%C3%A3o&cidade=Recife&estado=pe&q=Ana')
      .set('Authorization', `Bearer ${token}`);

    const where = prismaMock.professor.findMany.mock.calls[0][0].where;
    expect(where.cursos).toEqual({ has: 'Violão' });
    expect(where.cidade).toEqual({ equals: 'Recife', mode: 'insensitive' });
    expect(where.estado).toEqual({ equals: 'PE' });
    expect(where.nome).toEqual({ contains: 'Ana', mode: 'insensitive' });
  });
});

describe('GET /api/busca/escolas', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).get('/api/busca/escolas');
    expect(resposta.status).toBe(401);
  });

  test('filtro sempre inclui pacote:PACOTE_ESCOLA', async () => {
    prismaMock.escola.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });

    await request(app).get('/api/busca/escolas').set('Authorization', `Bearer ${token}`);

    const where = prismaMock.escola.findMany.mock.calls[0][0].where;
    expect(where.pacote).toBe('PACOTE_ESCOLA');
  });
});

describe('GET /api/professores/:id/perfil-publico', () => {
  test('professor sem SELF ativo (ou inexistente): 404, não revela nada', async () => {
    prismaMock.professor.findFirst.mockResolvedValue(null);
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });

    const resposta = await request(app)
      .get('/api/professores/prof-sem-self/perfil-publico')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(404);
  });

  test('professor com SELF ativo: 200, com nota média agregada', async () => {
    prismaMock.professor.findFirst.mockResolvedValue({
      id: 'prof-1', nome: 'Fulano', fotoUrl: null, bio: 'Ensino violão há 10 anos', cidade: 'Recife', estado: 'PE', cursos: ['Violão'], videoApresentacaoUrl: null,
    });
    prismaMock.avaliacao.aggregate.mockResolvedValue({ _avg: { nota: 4.5 }, _count: { nota: 10 } });
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });

    const resposta = await request(app)
      .get('/api/professores/prof-1/perfil-publico')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.notaMedia).toBe(4.5);
    expect(resposta.body.totalAvaliacoes).toBe(10);
    // Nunca vaza dado sensível no perfil público.
    expect(resposta.body.email).toBeUndefined();
    expect(resposta.body.telefone).toBeUndefined();
    expect(resposta.body.chavePix).toBeUndefined();
  });
});

describe('GET /api/escolas/:id/perfil-publico', () => {
  test('escola PACOTE_PROFESSOR (não é instituição de verdade): 404', async () => {
    prismaMock.escola.findFirst.mockResolvedValue(null);
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });

    const resposta = await request(app)
      .get('/api/escolas/escola-x/perfil-publico')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(404);
  });

  test('escola de verdade: 200, com cursos e nota média da escola', async () => {
    prismaMock.escola.findFirst.mockResolvedValue({ id: 'escola-1', nome: 'Instituto X', logoUrl: null, bio: 'Escola de música', cidade: 'Recife', estado: 'PE' });
    prismaMock.avaliacao.aggregate.mockResolvedValue({ _avg: { notaEscola: 4.8 }, _count: { notaEscola: 20 } });
    prismaMock.curso.findMany.mockResolvedValue([{ nome: 'Violão' }, { nome: 'Piano' }]);
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });

    const resposta = await request(app)
      .get('/api/escolas/escola-1/perfil-publico')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.cursos).toEqual(['Violão', 'Piano']);
    expect(resposta.body.notaMedia).toBe(4.8);
  });
});
