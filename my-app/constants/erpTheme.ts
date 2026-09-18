// Paleta do painel institucional (Pacote Escola) — segue a mesma
// linguagem visual "estilo X" de CORES (constants/theme.ts): fundo
// branco, divisores hairline em vez de sombra/cards flutuantes, sidebar
// clara em vez de chrome escuro. A única cor de marca preservada é o
// teal (`acento`/`acentoSoft`/`acentoForte`).
import { Platform } from 'react-native';

export const ERP = {
  // Sidebar / chrome — clara, como o rail do X (item ativo = tinta do acento)
  sidebarBg:        '#FFFFFF',
  sidebarBgAtivo:   '#E6F8F6',
  sidebarBgHover:   '#F7F9FA',
  sidebarBorda:     '#EFF3F4',
  sidebarTexto:     '#536471',
  sidebarTextoAtivo:'#0F9C8E',
  sidebarTextoMuted:'#8B98A5',

  // Conteúdo
  fundo:       '#FFFFFF',
  superficie:  '#FFFFFF',
  borda:       '#EFF3F4',
  bordaSuave:  '#EFF3F4',
  bordaForte:  '#D0D8DC',
  hover:       '#F7F9FA',

  // Texto
  texto:        '#0F1419',
  textoSecundario: '#536471',
  textoMuted:   '#8B98A5',

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

  raio:  { sm: 6, md: 10, lg: 14, xl: 18, pill: 9999 },
  fonte: { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 26, xxxl: 32 },

  // Sem elevação por sombra (estilo X é flat) — mantido só como hairline
  // de 1px pra compatibilidade com quem ainda espreita `...ERP.sombra.xs`.
  // Preferir `borderBottomWidth`/`borderWidth` com `ERP.borda` daqui pra frente.
  sombra: {
    xs: { shadowOpacity: 0, elevation: 0 },
    sm: { shadowOpacity: 0, elevation: 0 },
    md: { shadowOpacity: 0, elevation: 0 },
    lg: { shadowOpacity: 0, elevation: 0 },
  },
};

export const ERP_BREAKPOINT_DESKTOP = 960;

// Web (react-native-web) entende transitions CSS via style — no nativo essas
// chaves são simplesmente ignoradas. Usado pra dar suavidade a hover/lift
// sem precisar de Animated em toda parte interativa do ERP.
export const transicaoWeb = (propriedades = 'all') =>
  Platform.OS === 'web' ? ({ transitionProperty: propriedades, transitionDuration: '140ms', transitionTimingFunction: 'ease-out' } as any) : {};
