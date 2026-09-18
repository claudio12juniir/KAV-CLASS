// Rede Social — Epic D (Reels, 18/09/2026). Cobre:
//
//   1. POST /api/reels/upload-url cria a linha do Reel já amarrada ao autor
//      autenticado (nunca confia num videoId mandado de volta pelo
//      cliente — ver comentário na rota).
//   2. comoInstituicao só é aceito de DONO/GESTOR.
//   3. GET /api/reels só devolve status:PRONTO, escopado por escolaId.
//   4. curtir/comentar espelham o comportamento de Post.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';
process.env.CLOUDFLARE_ACCOUNT_ID = 'conta-teste';
process.env.CLOUDFLARE_STREAM_API_TOKEN = 'token-teste';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: { findUnique: jest.fn() },
    aluno: { findUnique: jest.fn() },
    reel: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    reelCurtida: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    reelComentario: { findMany: jest.fn(), create: jest.fn() },
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
  global.fetch = jest.fn();
});

describe('POST /api/reels/upload-url', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).post('/api/reels/upload-url').send({});
    expect(resposta.status).toBe(401);
  });

  test('comoInstituicao=true com papel PROFESSOR comum: recusa com 403', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1', papel: 'PROFESSOR' });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/reels/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ comoInstituicao: true });

    expect(resposta.status).toBe(403);
    expect(prismaMock.reel.create).not.toHaveBeenCalled();
  });

  test('sucesso: chama a Cloudflare, cria o Reel amarrado ao autor autenticado', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1', papel: 'PROFESSOR' });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { uid: 'uid-123', uploadURL: 'https://upload.example/uid-123' } }),
    });
    prismaMock.reel.create.mockResolvedValue({ id: 'reel-1', videoId: 'uid-123' });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/reels/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ descricao: 'Aula de violão' });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ uploadURL: 'https://upload.example/uid-123', reelId: 'reel-1' });
    const dadosCriados = prismaMock.reel.create.mock.calls[0][0].data;
    expect(dadosCriados.videoId).toBe('uid-123');
    expect(dadosCriados.autorProfessorId).toBe('prof-1');
    expect(dadosCriados.autorEscolaId).toBeUndefined();
    expect(dadosCriados.escolaId).toBe('escola-1');
  });

  test('comoInstituicao=true com DONO: cria amarrado à Escola, não ao Professor', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1', papel: 'DONO' });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { uid: 'uid-456', uploadURL: 'https://upload.example/uid-456' } }),
    });
    prismaMock.reel.create.mockResolvedValue({ id: 'reel-2', videoId: 'uid-456' });
    const token = assinarToken({ id: 'dono-1', papel: 'professor' });

    await request(app)
      .post('/api/reels/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ comoInstituicao: true });

    const dadosCriados = prismaMock.reel.create.mock.calls[0][0].data;
    expect(dadosCriados.autorEscolaId).toBe('escola-1');
    expect(dadosCriados.autorProfessorId).toBeUndefined();
  });
});

describe('GET /api/reels', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).get('/api/reels');
    expect(resposta.status).toBe(401);
  });

  test('filtro sempre inclui status:PRONTO e o escolaId de quem pede', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue({ escolaId: 'escola-9' });
    prismaMock.reel.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    await request(app).get('/api/reels').set('Authorization', `Bearer ${token}`);

    const where = prismaMock.reel.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PRONTO');
    expect(where.escolaId).toBe('escola-9');
  });
});

describe('POST /api/reels/:id/curtir', () => {
  test('toggle: curte quando não tinha curtido', async () => {
    prismaMock.reel.findUnique.mockResolvedValue({ id: 'reel-1' });
    prismaMock.reelCurtida.findFirst.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/reels/reel-1/curtir')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ curtido: true });
    expect(prismaMock.reelCurtida.create).toHaveBeenCalledWith({ data: { reelId: 'reel-1', autorAlunoId: 'aluno-1' } });
  });

  test('toggle: descurte quando já tinha curtido', async () => {
    prismaMock.reel.findUnique.mockResolvedValue({ id: 'reel-1' });
    prismaMock.reelCurtida.findFirst.mockResolvedValue({ id: 'curtida-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/reels/reel-1/curtir')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.body).toEqual({ curtido: false });
    expect(prismaMock.reelCurtida.delete).toHaveBeenCalledWith({ where: { id: 'curtida-1' } });
  });
});

describe('GET /api/professores/:id/reels e /api/escolas/:id/reels', () => {
  test('professor: filtra por autorProfessorId, não pelo escolaId de quem pede', async () => {
    prismaMock.reel.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    await request(app).get('/api/professores/prof-9/reels').set('Authorization', `Bearer ${token}`);

    const where = prismaMock.reel.findMany.mock.calls[0][0].where;
    expect(where.autorProfessorId).toBe('prof-9');
    expect(where.status).toBe('PRONTO');
  });

  test('escola: filtra por autorEscolaId (só o que a instituição postou, não de todos os professores dela)', async () => {
    prismaMock.reel.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    await request(app).get('/api/escolas/escola-9/reels').set('Authorization', `Bearer ${token}`);

    const where = prismaMock.reel.findMany.mock.calls[0][0].where;
    expect(where.autorEscolaId).toBe('escola-9');
  });
});

describe('POST /api/reels/:id/comentarios', () => {
  test('conteudo vazio: recusa com 400', async () => {
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });
    const resposta = await request(app)
      .post('/api/reels/reel-1/comentarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: '  ' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.reelComentario.create).not.toHaveBeenCalled();
  });

  test('sucesso: cria comentário amarrado ao autor autenticado', async () => {
    prismaMock.reel.findUnique.mockResolvedValue({ id: 'reel-1' });
    prismaMock.reelComentario.create.mockResolvedValue({ id: 'coment-1', conteudo: 'Top!' });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/reels/reel-1/comentarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Top!' });

    expect(resposta.status).toBe(201);
    expect(prismaMock.reelComentario.create).toHaveBeenCalledWith({
      data: { reelId: 'reel-1', conteudo: 'Top!', autorProfessorId: 'prof-1' },
    });
  });
});
