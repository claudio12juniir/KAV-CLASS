// Fundação de identidade unificada (Rede Social Fase 1, Step 1). Cobre:
//
//   1. Login legado (USAR_CONTA_NO_LOGIN desligada, o padrão hoje) continua
//      bit-a-bit igual ao comportamento anterior à Conta existir.
//   2. Login via Conta (flag ligada) pra uma Conta com 1 vínculo só —
//      mesmo resultado observável do login legado, só que com `vinculos` a
//      mais na resposta.
//   3. Login de Conta neutra (0 vínculos) — retorna papel 'conta'.
//   4. Troca de vínculo autenticada.
//   5. Troca de senha (PUT /api/professor/perfil) mantém Conta.senha em
//      sincronia — o ponto mais fácil de esquecer e mais silencioso de
//      quebrar (ver comentário em server.js: `sincronizarConta`).
//
// USAR_CONTA_NO_LOGIN é lido como `const` no topo do server.js na hora do
// primeiro require — por isso cada bloco que precisa de um valor diferente
// usa jest.resetModules() e re-requer o app numa "carga" isolada.

process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

jest.mock('@prisma/client', () => {
  const prismaMock = {
    professor: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    aluno: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    conta: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    escola: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    conviteProfessor: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((fn) => fn(prismaMock)),
    $executeRawUnsafe: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => prismaMock), __prismaMock: prismaMock };
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

// Recarrega server.js + o mock do Prisma do zero, com a env var desejada —
// necessário porque USAR_CONTA_NO_LOGIN é lido só na primeira vez que
// server.js roda.
function carregarApp({ usarContaNoLogin } = {}) {
  jest.resetModules();
  if (usarContaNoLogin === undefined) delete process.env.USAR_CONTA_NO_LOGIN;
  else process.env.USAR_CONTA_NO_LOGIN = String(usarContaNoLogin);

  const app = require('../server');
  const { __prismaMock: prismaMock } = require('@prisma/client');
  return { app, prismaMock };
}

const assinarToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/login — legado (USAR_CONTA_NO_LOGIN desligada, comportamento de hoje)', () => {
  test('professor com senha correta loga normalmente, sem campo vinculos', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: false });
    const senhaHash = await bcrypt.hash('senha123', 10);
    prismaMock.professor.findFirst.mockResolvedValue({
      id: 'prof-1', nome: 'Fulano', email: 'fulano@teste.com', senha: senhaHash,
      ativoNaEscola: true, assinaturaStatus: 'ATIVO',
    });

    const resposta = await request(app).post('/api/login').send({ email: 'fulano@teste.com', senha: 'senha123' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toEqual({ id: 'prof-1', nome: 'Fulano', papel: 'professor' });
    expect(resposta.body.vinculos).toBeUndefined();
    expect(prismaMock.conta.findUnique).not.toHaveBeenCalled();
  });

  test('senha errada continua recusando com 401', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: false });
    const senhaHash = await bcrypt.hash('senha123', 10);
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', nome: 'Fulano', senha: senhaHash, ativoNaEscola: true, assinaturaStatus: 'ATIVO' });

    const resposta = await request(app).post('/api/login').send({ email: 'fulano@teste.com', senha: 'errada' });
    expect(resposta.status).toBe(401);
  });
});

describe('POST /api/login — via Conta (USAR_CONTA_NO_LOGIN=true)', () => {
  test('Conta com 1 vínculo (professor): resultado observável idêntico ao login legado, mais vinculos', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: true });
    const senhaHash = await bcrypt.hash('senha123', 10);
    prismaMock.conta.findUnique.mockResolvedValue({
      id: 'conta-1', email: 'fulano@teste.com', senha: senhaHash, nome: 'Fulano',
      professores: [{ id: 'prof-1', nome: 'Fulano', escolaId: 'escola-1', ativoNaEscola: true, assinaturaStatus: 'ATIVO' }],
      alunos: [],
    });

    const resposta = await request(app).post('/api/login').send({ email: 'fulano@teste.com', senha: 'senha123' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toEqual({ id: 'prof-1', nome: 'Fulano', papel: 'professor' });
    expect(resposta.body.vinculos).toEqual([{ id: 'prof-1', papel: 'professor', nome: 'Fulano', escolaId: 'escola-1' }]);

    const payload = jwt.verify(resposta.body.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: 'prof-1', papel: 'professor', contaId: 'conta-1' });
  });

  test('Conta com 0 vínculos (neutra): papel "conta", vinculos vazio', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: true });
    const senhaHash = await bcrypt.hash('senha123', 10);
    prismaMock.conta.findUnique.mockResolvedValue({
      id: 'conta-2', email: 'neutro@teste.com', senha: senhaHash, nome: null, professores: [], alunos: [],
    });

    const resposta = await request(app).post('/api/login').send({ email: 'neutro@teste.com', senha: 'senha123' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario.papel).toBe('conta');
    expect(resposta.body.vinculos).toEqual([]);
  });

  test('professor desligado da escola, sem outro vínculo, continua bloqueado com 403', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: true });
    const senhaHash = await bcrypt.hash('senha123', 10);
    prismaMock.conta.findUnique.mockResolvedValue({
      id: 'conta-3', email: 'desligado@teste.com', senha: senhaHash,
      professores: [{ id: 'prof-3', nome: 'Desligado', escolaId: 'escola-1', ativoNaEscola: false, assinaturaStatus: 'ATIVO' }],
      alunos: [],
    });

    const resposta = await request(app).post('/api/login').send({ email: 'desligado@teste.com', senha: 'senha123' });
    expect(resposta.status).toBe(403);
  });
});

describe('POST /api/contas/trocar-vinculo', () => {
  test('sem token, recusa com 401', async () => {
    const { app } = carregarApp({ usarContaNoLogin: true });
    const resposta = await request(app).post('/api/contas/trocar-vinculo').send({ vinculoId: 'x', papel: 'professor' });
    expect(resposta.status).toBe(401);
  });

  test('token sem contaId (emitido antes da migração), recusa com 400', async () => {
    const { app } = carregarApp({ usarContaNoLogin: true });
    const token = assinarToken({ id: 'prof-1', papel: 'professor' }); // sem contaId de propósito
    const resposta = await request(app)
      .post('/api/contas/trocar-vinculo')
      .set('Authorization', `Bearer ${token}`)
      .send({ vinculoId: 'prof-2', papel: 'professor' });
    expect(resposta.status).toBe(400);
  });

  test('vínculo pertence a outra Conta: recusa com 403 e não vaza token', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: true });
    prismaMock.professor.findFirst.mockResolvedValue(null); // não achou com esse contaId
    const token = assinarToken({ id: 'prof-1', papel: 'professor', contaId: 'conta-1' });

    const resposta = await request(app)
      .post('/api/contas/trocar-vinculo')
      .set('Authorization', `Bearer ${token}`)
      .send({ vinculoId: 'prof-de-outra-conta', papel: 'professor' });

    expect(resposta.status).toBe(403);
  });

  test('troca pra outro vínculo da mesma Conta com sucesso', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: true });
    prismaMock.professor.findFirst.mockResolvedValue({
      id: 'prof-2', nome: 'Segundo Vínculo', contaId: 'conta-1', ativoNaEscola: true, assinaturaStatus: 'ATIVO',
    });
    const token = assinarToken({ id: 'prof-1', papel: 'professor', contaId: 'conta-1' });

    const resposta = await request(app)
      .post('/api/contas/trocar-vinculo')
      .set('Authorization', `Bearer ${token}`)
      .send({ vinculoId: 'prof-2', papel: 'professor' });

    expect(resposta.status).toBe(200);
    const payload = jwt.verify(resposta.body.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: 'prof-2', papel: 'professor', contaId: 'conta-1' });
  });
});

describe('Troca de senha mantém Conta.senha sincronizada', () => {
  test('PUT /api/professor/perfil com novaSenha chama conta.upsert com o mesmo hash', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: false });
    const senhaAtualHash = await bcrypt.hash('senhaAntiga', 10);
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-1', email: 'fulano@teste.com', senha: senhaAtualHash });
    prismaMock.professor.update.mockImplementation(({ data }) => Promise.resolve({
      id: 'prof-1', nome: 'Fulano', email: 'fulano@teste.com', telefone: null,
      cursos: [], codigoConvite: 'X', chavePix: null, linkPagamentoCartao: null, fotoUrl: null,
      _senhaGravada: data.senha,
    }));
    prismaMock.conta.upsert.mockResolvedValue({ id: 'conta-1' });

    const token = assinarToken({ id: 'prof-1', papel: 'professor' });
    const resposta = await request(app)
      .put('/api/professor/perfil')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'senhaAntiga', novaSenha: 'senhaNovaSegura' });

    expect(resposta.status).toBe(200);
    expect(prismaMock.conta.upsert).toHaveBeenCalledTimes(1);
    const argsUpsert = prismaMock.conta.upsert.mock.calls[0][0];
    expect(argsUpsert.where).toEqual({ email: 'fulano@teste.com' });
    expect(argsUpsert.update.senha).toBeDefined();
    // O hash gravado em Professor.senha e o gravado em Conta.senha devem ser
    // o MESMO valor — é a checagem central desta suíte (evita a classe de bug
    // "esqueceu de sincronizar" descrita no plano).
    const dadosProfessorGravados = prismaMock.professor.update.mock.calls[0][0].data;
    expect(argsUpsert.update.senha).toBe(dadosProfessorGravados.senha);
  });

  test('PUT /api/professor/perfil sem troca de senha não toca em Conta', async () => {
    const { app, prismaMock } = carregarApp({ usarContaNoLogin: false });
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-1', email: 'fulano@teste.com', senha: 'hash-antigo' });
    prismaMock.professor.update.mockResolvedValue({ id: 'prof-1', nome: 'Fulano Editado', email: 'fulano@teste.com' });

    const token = assinarToken({ id: 'prof-1', papel: 'professor' });
    const resposta = await request(app)
      .put('/api/professor/perfil')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Fulano Editado' });

    expect(resposta.status).toBe(200);
    expect(prismaMock.conta.upsert).not.toHaveBeenCalled();
  });
});
