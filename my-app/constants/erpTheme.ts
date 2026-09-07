// Paleta do painel institucional (Pacote Escola) — deliberadamente separada
// de CORES (constants/theme.ts), que é a identidade do app mobile do
// professor autônomo. O ERP é outra experiência: shell escuro fixo,
// conteúdo claro, tabelas densas — não o visual "app de celular".
import { Platform } from 'react-native';

export const ERP = {
  // Sidebar / chrome
  sidebarBg:        '#0B1220',
  sidebarBgAtivo:   '#161F32',
  sidebarBgHover:   'rgba(255,255,255,0.045)',
  sidebarBorda:     '#1E293B',
  sidebarTexto:     '#CBD5E1',
  sidebarTextoAtivo:'#FFFFFF',
  sidebarTextoMuted:'#64748B',

  // Conteúdo
  fundo:       '#F5F7FA',
  superficie:  '#FFFFFF',
  borda:       '#E3E8EF',
  bordaSuave:  '#EEF1F5',
  bordaForte:  '#CBD5E1',
  hover:       '#F8FAFC',

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

  raio:  { sm: 6, md: 10, lg: 14, xl: 18 },
  fonte: { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 26, xxxl: 32 },

  // Elevação — profundidade sutil (cards flutuam levemente sobre o fundo,
  // hover eleva mais um degrau). shadow* pro iOS/web, elevation pro Android.
  sombra: {
    xs: { shadowColor: '#0B1220', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    sm: { shadowColor: '#0B1220', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    md: { shadowColor: '#0B1220', shadowOpacity: 0.09, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    lg: { shadowColor: '#0B1220', shadowOpacity: 0.16, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  },
};

export const ERP_BREAKPOINT_DESKTOP = 960;

// Web (react-native-web) entende transitions CSS via style — no nativo essas
// chaves são simplesmente ignoradas. Usado pra dar suavidade a hover/lift
// sem precisar de Animated em toda parte interativa do ERP.
export const transicaoWeb = (propriedades = 'all') =>
  Platform.OS === 'web' ? ({ transitionProperty: propriedades, transitionDuration: '140ms', transitionTimingFunction: 'ease-out' } as any) : {};
