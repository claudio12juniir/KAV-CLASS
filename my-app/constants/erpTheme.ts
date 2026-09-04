// Paleta do painel institucional (Pacote Escola) — deliberadamente separada
// de CORES (constants/theme.ts), que é a identidade do app mobile do
// professor autônomo. O ERP é outra experiência: shell escuro fixo,
// conteúdo claro, tabelas densas — não o visual "app de celular".
export const ERP = {
  // Sidebar / chrome
  sidebarBg:        '#0B1220',
  sidebarBgAtivo:   '#161F32',
  sidebarBorda:     '#1E293B',
  sidebarTexto:     '#CBD5E1',
  sidebarTextoAtivo:'#FFFFFF',
  sidebarTextoMuted:'#64748B',

  // Conteúdo
  fundo:      '#F5F7FA',
  superficie: '#FFFFFF',
  borda:      '#E3E8EF',
  bordaForte: '#CBD5E1',

  // Texto
  texto:        '#101828',
  textoSecundario: '#475467',
  textoMuted:   '#98A2B3',

  // Marca / estado
  acento:      '#32BCAD',
  acentoSoft:  '#E6F8F6',
  acentoForte: '#0F9C8E',
  perigo:      '#D92D20',
  perigoSoft:  '#FEF3F2',
  aviso:       '#F79009',
  avisoSoft:   '#FFFAEB',
  sucesso:     '#12B76A',
  sucessoSoft: '#ECFDF3',
  info:        '#2E90FA',
  infoSoft:    '#EFF8FF',

  raio:  { sm: 6, md: 10, lg: 14 },
  fonte: { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 26 },
};

export const ERP_BREAKPOINT_DESKTOP = 960;
