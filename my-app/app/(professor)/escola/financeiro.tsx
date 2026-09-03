import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { BASE_URL, fetchComRetry } from '../../api';
import { SubAbas } from './_componentes';
import { estilosConteudo as estilos } from './_estilos';

type Sub = 'cobranca' | 'renovacao';

export default function FinanceiroEscola() {
  const [sub, setSub] = useState<Sub>('cobranca');
  const [carregando, setCarregando] = useState(true);

  const [stripeConnect, setStripeConnect] = useState<{ conectado: boolean; onboardingCompleto: boolean } | null>(null);
  const [conectandoStripe, setConectandoStripe] = useState(false);
  const [resumoCobranca, setResumoCobranca] = useState<{
    totalAtivas: number;
    precisamDeAcao: { matriculaId: string; alunoNome: string; valorMensalidade: number; erro: string; ultimaTentativa: string | null }[];
    emDia: { matriculaId: string; alunoNome: string; valorMensalidade: number; diaVencimento: number }[];
  } | null>(null);

  const [alunosVencendo, setAlunosVencendo] = useState<any[]>([]);
  const [selecaoRenovacao, setSelecaoRenovacao] = useState<Record<string, string>>({});
  const [renovando, setRenovando] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resStripeConnect, resResumoCobranca, resVencendo] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/status`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cobranca-automatica/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
      ]);
      if (resStripeConnect.ok) setStripeConnect(await resStripeConnect.json());
      if (resResumoCobranca.ok) setResumoCobranca(await resResumoCobranca.json());
      if (resVencendo.ok) setAlunosVencendo(await resVencendo.json());
    } catch (err) {
      console.error('Erro ao carregar Financeiro da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const conectarStripe = async () => {
    setConectandoStripe(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/iniciar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (!res.ok || !dados.url) {
        Alert.alert('Erro', dados.erro || 'Não foi possível iniciar a conexão com o Stripe.');
        return;
      }

      await WebBrowser.openAuthSessionAsync(dados.url, 'kavclass://stripe-connect-retorno');

      const resStatus = await fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resStatus.ok) {
        const status = await resStatus.json();
        setStripeConnect(status);
        if (status.onboardingCompleto) {
          Alert.alert('Conta conectada!', 'A cobrança automática já pode ser ativada nas matrículas.');
        } else {
          Alert.alert('Cadastro incompleto', 'Volte quando puder pra terminar de preencher os dados no Stripe.');
        }
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConectandoStripe(false);
    }
  };

  const alternarSelecaoRenovacao = (aluno: any) => {
    setSelecaoRenovacao((atual) => {
      const novo = { ...atual };
      if (novo[aluno.id] !== undefined) {
        delete novo[aluno.id];
      } else {
        novo[aluno.id] = String(aluno.valorMensalidade || '');
      }
      return novo;
    });
  };

  const confirmarRenovacaoLote = () => {
    const ids = Object.keys(selecaoRenovacao);
    if (!ids.length) {
      Alert.alert('Atenção', 'Selecione ao menos um aluno.');
      return;
    }
    Alert.alert(
      'Renovar matrículas?',
      `${ids.length} aluno(s) selecionado(s) — o contrato de cada um reinicia a partir de hoje com o valor informado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Renovar', onPress: renovarLote },
      ]
    );
  };

  const renovarLote = async () => {
    const renovacoes = Object.entries(selecaoRenovacao).map(([alunoId, valor]) => ({
      alunoId,
      novoValorMensalidade: parseFloat(valor.replace(',', '.')),
    }));
    if (renovacoes.some((r) => !r.novoValorMensalidade || r.novoValorMensalidade <= 0)) {
      Alert.alert('Atenção', 'Todo aluno selecionado precisa de um valor válido.');
      return;
    }
    setRenovando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/renovacoes/lote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovacoes }),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Feito!', dados.mensagem);
        setSelecaoRenovacao({});
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível renovar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setRenovando(false);
    }
  };

  if (carregando) {
    return (
      <View style={estilos.telaCentralizada}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={estilos.container} showsVerticalScrollIndicator={false}>
      <View style={estilos.subHeader}>
        <Text style={estilos.subTitulo}>Financeiro</Text>
        <Text style={estilos.subtitulo}>Cobrança automática e renovação de matrículas</Text>
      </View>

      <SubAbas
        opcoes={[
          { chave: 'cobranca', rotulo: `Cobrança${resumoCobranca?.precisamDeAcao.length ? ` (${resumoCobranca.precisamDeAcao.length})` : ''}` },
          { chave: 'renovacao', rotulo: `Renovação${alunosVencendo.length ? ` (${alunosVencendo.length})` : ''}` },
        ]}
        ativa={sub}
        onMudar={setSub}
      />

      {sub === 'cobranca' && (
        <View style={estilos.secaoLista}>
          <Text style={estilos.textoAjuda}>
            Conecte uma conta Stripe da Escola pra receber direto no cartão salvo do aluno, sem comprovante manual.
          </Text>

          {!stripeConnect?.conectado && (
            <View style={estilos.cardForm}>
              <Text style={{ color: '#000', fontSize: 14, marginBottom: 14, lineHeight: 20 }}>
                Nenhuma conta Stripe conectada ainda. Conecte pra liberar a ativação de cobrança automática nas matrículas.
              </Text>
              <TouchableOpacity
                style={[estilos.botaoPrimario, conectandoStripe && { opacity: 0.6 }]}
                onPress={conectarStripe}
                disabled={conectandoStripe}
              >
                {conectandoStripe ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>Conectar conta Stripe</Text>}
              </TouchableOpacity>
            </View>
          )}

          {stripeConnect?.conectado && !stripeConnect.onboardingCompleto && (
            <View style={estilos.cardForm}>
              <View style={estilos.badgePapel}>
                <Text style={[estilos.badgePapelTexto, { color: '#E68A00' }]}>CADASTRO INCOMPLETO</Text>
              </View>
              <Text style={{ color: '#000', fontSize: 14, marginTop: 10, marginBottom: 14, lineHeight: 20 }}>
                A conta Stripe existe, mas ainda falta terminar o preenchimento de dados pra receber pagamentos.
              </Text>
              <TouchableOpacity
                style={[estilos.botaoPrimario, conectandoStripe && { opacity: 0.6 }]}
                onPress={conectarStripe}
                disabled={conectandoStripe}
              >
                {conectandoStripe ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>Continuar cadastro</Text>}
              </TouchableOpacity>
            </View>
          )}

          {stripeConnect?.conectado && stripeConnect.onboardingCompleto && (
            <>
              <View style={[estilos.badgePapel, { backgroundColor: '#E8F8EE', marginBottom: 14 }]}>
                <Text style={[estilos.badgePapelTexto, { color: '#154a22' }]}>CONTA CONECTADA</Text>
              </View>

              {resumoCobranca && resumoCobranca.totalAtivas === 0 && (
                <Text style={estilos.textoVazio}>Nenhuma matrícula com cobrança automática ativa ainda.</Text>
              )}

              {resumoCobranca && resumoCobranca.precisamDeAcao.length > 0 && (
                <>
                  <Text style={[estilos.badgePapelTexto, { color: '#B00020', marginBottom: 8 }]}>PRECISAM DE AÇÃO</Text>
                  {resumoCobranca.precisamDeAcao.map((m) => (
                    <View key={m.matriculaId} style={estilos.cardReposicao}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.nomePessoa}>{m.alunoNome}</Text>
                        <Text style={[estilos.emailPessoa, { color: '#B00020' }]}>{m.erro}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {resumoCobranca && resumoCobranca.emDia.length > 0 && (
                <>
                  <Text style={[estilos.badgePapelTexto, { color: '#555', marginTop: 10, marginBottom: 8 }]}>EM DIA ({resumoCobranca.emDia.length})</Text>
                  {resumoCobranca.emDia.map((m) => (
                    <View key={m.matriculaId} style={estilos.cardReposicao}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.nomePessoa}>{m.alunoNome}</Text>
                        <Text style={estilos.emailPessoa}>R$ {m.valorMensalidade.toFixed(2).replace('.', ',')} · vence dia {m.diaVencimento}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </View>
      )}

      {sub === 'renovacao' && (
        <View style={estilos.secaoLista}>
          <Text style={estilos.textoAjuda}>Contratos vencendo nos próximos 30 dias. Selecione, ajuste o valor e renove de uma vez.</Text>

          {alunosVencendo.length === 0 ? (
            <Text style={estilos.textoVazio}>Nenhuma matrícula vencendo nos próximos 30 dias.</Text>
          ) : (
            <>
              {alunosVencendo.map((a) => {
                const selecionado = selecaoRenovacao[a.id] !== undefined;
                return (
                  <View key={a.id} style={estilos.cardReposicao}>
                    <TouchableOpacity onPress={() => alternarSelecaoRenovacao(a)}>
                      <Ionicons name={selecionado ? 'checkbox' : 'square-outline'} size={22} color={selecionado ? '#000' : '#999'} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={estilos.nomePessoa}>{a.nome}</Text>
                      <Text style={estilos.emailPessoa}>
                        {a.diasRestantes < 0 ? `Venceu há ${Math.abs(a.diasRestantes)} dia(s)` : `Vence em ${a.diasRestantes} dia(s)`}
                      </Text>
                    </View>
                    {selecionado && (
                      <TextInput
                        style={[estilos.input, { width: 90, marginBottom: 0, height: 40 }]}
                        keyboardType="numeric"
                        value={selecaoRenovacao[a.id]}
                        onChangeText={(v) => setSelecaoRenovacao((atual) => ({ ...atual, [a.id]: v }))}
                      />
                    )}
                  </View>
                );
              })}

              <TouchableOpacity
                style={[estilos.botaoPrimario, { marginTop: 12 }, renovando && { opacity: 0.6 }]}
                onPress={confirmarRenovacaoLote}
                disabled={renovando}
              >
                {renovando ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>Renovar selecionados ({Object.keys(selecaoRenovacao).length})</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
