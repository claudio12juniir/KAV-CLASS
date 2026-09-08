// Seed de demonstração — INSTITUTION (Instituto Musical Crescendo)
//
// Cria, do zero, uma Escola fictícia completa e isolada (não toca nenhum
// dado existente de outras escolas/professores/alunos) pra apresentação:
// perfil, equipe com disponibilidade, cursos/salas/turmas, alunos
// matriculados com contratos e responsáveis, aulas passadas com presença
// dupla, pagamentos, financeiro completo (despesas, folha de pagamento,
// caixa), coordenação (cronograma + avaliações + relatórios), captação
// (funil + leads + experimentais), calendário/eventos, comunicados,
// estoque, créditos de sala e — o motivo desta rodada — conversas
// realistas em cada chat de turma (MensagemTurma).
//
// Uso:
//   node prisma/seed-demo-escola.js            (cria; erro se já existir)
//   node prisma/seed-demo-escola.js --reset    (apaga a escola demo existente
//                                                pelo nome antes de recriar)
//
// Login de demonstração (todas as contas usam a mesma senha):
//   Diretora (DONO):    fernanda.diretora@demo-crescendo.kavclass
//   Secretária (GESTOR): patricia.secretaria@demo-crescendo.kavclass
//   Senha:              Demo@2026

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const NOME_ESCOLA = 'Instituto Musical Crescendo';
const DOMINIO_DEMO = 'demo-crescendo.kavclass';
const SENHA_DEMO = 'Demo@2026';

// ─── Utilitários ────────────────────────────────────────────────────────

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function chance(p) { return Math.random() < p; }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function addMonths(date, n) { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }
function pad2(n) { return String(n).padStart(2, '0'); }

function dataHoraNoDia(baseDate, horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// Retorna a data (no passado ou futuro) do dia da semana `diaSemanaAlvo`
// (0=Dom..6=Sáb) na semana que começa `offsetSemanas` semanas a partir de
// hoje (0 = semana atual).
function dataNaSemana(hoje, diaSemanaAlvo, offsetSemanas) {
  const diaAtual = hoje.getDay();
  const inicioSemanaAtual = addDays(hoje, -diaAtual);
  const inicioSemanaAlvo = addDays(inicioSemanaAtual, offsetSemanas * 7);
  return addDays(inicioSemanaAlvo, diaSemanaAlvo);
}

function fmtTelefone() {
  return `(${randInt(11, 99)}) 9${randInt(1000, 9999)}-${randInt(1000, 9999)}`;
}

function fmtCpf() {
  return `${randInt(100, 999)}.${randInt(100, 999)}.${randInt(100, 999)}-${randInt(10, 99)}`;
}

async function hash(senha) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senha, salt);
}

function avatarUrl(nome) {
  const iniciais = encodeURIComponent(nome.split(' ').slice(0, 2).join(' '));
  return `https://ui-avatars.com/api/?name=${iniciais}&background=random&size=256`;
}

const DIAS_SEMANA_NOME = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const NOMES_M = ['Rafael', 'Thiago', 'Lucas', 'Gabriel', 'Bruno', 'Diego', 'Felipe', 'Matheus', 'André', 'Rodrigo', 'Eduardo', 'Gustavo', 'Vinícius', 'Daniel', 'Marcelo', 'Pedro', 'João', 'Carlos', 'Fernando', 'Leonardo', 'Guilherme', 'Igor', 'Renato', 'Vitor', 'Caio'];
const NOMES_F = ['Fernanda', 'Patrícia', 'Beatriz', 'Camila', 'Juliana', 'Larissa', 'Mariana', 'Amanda', 'Carolina', 'Aline', 'Bruna', 'Débora', 'Isabela', 'Letícia', 'Natália', 'Priscila', 'Renata', 'Vanessa', 'Yasmin', 'Sofia', 'Helena', 'Valentina', 'Laura', 'Alice', 'Manuela'];
const SOBRENOMES = ['Souza', 'Lima', 'Ferreira', 'Martins', 'Andrade', 'Oliveira', 'Santos', 'Costa', 'Pereira', 'Almeida', 'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Barbosa', 'Rocha', 'Dias', 'Gomes', 'Teixeira', 'Melo', 'Correia', 'Cardoso', 'Monteiro', 'Moura', 'Pinto'];

const nomesUsados = new Set();
function gerarNome(genero) {
  let nome;
  do {
    const primeiro = rand(genero === 'M' ? NOMES_M : NOMES_F);
    const sobrenome1 = rand(SOBRENOMES);
    const sobrenome2 = rand(SOBRENOMES);
    nome = `${primeiro} ${sobrenome1}${sobrenome2 !== sobrenome1 ? ' ' + sobrenome2 : ''}`;
  } while (nomesUsados.has(nome));
  nomesUsados.add(nome);
  return nome;
}

function emailDe(nome, indice) {
  const slug = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.');
  return `${slug}.${indice}@${DOMINIO_DEMO}`;
}

// ─── Limpeza (pra permitir re-rodar durante os testes desta seed) ────────

async function apagarEscolaDemo(escolaId) {
  const professores = await prisma.professor.findMany({ where: { escolaId }, select: { id: true } });
  const professorIds = professores.map((p) => p.id);
  const alunos = await prisma.aluno.findMany({ where: { escolaId }, select: { id: true } });
  const alunoIds = alunos.map((a) => a.id);
  const comunicados = await prisma.comunicado.findMany({ where: { escolaId }, select: { id: true } });
  const comunicadoIds = comunicados.map((c) => c.id);

  await prisma.envioComunicado.deleteMany({ where: { comunicadoId: { in: comunicadoIds } } });
  await prisma.comunicado.deleteMany({ where: { escolaId } });
  await prisma.movimentacaoEstoque.deleteMany({ where: { escolaId } });
  await prisma.produto.deleteMany({ where: { escolaId } });
  await prisma.reservaSala.deleteMany({ where: { escolaId } });
  await prisma.compraCredito.deleteMany({ where: { alunoId: { in: alunoIds } } });
  await prisma.pacoteCredito.deleteMany({ where: { escolaId } });
  await prisma.relatorioAluno.deleteMany({ where: { escolaId } });
  await prisma.cronogramaConteudo.deleteMany({ where: { escolaId } });
  await prisma.despesaFixa.deleteMany({ where: { escolaId } });
  await prisma.folhaPagamentoProfessor.deleteMany({ where: { escolaId } });
  await prisma.lancamentoCaixa.deleteMany({ where: { escolaId } });
  await prisma.fechamentoCaixa.deleteMany({ where: { escolaId } });
  await prisma.contaPagar.deleteMany({ where: { escolaId } });
  await prisma.contrato.deleteMany({ where: { escolaId } });
  await prisma.pagamento.deleteMany({ where: { OR: [{ professorId: { in: professorIds } }, { alunoId: { in: alunoIds } }] } });
  await prisma.avaliacao.deleteMany({ where: { OR: [{ professorId: { in: professorIds } }, { alunoId: { in: alunoIds } }] } });
  await prisma.reposicao.deleteMany({ where: { OR: [{ professorId: { in: professorIds } }, { alunoId: { in: alunoIds } }] } });
  await prisma.material.deleteMany({ where: { professorId: { in: professorIds } } });
  await prisma.mensagem.deleteMany({ where: { OR: [{ professorId: { in: professorIds } }, { alunoId: { in: alunoIds } }] } });
  await prisma.mensagemTurma.deleteMany({ where: { professorId: { in: professorIds } } });
  await prisma.notificacao.deleteMany({ where: { professorId: { in: professorIds } } });
  await prisma.aula.deleteMany({ where: { OR: [{ professorId: { in: professorIds } }, { alunoId: { in: alunoIds } }] } });
  await prisma.matricula.deleteMany({ where: { escolaId } });
  await prisma.tarefaLead.deleteMany({ where: { escolaId } });
  await prisma.aulaExperimental.deleteMany({ where: { escolaId } });
  await prisma.lead.deleteMany({ where: { escolaId } });
  await prisma.estagioFunil.deleteMany({ where: { escolaId } });
  await prisma.linkCaptacao.deleteMany({ where: { escolaId } });
  await prisma.diaNaoLetivo.deleteMany({ where: { escolaId } });
  await prisma.valorPlano.deleteMany({ where: { planoPagamento: { escolaId } } });
  await prisma.versaoTabelaValores.deleteMany({ where: { tabela: { escolaId } } });
  await prisma.tabelaValores.deleteMany({ where: { escolaId } });
  await prisma.planoPagamento.deleteMany({ where: { escolaId } });
  await prisma.turma.deleteMany({ where: { escolaId } });
  await prisma.sala.deleteMany({ where: { escolaId } });
  await prisma.curso.deleteMany({ where: { escolaId } });
  await prisma.modalidade.deleteMany({ where: { escolaId } });
  await prisma.aluno.deleteMany({ where: { escolaId } });
  await prisma.responsavelFinanceiro.deleteMany({ where: { escolaId } });
  await prisma.conviteProfessor.deleteMany({ where: { escolaId } });
  await prisma.professor.deleteMany({ where: { escolaId } });
  await prisma.escola.delete({ where: { id: escolaId } });
}

// ─── Conteúdo por curso (usado em cronograma + assunto tratado nas aulas) ──

const TOPICOS_POR_CURSO = {
  'Violão': ['Afinação e postura', 'Acordes maiores básicos (C, G, D)', 'Acordes menores e transições', 'Ritmo de balada', 'Dedilhado simples', 'Levada de bossa nova', 'Pestana e acordes com barra', 'Repertório: música à escolha do aluno'],
  'Piano': ['Postura e posição das mãos', 'Escala de Dó Maior', 'Leitura de partitura — clave de sol', 'Acordes tríades', 'Escala de Sol Maior', 'Peça: Für Elise (trecho inicial)', 'Independência das mãos', 'Repertório popular brasileiro'],
  'Canto': ['Respiração diafragmática', 'Aquecimento vocal', 'Afinação e apoio', 'Extensão vocal', 'Técnica de projeção', 'Interpretação e dicção', 'Repertório MPB', 'Preparação para apresentação'],
  'Bateria': ['Postura e empunhadura das baquetas', 'Rudimentos básicos', 'Groove de rock 4/4', 'Levada de samba', 'Viradas simples', 'Coordenação de membros', 'Groove de funk', 'Repertório para banda'],
  'Violino': ['Postura e apoio do instrumento', 'Arco: golpes básicos', 'Primeira posição — escalas', 'Afinação com as cordas soltas', 'Vibrato inicial', 'Leitura de partitura', 'Peças do repertório clássico infantil', 'Duetos simples'],
  'Teclado': ['Postura e digitação', 'Escalas e acordes básicos', 'Sons e timbres do teclado', 'Ritmos automáticos', 'Leitura de cifras', 'Peça popular com acompanhamento', 'Improvisação simples', 'Repertório à escolha'],
  'Teoria Musical': ['Notas musicais e pauta', 'Figuras rítmicas e compasso', 'Escalas maiores e menores', 'Intervalos', 'Tríades e campo harmônico', 'Cifragem', 'Percepção auditiva', 'Análise de uma peça simples'],
  'Musicalização Infantil': ['Brincadeiras rítmicas', 'Reconhecimento de sons e alturas', 'Instrumentos de percussão corporal', 'Canções e rodas cantadas', 'Introdução a pulso e andamento', 'Jogo de imitação melódica', 'Instrumentos de pequena percussão', 'Apresentação em grupo'],
};

async function main() {
  const modoReset = process.argv.includes('--reset');

  const existente = await prisma.escola.findFirst({ where: { nome: NOME_ESCOLA } });
  if (existente) {
    if (!modoReset) {
      console.log(`Já existe uma Escola "${NOME_ESCOLA}" (id ${existente.id}). Rode com --reset pra recriar do zero.`);
      return;
    }
    console.log(`Apagando Escola demo existente (id ${existente.id})...`);
    await apagarEscolaDemo(existente.id);
    console.log('Escola demo anterior removida.');
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const senhaHash = await hash(SENHA_DEMO);

  console.log('Criando Escola e Perfil da Instituição...');
  const escola = await prisma.escola.create({
    data: {
      nome: NOME_ESCOLA,
      pacote: 'PACOTE_ESCOLA',
      email: 'contato@institutomusicalcrescendo.com.br',
      logoUrl: avatarUrl('Instituto Musical Crescendo'),
      valorPorAula: 35,
      tipoRemuneracaoProfessor: 'POR_AULA',
      diaFechamento: 25,
      horarioFuncionamento: {
        segunda: { abre: '09:00', fecha: '21:00' },
        terca: { abre: '09:00', fecha: '21:00' },
        quarta: { abre: '09:00', fecha: '21:00' },
        quinta: { abre: '09:00', fecha: '21:00' },
        sexta: { abre: '09:00', fecha: '21:00' },
        sabado: { abre: '09:00', fecha: '13:00' },
        domingo: { fechado: true },
        feriados: 'fechado',
      },
    },
  });

  // ─── Equipe ─────────────────────────────────────────────────────────
  console.log('Criando Equipe (diretora, secretária, professores)...');

  const diretora = await prisma.professor.create({
    data: {
      nome: 'Fernanda Albuquerque', email: 'fernanda.diretora@' + DOMINIO_DEMO, senha: senhaHash,
      telefone: fmtTelefone(), dataNascimento: new Date(1982, 3, 14),
      contatoEmergencia: fmtTelefone(), dataPagamento: 5, contratoUrl: 'https://storage.kavclass-demo.app/contratos/fernanda-diretora.pdf',
      cursos: [], fotoUrl: avatarUrl('Fernanda Albuquerque'), papel: 'DONO', escolaId: escola.id,
      assinaturaStatus: 'VITALICIO',
    },
  });

  const secretaria = await prisma.professor.create({
    data: {
      nome: 'Patrícia Nascimento', email: 'patricia.secretaria@' + DOMINIO_DEMO, senha: senhaHash,
      telefone: fmtTelefone(), dataNascimento: new Date(1990, 7, 22),
      contatoEmergencia: fmtTelefone(), dataPagamento: 5, contratoUrl: 'https://storage.kavclass-demo.app/contratos/patricia-secretaria.pdf',
      cursos: [], fotoUrl: avatarUrl('Patrícia Nascimento'), papel: 'GESTOR', escolaId: escola.id,
      assinaturaStatus: 'VITALICIO',
    },
  });

  const PROFESSORES_INFO = [
    { nome: 'Rafael Souza Andrade', cursos: ['Violão', 'Musicalização Infantil'], nascimento: [1991, 1, 9] },
    { nome: 'Beatriz Lima Carvalho', cursos: ['Piano', 'Teoria Musical'], nascimento: [1988, 5, 30] },
    { nome: 'Camila Ferreira Rocha', cursos: ['Canto'], nascimento: [1995, 8, 17] },
    { nome: 'Thiago Martins Dias', cursos: ['Bateria'], nascimento: [1993, 10, 2] },
    { nome: 'Lucas Andrade Pereira', cursos: ['Violino', 'Teclado'], nascimento: [1996, 8, 25] },
  ];

  const professores = [];
  for (let i = 0; i < PROFESSORES_INFO.length; i++) {
    const info = PROFESSORES_INFO[i];
    nomesUsados.add(info.nome);
    const [ano, mes, dia] = info.nascimento;
    const p = await prisma.professor.create({
      data: {
        nome: info.nome, email: emailDe(info.nome, i + 1), senha: senhaHash,
        telefone: fmtTelefone(), dataNascimento: new Date(ano, mes, dia),
        contatoEmergencia: fmtTelefone(), dataPagamento: rand([5, 10]), contratoUrl: `https://storage.kavclass-demo.app/contratos/professor-${i + 1}.pdf`,
        cursos: info.cursos, fotoUrl: avatarUrl(info.nome), papel: 'PROFESSOR', escolaId: escola.id,
        assinaturaStatus: 'VITALICIO',
      },
    });
    professores.push({ ...p, cursosNomes: info.cursos, slots: [] });
  }

  // ─── Disponibilidade semanal ────────────────────────────────────────
  console.log('Criando grade de disponibilidade dos professores...');
  const HORARIOS_TARDE = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  for (const prof of professores) {
    const disponibilidades = [];
    for (const dia of [1, 2, 3, 4, 5]) {
      const pausaIdx = rand([2, 3]); // pausa no meio da tarde, varia por professor
      for (let h = 0; h < HORARIOS_TARDE.length; h++) {
        const horaInicio = HORARIOS_TARDE[h];
        const horaFim = HORARIOS_TARDE[h + 1] || '20:00';
        const tipo = h === pausaIdx ? 'PAUSA' : 'DISPONIVEL';
        disponibilidades.push({ diaSemana: dia, horaInicio, horaFim, tipo, professorId: prof.id });
        if (tipo === 'DISPONIVEL') prof.slots.push({ diaSemana: dia, horaInicio });
      }
    }
    // Sábado de manhã
    for (const horaInicio of ['09:00', '10:00', '11:00']) {
      disponibilidades.push({ diaSemana: 6, horaInicio, horaFim: String(Number(horaInicio.slice(0, 2)) + 1).padStart(2, '0') + ':00', tipo: 'DISPONIVEL', professorId: prof.id });
      prof.slots.push({ diaSemana: 6, horaInicio });
    }
    await prisma.disponibilidadeProfessor.createMany({ data: disponibilidades });
  }

  // ─── Modalidades ────────────────────────────────────────────────────
  console.log('Criando Modalidades, Cursos, Salas, Planos e Tabela de Valores...');
  await prisma.modalidade.createMany({
    data: [
      { nome: 'Aula Individual 45min', frequencia: 'SEMANAL', duracaoMinutos: 45, padrao: true, escolaId: escola.id },
      { nome: 'Aula Individual 60min', frequencia: 'SEMANAL', duracaoMinutos: 60, padrao: false, escolaId: escola.id },
      { nome: 'Aula em Dupla 60min', frequencia: 'SEMANAL', duracaoMinutos: 60, padrao: false, escolaId: escola.id },
    ],
  });

  // ─── Cursos ─────────────────────────────────────────────────────────
  const NOMES_CURSOS = ['Violão', 'Piano', 'Canto', 'Bateria', 'Violino', 'Teclado', 'Teoria Musical', 'Musicalização Infantil'];
  const cursosPorNome = {};
  for (const nome of NOMES_CURSOS) {
    cursosPorNome[nome] = await prisma.curso.create({ data: { nome, escolaId: escola.id } });
  }

  // ─── Salas ──────────────────────────────────────────────────────────
  const SALAS_INFO = [
    { nome: 'Sala 1 — Piano', descricao: 'Piano acústico vertical, isolamento acústico parcial.' },
    { nome: 'Sala 2 — Cordas', descricao: 'Violão e violino, estantes de partitura.' },
    { nome: 'Sala 3 — Bateria', descricao: 'Isolamento acústico total, kit completo.' },
    { nome: 'Sala 4 — Canto e Teoria', descricao: 'Multiuso, teclado de apoio e espelho.' },
  ];
  const salas = [];
  for (const s of SALAS_INFO) salas.push(await prisma.sala.create({ data: { ...s, escolaId: escola.id } }));

  // ─── Planos de pagamento + tabela de valores ───────────────────────
  const planoMensal = await prisma.planoPagamento.create({ data: { nome: 'Mensal', periodicidade: 'MENSAL', escolaId: escola.id } });
  const planoSemestral = await prisma.planoPagamento.create({ data: { nome: 'Semestral', periodicidade: 'SEMESTRAL', escolaId: escola.id } });
  const planoAnual = await prisma.planoPagamento.create({ data: { nome: 'Anual', periodicidade: 'ANUAL', escolaId: escola.id } });

  const tabelaValores = await prisma.tabelaValores.create({ data: { nome: 'Tabela Padrão 2026', escolaId: escola.id } });
  const versaoTabela = await prisma.versaoTabelaValores.create({ data: { tabelaId: tabelaValores.id, ativa: true } });
  await prisma.valorPlano.createMany({
    data: [
      { versaoId: versaoTabela.id, planoPagamentoId: planoMensal.id, valor: 280 },
      { versaoId: versaoTabela.id, planoPagamentoId: planoSemestral.id, valor: 1580 },
      { versaoId: versaoTabela.id, planoPagamentoId: planoAnual.id, valor: 2950 },
    ],
  });
  for (const nome of NOMES_CURSOS) {
    await prisma.curso.update({ where: { id: cursosPorNome[nome].id }, data: { tabelaValoresId: tabelaValores.id } });
  }

  // ─── Turmas (uma por professor, curso principal) ───────────────────
  console.log('Criando Turmas...');
  const salaPorCurso = { 'Piano': salas[0], 'Violão': salas[1], 'Violino': salas[1], 'Bateria': salas[2], 'Canto': salas[3], 'Teoria Musical': salas[3], 'Teclado': salas[0], 'Musicalização Infantil': salas[3] };
  for (const prof of professores) {
    const cursoPrincipal = prof.cursosNomes[0];
    prof.turma = await prisma.turma.create({
      data: {
        nome: `Turma ${cursoPrincipal} — ${prof.nome.split(' ')[0]}`,
        cursoId: cursosPorNome[cursoPrincipal].id,
        salaId: salaPorCurso[cursoPrincipal].id,
        professorId: prof.id,
        escolaId: escola.id,
        limiteAlunos: 12,
      },
    });
  }

  // ─── Cronograma de conteúdo (Coordenação) ──────────────────────────
  console.log('Criando Cronograma de Conteúdo (Coordenação)...');
  for (const nome of NOMES_CURSOS) {
    await prisma.cronogramaConteudo.create({
      data: {
        tipo: 'UNIVERSAL', cursoId: cursosPorNome[nome].id, escolaId: escola.id,
        titulo: `Cronograma ${nome} — 2º semestre 2026`,
        anexoUrl: `https://storage.kavclass-demo.app/cronogramas/${nome.toLowerCase().replace(/\s+/g, '-')}.pdf`,
      },
    });
  }
  // Dois professores preferem subir cronograma pessoal, além do universal.
  await prisma.cronogramaConteudo.create({
    data: { tipo: 'PESSOAL', cursoId: cursosPorNome['Canto'].id, professorId: professores[2].id, escolaId: escola.id, titulo: 'Repertório MPB — método próprio da Camila', anexoUrl: 'https://storage.kavclass-demo.app/cronogramas/canto-camila-pessoal.pdf' },
  });
  await prisma.cronogramaConteudo.create({
    data: { tipo: 'PESSOAL', cursoId: cursosPorNome['Bateria'].id, professorId: professores[3].id, escolaId: escola.id, titulo: 'Groove funk/soul — apostila do Thiago', anexoUrl: 'https://storage.kavclass-demo.app/cronogramas/bateria-thiago-pessoal.pdf' },
  });

  // ─── Alunos, responsáveis, matrículas, contratos ───────────────────
  console.log('Criando Alunos, Responsáveis, Matrículas e Contratos...');
  const alunosPorProfessor = {};
  for (const prof of professores) alunosPorProfessor[prof.id] = [];

  let slotCursor = {};
  for (const prof of professores) slotCursor[prof.id] = 0;

  const todosAlunos = [];
  let contadorEmail = 100;

  for (const prof of professores) {
    const qtdAlunos = randInt(5, 7);
    const cursoPrincipal = prof.cursosNomes[0];
    for (let i = 0; i < qtdAlunos; i++) {
      contadorEmail++;
      const genero = chance(0.5) ? 'M' : 'F';
      const nome = gerarNome(genero);
      const menorDeIdade = chance(0.35);
      const idade = menorDeIdade ? randInt(8, 17) : randInt(18, 52);
      const dataNascimento = new Date(hoje.getFullYear() - idade, randInt(0, 11), randInt(1, 28));

      const slot = prof.slots[slotCursor[prof.id] % prof.slots.filter((s) => true).length];
      slotCursor[prof.id]++;

      const tempoContrato = rand([6, 12, 24]);
      const mesesDecorridos = randInt(0, tempoContrato - 1);
      const dataInicioContrato = addMonths(hoje, -mesesDecorridos);

      const statusAluno = chance(0.85) ? 'ATIVO' : (chance(0.6) ? 'INATIVO' : 'PENDENTE');
      const valorMensalidade = 280 + rand([-20, -10, 0, 0, 10, 20]);

      let responsavelId = null;
      let vinculoResponsavel = 'CONTRATANTE';
      if (menorDeIdade) {
        const nomeResp = gerarNome(chance(0.5) ? 'M' : 'F');
        const resp = await prisma.responsavelFinanceiro.create({
          data: { nome: nomeResp, cpf: fmtCpf(), email: emailDe(nomeResp, contadorEmail), telefone: fmtTelefone(), escolaId: escola.id },
        });
        responsavelId = resp.id;
        vinculoResponsavel = 'DEPENDENTE';
      }

      const aluno = await prisma.aluno.create({
        data: {
          nome, email: emailDe(nome, contadorEmail), senha: senhaHash,
          telefone: fmtTelefone(), dataNascimento, curso: cursoPrincipal,
          fotoUrl: avatarUrl(nome), status: statusAluno,
          valorMensalidade, diaVencimento: rand([5, 10, 15, 20]),
          recorrenciaAula: 'SEMANAL', diaSemanaAula: DIAS_SEMANA_NOME[slot.diaSemana], diaSemanaNumero: slot.diaSemana, horarioAula: slot.horaInicio,
          tempoContrato, dataInicioContrato,
          contratoUrl: `https://storage.kavclass-demo.app/contratos/aluno-${contadorEmail}.pdf`,
          professorId: prof.id, escolaId: escola.id,
          responsavelId, vinculoResponsavel,
        },
      });

      const matricula = await prisma.matricula.create({
        data: {
          alunoId: aluno.id, professorId: prof.id, escolaId: escola.id, turmaId: prof.turma.id,
          valorMensalidade, diaVencimento: aluno.diaVencimento, status: statusAluno === 'INATIVO' ? 'INATIVO' : 'ATIVO',
          dataInicio: dataInicioContrato, planoPagamentoId: planoMensal.id,
        },
      });

      const statusContrato = chance(0.8) ? 'ASSINADO' : rand(['ENVIADO', 'PREENCHIDO']);
      await prisma.contrato.create({
        data: {
          token: `demo-${aluno.id}`, status: statusContrato, escolaId: escola.id, matriculaId: matricula.id,
          testemunhas: ['Secretaria — Patrícia Nascimento'],
          nomeAssinanteResponsavel: menorDeIdade ? undefined : nome,
          cpfAssinanteResponsavel: fmtCpf(),
          assinadoPeloResponsavelEm: statusContrato !== 'ENVIADO' ? addDays(dataInicioContrato, 1) : null,
          nomeRepresentanteEscola: statusContrato === 'ASSINADO' ? diretora.nome : null,
          assinadoPeloRepresentanteEm: statusContrato === 'ASSINADO' ? addDays(dataInicioContrato, 2) : null,
        },
      });

      const registro = { ...aluno, prof, matriculaId: matricula.id, menorDeIdade };
      todosAlunos.push(registro);
      alunosPorProfessor[prof.id].push(registro);
    }
  }

  // Um punhado de alunos com 2º curso/professor (multi-matrícula), pra
  // demonstrar o cenário descrito no briefing (aluno com mais de um professor).
  const candidatosMulti = todosAlunos.filter((a) => a.status === 'ATIVO').slice(0, 4);
  for (const aluno of candidatosMulti) {
    const outroProf = rand(professores.filter((p) => p.id !== aluno.professorId));
    const cursoSecundario = outroProf.cursosNomes[0];
    const matricula2 = await prisma.matricula.create({
      data: {
        alunoId: aluno.id, professorId: outroProf.id, escolaId: escola.id, turmaId: outroProf.turma.id,
        valorMensalidade: 280, diaVencimento: aluno.diaVencimento, status: 'ATIVO',
        dataInicio: addMonths(hoje, -randInt(0, 3)), planoPagamentoId: planoMensal.id,
        planoPersonalizadoDescricao: null,
      },
    });
    aluno.matriculaSecundariaId = matricula2.id;
    aluno.professorSecundario = outroProf;
    alunosPorProfessor[outroProf.id].push({ ...aluno, prof: outroProf, matriculaId: matricula2.id, ehSecundaria: true });
  }

  // ─── Pagamentos (últimos 4 meses) ───────────────────────────────────
  console.log('Criando Pagamentos (Financeiro → Pagamentos)...');
  const MESES_PAGAMENTO = [-3, -2, -1, 0];
  for (const aluno of todosAlunos) {
    if (aluno.status === 'PENDENTE') continue;
    for (const offset of MESES_PAGAMENTO) {
      const vencimento = new Date(hoje.getFullYear(), hoje.getMonth() + offset, aluno.diaVencimento || 10);
      let status, dataPagamento = null, metodo = null;
      if (offset === 0) {
        // Mês corrente: ainda não venceu (pendente) ou já venceu (atrasado/pago)
        if (vencimento > hoje) status = 'PENDENTE';
        else status = chance(0.6) ? 'PAGO' : (chance(0.5) ? 'ATRASADO' : 'PENDENTE');
      } else {
        status = chance(0.78) ? 'PAGO' : (chance(0.6) ? 'ATRASADO' : 'EM_ANALISE');
      }
      if (status === 'PAGO') { dataPagamento = addDays(vencimento, randInt(-2, 3)); metodo = rand(['PIX', 'CARTAO', 'BOLETO']); }
      await prisma.pagamento.create({
        data: {
          valor: aluno.valorMensalidade || 280, vencimento, dataPagamento, status, metodo,
          professorId: aluno.professorId, alunoId: aluno.id, matriculaId: aluno.matriculaId,
          notificadoAtrasado: status === 'ATRASADO' ? chance(0.5) : false,
        },
      });
    }
  }

  // ─── Aulas (8 semanas passadas + semana atual + próxima) ───────────
  console.log('Criando Aulas com presença dupla (isso pode levar um instante)...');
  let totalAulas = 0;
  for (const aluno of todosAlunos) {
    if (aluno.status !== 'ATIVO') continue;
    const prof = aluno.prof;
    const cursoNome = aluno.ehSecundaria ? prof.cursosNomes[0] : aluno.curso;
    const topicos = TOPICOS_POR_CURSO[cursoNome] || TOPICOS_POR_CURSO['Teoria Musical'];

    for (let offsetSemana = -8; offsetSemana <= 1; offsetSemana++) {
      const dataAula = dataNaSemana(hoje, aluno.diaSemanaNumero, offsetSemana);
      const dataHora = dataHoraNoDia(dataAula, aluno.horarioAula);
      const passada = dataHora < hoje;

      if (!passada) {
        await prisma.aula.create({
          data: {
            dataHora, professorId: prof.id, alunoId: aluno.id, status: 'AGENDADA', tipo: 'REGULAR',
            turmaId: prof.turma.id, salaId: prof.turma.salaId,
          },
        });
        totalAulas++;
        continue;
      }

      const topico = rand(topicos);
      const cenario = Math.random();
      let presenca, presencaProfessorEm = null, presencaAlunoEm = null, confirmadoManualmentePor = null, motivoManual = null, decisaoReposicao = null, tipo = 'REGULAR';

      if (cenario < 0.78) {
        presenca = 'PRESENTE';
        presencaProfessorEm = addDays(dataHora, 0);
        presencaAlunoEm = new Date(dataHora.getTime() + randInt(1, 5) * 60000);
      } else if (cenario < 0.88) {
        presenca = 'AUSENCIA_ALUNO';
        presencaProfessorEm = dataHora;
        decisaoReposicao = chance(0.6) ? true : null;
        if (chance(0.4)) tipo = 'REPOSICAO';
      } else if (cenario < 0.94) {
        presenca = 'AUSENCIA_PROFESSOR';
        presencaAlunoEm = dataHora;
        decisaoReposicao = chance(0.7) ? true : null;
      } else {
        // Ninguém confirmou pelo celular — a Escola interveio manualmente.
        presenca = 'PRESENTE';
        confirmadoManualmentePor = rand(['PROFESSOR', 'ALUNO']);
        motivoManual = confirmadoManualmentePor === 'ALUNO' ? 'Aluno esqueceu o celular em casa — confirmado pela secretaria com a senha do aluno.' : 'Professor sem celular no momento — confirmado pela secretaria com a senha do professor.';
        presencaProfessorEm = dataHora;
        presencaAlunoEm = dataHora;
      }

      await prisma.aula.create({
        data: {
          dataHora, professorId: prof.id, alunoId: aluno.id, status: 'CONCLUIDA', tipo, presenca,
          presencaProfessorEm, presencaAlunoEm, confirmadoManualmentePor, motivoManual, decisaoReposicao,
          assuntoTratado: presenca === 'PRESENTE' ? topico : null,
          turmaId: prof.turma.id, salaId: prof.turma.salaId,
        },
      });
      totalAulas++;
    }
  }
  console.log(`  → ${totalAulas} aulas criadas.`);

  // ─── Reposições (fluxo de solicitação, model Reposicao) ────────────
  console.log('Criando Reposições...');
  const alunosAtivos = todosAlunos.filter((a) => a.status === 'ATIVO');
  for (let i = 0; i < 6; i++) {
    const aluno = rand(alunosAtivos);
    await prisma.reposicao.create({
      data: {
        professorId: aluno.professorId, alunoId: aluno.id,
        dataOriginal: addDays(hoje, -randInt(3, 20)).toISOString().slice(0, 10),
        dataProposta: addDays(hoje, randInt(1, 14)).toISOString().slice(0, 10),
        motivo: rand(['Aluno estava doente', 'Compromisso de última hora', 'Professor precisou remarcar', 'Viagem em família']),
        status: rand(['AGUARDANDO', 'CONFIRMADA', 'SOLICITADA', 'AUTORIZADA', 'FINALIZADA']),
        origem: rand(['PROFESSOR', 'ALUNO']),
      },
    });
  }

  // ─── Avaliações mensais (Coordenação) ──────────────────────────────
  console.log('Criando Avaliações mensais...');
  const mesesAvaliacao = [
    `${hoje.getFullYear()}-${pad2(hoje.getMonth())}`,
    `${hoje.getFullYear()}-${pad2(hoje.getMonth() + 1)}`,
  ];
  for (const aluno of alunosAtivos) {
    if (!chance(0.7)) continue;
    for (const mesReferencia of mesesAvaliacao) {
      if (!chance(0.75)) continue;
      await prisma.avaliacao.create({
        data: {
          nota: rand([4, 4, 5, 5, 5, 3]), notaEscola: rand([4, 4, 5, 5, 5, 3]),
          comentario: chance(0.4) ? rand(['Professor(a) muito atencioso(a)!', 'Estou gostando bastante das aulas.', 'Gostaria de mais material de apoio.', 'Tudo ótimo, recomendo!', 'A sala poderia ter melhor ventilação.']) : null,
          mesReferencia, alunoId: aluno.id, professorId: aluno.professorId,
        },
      });
    }
  }

  // ─── Relatórios de aluno (Coordenação) ─────────────────────────────
  console.log('Criando Relatórios de aluno...');
  for (let i = 0; i < 10; i++) {
    const aluno = rand(alunosAtivos);
    const autorTipo = chance(0.6) ? 'PROFESSOR' : 'COORDENACAO';
    await prisma.relatorioAluno.create({
      data: {
        alunoId: aluno.id, escolaId: escola.id, autorTipo,
        descricao: rand([
          'Progresso consistente no repertório do mês.',
          'Precisa reforçar a prática em casa — combinamos rotina de 15min/dia.',
          'Ótima evolução técnica, pronto(a) para avançar de nível.',
          'Relatório solicitado pela coordenação para acompanhamento pedagógico.',
          'Aluno(a) demonstrou bastante interesse em se apresentar no festival.',
        ]),
        anexoUrl: chance(0.5) ? `https://storage.kavclass-demo.app/relatorios/${aluno.id}.pdf` : null,
      },
    });
  }

  // ─── Financeiro: despesas, caixa, folha de pagamento ───────────────
  console.log('Criando Financeiro (despesas fixas, avulsas, caixa, folha de pagamento)...');
  const despesasFixas = [
    { descricao: 'Aluguel do espaço', valor: 4200 },
    { descricao: 'Internet e telefonia', valor: 220 },
    { descricao: 'Energia elétrica', valor: 680 },
    { descricao: 'Água e esgoto', valor: 150 },
    { descricao: 'Manutenção de instrumentos', valor: 300 },
    { descricao: 'Assinatura de softwares de gestão', valor: 180 },
  ];
  for (const d of despesasFixas) await prisma.despesaFixa.create({ data: { ...d, recorrente: true, escolaId: escola.id } });

  const contasAvulsas = [
    { descricao: 'Afinação dos pianos', valor: 450, paga: true },
    { descricao: 'Compra de baquetas novas', valor: 180, paga: true },
    { descricao: 'Reparo do ar-condicionado — Sala 3', valor: 620, paga: false },
    { descricao: 'Materiais de escritório', valor: 95, paga: true },
    { descricao: 'Honorários contábeis do mês', valor: 500, paga: false },
  ];
  for (const c of contasAvulsas) {
    const vencimento = addDays(hoje, randInt(-20, 15));
    const conta = await prisma.contaPagar.create({
      data: { descricao: c.descricao, valor: c.valor, vencimento, paga: c.paga, pagoEm: c.paga ? addDays(vencimento, 1) : null, escolaId: escola.id },
    });
    if (c.paga) {
      await prisma.lancamentoCaixa.create({
        data: { tipo: 'SAIDA', descricao: c.descricao, valor: c.valor, data: conta.pagoEm, escolaId: escola.id, contaPagarId: conta.id },
      });
    }
  }

  // Lançamentos de caixa extra (entradas avulsas + despesas fixas do mês passado)
  await prisma.lancamentoCaixa.createMany({
    data: [
      { tipo: 'ENTRADA', descricao: 'Venda de partituras avulsas', valor: 120, data: addDays(hoje, -6), escolaId: escola.id },
      { tipo: 'ENTRADA', descricao: 'Aula experimental paga avulsa', valor: 80, data: addDays(hoje, -3), escolaId: escola.id },
      { tipo: 'SAIDA', descricao: 'Aluguel do espaço — mês anterior', valor: 4200, data: addMonths(hoje, -1), escolaId: escola.id },
      { tipo: 'SAIDA', descricao: 'Energia elétrica — mês anterior', valor: 655, data: addMonths(hoje, -1), escolaId: escola.id },
    ],
  });

  await prisma.fechamentoCaixa.create({
    data: { data: addDays(hoje, -1), saldoInicial: 12500, totalEntradas: 980, totalSaidas: 340, saldoFinal: 13140, escolaId: escola.id },
  });
  await prisma.fechamentoCaixa.create({
    data: { data: addDays(hoje, -2), saldoInicial: 11800, totalEntradas: 1150, totalSaidas: 450, saldoFinal: 12500, escolaId: escola.id },
  });

  // Folha de pagamento: nº de aulas CONCLUIDAS com PRESENTE no mês × valorPorAula
  for (const prof of professores) {
    for (const offset of [-1, 0]) {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + offset + 1, 1);
      const aulasNoMes = await prisma.aula.count({
        where: { professorId: prof.id, status: 'CONCLUIDA', presenca: 'PRESENTE', dataHora: { gte: inicioMes, lt: fimMes } },
      });
      const valorCalculado = aulasNoMes * 35;
      const ajustar = chance(0.25);
      await prisma.folhaPagamentoProfessor.create({
        data: {
          mes: inicioMes.getMonth() + 1, ano: inicioMes.getFullYear(), valorCalculado,
          valorAjustado: ajustar ? valorCalculado + 40 : null,
          comprovantes: offset === -1 ? [`https://storage.kavclass-demo.app/comprovantes/${prof.id}-${inicioMes.getMonth() + 1}.pdf`] : [],
          status: offset === -1 ? 'FECHADA' : 'ABERTA',
          professorId: prof.id, escolaId: escola.id,
        },
      });
    }
  }

  // ─── Captação: funil, leads, tarefas, links, experimentais ─────────
  console.log('Criando Captação (funil, leads, experimentais)...');
  const NOMES_ESTAGIOS = ['Novo Contato', 'Em Diálogo', 'Aula Experimental Marcada', 'Negociação', 'Matriculado'];
  const estagios = [];
  for (let i = 0; i < NOMES_ESTAGIOS.length; i++) {
    estagios.push(await prisma.estagioFunil.create({ data: { nome: NOMES_ESTAGIOS[i], ordem: i + 1, escolaId: escola.id } }));
  }

  const ORIGENS = ['Instagram', 'Indicação', 'Google', 'Site', 'Panfleto'];
  const leads = [];
  for (let i = 0; i < 12; i++) {
    const nome = gerarNome(chance(0.5) ? 'M' : 'F');
    const arquivado = i < 2;
    const lead = await prisma.lead.create({
      data: {
        nome, telefone: fmtTelefone(), email: emailDe(nome, 900 + i), origem: rand(ORIGENS),
        estagioId: arquivado ? estagios[0].id : rand(estagios).id,
        professorId: chance(0.5) ? rand(professores).id : null,
        escolaId: escola.id, arquivado,
        motivoArquivamento: arquivado ? rand(['Não retornou contato', 'Optou por outra escola']) : null,
      },
    });
    leads.push(lead);
  }

  for (let i = 0; i < 5; i++) {
    const lead = rand(leads.filter((l) => !l.arquivado));
    await prisma.tarefaLead.create({
      data: {
        leadId: lead.id, escolaId: escola.id,
        descricao: rand(['Ligar pra confirmar interesse', 'Enviar tabela de valores', 'Confirmar horário da experimental', 'Follow-up pós aula experimental']),
        dataPrevista: addDays(hoje, randInt(-2, 5)),
        concluida: chance(0.4), responsavelId: secretaria.id,
      },
    });
  }

  await prisma.linkCaptacao.create({ data: { token: 'demo-cadastro-geral', tipo: 'CADASTRO', escolaId: escola.id } });
  await prisma.linkCaptacao.create({ data: { token: 'demo-experimental-rafael', tipo: 'AGENDAMENTO_EXPERIMENTAL', escolaId: escola.id, professorId: professores[0].id } });

  for (let i = 0; i < 6; i++) {
    const lead = rand(leads);
    const prof = rand(professores);
    const status = rand(['AGENDADA', 'REALIZADA', 'REALIZADA', 'NAO_COMPARECEU', 'CANCELADA']);
    await prisma.aulaExperimental.create({
      data: {
        leadId: lead.id, cursoId: cursosPorNome[prof.cursosNomes[0]].id, professorId: prof.id, escolaId: escola.id,
        dataHora: status === 'AGENDADA' ? addDays(hoje, randInt(1, 10)) : addDays(hoje, -randInt(1, 25)),
        status, observacao: chance(0.5) ? 'Primeira aula-teste, sem compromisso.' : null,
      },
    });
  }

  // Duas conversões reais lead → matrícula (pra alimentar relatório de conversão)
  const leadsConvertiveis = leads.filter((l) => !l.arquivado).slice(0, 2);
  for (const lead of leadsConvertiveis) {
    const prof = lead.professorId ? professores.find((p) => p.id === lead.professorId) : rand(professores);
    const nome = gerarNome(chance(0.5) ? 'M' : 'F');
    contadorEmail++;
    const alunoConvertido = await prisma.aluno.create({
      data: {
        nome, email: emailDe(nome, contadorEmail), senha: senhaHash,
        telefone: fmtTelefone(), dataNascimento: new Date(hoje.getFullYear() - randInt(18, 40), randInt(0, 11), 10),
        curso: prof.cursosNomes[0], fotoUrl: avatarUrl(nome), status: 'ATIVO',
        valorMensalidade: 280, diaVencimento: 10, recorrenciaAula: 'SEMANAL',
        diaSemanaAula: DIAS_SEMANA_NOME[prof.slots[0].diaSemana], diaSemanaNumero: prof.slots[0].diaSemana, horarioAula: prof.slots[0].horaInicio,
        tempoContrato: 12, dataInicioContrato: addDays(hoje, -10),
        professorId: prof.id, escolaId: escola.id, vinculoResponsavel: 'CONTRATANTE',
      },
    });
    await prisma.matricula.create({
      data: {
        alunoId: alunoConvertido.id, professorId: prof.id, escolaId: escola.id, turmaId: prof.turma.id,
        valorMensalidade: 280, status: 'ATIVO', dataInicio: addDays(hoje, -10), planoPagamentoId: planoMensal.id, leadId: lead.id,
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { estagioId: estagios[4].id } });
  }

  // ─── Calendário / Cronograma (eventos) ─────────────────────────────
  console.log('Criando eventos do Cronograma...');
  await prisma.diaNaoLetivo.create({ data: { data: new Date(hoje.getFullYear(), 8, 7), descricao: 'Independência do Brasil', tipo: 'FERIADO', escolaId: escola.id } });
  await prisma.diaNaoLetivo.create({ data: { data: new Date(hoje.getFullYear(), 11, 20), dataFim: new Date(hoje.getFullYear() + 1, 0, 5), descricao: 'Recesso de Fim de Ano', tipo: 'RECESSO', escolaId: escola.id } });

  const passeio = await prisma.diaNaoLetivo.create({ data: { data: new Date(hoje.getFullYear(), 9, 10), descricao: 'Visita à Sala de Concertos Municipal', tipo: 'PASSEIO', escolaId: escola.id } });
  await prisma.diaNaoLetivoCurso.createMany({ data: [
    { diaNaoLetivoId: passeio.id, cursoId: cursosPorNome['Canto'].id },
    { diaNaoLetivoId: passeio.id, cursoId: cursosPorNome['Teoria Musical'].id },
  ] });

  const festival = await prisma.diaNaoLetivo.create({ data: { data: new Date(hoje.getFullYear(), 10, 15), descricao: 'Festival de Talentos Crescendo', tipo: 'FESTIVAL', escolaId: escola.id } });
  await prisma.diaNaoLetivoCurso.createMany({ data: [
    { diaNaoLetivoId: festival.id, cursoId: cursosPorNome['Canto'].id },
    { diaNaoLetivoId: festival.id, cursoId: cursosPorNome['Violão'].id },
    { diaNaoLetivoId: festival.id, cursoId: cursosPorNome['Piano'].id },
    { diaNaoLetivoId: festival.id, cursoId: cursosPorNome['Bateria'].id },
  ] });

  await prisma.diaNaoLetivo.create({ data: { data: new Date(hoje.getFullYear(), 11, 12), descricao: 'Recital de Encerramento do Semestre', tipo: 'APRESENTACAO', escolaId: escola.id } });

  // ─── Comunicados ────────────────────────────────────────────────────
  console.log('Criando Comunicados...');
  const comunicado1 = await prisma.comunicado.create({
    data: {
      titulo: 'Festival de Talentos: inscrições abertas!', corpo: 'Já estão abertas as inscrições para o Festival de Talentos Crescendo. Fale com seu professor(a) para participar!',
      publico: 'ALUNOS', status: 'ENVIADO', enviadoEm: addDays(hoje, -4), escolaId: escola.id, autorId: diretora.id,
    },
  });
  for (const aluno of alunosAtivos) {
    await prisma.envioComunicado.create({
      data: {
        comunicadoId: comunicado1.id, destinatarioNome: aluno.nome, destinatarioEmail: aluno.email, destinatarioTipo: 'ALUNO', sucesso: true,
        alunoId: aluno.id, lidoEm: chance(0.6) ? addDays(hoje, -randInt(1, 3)) : null,
      },
    });
  }

  const comunicado2 = await prisma.comunicado.create({
    data: {
      titulo: 'Recesso de fim de ano — datas e horários', corpo: 'Nosso recesso de fim de ano será de 20/12 a 05/01. As aulas retornam normalmente na primeira semana de janeiro.',
      publico: 'TODOS', status: 'ENVIADO', enviadoEm: addDays(hoje, -10), escolaId: escola.id, autorId: diretora.id,
    },
  });
  for (const aluno of alunosAtivos.slice(0, 15)) {
    await prisma.envioComunicado.create({
      data: { comunicadoId: comunicado2.id, destinatarioNome: aluno.nome, destinatarioEmail: aluno.email, destinatarioTipo: 'ALUNO', sucesso: true, alunoId: aluno.id, lidoEm: chance(0.5) ? addDays(hoje, -8) : null },
    });
  }
  for (const prof of professores) {
    await prisma.envioComunicado.create({ data: { comunicadoId: comunicado2.id, destinatarioNome: prof.nome, destinatarioEmail: prof.email, destinatarioTipo: 'PROFESSOR', sucesso: true } });
  }

  await prisma.comunicado.create({
    data: { titulo: 'Nova política de reposição de aulas', corpo: 'Rascunho: reposições agora exigem no mínimo 24h de antecedência salvo emergências médicas.', publico: 'PROFESSORES', status: 'RASCUNHO', escolaId: escola.id, autorId: secretaria.id },
  });

  // ─── Estoque ─────────────────────────────────────────────────────────
  console.log('Criando Estoque de materiais...');
  const produtosInfo = [
    { nome: 'Cordas de violão (jogo avulso)', descricao: 'Encordoamento para violão nylon', inicial: 40 },
    { nome: 'Baquetas (par)', descricao: 'Baquetas 5A para bateria', inicial: 15 },
    { nome: 'Metrônomos', descricao: 'Metrônomo mecânico para empréstimo', inicial: 8 },
    { nome: 'Partituras avulsas (pacote)', descricao: 'Pacotes de partituras do repertório do curso', inicial: 25 },
    { nome: 'Cabo P10', descricao: 'Cabo P10-P10 para teclado/guitarra', inicial: 12 },
  ];
  for (const p of produtosInfo) {
    const produto = await prisma.produto.create({ data: { nome: p.nome, descricao: p.descricao, quantidadeEstoque: p.inicial, escolaId: escola.id } });
    await prisma.movimentacaoEstoque.create({ data: { produtoId: produto.id, tipo: 'ENTRADA', quantidade: p.inicial, observacao: 'Compra inicial de estoque', escolaId: escola.id } });
    const saida = randInt(1, 4);
    await prisma.movimentacaoEstoque.create({ data: { produtoId: produto.id, tipo: 'SAIDA', quantidade: saida, observacao: 'Uso em aula / venda ao aluno', escolaId: escola.id } });
    await prisma.produto.update({ where: { id: produto.id }, data: { quantidadeEstoque: p.inicial - saida } });
  }
  const metronomo = await prisma.produto.findFirst({ where: { escolaId: escola.id, nome: { contains: 'Metrônomo' } } });
  if (metronomo) {
    const alunoEmprestimo = rand(alunosAtivos);
    await prisma.movimentacaoEstoque.create({ data: { produtoId: metronomo.id, tipo: 'EMPRESTIMO', quantidade: 1, alunoId: alunoEmprestimo.id, observacao: 'Empréstimo para prática em casa', escolaId: escola.id } });
  }

  // ─── Créditos de sala de ensaio ─────────────────────────────────────
  console.log('Criando Pacotes de Crédito e Reservas de Sala...');
  const pacote10h = await prisma.pacoteCredito.create({ data: { nome: 'Pacote 10h Sala de Ensaio', horas: 10, escolaId: escola.id } });
  const pacote5h = await prisma.pacoteCredito.create({ data: { nome: 'Pacote 5h Sala de Ensaio', horas: 5, escolaId: escola.id } });
  const compradores = alunosAtivos.slice(0, 3);
  for (let i = 0; i < compradores.length; i++) {
    const aluno = compradores[i];
    const pacote = i === 0 ? pacote10h : pacote5h;
    await prisma.compraCredito.create({ data: { alunoId: aluno.id, pacoteCreditoId: pacote.id, horas: pacote.horas } });
    await prisma.reservaSala.create({
      data: { alunoId: aluno.id, salaId: rand(salas).id, escolaId: escola.id, dataHoraInicio: addDays(hoje, randInt(1, 7)), horas: 1, ativa: i !== 2 },
    });
  }

  // ─── Chat da turma — o item principal desta rodada ─────────────────
  console.log('Criando conversas do Chat da Turma (MensagemTurma) por professor...');

  const ROTEIROS_CHAT = {
    'Violão': [
      ['PROFESSOR', 'Bom dia, turma! Semana que vem vamos fechar o acorde de pestana. Quem já treinou o Dó com pestana em casa?'],
      ['ALUNO', 'Bom dia, prof! Treinei bastante, mas ainda dói o dedo kkkk'],
      ['ALUNO', 'Eu também treinei, mas o som fica meio abafado ainda'],
      ['PROFESSOR', 'Normal no começo! O segredo é a posição do polegar atrás do braço, mais pro meio. Vou mandar um vídeo de referência.'],
      ['PROFESSOR', 'https://youtu.be/exemplo-pestana-violao'],
      ['ALUNO', 'Vou assistir, obrigado!'],
      ['PROFESSOR', 'Lembrando que sexta tem o Festival de Talentos — quem quiser se inscrever, me avisa até quarta.'],
      ['ALUNO', 'Eu quero participar! Posso tocar a música que estamos ensaiando?'],
      ['PROFESSOR', 'Pode sim, vamos ajustar juntos na próxima aula.'],
      ['ALUNO', 'Prof, posso trazer meu próprio violão na próxima aula? O da sala está desafinando rápido'],
      ['PROFESSOR', 'Pode sim! E vou pedir pra secretaria dar uma olhada nesse violão da sala.'],
      ['ALUNO', 'Show, obrigado!'],
    ],
    'Piano': [
      ['PROFESSOR', 'Pessoal, bom treino essa semana com a escala de Sol Maior. Quem sentiu dificuldade na passagem do polegar?'],
      ['ALUNO', 'Eu! Sempre travo na hora de passar o dedo 1 por baixo'],
      ['PROFESSOR', 'Isso é super comum. Vamos fazer um exercício específico pra isso na próxima aula.'],
      ['ALUNO', 'Combinado! Aproveitando, professora, aquele link da partitura da Für Elise ainda funciona?'],
      ['PROFESSOR', 'https://exemplo.com/partituras/fur-elise-trecho1.pdf'],
      ['ALUNO', 'Perfeito, obrigada!'],
      ['ALUNO', 'Professora, vou faltar quinta-feira, posso repor?'],
      ['PROFESSOR', 'Sem problema, me avisa com antecedência que a secretaria organiza a reposição.'],
      ['ALUNO', 'Já avisei a secretaria, obrigado!'],
      ['PROFESSOR', 'Ótimo! Vamos revisar os acordes tríades na próxima aula também, tragam o caderno de teoria.'],
    ],
    'Canto': [
      ['PROFESSOR', 'Bom dia! Não esqueçam do aquecimento vocal antes de qualquer ensaio em casa 🎤'],
      ['ALUNO', 'Bom dia! Estou sentindo a voz mais solta essa semana, o exercício de sirene ajudou muito'],
      ['PROFESSOR', 'Que ótimo ouvir isso! Vamos continuar evoluindo. Semana que vem começamos repertório novo de MPB.'],
      ['ALUNO', 'Posso sugerir uma música?'],
      ['PROFESSOR', 'Claro, manda o nome aqui que eu vejo se encaixa na sua tessitura.'],
      ['ALUNO', 'Águas de Março, do Tom Jobim'],
      ['PROFESSOR', 'Ótima escolha! Vamos trabalhar nela.'],
      ['ALUNO', 'Professora, vi que tem o Festival de Talentos, dá pra eu me inscrever com essa música?'],
      ['PROFESSOR', 'Dá sim! Vamos preparar juntas.'],
      ['ALUNO', 'Ansiosa! Obrigada pelo apoio'],
      ['PROFESSOR', 'https://exemplo.com/aquecimento-vocal-guia.pdf — segue o guia de aquecimento que combinei'],
    ],
    'Bateria': [
      ['PROFESSOR', 'E aí, galera! Treinaram os rudimentos essa semana?'],
      ['ALUNO', 'Treinei o paradiddle, mas ainda travo na velocidade mais alta'],
      ['PROFESSOR', 'Beleza, vamos com calma, velocidade vem depois de precisão. Foco na mão fraca essa semana.'],
      ['ALUNO', 'Bora! Ah, professor, o kit da sala 3 tá com o prato meio solto'],
      ['PROFESSOR', 'Valeu pelo aviso, vou pedir pra secretaria dar uma olhada.'],
      ['ALUNO', 'Professor, groove de funk que a gente viu ficou muito bom, posso mandar um vídeo meu treinando?'],
      ['PROFESSOR', 'Manda sim, sem problema (só texto e link aqui no chat, me manda o link do vídeo no drive)'],
      ['ALUNO', 'https://drive.exemplo.com/meu-treino-funk'],
      ['PROFESSOR', 'Muito bom! Já dá pra perceber a evolução na levada.'],
    ],
    'Violino': [
      ['PROFESSOR', 'Bom dia, turminha! Essa semana vamos revisar a afinação com as cordas soltas antes de cada aula.'],
      ['ALUNO', 'Bom dia! Minha corda Ré está sempre desafinando rápido, é normal?'],
      ['PROFESSOR', 'Pode ser a corda precisando trocar, ou o cravelheiro meio solto. Vou dar uma olhada na próxima aula.'],
      ['ALUNO', 'Combinado, obrigada!'],
      ['ALUNO', 'Professor, o passeio pra sala de concertos vai valer aula ou é opcional?'],
      ['PROFESSOR', 'É um evento do calendário — não conta falta, mas é bem recomendado ir!'],
      ['PROFESSOR', 'https://exemplo.com/partitura-dueto-simples.pdf — segue a partitura do dueto que vamos ensaiar'],
      ['ALUNO', 'Já baixei, muito obrigada!'],
    ],
  };

  for (const prof of professores) {
    const cursoPrincipal = prof.cursosNomes[0];
    const roteiro = ROTEIROS_CHAT[cursoPrincipal] || [];
    // Só alunos cujo professor PRINCIPAL de login é este (não os vínculos
    // secundários de multi-matrícula) — evita mensagem "de" um aluno que a
    // tela de chats não vai achar na lista de alunos deste professor.
    const alunosDoProf = alunosPorProfessor[prof.id].filter((a) => a.status === 'ATIVO' && a.professorId === prof.id);
    if (alunosDoProf.length === 0 || roteiro.length === 0) continue;

    let diasAtras = roteiro.length; // espalha as mensagens ao longo dos últimos dias
    for (const [autorTipo, texto] of roteiro) {
      const autorId = autorTipo === 'PROFESSOR' ? prof.id : rand(alunosDoProf).id;
      await prisma.mensagemTurma.create({
        data: {
          texto, autorTipo, autorId, professorId: prof.id,
          createdAt: addDays(new Date(hoje.getTime() + randInt(0, 6) * 3600000), -diasAtras),
        },
      });
      diasAtras = Math.max(0, diasAtras - rand([0, 0, 1]));
    }
  }

  // ─── Notificações (aniversário, contrato) ──────────────────────────
  console.log('Criando Notificações...');
  await prisma.notificacao.create({
    data: { tipo: 'NOVO_ALUNO', titulo: 'Novo aluno matriculado', mensagem: `${todosAlunos[0].nome} acabou de ser matriculado(a).`, professorId: diretora.id },
  });
  const alunoContratoExpirando = alunosAtivos.find((a) => addMonths(a.dataInicioContrato, a.tempoContrato) < addDays(hoje, 30));
  if (alunoContratoExpirando) {
    await prisma.notificacao.create({
      data: { tipo: 'CONTRATO_EXPIRANDO', titulo: 'Contrato vencendo em breve', mensagem: `O contrato de ${alunoContratoExpirando.nome} vence em menos de 30 dias.`, professorId: diretora.id, dadosExtra: JSON.stringify({ alunoId: alunoContratoExpirando.id }) },
    });
  }

  // ─── Mensagens 1:1 (chat legado professor↔aluno) ───────────────────
  console.log('Criando algumas mensagens 1:1 (chat legado)...');
  for (const prof of professores.slice(0, 2)) {
    const alunoDoProf = rand(alunosPorProfessor[prof.id].filter((a) => a.status === 'ATIVO'));
    if (!alunoDoProf) continue;
    await prisma.mensagem.create({ data: { texto: 'Professor(a), posso enviar o comprovante do pagamento por aqui?', remetente: alunoDoProf.id, alunoId: alunoDoProf.id, professorId: prof.id, createdAt: addDays(hoje, -2) } });
    await prisma.mensagem.create({ data: { texto: 'Pode sim! Mas o ideal é anexar direto na tela de Pagamentos.', remetente: 'professor', professorId: prof.id, createdAt: addDays(hoje, -2) } });
  }

  console.log('\nSeed concluída com sucesso!');
  console.log(`Escola: ${NOME_ESCOLA} (id ${escola.id})`);
  console.log(`Professores: ${professores.length + 2} · Alunos: ${todosAlunos.length + leadsConvertiveis.length} · Leads: ${leads.length}`);
  console.log('\nLogins de demonstração (senha para todos: ' + SENHA_DEMO + '):');
  console.log(`  Diretora (DONO):     ${diretora.email}`);
  console.log(`  Secretária (GESTOR): ${secretaria.email}`);
  for (const prof of professores) console.log(`  Professor(a):        ${prof.email}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
