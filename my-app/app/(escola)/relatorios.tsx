import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { EstadoVazio, ErpShell, Kpi, Modal, SectionCard, SubAbasSimples } from './_ui';

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

type MesMetrica = { mes: number; faturamento: number; quantidadePagamentos: number; inadimplencia: number; quantidadeAtrasados: number };
type Metrica = 'faturamento' | 'inadimplencia';

const EXPLICACOES: Record<Metrica, string> = {
  faturamento: 'Soma de todos os pagamentos com status PAGO, agrupados pelo mês em que o pagamento foi efetivamente registrado.',
  inadimplencia: 'Soma dos pagamentos com status ATRASADO, agrupados pelo mês de vencimento.',
};

export default function RelatoriosEscola() {
  const anoAtual = new Date().getFullYear();
  const [carregando, setCarregando] = useState(true);
  const [anoBase, setAnoBase] = useState(anoAtual);
  const [mesesAnoBase, setMesesAnoBase] = useState<MesMetrica[]>([]);
  const [mesesAnoAnterior, setMesesAnoAnterior] = useState<MesMetrica[]>([]);
  const [metricaAtiva, setMetricaAtiva] = useState<Metrica>('faturamento');

  const [modalMes, setModalMes] = useState<{ mes: number; ano: number } | null>(null);
  const [detalheMes, setDetalheMes] = useState<any[] | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregar = useCallback(async (ano: number) => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/metricas/faturamento?ano=${ano}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const dados = await res.json();
        setMesesAnoBase(dados.meses || []);
        setMesesAnoAnterior(dados.mesesAnoAnterior || []);
      }
    } catch (err) {
      console.error('Erro ao carregar Relatórios:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(anoBase); }, [carregar, anoBase]));

  const trocarAno = (delta: number) => {
    const novo = anoBase + delta;
    if (novo > anoAtual) return;
    setAnoBase(novo);
  };

  const abrirDetalheMes = async (mes: number) => {
    setModalMes({ mes, ano: anoBase });
    setDetalheMes(null);
    setCarregandoDetalhe(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(
        `${BASE_URL}/api/escola/metricas/faturamento/detalhe?ano=${anoBase}&mes=${mes}&tipo=${metricaAtiva}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDetalheMes(res.ok ? await res.json() : []);
    } catch (err) {
      console.error('Erro ao carregar detalhe:', err);
      setDetalheMes([]);
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  const totalAnoBase = mesesAnoBase.reduce((acc, m) => acc + m[metricaAtiva], 0);
  const totalAnoAnterior = mesesAnoAnterior.reduce((acc, m) => acc + m[metricaAtiva], 0);
  const variacao = totalAnoAnterior > 0 ? ((totalAnoBase - totalAnoAnterior) / totalAnoAnterior) * 100 : (totalAnoBase > 0 ? 100 : 0);
  const variacaoPositiva = metricaAtiva === 'faturamento' ? variacao >= 0 : variacao <= 0;
  const maiorValor = Math.max(1, ...mesesAnoBase.map(m => m[metricaAtiva]), ...mesesAnoAnterior.map(m => m[metricaAtiva]));

  return (
    <ErpShell titulo="Relatórios">
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: ERP.texto }}>Painel de métricas</Text>
        <Text style={{ fontSize: 13, color: ERP.textoSecundario, marginTop: 3 }}>
          Compare faturamento e inadimplência ano a ano — toque num mês pra ver os alunos por trás do número.
        </Text>
      </View>

      <SubAbasSimples
        opcoes={[{ chave: 'faturamento', rotulo: 'Faturamento' }, { chave: 'inadimplencia', rotulo: 'Inadimplência' }]}
        ativa={metricaAtiva}
        onMudar={setMetricaAtiva}
      />

      {carregando ? (
        <SectionCard><View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></SectionCard>
      ) : (
        <>
          <View style={estilos.kpiGrade}>
            <Kpi
              label={`${metricaAtiva === 'faturamento' ? 'Faturamento' : 'Inadimplência'} em ${anoBase}`}
              valor={`R$ ${totalAnoBase.toFixed(2).replace('.', ',')}`}
              tom={metricaAtiva === 'inadimplencia' && totalAnoBase > 0 ? 'alerta' : 'default'}
            />
            <Kpi
              label={`Variação vs. ${anoBase - 1}`}
              valor={`${variacao >= 0 ? '+' : ''}${variacao.toFixed(1)}%`}
              tom={variacaoPositiva ? 'sucesso' : 'alerta'}
            />
          </View>

          <SectionCard style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => trocarAno(-1)}><Ionicons name="chevron-back" size={20} color={ERP.texto} /></TouchableOpacity>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: ERP.texto }}>{anoBase - 1} vs {anoBase}</Text>
              <TouchableOpacity onPress={() => trocarAno(1)} disabled={anoBase >= anoAtual}>
                <Ionicons name="chevron-forward" size={20} color={anoBase >= anoAtual ? ERP.textoMuted : ERP.texto} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
              <Legenda cor={ERP.texto} texto={String(anoBase)} />
              <Legenda cor={ERP.borda} texto={String(anoBase - 1)} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 180, paddingHorizontal: 8, gap: 6 }}>
                {mesesAnoBase.map((item) => {
                  const anterior = mesesAnoAnterior.find(m => m.mes === item.mes);
                  const valorAtual = item[metricaAtiva];
                  const valorAnterior = anterior ? anterior[metricaAtiva] : 0;
                  const alturaAtual = Math.max(Math.round((valorAtual / maiorValor) * 130), valorAtual > 0 ? 6 : 2);
                  const alturaAnterior = Math.max(Math.round((valorAnterior / maiorValor) * 130), valorAnterior > 0 ? 6 : 2);
                  return (
                    <TouchableOpacity key={item.mes} style={{ alignItems: 'center', width: 46 }} onPress={() => abrirDetalheMes(item.mes)}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 3, marginBottom: 8 }}>
                        <View style={estilos.trilha}><View style={[estilos.barra, { height: alturaAtual, backgroundColor: ERP.texto }]} /></View>
                        <View style={estilos.trilha}><View style={[estilos.barra, { height: alturaAnterior, backgroundColor: ERP.borda }]} /></View>
                      </View>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: ERP.texto }}>{MESES_PT[item.mes - 1]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <Text style={{ fontSize: 11, color: ERP.textoMuted, textAlign: 'center', marginTop: 12, fontStyle: 'italic' }}>
              {EXPLICACOES[metricaAtiva]}
            </Text>
          </SectionCard>
        </>
      )}

      <Modal visivel={!!modalMes} titulo={modalMes ? `${MESES_EXTENSO[modalMes.mes - 1]}/${modalMes.ano}` : ''} onFechar={() => setModalMes(null)}>
        {carregandoDetalhe ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}><SyncLoader size="small" color={ERP.texto} /></View>
        ) : !detalheMes?.length ? (
          <EstadoVazio icone="document-text-outline" texto="Nenhum pagamento encontrado nesse mês." />
        ) : (
          detalheMes.map((item: any) => (
            <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.borda }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{item.alunoNome}</Text>
                <Text style={{ fontSize: 12, color: ERP.textoSecundario, marginTop: 2 }}>
                  {item.professorNome} · {item.dataPagamento ? new Date(item.dataPagamento).toLocaleDateString('pt-BR') : `venc. ${new Date(item.vencimento).toLocaleDateString('pt-BR')}`}
                </Text>
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: ERP.texto }}>R$ {Number(item.valor).toFixed(2).replace('.', ',')}</Text>
            </View>
          ))
        )}
      </Modal>
    </ErpShell>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cor }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: ERP.textoSecundario }}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  trilha: { width: 14, height: 130, backgroundColor: ERP.fundo, borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
  barra: { width: '100%', borderRadius: 7 },
});
