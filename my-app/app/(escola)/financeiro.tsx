import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, ErpShell, EstadoVazio, Kpi, SectionCard, SubAbasSimples, Tabela } from './_ui';

type Sub = 'cobranca' | 'renovacao';

export default function FinanceiroEscola() {
  const [sub, setSub] = useState<Sub>('cobranca');
  const [carregando, setCarregando] = useState(true);

  const [stripeConnect, setStripeConnect] = useState<{ conectado: boolean; onboardingCompleto: boolean } | null>(null);
  const [conectandoStripe, setConectandoStripe] = useState(false);
  const [resumoCobranca, setResumoCobranca] = useState<any>(null);

  const [alunosVencendo, setAlunosVencendo] = useState<any[]>([]);
  const [selecaoRenovacao, setSelecaoRenovacao] = useState<Record<string, string>>({});
  const [renovando, setRenovando] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resStripe, resResumo, resVencendo] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/status`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cobranca-automatica/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
      ]);
      if (resStripe.ok) setStripeConnect(await resStripe.json());
      if (resResumo.ok) setResumoCobranca(await resResumo.json());
      if (resVencendo.ok) setAlunosVencendo(await resVencendo.json());
    } catch (err) {
      console.error('Erro ao carregar Financeiro:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const conectarStripe = async () => {
    setConectandoStripe(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/iniciar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const dados = await res.json();
      if (!res.ok || !dados.url) { Alert.alert('Erro', dados.erro || 'Não foi possível iniciar a conexão com o Stripe.'); return; }
      await WebBrowser.openAuthSessionAsync(dados.url, 'kavclass://stripe-connect-retorno');
      const resStatus = await fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (resStatus.ok) {
        const status = await resStatus.json();
        setStripeConnect(status);
        Alert.alert(status.onboardingCompleto ? 'Conta conectada!' : 'Cadastro incompleto',
          status.onboardingCompleto ? 'A cobrança automática já pode ser ativada nas matrículas.' : 'Volte quando puder pra terminar de preencher os dados no Stripe.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConectandoStripe(false);
    }
  };

  const alternarSelecao = (aluno: any) => {
    setSelecaoRenovacao((atual) => {
      const novo = { ...atual };
      if (novo[aluno.id] !== undefined) delete novo[aluno.id];
      else novo[aluno.id] = String(aluno.valorMensalidade || '');
      return novo;
    });
  };

  const confirmarRenovacaoLote = () => {
    const ids = Object.keys(selecaoRenovacao);
    if (!ids.length) { Alert.alert('Atenção', 'Selecione ao menos um aluno.'); return; }
    Alert.alert('Renovar matrículas?', `${ids.length} aluno(s) selecionado(s) — o contrato de cada um reinicia a partir de hoje com o valor informado.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Renovar', onPress: renovarLote }]);
  };

  const renovarLote = async () => {
    const renovacoes = Object.entries(selecaoRenovacao).map(([alunoId, valor]) => ({ alunoId, novoValorMensalidade: parseFloat(valor.replace(',', '.')) }));
    if (renovacoes.some((r) => !r.novoValorMensalidade || r.novoValorMensalidade <= 0)) { Alert.alert('Atenção', 'Todo aluno selecionado precisa de um valor válido.'); return; }
    setRenovando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/renovacoes/lote`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovacoes }),
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Feito!', dados.mensagem); setSelecaoRenovacao({}); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível renovar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setRenovando(false);
    }
  };

  if (carregando) {
    return <ErpShell titulo="Financeiro"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Financeiro">
      <Text style={estilos.titulo}>Financeiro</Text>
      <Text style={estilos.subtitulo}>Cobrança automática via Stripe Connect e renovação de matrículas</Text>

      <SubAbasSimples
        opcoes={[
          { chave: 'cobranca', rotulo: `Cobrança${resumoCobranca?.precisamDeAcao?.length ? ` · ${resumoCobranca.precisamDeAcao.length}` : ''}` },
          { chave: 'renovacao', rotulo: `Renovação${alunosVencendo.length ? ` · ${alunosVencendo.length}` : ''}` },
        ]}
        ativa={sub} onMudar={setSub}
      />

      {sub === 'cobranca' && (
        <>
          {!stripeConnect?.conectado && (
            <SectionCard>
              <Text style={{ color: ERP.texto, fontSize: 14, marginBottom: 16, lineHeight: 20 }}>
                Nenhuma conta Stripe conectada ainda. Conecte pra liberar a ativação de cobrança automática nas matrículas.
              </Text>
              <Botao texto="Conectar conta Stripe" onPress={conectarStripe} carregando={conectandoStripe} />
            </SectionCard>
          )}

          {stripeConnect?.conectado && !stripeConnect.onboardingCompleto && (
            <SectionCard>
              <Badge texto="Cadastro incompleto" tom="aviso" />
              <Text style={{ color: ERP.texto, fontSize: 14, marginTop: 12, marginBottom: 16, lineHeight: 20 }}>
                A conta Stripe existe, mas ainda falta terminar o preenchimento de dados pra receber pagamentos.
              </Text>
              <Botao texto="Continuar cadastro" onPress={conectarStripe} carregando={conectandoStripe} />
            </SectionCard>
          )}

          {stripeConnect?.conectado && stripeConnect.onboardingCompleto && (
            <View style={{ gap: 16 }}>
              <View style={estilos.kpiGrade}>
                <Kpi label="Matrículas com cobrança ativa" valor={resumoCobranca?.totalAtivas ?? 0} />
                <Kpi label="Precisam de ação" valor={resumoCobranca?.precisamDeAcao?.length ?? 0} tom={(resumoCobranca?.precisamDeAcao?.length ?? 0) > 0 ? 'alerta' : 'default'} />
                <Kpi label="Em dia" valor={resumoCobranca?.emDia?.length ?? 0} tom="sucesso" />
              </View>

              {resumoCobranca?.precisamDeAcao?.length > 0 && (
                <SectionCard>
                  <Text style={estilos.cardTitulo}>Precisam de ação</Text>
                  <Tabela
                    vazioTexto=""
                    dados={resumoCobranca.precisamDeAcao.map((m: any) => ({ ...m, id: m.matriculaId }))}
                    colunas={[
                      { chave: 'alunoNome', titulo: 'Aluno', flex: 3 },
                      { chave: 'erro', titulo: 'Erro', flex: 4, render: (m: any) => <Text style={{ fontSize: 13, color: ERP.perigo }}>{m.erro}</Text> },
                    ]}
                  />
                </SectionCard>
              )}

              {resumoCobranca?.emDia?.length > 0 && (
                <SectionCard>
                  <Text style={estilos.cardTitulo}>Em dia</Text>
                  <Tabela
                    vazioTexto=""
                    dados={resumoCobranca.emDia.map((m: any) => ({ ...m, id: m.matriculaId }))}
                    colunas={[
                      { chave: 'alunoNome', titulo: 'Aluno', flex: 3 },
                      { chave: 'valor', titulo: 'Valor', flex: 2, render: (m: any) => <Text style={{ fontSize: 13 }}>R$ {m.valorMensalidade.toFixed(2).replace('.', ',')}</Text> },
                      { chave: 'vencimento', titulo: 'Vence', flex: 2, render: (m: any) => <Text style={{ fontSize: 13, color: ERP.textoSecundario }}>Dia {m.diaVencimento}</Text> },
                    ]}
                  />
                </SectionCard>
              )}
            </View>
          )}
        </>
      )}

      {sub === 'renovacao' && (
        <SectionCard>
          <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginBottom: 16 }}>Contratos vencendo nos próximos 30 dias. Selecione, ajuste o valor e renove de uma vez.</Text>
          {alunosVencendo.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma matrícula vencendo nos próximos 30 dias." />
          ) : (
            <>
              {alunosVencendo.map((a) => {
                const selecionado = selecaoRenovacao[a.id] !== undefined;
                return (
                  <View key={a.id} style={estilos.linhaRenovacao}>
                    <TouchableOpacity onPress={() => alternarSelecao(a)}>
                      <Ionicons name={selecionado ? 'checkbox' : 'square-outline'} size={22} color={selecionado ? ERP.texto : '#999'} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{a.nome}</Text>
                      <Text style={{ fontSize: 12, color: ERP.textoSecundario, marginTop: 2 }}>
                        {a.diasRestantes < 0 ? `Venceu há ${Math.abs(a.diasRestantes)} dia(s)` : `Vence em ${a.diasRestantes} dia(s)`}
                      </Text>
                    </View>
                    {selecionado && (
                      <TextInput
                        style={estilos.inputValor}
                        keyboardType="numeric"
                        value={selecaoRenovacao[a.id]}
                        onChangeText={(v) => setSelecaoRenovacao((atual) => ({ ...atual, [a.id]: v }))}
                      />
                    )}
                  </View>
                );
              })}
              <View style={{ marginTop: 16 }}>
                <Botao texto={`Renovar selecionados (${Object.keys(selecaoRenovacao).length})`} onPress={confirmarRenovacaoLote} carregando={renovando} />
              </View>
            </>
          )}
        </SectionCard>
      )}
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13, color: ERP.textoSecundario, marginTop: 3, marginBottom: 16 },
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cardTitulo: { fontSize: 13.5, fontWeight: '800', color: ERP.texto, marginBottom: 12 },
  linhaRenovacao: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F3F6' },
  inputValor: { width: 96, height: 38, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: 8, paddingHorizontal: 10, fontSize: 13.5, color: ERP.texto },
});
