import type { GrupoNav } from '../(escola)/_ui';

export const NAV_PROFESSOR_ESCOLA: GrupoNav[] = [
  { titulo: '', itens: [
    { chave: 'painel', rota: '/(professor-escola)', rotulo: 'Painel', icone: 'grid-outline' },
    { chave: 'calendario', rota: '/(professor-escola)/calendario', rotulo: 'Calendário', icone: 'calendar-outline' },
    { chave: 'financeiro', rota: '/(professor-escola)/financeiro', rotulo: 'Financeiro', icone: 'cash-outline' },
    { chave: 'chat-turma', rota: '/(professor-escola)/chat-turma', rotulo: 'Chat da Turma', icone: 'chatbubbles-outline' },
    { chave: 'configuracoes', rota: '/(professor-escola)/configuracoes', rotulo: 'Configurações', icone: 'settings-outline' },
  ]},
];
