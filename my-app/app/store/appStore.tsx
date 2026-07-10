// ─── KAV CLASS — Estado Global Compartilhado ──────────────────────────────────
// Simula um store reativo simples (substituir por Zustand ou Context quando
// conectar ao banco de dados).

export type TipoAula = 'individual' | 'grupo';
export type StatusAula = 'agendada' | 'realizada' | 'falta_justificada' | 'falta_injustificada' | 'falta_professor' | 'cancelada';
export type StatusReposicao = 'pendente' | 'confirmada' | 'recusada';
export type StatusNotificacao = 'nova' | 'lida';

export interface Aluno {
  id: string;
  nome: string;
  curso: string;
  telefone: string;
  email: string;
  codigoConvite: string; // gerado pelo link do professor
  valorMensal?: number;
  mesesContrato?: number;
  statusCadastro: 'pendente_preco' | 'ativo'; // 'pendente_preco' = chegou pelo link, aguarda configuração
  faltas: number;
  presencas: number;
  faltasJustificadas: number;
  aulasPendentes: number; // reposições devidas ao aluno
}

export interface AulaAgendada {
  id: string;
  alunoIds: string[]; // um ou vários (grupo)
  tipo: TipoAula;
  diaSemana: number; // 0=Dom … 6=Sáb
  horario: string;   // 'HH:MM'
  dataInicio: string; // 'YYYY-MM-DD'
  dataFim: string;    // fim do ano letivo
  recorrente: boolean;
  curso: string;
  // instâncias canceladas/editadas (por data 'YYYY-MM-DD')
  excecoes: Record<string, { cancelada?: boolean; novoHorario?: string }>;
}

export interface RegistroPresenca {
  id: string;
  aulaId: string;
  alunoId: string;
  data: string; // 'YYYY-MM-DD'
  status: StatusAula;
  observacao?: string;
}

export interface Reposicao {
  id: string;
  alunoId: string;
  aulaOrigemId: string;
  dataOriginal: string;
  dataProposta?: string;
  horarioProposto?: string;
  status: StatusReposicao;
  motivo: 'falta_justificada' | 'falta_professor';
}

export interface Notificacao {
  id: string;
  tipo: 'novo_aluno' | 'ajuste_horario' | 'pagamento' | 'reposicao';
  titulo: string;
  descricao: string;
  data: string;
  status: StatusNotificacao;
  alunoId?: string;
  payload?: Record<string, any>;
}

// ─── Dados mock iniciais ───────────────────────────────────────────────────────

export const ALUNOS_MOCK: Aluno[] = [
  {
    id: 'a1', nome: 'João Pedro', curso: 'Bateria', telefone: '11999990001',
    email: 'joao@email.com', codigoConvite: 'KAV-JP01',
    valorMensal: 300, mesesContrato: 12,
    statusCadastro: 'ativo', faltas: 1, presencas: 8, faltasJustificadas: 1, aulasPendentes: 0,
  },
  {
    id: 'a2', nome: 'Maria Clara', curso: 'Bateria', telefone: '11999990002',
    email: 'maria@email.com', codigoConvite: 'KAV-MC02',
    valorMensal: 300, mesesContrato: 6,
    statusCadastro: 'ativo', faltas: 0, presencas: 9, faltasJustificadas: 0, aulasPendentes: 0,
  },
  {
    id: 'a3', nome: 'Lucas Silva', curso: 'Bateria', telefone: '11999990003',
    email: 'lucas@email.com', codigoConvite: 'KAV-LS03',
    valorMensal: 300, mesesContrato: 3,
    statusCadastro: 'ativo', faltas: 4, presencas: 5, faltasJustificadas: 0, aulasPendentes: 1,
  },
  // Novo aluno chegou pelo link — aguarda configuração de preço
  {
    id: 'a4', nome: 'Felipe Costa', curso: 'Bateria', telefone: '11999990004',
    email: 'felipe@email.com', codigoConvite: 'KAV-7X9P',
    statusCadastro: 'pendente_preco', faltas: 0, presencas: 0, faltasJustificadas: 0, aulasPendentes: 0,
  },
];

export const AULAS_AGENDADAS_MOCK: AulaAgendada[] = [
  {
    id: 'ag1', alunoIds: ['a1'], tipo: 'individual',
    diaSemana: 2, horario: '14:00', // Terça
    dataInicio: '2026-01-01', dataFim: '2026-12-31',
    recorrente: true, curso: 'Bateria', excecoes: {},
  },
  {
    id: 'ag2', alunoIds: ['a2', 'a3'], tipo: 'grupo',
    diaSemana: 4, horario: '11:00', // Quinta
    dataInicio: '2026-01-01', dataFim: '2026-12-31',
    recorrente: true, curso: 'Bateria', excecoes: {},
  },
];

export const REPOSICOES_MOCK: Reposicao[] = [
  {
    id: 'r1', alunoId: 'a3', aulaOrigemId: 'ag1',
    dataOriginal: '2026-03-24',
    dataProposta: '2026-03-28', horarioProposto: '14:00',
    status: 'pendente', motivo: 'falta_justificada',
  },
];

export const NOTIFICACOES_MOCK: Notificacao[] = [
  {
    id: 'n1', tipo: 'novo_aluno',
    titulo: 'Novo aluno pelo link!',
    descricao: 'Felipe Costa se cadastrou via seu link de convite. Configure o plano dele.',
    data: '2026-04-10', status: 'nova', alunoId: 'a4',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Gera todas as datas de uma aula recorrente dentro do intervalo */
export function gerarDatasRecorrentes(aula: AulaAgendada): string[] {
  const datas: string[] = [];
  const inicio = new Date(aula.dataInicio);
  const fim = new Date(aula.dataFim);
  const cur = new Date(inicio);

  // Avança até o primeiro dia da semana correto
  while (cur.getDay() !== aula.diaSemana) cur.setDate(cur.getDate() + 1);

  while (cur <= fim) {
    const key = cur.toISOString().split('T')[0];
    if (!aula.excecoes[key]?.cancelada) datas.push(key);
    cur.setDate(cur.getDate() + 7);
  }
  return datas;
}

/** Retorna o nome do aluno pelo id */
export function nomeAluno(id: string, alunos: Aluno[]): string {
  return alunos.find(a => a.id === id)?.nome ?? '—';
}
