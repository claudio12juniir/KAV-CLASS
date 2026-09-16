// Rede Social Fase 1, Step 2 — multi-vínculo de verdade: mesmo e-mail pode
// ter mais de uma linha Professor/Aluno (escolas diferentes). Cobre:
//
//   1. POST /api/professor/self/ativar — segunda linha Professor (SELF)
//      pro professor institucional, atrás de MULTI_VINCULO_HABILITADO.
//   2. POST /api/alunos/cadastro anexando a uma Conta existente quando o
//      e-mail já é aluno em outra Escola — exige provar a senha da Conta.
//
// MULTI_VINCULO_HABILITADO é lido como `const` no topo do server.js na
// primeira vez que o módulo roda — por isso usamos jest.resetModules() pra
// recarregar com o valor certo em cada bloco, mesmo padrão de
// tests/conta-identidade.test.js.

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
    responsavelFinanceiro: { create: jest.fn() },
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

function carregarApp({ multiVinculoHabilitado } = {}) {
  jest.resetModules();
  if (multiVinculoHabilitado === undefined) delete process.env.MULTI_VINCULO_HABILITADO;
  else process.env.MULTI_VINCULO_HABILITADO = String(multiVinculoHabilitado);

  const app = require('../server');
  const { __prismaMock: prismaMock } = require('@prisma/client');
  return { app, prismaMock };
}

const assinarToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/professor/self/ativar', () => {
  test('flag desligada: recusa com 403 e não cria nada', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: false });
    const token = assinarToken({ id: 'prof-inst-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/professor/self/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(403);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('professor sem contaId (conta não migrada): recusa com 400', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: true });
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-inst-1', nome: 'Fulano', email: 'fulano@escola.com', contaId: null });
    const token = assinarToken({ id: 'prof-inst-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/professor/self/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('já tem uma prática SELF ativa: recusa com 400, não duplica', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: true });
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'prof-inst-1', nome: 'Fulano', email: 'fulano@escola.com', contaId: 'conta-1' });
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-self-existente', contaId: 'conta-1' });
    const token = assinarToken({ id: 'prof-inst-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/professor/self/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(prismaMock.professor.create).not.toHaveBeenCalled();
  });

  test('ativa com sucesso: cria segunda linha Professor com a MESMA contaId, TESTE, escola stub própria', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: true });
    prismaMock.professor.findUnique.mockResolvedValue({
      id: 'prof-inst-1', nome: 'Fulano', email: 'fulano@escola.com', contaId: 'conta-1',
      fotoUrl: null, telefone: '11999999999', cursos: ['Violão'],
    });
    prismaMock.professor.findFirst.mockResolvedValue(null); // ainda não tem SELF
    prismaMock.professor.create.mockResolvedValue({ id: 'prof-self-novo', nome: 'Fulano', codigoConvite: 'KAV-SELF' });
    const token = assinarToken({ id: 'prof-inst-1', papel: 'professor' });

    const resposta = await request(app)
      .post('/api/professor/self/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(201);
    const dadosCriados = prismaMock.professor.create.mock.calls[0][0].data;
    expect(dadosCriados.conta).toEqual({ connect: { id: 'conta-1' } });
    expect(dadosCriados.email).toBe('fulano@escola.com');
    expect(dadosCriados.senha).toBeNull();
    expect(dadosCriados.assinaturaStatus).toBe('TESTE');
    expect(dadosCriados.escola).toEqual({ create: { nome: 'Fulano' } });

    const payload = jwt.verify(resposta.body.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: 'prof-self-novo', papel: 'professor', contaId: 'conta-1' });
  });
});

describe('POST /api/alunos/cadastro — anexar a Conta existente (multi-escola)', () => {
  test('e-mail já é aluno NESTA MESMA escola: recusa, independente da flag', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: true });
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-A', codigoConvite: 'COD-A' });
    prismaMock.aluno.findFirst.mockResolvedValueOnce({ id: 'aluno-existente', escolaId: 'escola-A' }); // já na mesma escola

    const resposta = await request(app)
      .post('/api/alunos/cadastro')
      .send({ nome: 'Aluno', email: 'aluno@teste.com', senha: 'senha123', codigoConvite: 'COD-A' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.aluno.create).not.toHaveBeenCalled();
  });

  test('e-mail já é aluno em OUTRA escola, flag desligada: recusa como antes', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: false });
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-B', codigoConvite: 'COD-B' });
    prismaMock.aluno.findFirst
      .mockResolvedValueOnce(null) // não existe na escola-B (a de destino)
      .mockResolvedValueOnce({ id: 'aluno-outra-escola', escolaId: 'escola-A' }); // existe em outra escola

    const resposta = await request(app)
      .post('/api/alunos/cadastro')
      .send({ nome: 'Aluno', email: 'aluno@teste.com', senha: 'senha123', codigoConvite: 'COD-B' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.aluno.create).not.toHaveBeenCalled();
  });

  test('e-mail já é aluno em OUTRA escola, flag ligada, senha errada: recusa sem anexar', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: true });
    const senhaHashExistente = await bcrypt.hash('senhaCorreta', 10);
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-B', codigoConvite: 'COD-B' });
    prismaMock.aluno.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'aluno-outra-escola', escolaId: 'escola-A' });
    prismaMock.conta.findUnique.mockResolvedValue({ id: 'conta-1', email: 'aluno@teste.com', senha: senhaHashExistente });

    const resposta = await request(app)
      .post('/api/alunos/cadastro')
      .send({ nome: 'Aluno', email: 'aluno@teste.com', senha: 'senhaErrada', codigoConvite: 'COD-B' });

    expect(resposta.status).toBe(400);
    expect(prismaMock.aluno.create).not.toHaveBeenCalled();
  });

  test('e-mail já é aluno em OUTRA escola, flag ligada, senha correta: anexa à mesma Conta', async () => {
    const { app, prismaMock } = carregarApp({ multiVinculoHabilitado: true });
    const senhaHashExistente = await bcrypt.hash('senhaCorreta', 10);
    prismaMock.professor.findFirst.mockResolvedValue({ id: 'prof-1', escolaId: 'escola-B', codigoConvite: 'COD-B' });
    prismaMock.aluno.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'aluno-outra-escola', escolaId: 'escola-A' });
    prismaMock.conta.findUnique.mockResolvedValue({ id: 'conta-1', email: 'aluno@teste.com', senha: senhaHashExistente });
    prismaMock.aluno.create.mockResolvedValue({ id: 'aluno-novo', nome: 'Aluno' });

    const resposta = await request(app)
      .post('/api/alunos/cadastro')
      .send({ nome: 'Aluno', email: 'aluno@teste.com', senha: 'senhaCorreta', codigoConvite: 'COD-B' });

    expect(resposta.status).toBe(201);
    const dadosCriados = prismaMock.aluno.create.mock.calls[0][0].data;
    expect(dadosCriados.contaId).toBe('conta-1');
    expect(dadosCriados.escolaId).toBe('escola-B');
    expect(dadosCriados.senha).toBe(senhaHashExistente);
    // Não deve ter tentado criar/alterar Conta — só reaproveitou a existente.
    expect(prismaMock.conta.upsert).not.toHaveBeenCalled();
  });
});
