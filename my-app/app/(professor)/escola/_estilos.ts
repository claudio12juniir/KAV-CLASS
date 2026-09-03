import { StyleSheet } from 'react-native';
import { CORES } from '../../../constants/theme';

/** Estilos compartilhados entre as abas de Minha Escola. */
export const estilosConteudo = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },

  subHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  subTitulo: { color: CORES.primaria, fontSize: 22, fontWeight: 'bold' },
  subtitulo: { color: CORES.secundaria, fontSize: 14, marginTop: 2, marginBottom: 4 },

  avisoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    margin: 20, marginBottom: 0, padding: 14,
    backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1, borderColor: '#F0DFA0',
  },
  avisoTexto: { flex: 1, color: '#6B5900', fontSize: 13, lineHeight: 18 },

  cardForm: { margin: 20, padding: 20, backgroundColor: CORES.superficie, borderRadius: 16, borderWidth: 1, borderColor: CORES.borda },
  labelInput: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  input: {
    width: '100%', height: 48, backgroundColor: CORES.fundo,
    borderRadius: 10, paddingHorizontal: 15, color: CORES.primaria,
    marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: CORES.borda,
  },
  papelRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chipPapel: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: CORES.fundo, borderRadius: 20, borderWidth: 1, borderColor: CORES.borda },
  chipPapelAtivo: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  textoChip: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },

  botaoPrimario: { backgroundColor: CORES.primaria, borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  botaoPrimarioTexto: { color: CORES.fundo, fontSize: 15, fontWeight: 'bold' },

  codigoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 14, padding: 12, backgroundColor: CORES.acentoClaro, borderRadius: 10,
    borderWidth: 1, borderColor: CORES.acento,
  },
  codigoTexto: { color: CORES.primaria, fontSize: 18, fontWeight: 'bold', letterSpacing: 3 },

  secaoLista: { paddingHorizontal: 20, marginTop: 24 },
  secaoTitulo: { fontSize: 16, fontWeight: 'bold', color: CORES.primaria, marginBottom: 12 },
  textoVazio: { color: '#999', fontSize: 13, fontStyle: 'italic' },
  textoAjuda: { color: '#888', fontSize: 12, marginTop: -6, marginBottom: 12, lineHeight: 16 },

  cardLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  botaoIcone: { padding: 6 },

  linhaTituloFunil: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  badgeAlerta: { backgroundColor: '#FFF3CD', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#F0DFA0' },
  badgeAlertaTexto: { fontSize: 11, fontWeight: '700', color: CORES.aviso },
  funilRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  estagioCard: {
    minWidth: 90, flexGrow: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: CORES.superficie, borderRadius: 12, borderWidth: 1, borderColor: CORES.borda,
  },
  estagioTotal: { fontSize: 22, fontWeight: 'bold', color: CORES.primaria },
  estagioNome: { fontSize: 11, color: CORES.secundaria, marginTop: 4, textAlign: 'center' },

  conversaoRow: { flexDirection: 'row', gap: 10 },
  conversaoCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: CORES.superficie, borderRadius: 12, borderWidth: 1, borderColor: CORES.borda,
  },
  conversaoCardDestaque: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },

  linhaPessoa: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetra: { color: CORES.fundo, fontSize: 15, fontWeight: '700' },
  nomePessoa: { color: CORES.primaria, fontSize: 14, fontWeight: '600' },
  emailPessoa: { color: '#888', fontSize: 12, marginTop: 1 },
  badgePapel: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: CORES.superficie, borderRadius: 12 },
  badgePapelTexto: { fontSize: 10, fontWeight: '700', color: CORES.secundaria, letterSpacing: 0.5 },

  cardReposicao: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  botaoFinalizar: { backgroundColor: CORES.info, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  botaoFinalizarTexto: { color: CORES.fundo, fontSize: 12, fontWeight: 'bold' },

  cardComunicado: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  badgeStatus: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: CORES.superficie, borderRadius: 12 },
  badgeStatusEnviado: { backgroundColor: CORES.acentoClaro },
  badgeStatusTexto: { fontSize: 10, fontWeight: '700', color: CORES.secundaria, letterSpacing: 0.5 },
  acoesComunicado: { flexDirection: 'row', gap: 20, marginTop: 10 },
  linkAcao: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },

  telaCentralizada: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CORES.fundo },
});
