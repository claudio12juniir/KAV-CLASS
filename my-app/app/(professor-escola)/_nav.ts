import type { GrupoNav } from '../(escola)/_ui';

export const NAV_PROFESSOR_ESCOLA: GrupoNav[] = [
  { titulo: '', itens: [
    { chave: 'painel', rota: '/(professor-escola)', rotulo: 'Painel', icone: 'grid-outline' },
  ]},
  { titulo: 'Social', itens: [
    { chave: 'feed', rota: '/(professor-escola)/feed', rotulo: 'Feed', icone: 'newspaper-outline' },
    { chave: 'reels', rota: '/(professor-escola)/reels', rotulo: 'Reels', icone: 'film-outline' },
    { chave: 'mensagens', rota: '/(professor-escola)/mensagens', rotulo: 'Mensagens', icone: 'paper-plane-outline' },
    { chave: 'busca', rota: '/(professor-escola)/busca', rotulo: 'Pesquisa', icone: 'search-outline' },
    { chave: 'notificacoes', rota: '/(professor-escola)/notificacoes', rotulo: 'Notificações', icone: 'notifications-outline' },
    { chave: 'criar', rota: '/(professor-escola)/criar', rotulo: 'Criar', icone: 'add-circle-outline' },
    { chave: 'perfil-social', rota: '/(professor-escola)/perfil', rotulo: 'Perfil', icone: 'person-circle-outline' },
  ]},
  { titulo: '', itens: [
    { chave: 'confirmar-presenca', rota: '/(professor-escola)/confirmar-presenca', rotulo: 'Confirmar Presença', icone: 'finger-print-outline' },
    { chave: 'calendario', rota: '/(professor-escola)/calendario', rotulo: 'Calendário', icone: 'calendar-outline' },
    { chave: 'financeiro', rota: '/(professor-escola)/financeiro', rotulo: 'Financeiro', icone: 'cash-outline' },
    { chave: 'fiscal', rota: '/(professor-escola)/fiscal', rotulo: 'Fiscal', icone: 'document-text-outline' },
    { chave: 'chat-turma', rota: '/(professor-escola)/chat-turma', rotulo: 'Chat da Turma', icone: 'chatbubbles-outline' },
    { chave: 'reposicoes', rota: '/(professor-escola)/reposicoes', rotulo: 'Reposições', icone: 'swap-horizontal-outline' },
    { chave: 'configuracoes', rota: '/(professor-escola)/configuracoes', rotulo: 'Configurações', icone: 'settings-outline' },
  ]},
];
