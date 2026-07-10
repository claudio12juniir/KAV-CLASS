import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import LoadingGlobal from '../../components/LoadingGlobal';
import ProfileFooter from '../../components/ProfileFooter';
import { CORES } from '../../constants/theme';

const API_URL = BASE_URL;

interface ProximaAula {
  id: string;
  dataHora: string;
  tipo: string;
  professor: { nome: string };
}

interface DashboardData {
  pendente?: boolean;
  inativo?: boolean;
  proximaAula?: ProximaAula | null;
  frequencia?: { presencas: number; faltas: number; total: number };
  pagamento?: { status: string; vencimento?: string | null } | null;
  plano?: { tempoContrato: number | null; dataInicio: string | null };
}

function getEmojiFrequencia(presencas: number, total: number) {
  if (total === 0) return { emoji: '📚', nivel: 'Sem aulas registradas', cor: CORES.secundaria };
  const taxa = presencas / total;
  if (taxa < 0.2) return { emoji: '😱', nivel: 'Péssimo', cor: CORES.erro };
  if (taxa < 0.4) return { emoji: '😟', nivel: 'Ruim', cor: '#E07020' };
  if (taxa < 0.6) return { emoji: '😐', nivel: 'Regular', cor: CORES.aviso };
  if (taxa < 0.8) return { emoji: '😊', nivel: 'Bom', cor: CORES.acento };
  return { emoji: '🌟', nivel: 'Ótimo', cor: '#4CAF50' };
}

function getConfigPagamento(status: string | null) {
  switch ((status || '').toUpperCase()) {
    case 'ATRASADO':
      return { cor: '#D9534F', fundo: '#FFF0F0', texto: 'Pagamento em atraso', icone: 'alert-circle' as const };
    case 'PAGO':
      return { cor: '#4CAF50', fundo: '#E8F8EE', texto: 'Mensalidade paga!', icone: 'checkmark-circle' as const };
    case 'EM_ANALISE':
      return { cor: '#0275D8', fundo: '#E8F0FF', texto: 'Comprovante em análise', icone: 'time' as const };
    default:
      return { cor: '#4FC3F7', fundo: '#E3F4FD', texto: 'Pagamento em dia', icone: 'checkmark-done-circle' as const };
  }
}

function calcProgresso(tempoContrato: number | null, dataInicio: string | null): number {
  if (!tempoContrato || !dataInicio) return 0;
  const inicio = new Date(dataInicio).getTime();
  const duracaoMs = tempoContrato * 30 * 24 * 60 * 60 * 1000;
  return Math.min(Math.max((Date.now() - inicio) / duracaoMs, 0), 1);
}

function getCorBarra(p: number): string {
  if (p < 0.5) return '#4CAF50';
  if (p < 0.75) return CORES.acento;
  if (p < 0.9) return CORES.aviso;
  return CORES.erro;
}

export default function AlunoDashboard() {
  const navigation = useNavigation();
  const router = useRouter();
  const [dados, setDados] = useState<DashboardData>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [modalPlano, setModalPlano] = useState(false);
  const [nomeAluno, setNomeAluno] = useState('');
  const [fotoAluno, setFotoAluno] = useState<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const frequenciaAnim = useRef(new Animated.Value(0)).current;
  const widgetsOpacity = useRef(new Animated.Value(0)).current;
  const widgetsTranslate = useRef(new Animated.Value(20)).current;

  const carregarDashboard = async () => {
    setErro(false);
    setCarregando(true);
    progressAnim.setValue(0);
    frequenciaAnim.setValue(0);
    widgetsOpacity.setValue(0);
    widgetsTranslate.setValue(20);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';
      if (!alunoId) { setErro(true); return; }

      // Carrega do cache para o footer aparecer mesmo com backend lento
      const nomeCache = await SecureStore.getItemAsync('kav_cache_aluno_nome');
      const fotoCache = await SecureStore.getItemAsync('kav_cache_aluno_foto');
      if (nomeCache) setNomeAluno(nomeCache);
      if (fotoCache) setFotoAluno(fotoCache);

      const [res, resPerfil] = await Promise.all([
        fetchComRetry(`${API_URL}/api/aluno/dashboard?alunoId=${alunoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchComRetry(`${API_URL}/api/aluno/perfil?alunoId=${alunoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resPerfil.ok) {
        const p = await resPerfil.json();
        setNomeAluno(p.nome || nomeCache || '');
        setFotoAluno(p.fotoUrl || null);
        if (p.nome) SecureStore.setItemAsync('kav_cache_aluno_nome', p.nome);
        if (p.fotoUrl) SecureStore.setItemAsync('kav_cache_aluno_foto', p.fotoUrl);
      }

      if (res.ok) {
        const d: DashboardData = await res.json();
        setDados(d);

        if (!d.pendente && !d.inativo) {
          const prog = calcProgresso(d.plano?.tempoContrato ?? null, d.plano?.dataInicio ?? null);
          const freq = (d.frequencia?.total ?? 0) > 0
            ? (d.frequencia!.presencas / d.frequencia!.total)
            : 0;

          Animated.parallel([
            Animated.timing(widgetsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(widgetsTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
            Animated.timing(frequenciaAnim, { toValue: freq, duration: 1000, delay: 300, useNativeDriver: false }),
            Animated.timing(progressAnim, { toValue: prog, duration: 1200, delay: 400, useNativeDriver: false }),
          ]).start();

          if (prog >= 1 && d.plano?.tempoContrato) {
            setTimeout(() => setModalPlano(true), 1600);
          }
        }
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  };

  useFocusEffect(useCallback(() => { carregarDashboard(); }, []));

  if (carregando) return <LoadingGlobal />;

  const { pendente, inativo, proximaAula, frequencia, pagamento, plano } = dados;
  const progresso = calcProgresso(plano?.tempoContrato ?? null, plano?.dataInicio ?? null);
  const configPag = getConfigPagamento(pagamento?.status ?? null);
  const emojiFreq = getEmojiFrequencia(frequencia?.presencas ?? 0, frequencia?.total ?? 0);
  const pctFreq = (frequencia?.total ?? 0) > 0
    ? Math.round(((frequencia?.presencas ?? 0) / frequencia!.total) * 100)
    : 0;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>INÍCIO</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {inativo ? (
          <View style={styles.cardAviso}>
            <Ionicons name="moon-outline" size={44} color="#888" style={{ marginBottom: 14 }} />
            <Text style={[styles.avisoTitulo, { color: '#555' }]}>DESLIGADO TEMPORARIAMENTE</Text>
            <Text style={styles.avisoTexto}>
              Você está desligado temporariamente, até mais!{'\n\n'}Entre em contato com seu professor para mais informações.
            </Text>
          </View>
        ) : erro ? (
          <View style={[styles.cardAviso, { borderColor: CORES.erro }]}>
            <Ionicons name="cloud-offline-outline" size={40} color={CORES.erro} style={{ marginBottom: 14 }} />
            <Text style={[styles.avisoTitulo, { color: CORES.erro }]}>Não foi possível carregar</Text>
            <Text style={styles.avisoTexto}>Verifique sua conexão com a internet e tente novamente.</Text>
            <TouchableOpacity style={styles.botaoRetry} onPress={carregarDashboard}>
              <Ionicons name="refresh-outline" size={16} color={CORES.fundo} style={{ marginRight: 6 }} />
              <Text style={styles.textoBotaoRetry}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : pendente ? (
          <View style={[styles.cardAviso, { borderColor: CORES.aviso }]}>
            <Ionicons name="time-outline" size={40} color={CORES.aviso} style={{ marginBottom: 14 }} />
            <Text style={[styles.avisoTitulo, { color: CORES.aviso }]}>AGUARDANDO APROVAÇÃO</Text>
            <Text style={styles.avisoTexto}>
              Seu cadastro foi recebido. Assim que o professor ativar sua conta e configurar suas aulas, elas aparecerão aqui.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Próxima Aula ── */}
            <Text style={styles.secaoLabel}>PRÓXIMA AULA</Text>
            {!proximaAula ? (
              <View style={styles.cardVazio}>
                <Ionicons name="calendar-clear-outline" size={32} color={CORES.secundaria} />
                <Text style={styles.textoVazio}>Nenhuma aula agendada ainda.</Text>
              </View>
            ) : (
              <View style={styles.cardAula}>
                <View style={styles.horarioBox}>
                  <Text style={styles.textoHorario}>
                    {new Date(proximaAula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.textoData}>
                    {new Date(proximaAula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nomeProfessor}>Prof. {proximaAula.professor?.nome || 'Professor'}</Text>
                  <Text style={styles.tipoAula}>
                    {proximaAula.tipo === 'REGULAR' ? 'Aula Regular' : 'Reposição'}
                  </Text>
                </View>
                <View style={styles.statusDot} />
              </View>
            )}

            {/* ── Widgets ── */}
            <Text style={[styles.secaoLabel, { marginTop: 28 }]}>MÉTRICAS</Text>

            <Animated.View style={{
              opacity: widgetsOpacity,
              transform: [{ translateY: widgetsTranslate }],
            }}>

              {/* Widget 1: Frequência */}
              <View style={styles.widget}>
                <View style={styles.widgetHeader}>
                  <View style={[styles.widgetIcone, { backgroundColor: '#E8F4FD' }]}>
                    <Ionicons name="stats-chart" size={20} color={CORES.info} />
                  </View>
                  <Text style={styles.widgetTitulo}>Frequência nas Aulas</Text>
                </View>

                <View style={styles.frequenciaRow}>
                  <Text style={styles.emoji}>{emojiFreq.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.nivelFrequencia, { color: emojiFreq.cor }]}>{emojiFreq.nivel}</Text>
                    <View style={styles.frequenciaDetalhes}>
                      <View style={[styles.badgeFreq, { backgroundColor: '#E8F8EE' }]}>
                        <Ionicons name="checkmark-circle" size={13} color="#4CAF50" />
                        <Text style={[styles.textoFreq, { color: '#4CAF50' }]}>{frequencia?.presencas ?? 0} presenças</Text>
                      </View>
                      <View style={[styles.badgeFreq, { backgroundColor: '#FFF0F0' }]}>
                        <Ionicons name="close-circle" size={13} color={CORES.erro} />
                        <Text style={[styles.textoFreq, { color: CORES.erro }]}>{frequencia?.faltas ?? 0} faltas</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.barraContainer}>
                  <Animated.View style={[styles.barraPreenchimento, {
                    width: frequenciaAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    backgroundColor: emojiFreq.cor,
                  }]} />
                </View>
                <View style={styles.barraLabels}>
                  <Text style={styles.barraLabelText}>0%</Text>
                  <Text style={[styles.barraLabelText, { color: emojiFreq.cor, fontWeight: 'bold' }]}>
                    {pctFreq}% de presença
                  </Text>
                  <Text style={styles.barraLabelText}>100%</Text>
                </View>
              </View>

              {/* Widget 2: Pagamento */}
              <View style={[styles.widget, { backgroundColor: configPag.fundo, borderColor: configPag.cor, borderWidth: 1.5 }]}>
                <View style={styles.widgetHeader}>
                  <View style={[styles.widgetIcone, { backgroundColor: configPag.fundo }]}>
                    <Ionicons name={configPag.icone} size={20} color={configPag.cor} />
                  </View>
                  <Text style={styles.widgetTitulo}>Status do Pagamento</Text>
                </View>

                <View style={[styles.statusPill, { backgroundColor: configPag.cor }]}>
                  <Ionicons name={configPag.icone} size={16} color="#fff" />
                  <Text style={styles.statusPillTexto}>{configPag.texto}</Text>
                </View>

                {pagamento?.vencimento && (
                  <Text style={[styles.vencimentoTexto, { color: configPag.cor }]}>
                    Vencimento: {new Date(pagamento.vencimento).toLocaleDateString('pt-BR')}
                  </Text>
                )}
                {!pagamento && (
                  <Text style={styles.semDadosPag}>Nenhuma cobrança gerada ainda.</Text>
                )}
              </View>

              {/* Widget 3: Evolução do Plano */}
              <View style={styles.widget}>
                <View style={styles.widgetHeader}>
                  <View style={[styles.widgetIcone, { backgroundColor: '#F0F8F0' }]}>
                    <Ionicons name="trending-up" size={20} color="#4CAF50" />
                  </View>
                  <Text style={styles.widgetTitulo}>Evolução do Plano</Text>
                </View>

                {!plano?.tempoContrato ? (
                  <Text style={styles.semPlano}>Plano não configurado pelo professor ainda.</Text>
                ) : (
                  <>
                    <View style={styles.planoBarraContainer}>
                      <Animated.View style={[styles.planoBarraPreenchimento, {
                        width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        backgroundColor: progressAnim.interpolate({
                          inputRange: [0, 0.5, 0.75, 0.9, 1],
                          outputRange: ['#4CAF50', '#4CAF50', CORES.acento, CORES.aviso, CORES.erro],
                        }),
                      }]} />
                    </View>

                    <View style={styles.planoInfo}>
                      <Text style={styles.planoTexto}>
                        {Math.round(progresso * (plano.tempoContrato ?? 0))} de {plano.tempoContrato} meses
                      </Text>
                      <Text style={[styles.planoPercent, { color: getCorBarra(progresso) }]}>
                        {Math.round(progresso * 100)}%
                      </Text>
                    </View>

                    {plano.dataInicio && (
                      <Text style={styles.planoDataTexto}>
                        Início: {new Date(plano.dataInicio).toLocaleDateString('pt-BR')}
                      </Text>
                    )}
                  </>
                )}
              </View>

            </Animated.View>
          </>
        )}

      </ScrollView>

      {nomeAluno ? (
        <ProfileFooter
          nome={nomeAluno}
          fotoUrl={fotoAluno}
          onPress={() => router.push('/(aluno)/perfil')}
        />
      ) : null}

      {/* Modal: Plano Encerrado */}
      <Modal visible={modalPlano} transparent animationType="fade" onRequestClose={() => setModalPlano(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalPlano(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIconeContainer}>
              <Ionicons name="warning" size={52} color={CORES.aviso} />
            </View>
            <Text style={styles.modalTitulo}>Plano Encerrado</Text>
            <View style={styles.modalDivisor} />
            <Text style={styles.modalMensagem}>
              Seu plano acabou, solicite ao professor para atualizá-lo.
            </Text>
            <TouchableOpacity style={styles.modalBotao} onPress={() => setModalPlano(false)}>
              <Text style={styles.modalBotaoTexto}>Entendi</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  hamburger: { padding: 4 },
  titulo: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  scroll: { padding: 20 },
  secaoLabel: {
    color: CORES.secundaria, fontSize: 11, fontWeight: 'bold',
    letterSpacing: 2, marginBottom: 12,
  },

  // ── Avisos ──
  cardAviso: {
    backgroundColor: CORES.superficie, borderRadius: 14, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: CORES.borda,
    marginTop: 20,
  },
  avisoTitulo: { fontSize: 13, fontWeight: 'bold', letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  avisoTexto: { color: CORES.secundaria, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  botaoRetry: {
    flexDirection: 'row', alignItems: 'center', marginTop: 20,
    backgroundColor: CORES.acento, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10,
  },
  textoBotaoRetry: { color: CORES.fundo, fontWeight: 'bold', fontSize: 14 },

  // ── Aula ──
  cardAula: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.superficie,
    padding: 14, borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: CORES.borda,
  },
  horarioBox: {
    backgroundColor: CORES.fundo, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, marginRight: 14, borderWidth: 1, borderColor: CORES.borda,
    alignItems: 'center', minWidth: 60,
  },
  textoHorario: { color: CORES.acento, fontWeight: 'bold', fontSize: 14, fontFamily: 'monospace' },
  textoData: { color: CORES.secundaria, fontSize: 10, textTransform: 'uppercase', marginTop: 2 },
  nomeProfessor: { color: CORES.primaria, fontSize: 15, fontWeight: 'bold' },
  tipoAula: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CORES.sucesso, marginLeft: 10 },

  cardVazio: {
    alignItems: 'center', backgroundColor: CORES.superficie, padding: 30,
    borderRadius: 12, borderWidth: 1, borderColor: CORES.borda, borderStyle: 'dashed',
  },
  textoVazio: { color: CORES.secundaria, marginTop: 12, textAlign: 'center', lineHeight: 20 },

  // ── Widgets ──
  widget: {
    backgroundColor: CORES.superficie, borderRadius: 16, padding: 18,
    marginBottom: 14, borderWidth: 1, borderColor: CORES.borda,
  },
  widgetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  widgetIcone: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  widgetTitulo: { color: CORES.primaria, fontSize: 14, fontWeight: '700' },

  // Widget 1: Frequência
  frequenciaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  emoji: { fontSize: 38, marginRight: 14 },
  nivelFrequencia: { fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  frequenciaDetalhes: { flexDirection: 'row', gap: 8 },
  badgeFreq: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  textoFreq: { fontSize: 12, fontWeight: '600' },
  barraContainer: {
    height: 10, backgroundColor: CORES.borda, borderRadius: 5, overflow: 'hidden', marginBottom: 6,
  },
  barraPreenchimento: { height: '100%', borderRadius: 5 },
  barraLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barraLabelText: { color: CORES.secundaria, fontSize: 10 },

  // Widget 2: Pagamento
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    alignSelf: 'flex-start', marginBottom: 10,
  },
  statusPillTexto: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  vencimentoTexto: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  semDadosPag: { color: CORES.secundaria, fontSize: 13 },

  // Widget 3: Plano
  semPlano: { color: CORES.secundaria, fontSize: 13, fontStyle: 'italic' },
  planoBarraContainer: {
    height: 14, backgroundColor: CORES.borda, borderRadius: 7,
    overflow: 'hidden', marginBottom: 10,
  },
  planoBarraPreenchimento: { height: '100%', borderRadius: 7 },
  planoInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  planoTexto: { color: CORES.primaria, fontSize: 13, fontWeight: '600' },
  planoPercent: { fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
  planoDataTexto: { color: CORES.secundaria, fontSize: 11, marginTop: 2 },

  // Modal: Plano Encerrado
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  modalCard: {
    backgroundColor: CORES.fundo, borderRadius: 20, padding: 28,
    width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
  },
  modalIconeContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF4E5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  modalTitulo: {
    color: CORES.primaria, fontSize: 20, fontWeight: 'bold',
    marginBottom: 12, textAlign: 'center',
  },
  modalDivisor: { height: 1, backgroundColor: CORES.borda, width: '100%', marginBottom: 14 },
  modalMensagem: {
    color: CORES.secundaria, fontSize: 15, lineHeight: 23,
    textAlign: 'center', marginBottom: 24,
  },
  modalBotao: {
    backgroundColor: CORES.acento, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 40,
  },
  modalBotaoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },
});
