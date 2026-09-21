import type { GrupoNav } from '../(escola)/_ui';

export const NAV_ALUNO_ESCOLA: GrupoNav[] = [
  { titulo: '', itens: [
    { chave: 'painel', rota: '/(aluno-escola)', rotulo: 'Painel', icone: 'grid-outline' },
  ]},
  { titulo: 'Social', itens: [
    { chave: 'feed', rota: '/(aluno-escola)/feed', rotulo: 'Feed', icone: 'newspaper-outline' },
    { chave: 'reels', rota: '/(aluno-escola)/reels', rotulo: 'Reels', icone: 'film-outline' },
    { chave: 'mensagens', rota: '/(aluno-escola)/mensagens', rotulo: 'Mensagens', icone: 'paper-plane-outline' },
    { chave: 'busca', rota: '/(aluno-escola)/busca', rotulo: 'Pesquisa', icone: 'search-outline' },
    { chave: 'notificacoes', rota: '/(aluno-escola)/notificacoes', rotulo: 'Notificações', icone: 'notifications-outline' },
    { chave: 'criar', rota: '/(aluno-escola)/criar', rotulo: 'Criar', icone: 'add-circle-outline' },
    { chave: 'perfil-social', rota: '/(aluno-escola)/perfil', rotulo: 'Perfil', icone: 'person-circle-outline' },
  ]},
  { titulo: '', itens: [
    { chave: 'financeiro', rota: '/(aluno-escola)/financeiro', rotulo: 'Financeiro', icone: 'cash-outline' },
    { chave: 'materiais', rota: '/(aluno-escola)/materiais', rotulo: 'Material Didático', icone: 'book-outline' },
    { chave: 'chat-turma', rota: '/(aluno-escola)/chat-turma', rotulo: 'Chat da Turma', icone: 'chatbubbles-outline' },
    { chave: 'reposicoes', rota: '/(aluno-escola)/reposicoes', rotulo: 'Reposições', icone: 'swap-horizontal-outline' },
    { chave: 'avaliacao-mensal', rota: '/(aluno-escola)/avaliacao-mensal', rotulo: 'Avaliação Mensal', icone: 'star-outline' },
    { chave: 'comunicados', rota: '/(aluno-escola)/comunicados', rotulo: 'Comunicados', icone: 'megaphone-outline' },
    { chave: 'configuracoes', rota: '/(aluno-escola)/configuracoes', rotulo: 'Configurações', icone: 'settings-outline' },
  ]},
];
