import type { GrupoNav } from '../(escola)/_ui';

export const NAV_ALUNO_ESCOLA: GrupoNav[] = [
  { titulo: '', itens: [
    { chave: 'painel', rota: '/(aluno-escola)', rotulo: 'Painel', icone: 'grid-outline' },
    { chave: 'financeiro', rota: '/(aluno-escola)/financeiro', rotulo: 'Financeiro', icone: 'cash-outline' },
    { chave: 'materiais', rota: '/(aluno-escola)/materiais', rotulo: 'Material Didático', icone: 'book-outline' },
    { chave: 'chat-turma', rota: '/(aluno-escola)/chat-turma', rotulo: 'Chat da Turma', icone: 'chatbubbles-outline' },
    { chave: 'configuracoes', rota: '/(aluno-escola)/configuracoes', rotulo: 'Configurações', icone: 'settings-outline' },
  ]},
];
