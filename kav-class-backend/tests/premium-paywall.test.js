// Rede Social Fase 5 — paywall de conteúdo premium. Cobre:
//
//   1. Só é possível configurar preço/publicar exclusivo com a conta
//      Stripe Connect da Escola do professor já onboardada.
//   2. Checkout de assinatura usa Connect (transfer_data.destination) —
//      sem isso o dinheiro do aluno iria pra conta da plataforma, não pro
//      professor.
//   3. GET /api/feed redige conteúdo/midiaUrl de post exclusivo pra aluno
//      sem assinatura ATIVA; nunca bloqueia Professor (é a equipe).
//   4. Curtir/comentar em post exclusivo trancado é recusado.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_para_teste';

jest.mock('stripe', () => {
  const stripeMock = {
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { update: jest.fn() },
  };
  const factory = jest.fn(() => stripeMock);
  factory.__stripeMock = stripeMock;
  return factory;
});

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: { findUnique: jest.fn(), update: jest.fn() },
    aluno: { findUnique: jest.fn() },
    escola: { findUnique: jest.fn() },
    assinaturaPremium: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
    post: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    postCurtida: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    postComentario: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => prismaMock), __prismaMock: prismaMock };
});

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../server');
const { __prismaMock: prismaMock } = require('@prisma/client');
const stripeMock = require('stripe').__stripeMock;

const assinarToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.postCurtida.findMany.mockResolvedValue([]);
});

describe('PUT /api/professor/premium/configurar', () => {
  test('preço <= 0: recusa com 400', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .put('/api/professor/premium/configurar')
      .set('Authorization', `Bearer ${token}`)
      .send({ precoAssinaturaPremium: 0 });

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.update).not.toHaveBeenCalled();
  });

  test('sem Stripe Connect onboardado: recusa com 400', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.escola.findUnique.mockResolvedValue({ stripeConnectOnboardingCompleto: false });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .put('/api/professor/premium/configurar')
      .set('Authorization', `Bearer ${token}`)
      .send({ precoAssinaturaPremium: 29.9 });

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.update).not.toHaveBeenCalled();
  });

  test('com Stripe Connect onboardado: configura com sucesso', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.escola.findUnique.mockResolvedValue({ stripeConnectOnboardingCompleto: true });
    prismaMock.professor.update.mockResolvedValue({ precoAssinaturaPremium: 29.9 });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .put('/api/professor/premium/configurar')
      .set('Authorization', `Bearer ${token}`)
      .send({ precoAssinaturaPremium: 29.9 });

    expect(resposta.status).toBe(200);
    expect(resposta.body.precoAssinaturaPremium).toBe(29.9);
  });
});

describe('POST /api/posts — exclusivo exige preço premium configurado', () => {
  test('exclusivo:true sem precoAssinaturaPremium: recusa com 400', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1', precoAssinaturaPremium: null });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Aula completa de escalas', exclusivo: true });

    expect(resposta.status).toBe(400);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });

  test('exclusivo:true com preço configurado: publica com sucesso', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1', precoAssinaturaPremium: 29.9 });
    prismaMock.post.create.mockResolvedValue({ id: 'post-1', exclusivo: true });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Aula completa de escalas', exclusivo: true });

    expect(resposta.status).toBe(201);
    expect(prismaMock.post.create.mock.calls[0][0].data.exclusivo).toBe(true);
  });
});

describe('POST /api/professores/:id/premium/assinar', () => {
  test('professor sem premium configurado: recusa com 400', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-1', nome: 'Fulano', escolaId: 'escola-1', precoAssinaturaPremium: null });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/premium/assinar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('professor com premium mas sem Stripe Connect onboardado: recusa com 400', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-1', nome: 'Fulano', escolaId: 'escola-1', precoAssinaturaPremium: 29.9 });
    prismaMock.escola.findUnique.mockResolvedValue({ stripeConnectAccountId: null, stripeConnectOnboardingCompleto: false });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/premium/assinar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('sucesso: cria checkout de subscription com Connect destination = escola do professor', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-1', nome: 'Fulano', escolaId: 'escola-1', precoAssinaturaPremium: 29.9 });
    prismaMock.escola.findUnique.mockResolvedValue({ stripeConnectAccountId: 'acct_123', stripeConnectOnboardingCompleto: true });
    prismaMock.aluno.findUnique.mockResolvedValue({ nome: 'Ciclano', email: 'ciclano@teste.com' });
    prismaMock.assinaturaPremium.upsert.mockResolvedValue({ id: 'assinatura-1' });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/xyz', id: 'cs_123' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/premium/assinar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(200);
    expect(resposta.body.url).toBe('https://checkout.stripe.com/xyz');
    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    expect(args.subscription_data.transfer_data.destination).toBe('acct_123');
    expect(args.metadata.assinaturaPremiumId).toBe('assinatura-1');
    expect(args.line_items[0].price_data.unit_amount).toBe(2990);
  });
});

describe('POST /api/professores/:id/premium/cancelar', () => {
  test('sem assinatura: 404', async () => {
    prismaMock.assinaturaPremium.findUnique.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/premium/cancelar')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(404);
  });

  test('com assinatura: cancela no Stripe com cancel_at_period_end', async () => {
    prismaMock.assinaturaPremium.findUnique.mockResolvedValue({ stripeSubscriptionId: 'sub_123' });
    stripeMock.subscriptions.update.mockResolvedValue({});
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/professores/prof-1/premium/cancelar')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_123', { cancel_at_period_end: true });
  });
});

describe('GET /api/feed — paywall', () => {
  const postExclusivo = {
    id: 'post-1', conteudo: 'Segredo dos mestres', midiaUrl: 'https://x/video.mp4', exclusivo: true, createdAt: new Date(),
    autorProfessorId: 'prof-1', autorProfessor: { id: 'prof-1', nome: 'Fulano', fotoUrl: null }, autorEscola: null,
    _count: { curtidas: 0, comentarios: 0 },
  };

  test('aluno SEM assinatura ATIVA: conteúdo/midiaUrl redigidos, bloqueado:true', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.post.findMany.mockResolvedValue([postExclusivo]);
    prismaMock.postCurtida.findFirst.mockResolvedValue(null);
    prismaMock.assinaturaPremium.findMany.mockResolvedValue([]); // nenhuma assinatura ativa
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    const post = resposta.body.posts[0];
    expect(post.bloqueado).toBe(true);
    expect(post.conteudo).toBeNull();
    expect(post.midiaUrl).toBeNull();
  });

  test('aluno COM assinatura ATIVA: vê o conteúdo completo', async () => {
    prismaMock.aluno.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.post.findMany.mockResolvedValue([postExclusivo]);
    prismaMock.assinaturaPremium.findMany.mockResolvedValue([{ professorId: 'prof-1' }]);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);

    const post = resposta.body.posts[0];
    expect(post.bloqueado).toBe(false);
    expect(post.conteudo).toBe('Segredo dos mestres');
  });

  test('professor (equipe) nunca é bloqueado, mesmo sem AssinaturaPremium', async () => {
    prismaMock.professor.findUnique.mockResolvedValue({ escolaId: 'escola-1' });
    prismaMock.post.findMany.mockResolvedValue([postExclusivo]);
    const token = assinarToken({ id: 'prof-2', papel: 'professor' });

    const resposta = await request(app).get('/api/feed').set('Authorization', `Bearer ${token}`);

    const post = resposta.body.posts[0];
    expect(post.bloqueado).toBe(false);
    expect(post.conteudo).toBe('Segredo dos mestres');
    expect(prismaMock.assinaturaPremium.findMany).not.toHaveBeenCalled();
  });
});

describe('Interação em post exclusivo trancado', () => {
  test('curtir: aluno sem assinatura ATIVA é recusado com 403', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1', exclusivo: true, autorProfessorId: 'prof-1' });
    prismaMock.assinaturaPremium.findUnique.mockResolvedValue(null);
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app).post('/api/posts/post-1/curtir').set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(403);
    expect(prismaMock.postCurtida.create).not.toHaveBeenCalled();
  });

  test('comentar: aluno com assinatura ATIVA consegue', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ id: 'post-1', exclusivo: true, autorProfessorId: 'prof-1' });
    prismaMock.assinaturaPremium.findUnique.mockResolvedValue({ status: 'ATIVA' });
    prismaMock.postComentario.create.mockResolvedValue({ id: 'coment-1' });
    const token = assinarToken({ id: 'aluno-1', papel: 'aluno' });

    const resposta = await request(app)
      .post('/api/posts/post-1/comentarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ conteudo: 'Muito bom!' });

    expect(resposta.status).toBe(201);
  });
});
