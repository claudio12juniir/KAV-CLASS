export const EMPRESA = {
  nome:   'KAV Class',
  slogan: 'Educação que transforma',
};

// Linguagem visual "estilo X": fundo branco, texto quase-preto, cinza
// secundário neutro, divisores em vez de cards flutuantes/sombra. A única
// cor de marca preservada é o teal (`acento`) — o resto segue a paleta do X.
export const CORES = {
  fundo:        '#ffffff',
  superficie:   '#ffffff',
  borda:        '#EFF3F4',
  primaria:     '#0F1419',
  secundaria:   '#536471',
  acento:       '#32BCAD',
  acentoClaro:  '#E8F8F6',
  sucesso:      '#154a22',
  erro:         '#D9534F',
  aviso:        '#E68A00',
  info:         '#0275D8',
};

export const RAIO = {
  sm:   8,
  md:   12,
  pill: 9999,
};

export const TIPOGRAFIA = {
  letterSpacingTitulo: 1,
  letterSpacingLabel:  0.5,
  letterSpacingMono:   0,
  fonteMono:           'monospace' as const,
};
