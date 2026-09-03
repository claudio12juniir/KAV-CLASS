import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type MesMetrica = {
  mes: number;
  faturamento: number;
  quantidadePagamentos: number;
  inadimplencia: number;
  quantidadeAtrasados: number;
};

type DetalheItem = {
  id: string;
  alunoNome: string;
  professorNome: string;
  valor: number;
  status: string;
  metodo: string | null;
  dataPagamento: string | null;
  vencimento: string;
};

type Metrica = 'faturamento' | 'inadimplencia';

const EXPLICACOES: Record<Metrica, string> = {
  faturamento: 'Soma de todos os pagamentos com status PAGO, agrupados pelo mês em que o pagamento foi efetivamente registrado. Pagamentos pendentes ou em atraso não entram nessa conta.',
  inadimplencia: 'Soma dos pagamentos com status ATRASADO, agrupados pelo mês de vencimento. Um pagamento sai dessa lista assim que é marcado como pago ou cancelado.',
};

export default function RelatoriosProfessorScreen() {
  const navigation = useNavigation();
  const [carregando, setCarregando] = useState(true);
  const [papel, setPapel] = useState<'DONO' | 'GESTOR' | 'PROFESSOR' | null>(null);

  // ── Visão PROFESSOR (existente) ─────────────────────────────────────────
  const [faturamentoTotal, setFaturamentoTotal] = useState(0);
  const [grafico, setGrafico] = useState<any[]>([]);

  // ── Visão comum aos dois papéis ─────────────────────────────────────────
  const [faltas, setFaltas] = useState<any[]>([]);

  // ── Painel de métricas do GESTOR (S5.2) ─────────────────────────────────
  const anoAtual = new Date().getFullYear();
  const [anoBase, setAnoBase] = useState(anoAtual);
  const [mesesAnoBase, setMesesAnoBase] = useState<MesMetrica[]>([]);
  const [mesesAnoAnterior, setMesesAnoAnterior] = useState<MesMetrica[]>([]);
  const [metricaAtiva, setMetricaAtiva] = useState<Metrica>('faturamento');
  const [carregandoPainel, setCarregandoPainel] = useState(false);

  const [modalExplicacao, setModalExplicacao] = useState<Metrica | null>(null);
  const [modalMes, setModalMes] = useState<{ mes: number; ano: number } | null>(null);
  const [detalheMes, setDetalheMes] = useState<DetalheItem[] | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregarPainel = useCallback(async (ano: number) => {
    setCarregandoPainel(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/escola/metricas/faturamento?ano=${ano}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) {
        const dados = await resposta.json();
        setMesesAnoBase(Array.isArray(dados.meses) ? dados.meses : []);
        setMesesAnoAnterior(Array.isArray(dados.mesesAnoAnterior) ? dados.mesesAnoAnterior : []);
      }
    } catch (error) {
      console.error('Erro ao buscar painel de métricas:', error);
    } finally {
      setCarregandoPainel(false);
    }
  }, []);

  const carregarDados = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      const headers = { Authorization: `Bearer ${token}` };

      const [respPerfil, respRelatorios] = await Promise.all([
        fetchComRetry(`${API_URL}/api/professor/perfil?professorId=${professorId}`, { headers }),
        fetchComRetry(`${API_URL}/api/relatorios?professorId=${professorId}`, { headers }),
      ]);

      let papelAtual: 'DONO' | 'GESTOR' | 'PROFESSOR' | null = null;
      if (respPerfil.ok) {
        const perfil = await respPerfil.json();
        papelAtual = perfil.papel || null;
        setPapel(papelAtual);
      }

      if (respRelatorios.ok) {
        const dados = await respRelatorios.json();
        setFaturamentoTotal(dados.faturamentoAtual ?? 0);
        setGrafico(Array.isArray(dados.grafico) && dados.grafico.length > 0
          ? dados.grafico
          : [
              { mes: 'Jan', valor: 0, altura: '10%' },
              { mes: 'Fev', valor: 0, altura: '10%' },
              { mes: 'Mar', valor: 0, altura: '10%' },
              { mes: 'Abr', valor: 0, altura: '10%' },
            ]);
        setFaltas(Array.isArray(dados.faltas) ? dados.faltas : []);
      }

      if (papelAtual === 'DONO' || papelAtual === 'GESTOR') {
        await carregarPainel(anoBase);
      }
    } catch (error) {
      console.error('Erro ao buscar relatórios:', error);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarPainel]);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const trocarAno = (delta: number) => {
    const novoAno = anoBase + delta;
    if (novoAno > anoAtual) return;
    setAnoBase(novoAno);
    carregarPainel(novoAno);
  };

  const abrirDetalheMes = async (mes: number) => {
    setModalMes({ mes, ano: anoBase });
    setDetalheMes(null);
    setCarregandoDetalhe(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(
        `${API_URL}/api/escola/metricas/faturamento/detalhe?ano=${anoBase}&mes=${mes}&tipo=${metricaAtiva}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDetalheMes(resposta.ok ? await resposta.json() : []);
    } catch (error) {
      console.error('Erro ao buscar detalhe do mês:', error);
      setDetalheMes([]);
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  const ehGestor = papel === 'DONO' || papel === 'GESTOR';

  const totalAnoBase = mesesAnoBase.reduce((acc, m) => acc + m[metricaAtiva], 0);
  const totalAnoAnterior = mesesAnoAnterior.reduce((acc, m) => acc + m[metricaAtiva], 0);
  const variacaoPercentual = totalAnoAnterior > 0
    ? ((totalAnoBase - totalAnoAnterior) / totalAnoAnterior) * 100
    : (totalAnoBase > 0 ? 100 : 0);
  // Faturamento subindo é bom (verde); inadimplência subindo é ruim (vermelho) — inverte o sinal.
  const variacaoEhPositiva = metricaAtiva === 'faturamento' ? variacaoPercentual >= 0 : variacaoPercentual <= 0;

  const maiorValorGrafico = Math.max(
    1,
    ...mesesAnoBase.map(m => m[metricaAtiva]),
    ...mesesAnoAnterior.map(m => m[metricaAtiva]),
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.titulo}>{ehGestor ? 'PAINEL DE MÉTRICAS' : 'RELATÓRIOS'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {ehGestor ? (
        <>
          <View style={styles.subHeader}>
            <Text style={styles.subTitulo}>Métricas da Escola</Text>
            <Text style={styles.subtitulo}>Compare períodos e entenda cada número</Text>
          </View>

          <View style={styles.tabsMetrica}>
            <TouchableOpacity
              style={[styles.tabMetrica, metricaAtiva === 'faturamento' && styles.tabMetricaAtiva]}
              onPress={() => setMetricaAtiva('faturamento')}
            >
              <Text style={[styles.tabMetricaTexto, metricaAtiva === 'faturamento' && styles.tabMetricaTextoAtivo]}>Faturamento</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabMetrica, metricaAtiva === 'inadimplencia' && styles.tabMetricaAtiva]}
              onPress={() => setMetricaAtiva('inadimplencia')}
            >
              <Text style={[styles.tabMetricaTexto, metricaAtiva === 'inadimplencia' && styles.tabMetricaTextoAtivo]}>Inadimplência</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cardResumo} onPress={() => setModalExplicacao(metricaAtiva)} activeOpacity={0.85}>
            <View style={styles.labelResumoRow}>
              <Text style={styles.labelResumo}>
                {metricaAtiva === 'inadimplencia' ? 'Inadimplência' : 'Faturamento'} em {anoBase}
              </Text>
              <Ionicons name="information-circle-outline" size={18} color="#A0B0B9" />
            </View>
            <Text style={styles.valorResumo}>R$ {totalAnoBase.toFixed(2).replace('.', ',')}</Text>
            <Text style={[styles.crescimento, !variacaoEhPositiva && styles.crescimentoNegativo]}>
              {variacaoPercentual >= 0 ? '+' : ''}{variacaoPercentual.toFixed(1)}% vs {anoBase - 1}
            </Text>
          </TouchableOpacity>

          <View style={styles.seletorAno}>
            <TouchableOpacity onPress={() => trocarAno(-1)} style={styles.setaAno}>
              <Ionicons name="chevron-back" size={20} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.textoAno}>{anoBase - 1} vs {anoBase}</Text>
            <TouchableOpacity onPress={() => trocarAno(1)} style={styles.setaAno} disabled={anoBase >= anoAtual}>
              <Ionicons name="chevron-forward" size={20} color={anoBase >= anoAtual ? '#D0D8DC' : '#000000'} />
            </TouchableOpacity>
          </View>

          <View style={styles.cardGrafico}>
            <View style={styles.legendaRow}>
              <View style={styles.legendaItem}>
                <View style={[styles.legendaBolinha, { backgroundColor: '#000000' }]} />
                <Text style={styles.legendaTexto}>{anoBase}</Text>
              </View>
              <View style={styles.legendaItem}>
                <View style={[styles.legendaBolinha, { backgroundColor: '#D0D8DC' }]} />
                <Text style={styles.legendaTexto}>{anoBase - 1}</Text>
              </View>
            </View>

            {carregandoPainel ? (
              <SyncLoader size="small" color="#000000" style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.graficoAreaGestor}>
                  {mesesAnoBase.map((item) => {
                    const anterior = mesesAnoAnterior.find(m => m.mes === item.mes);
                    const valorAtual = item[metricaAtiva];
                    const valorAnterior = anterior ? anterior[metricaAtiva] : 0;
                    const alturaAtual = Math.max(Math.round((valorAtual / maiorValorGrafico) * 100), valorAtual > 0 ? 5 : 2);
                    const alturaAnterior = Math.max(Math.round((valorAnterior / maiorValorGrafico) * 100), valorAnterior > 0 ? 5 : 2);
                    return (
                      <TouchableOpacity
                        key={item.mes}
                        style={styles.colunaGraficoGestor}
                        onPress={() => abrirDetalheMes(item.mes)}
                        activeOpacity={0.6}
                      >
                        <View style={styles.duasBarras}>
                          <View style={styles.trilhaBarraGestor}>
                            <View style={[styles.barraPreenchida, { height: `${alturaAtual}%`, backgroundColor: '#000000' }]} />
                          </View>
                          <View style={styles.trilhaBarraGestor}>
                            <View style={[styles.barraPreenchida, { height: `${alturaAnterior}%`, backgroundColor: '#D0D8DC' }]} />
                          </View>
                        </View>
                        <Text style={styles.labelMes}>{MESES_PT[item.mes - 1]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
            <Text style={styles.dicaToque}>Toque em um mês para ver os alunos por trás do número</Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.subHeader}>
            <Text style={styles.subTitulo}>Seu Desempenho</Text>
            <Text style={styles.subtitulo}>Acompanhe o crescimento do seu negócio</Text>
          </View>

          <View style={styles.cardResumo}>
            <Text style={styles.labelResumo}>Faturamento Total (Aprovado)</Text>
            <Text style={styles.valorResumo}>R$ {faturamentoTotal.toFixed(2).replace('.', ',')}</Text>
            <Text style={styles.crescimento}>+ Atualizado em tempo real</Text>
          </View>

          <View style={styles.cardGrafico}>
            <Text style={styles.tituloSecao}>Evolução da Receita</Text>
            <View style={styles.graficoArea}>
              {grafico.map((item, index) => (
                <View key={index} style={styles.colunaGrafico}>
                  <Text style={styles.valorBarra}>
                    {item.valor > 0 ? `R$${Math.round(item.valor)}` : ''}
                  </Text>
                  <View style={styles.trilhaBarra}>
                    <View style={[
                      styles.barraPreenchida,
                      {
                        height: item.altura,
                        backgroundColor: index === grafico.length - 1 ? '#000000' : '#A0B0B9'
                      }
                    ]} />
                  </View>
                  <Text style={styles.labelMes}>{item.mes}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      <View style={styles.cardFaltas}>
        <Text style={styles.tituloSecao}>Atenção às Faltas</Text>

        {faltas.length === 0 && (
          <Text style={styles.subtitulo}>Nenhuma falta registrada nos últimos 30 dias.</Text>
        )}

        {faltas.map(aluno => (
          <View key={aluno.id} style={styles.linhaFalta}>
            <View>
              <Text style={styles.nomeFalta}>{aluno.nome}</Text>
              <Text style={styles.qtdFalta}>{aluno.faltas} faltas no mês</Text>
            </View>
            <View style={[
              styles.badgeStatus,
              aluno.status === 'Excelente' ? { backgroundColor: '#E8F8EE' } :
              aluno.status === 'Bom' ? { backgroundColor: '#E3F2FD' } :
              { backgroundColor: '#FFEBEE' }
            ]}>
              <Text style={[
                styles.textoStatusFalta,
                aluno.status === 'Excelente' ? { color: '#154a22' } :
                aluno.status === 'Bom' ? { color: '#1976D2' } :
                { color: '#C62828' }
              ]}>{aluno.status}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />

      {/* Modal: como calculamos a métrica ativa */}
      <Modal
        visible={!!modalExplicacao}
        animationType="slide"
        transparent
        onRequestClose={() => setModalExplicacao(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitulo}>COMO CALCULAMOS</Text>
              <TouchableOpacity onPress={() => setModalExplicacao(null)}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>
            <Text style={styles.textoExplicacao}>
              {modalExplicacao ? EXPLICACOES[modalExplicacao] : ''}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modal: drill-down dos alunos por trás do número do mês */}
      <Modal
        visible={!!modalMes}
        animationType="slide"
        transparent
        onRequestClose={() => setModalMes(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitulo}>
                  {modalMes ? `${MESES_PT[modalMes.mes - 1]}/${modalMes.ano}` : ''}
                </Text>
                <Text style={styles.modalSub}>
                  {metricaAtiva === 'inadimplencia' ? 'Pagamentos em atraso' : 'Pagamentos recebidos'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalMes(null)}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {carregandoDetalhe ? (
                <SyncLoader size="small" color="#000000" style={{ marginVertical: 30 }} />
              ) : detalheMes && detalheMes.length > 0 ? (
                detalheMes.map(item => (
                  <View key={item.id} style={styles.linhaDetalhe}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={styles.nomeFalta}>{item.alunoNome}</Text>
                      <Text style={styles.qtdFalta}>
                        {item.professorNome} · {item.dataPagamento
                          ? new Date(item.dataPagamento).toLocaleDateString('pt-BR')
                          : `venc. ${new Date(item.vencimento).toLocaleDateString('pt-BR')}`}
                      </Text>
                    </View>
                    <Text style={styles.valorDetalhe}>R$ {Number(item.valor).toFixed(2).replace('.', ',')}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.subtitulo}>Nenhum pagamento encontrado nesse mês.</Text>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#D0D8DC',
    backgroundColor: '#ffffff',
  },
  hamburger: { padding: 4 },
  titulo: { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  subHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  subTitulo: { color: '#000000', fontSize: 22, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2, marginBottom: 16 },

  tabsMetrica: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: '#F0F4F8', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#D0D8DC' },
  tabMetrica: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabMetricaAtiva: { backgroundColor: '#000000' },
  tabMetricaTexto: { color: '#666', fontSize: 13, fontWeight: 'bold' },
  tabMetricaTextoAtivo: { color: '#ffffff' },

  cardResumo: { backgroundColor: '#000000', marginHorizontal: 20, borderRadius: 16, padding: 20, marginBottom: 20, elevation: 4 },
  labelResumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelResumo: { color: '#A0B0B9', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  valorResumo: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' },
  crescimento: { color: '#32BCAD', fontSize: 14, fontWeight: 'bold', marginTop: 8 },
  crescimentoNegativo: { color: '#EF9A9A' },

  seletorAno: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  setaAno: { padding: 8 },
  textoAno: { color: '#000000', fontSize: 14, fontWeight: 'bold', marginHorizontal: 12 },

  legendaRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  legendaBolinha: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendaTexto: { color: '#666', fontSize: 12, fontWeight: '600' },

  graficoAreaGestor: { flexDirection: 'row', alignItems: 'flex-end', height: 180, paddingTop: 10, paddingHorizontal: 4 },
  colunaGraficoGestor: { alignItems: 'center', width: 56 },
  duasBarras: { flexDirection: 'row', alignItems: 'flex-end', height: 130, marginBottom: 8 },
  trilhaBarraGestor: { width: 14, height: 130, backgroundColor: '#E0E7ED', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden', marginHorizontal: 2 },
  dicaToque: { color: '#999', fontSize: 11, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },

  cardGrafico: { backgroundColor: '#F0F4F8', marginHorizontal: 20, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#D0D8DC' },
  tituloSecao: { color: '#000000', fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  graficoArea: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 200, paddingTop: 20 },
  colunaGrafico: { alignItems: 'center', flex: 1 },
  valorBarra: { color: '#666', fontSize: 10, fontWeight: 'bold', marginBottom: 8 },
  trilhaBarra: { width: 24, height: 130, backgroundColor: '#E0E7ED', borderRadius: 12, justifyContent: 'flex-end', overflow: 'hidden', marginBottom: 8 },
  barraPreenchida: { width: '100%', borderRadius: 12 },
  labelMes: { color: '#000000', fontSize: 14, fontWeight: 'bold' },

  cardFaltas: { marginHorizontal: 20 },
  linhaFalta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0F4F8', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#D0D8DC' },
  nomeFalta: { color: '#000000', fontSize: 16, fontWeight: 'bold' },
  qtdFalta: { color: '#666', fontSize: 13, marginTop: 4 },
  badgeStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  textoStatusFalta: { fontSize: 12, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '80%', borderTopWidth: 1, borderTopColor: '#D0D8DC',
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalTitulo: { fontSize: 16, fontWeight: 'bold', color: '#000000', letterSpacing: 1 },
  modalSub: { fontSize: 13, color: '#666', marginTop: 2 },
  textoExplicacao: { fontSize: 15, color: '#333', lineHeight: 22 },

  linhaDetalhe: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  valorDetalhe: { color: '#000000', fontSize: 15, fontWeight: 'bold' },
});
