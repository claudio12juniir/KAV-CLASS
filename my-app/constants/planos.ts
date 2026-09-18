// Planos em 2 níveis (Rede Social — planos/captação, 18/09/2026). BASICO só
// ferramentas de gestão (SaaS). COMPLETO soma a Rede Social (aparece na
// busca, avaliações públicas, ranking por nota). Reels é liberado já no
// BASICO — não é diferencial do Completo, é isca de captação.
// Compartilhado entre escolher-plano.tsx e pagamento-sucesso.tsx pra nunca
// desalinhar preço/nome entre as duas telas.

export type PlanoId = 'professor_basico' | 'professor_completo' | 'escola_basico' | 'escola_completo';

export type InfoPlano = {
  id: PlanoId;
  tipoConta: 'professor' | 'escola';
  nivel: 'BASICO' | 'COMPLETO';
  nome: string;
  precoNumero: number;
  preco: string;
  periodo: string;
  descricao: string;
  recomendado: boolean;
  features: string[];
  badge: string;
  detalhe: string;
  icone: string;
};

export const PLANOS: Record<PlanoId, InfoPlano> = {
  professor_basico: {
    id: 'professor_basico',
    tipoConta: 'professor',
    nivel: 'BASICO',
    nome: 'BÁSICO',
    precoNumero: 29.9,
    preco: 'R$ 29,90',
    periodo: '/mês',
    descricao: 'Ferramentas de gestão para o seu dia a dia.',
    recomendado: false,
    features: [
      'Calendário de aulas com recorrência',
      'Gestão de cobranças mensais',
      'Código de convite para alunos',
      'Relatórios financeiros',
      'Chat com alunos',
      'Reels — grave e publique aulas curtas',
    ],
    badge: 'Plano Básico ativado',
    detalhe: 'R$ 29,90/mês • Ferramentas de gestão • Cancele quando quiser',
    icone: 'shield-checkmark-outline',
  },
  professor_completo: {
    id: 'professor_completo',
    tipoConta: 'professor',
    nivel: 'COMPLETO',
    nome: 'COMPLETO',
    precoNumero: 45.0,
    preco: 'R$ 45,00',
    periodo: '/mês',
    descricao: 'Tudo do Básico + Rede Social pra captar alunos novos.',
    recomendado: true,
    features: [
      'Tudo do plano Básico',
      'Apareça na busca de aula particular',
      'Avaliações públicas de alunos',
      'Entra no ranking por nota',
      'Perfil vitrine completo',
    ],
    badge: 'Plano Completo ativado',
    detalhe: 'R$ 45,00/mês • SaaS + Rede Social • Cancele quando quiser',
    icone: 'star-outline',
  },
  escola_basico: {
    id: 'escola_basico',
    tipoConta: 'escola',
    nivel: 'BASICO',
    nome: 'BÁSICO',
    precoNumero: 120.0,
    preco: 'R$ 120,00',
    periodo: '/mês',
    descricao: 'Ferramentas de gestão para a sua instituição.',
    recomendado: false,
    features: [
      'Vários professores, turmas e alunos',
      'Financeiro, contratos e folha de pagamento',
      'Calendário, presença e reposições',
      'Reels — grave e publique aulas curtas',
    ],
    badge: 'Plano Básico ativado',
    detalhe: 'R$ 120,00/mês • Ferramentas de gestão • Cancele quando quiser',
    icone: 'shield-checkmark-outline',
  },
  escola_completo: {
    id: 'escola_completo',
    tipoConta: 'escola',
    nivel: 'COMPLETO',
    nome: 'COMPLETO',
    precoNumero: 380.0,
    preco: 'R$ 380,00',
    periodo: '/mês',
    descricao: 'Tudo do Básico + Rede Social pra captar alunos novos.',
    recomendado: true,
    features: [
      'Tudo do plano Básico',
      'Apareça na busca de escolas',
      'Avaliações públicas de alunos',
      'Entra no ranking por nota',
      'Perfil vitrine completo',
    ],
    badge: 'Plano Completo ativado',
    detalhe: 'R$ 380,00/mês • SaaS + Rede Social • Cancele quando quiser',
    icone: 'star-outline',
  },
};

export function planosPorPacote(pacote?: string | null): InfoPlano[] {
  const tipoConta = pacote === 'PACOTE_ESCOLA' ? 'escola' : 'professor';
  return Object.values(PLANOS).filter((p) => p.tipoConta === tipoConta);
}
