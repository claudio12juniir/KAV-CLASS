// Rede Social Fase 4 — feed/posts. Cobre o invariante central: o feed é
// uma comunidade FECHADA por Escola (nunca global) — e as regras de quem
// pode postar/apagar/curtir.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: { findUnique: jest.fn(), findFirst: jest.fn() },
    aluno: { findUnique: jest.fn() },
    post: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    postCurtida: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    postComentario: { findMany: jest.fn(), create: jest.fn() },
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

describe('POST /api/posts — professor publica em nome próprio', () => {
  test('sem token: recusa com 401', async () => {
    const resposta = await request(app).post('/api/posts').send({ conteudo: 'Oi' });
    expect(resposta.status).toBe(401);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });

  test('conteudo vazio: recusa com 400', async () => {
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });
    const resposta = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: '   ' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });

  test('publica com sucesso, escolaId denormalizado da própria escola do professor', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.post.create.mockResolvedValue({ id: 'post-1', conteudo: 'Dica de hoje' });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Dica de hoje' });

    expect(resposta.status).toBe(201);
    const dados = prismaMock.post.create.mock.calls[0][0].data;
    expect(dados.autorProfessorId).toBe('prof-1');
    expect(dados.escolaId).toBe('escola-1');
    expect(dados.autorEscolaId).toBeUndefined();
  });
});

describe('POST /api/escola/posts — só DONO/GESTOR posta como a instituição', () => {
  test('professor comum (papel PROFESSOR) não pode postar como a Escola', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({
      id: 'prof-comum', papel: 'PROFESSOR', escolaId: 'escola-1',
      escola: { id: 'escola-1', nome: 'Escola X', pacote: 'PACOTE_ESCOLA', codigoConvite: null },
    });
    const token = assinarToken({ id: 'prof-comum', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/escola/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Comunicado' });

    expect(resposta.status).toBe(403);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });

  test('DONO publica com sucesso, autorEscolaId = escolaId = escola do DONO', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({
      id: 'dono-1', papel: 'DONO', escolaId: 'escola-1',
      escola: { id: 'escola-1', nome: 'Escola X', pacote: 'PACOTE_ESCOLA', codigoConvite: null },
    });
    prismaMock.post.create.mockResolvedValue({ id: 'post-2', conteudo: 'Comunicado oficial' });
    const token = assinarToken({ id: 'dono-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/escola/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Comunicado oficial' });

    expect(resposta.status).toBe(201);
    const dados = prismaMock.post.create.mock.calls[0][0].data;
    expect(dados.autorEscolaId).toBe('escola-1');
    expect(dados.escolaId).toBe('escola-1');
    expect(dados.autorProfessorId).toBeUndefined();
  });
});

describe('DELETE /api/posts/:id', () => {
  test('autor original apaga o próprio post', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1', autorProfessorId: 'prof-1', escolaId: 'escola-1' });
    prismaMock.post.delete.mockResolvedValue({});
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app).delete('/api/posts/post-1').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(prismaMock.post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
  });

  test('professor comum de OUTRA escola não pode apagar (nem sendo DONO em outro lugar não ajuda)', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1', autorProfessorId: 'outro-prof', escolaId: 'escola-1' });
    prismaMock.professor.findUnique.mockResolvedValue({ papel: 'PROFESSOR', escolaId: 'escola-2' });
    const token = assinarToken({ id: 'prof-x', papel: 'professor' });

    const resposta = await request(app).delete('/api/posts/post-1').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(403);
    expect(prismaMock.post.delete).not.toHaveBeenCalled();
  });

  test('GESTOR da mesma Escola apaga post de outro professor (moderação)', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1', autorProfessorId: 'outro-prof', escolaId: 'escola-1' });
    prismaMock.professor.findUnique.mockResolvedValue({ papel: 'GESTOR', escolaId: 'escola-1' });
    prismaMock.post.delete.mockResolvedValue({});
    const token = assinarToken({ id: 'gestor-1', papel: 'professor' });

    const resposta = await request(app).delete('/api/posts/post-1').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
  });

  test('aluno nunca pode apagar post nenhum', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1', autorProfessorId: 'prof-1', escolaId: 'escola-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app).delete('/api/posts/post-1').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(403);
  });
});

describe('GET /api/feed — comunidade fechada por Escola', () => {
  test('professor: feed é filtrado pela PRÓPRIA escolaId, nunca global', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.post.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);

    expect(prismaMock.post.findMany.mock.calls[0][0].where).toEqual({ escolaId: 'escola-1' });
  });

  test('aluno: feed é filtrado pela escolaId do vínculo ativo dele', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue({ escolaId: 'escola-2' });
    prismaMock.post.findMany.mockResolvedValue([]);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);

    expect(prismaMock.post.findMany.mock.calls[0][0].where).toEqual({ escolaId: 'escola-2' });
  });

  test('conta neutra não vê feed (sem vínculo, sem escolaId pra escopar)', async () => {
    const token = assinarToken({ id: 'conta-1', papel: 'conta' });
    const resposta = await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);
    expect(resposta.status).toBe(403);
  });

  test('marca curtidoPeloUsuario a partir de PostCurtida do próprio usuário', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.post.findMany.mockResolvedValue([
      { id: 'post-1', conteudo: 'A', midiaUrl: null, createdAt: new Date(), autorProfessor: { id: 'prof-1', nome: 'Fulano', fotoUrl: null }, autorEscola: null, _count: { curtidas: 2, comentarios: 0 } },
      { id: 'post-2', conteudo: 'B', midiaUrl: null, createdAt: new Date(), autorProfessor: { id: 'prof-1', nome: 'Fulano', fotoUrl: null }, autorEscola: null, _count: { curtidas: 0, comentarios: 0 } },
    ]);
    prismaMock.postCurtida.findMany.mockResolvedValue([{ postId: 'post-1' }]);
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.posts.find((p) => p.id === 'post-1').curtidoPeloUsuario).toBe(true);
    expect(resposta.body.posts.find((p) => p.id === 'post-2').curtidoPeloUsuario).toBe(false);
  });
});

describe('POST /api/posts/:id/curtir — toggle', () => {
  test('curte quando ainda não tinha curtido', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1' });
    prismaMock.postCurtida.findFirst.mockResolvedValue(null);
    prismaMock.postCurtida.create.mockResolvedValue({});
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app).post('/api/posts/post-1/curtir').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.curtido).toBe(true);
    expect(prismaMock.postCurtida.create.mock.calls[0][0].data).toEqual({ postId: 'post-1', autorAlunoId: 'aluno-1' });
  });

  test('descurte quando já tinha curtido (toggle)', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1' });
    prismaMock.postCurtida.findFirst.mockResolvedValue({ id: 'curtida-1' });
    prismaMock.postCurtida.delete.mockResolvedValue({});
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app).post('/api/posts/post-1/curtir').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.curtido).toBe(false);
    expect(prismaMock.postCurtida.delete).toHaveBeenCalledWith({ where: { id: 'curtida-1' } });
  });
});

describe('POST /api/posts/:id/comentarios', () => {
  test('professor e aluno conseguem comentar; conteudo vazio é recusado', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const respostaVazia = await request(app)
      .post('/api/posts/post-1/comentarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: '' });
    expect(respostaVazia.status).toBe(400);

    prismaMock.postComentario.create.mockResolvedValue({ id: 'coment-1', conteudo: 'Ótima dica!' });
    const resposta = await request(app)
      .post('/api/posts/post-1/comentarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Ótima dica!' });

    expect(resposta.status).toBe(201);
    expect(prismaMock.postComentario.create.mock.calls[0][0].data).toEqual({
      postId: 'post-1', conteudo: 'Ótima dica!', autorAlunoId: 'aluno-1',
    });
  });
});
