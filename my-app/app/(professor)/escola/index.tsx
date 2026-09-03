import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { CORES } from '../../../constants/theme';
import { BASE_URL, fetchComRetry } from '../../api';
import { ABAS_ESCOLA } from './_componentes';
import { useEscolaContexto } from './_contexto';
import { estilosConteudo as estilos } from './_estilos';

export default function PainelEscola() {
  const { pacote, nomeEscola } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);

  const [totalLeads, setTotalLeads] = useState(0);
  const [tarefasFunilPendentes, setTarefasFunilPendentes] = useState(0);
  const [conversao, setConversao] = useState<{ totalExperimentais: number; convertidas: number; taxaConversao: number } | null>(null);
  const [tarefasPendentes, setTarefasPendentes] = useState<any[]>([]);
  const [reposicoesParaFinalizar, setReposicoesParaFinalizar] = useState<any[]>([]);
  const [precisamDeAcao, setPrecisamDeAcao] = useState(0);
  const [vencendo, setVencendo] = useState(0);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);
      const paraYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10);

      const [resFunil, resConversao, resTarefas, resReposicoes, resResumoCobranca, resVencendo] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/funil/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/relatorios/conversao-experimental?de=${paraYYYYMMDD(trintaDiasAtras)}&ate=${paraYYYYMMDD(hoje)}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/tarefas-lead`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/reposicoes`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cobranca-automatica/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
      ]);

      if (resFunil.ok) {
        const funil = await resFunil.json();
        setTotalLeads((funil.estagios || []).reduce((soma: number, e: any) => soma + e.totalLeads, 0));
        setTarefasFunilPendentes(funil.tarefasPendentes || 0);
      }
      if (resConversao.ok) setConversao(await resConversao.json());
      if (resTarefas.ok) setTarefasPendentes(await resTarefas.json());
      if (resReposicoes.ok) setReposicoesParaFinalizar(await resReposicoes.json());
      if (resResumoCobranca.ok) {
        const resumo = await resResumoCobranca.json();
        setPrecisamDeAcao(resumo.precisamDeAcao?.length || 0);
      }
      if (resVencendo.ok) setVencendo((await resVencendo.json()).length || 0);
    } catch (err) {
      console.error('Erro ao carregar Painel da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const concluirTarefa = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/tarefas-lead/${id}/concluir`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível concluir.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const finalizarReposicao = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${id}/finalizar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Finalizada!', dados.mensagem);
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível finalizar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const irPara = (chave: string) => {
    const aba = ABAS_ESCOLA.find((a) => a.chave === chave);
    if (aba) router.push(aba.rota as any);
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
        <Text style={estilos.subTitulo}>{nomeEscola || 'Visão Geral'}</Text>
        <Text style={estilos.subtitulo}>O que precisa da sua atenção agora</Text>
      </View>

      {pacote !== 'PACOTE_ESCOLA' && (
        <View style={estilos.avisoCard}>
          <Ionicons name="information-circle-outline" size={20} color={CORES.aviso} />
          <Text style={estilos.avisoTexto}>
            Sua conta ainda está no Pacote Professor. Convidar outros professores é um recurso do Pacote Escola.
          </Text>
        </View>
      )}

      <View style={estilos.secaoLista}>
        <View style={estatisticas.grade}>
          <TouchableOpacity style={estatisticas.card} onPress={() => irPara('captacao')}>
            <Text style={estatisticas.numero}>{totalLeads}</Text>
            <Text style={estatisticas.rotulo}>Leads no funil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estatisticas.card} onPress={() => irPara('captacao')}>
            <Text style={estatisticas.numero}>{conversao?.taxaConversao ?? 0}%</Text>
            <Text style={estatisticas.rotulo}>Conversão (30d)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estatisticas.card, precisamDeAcao > 0 && estatisticas.cardAlerta]}
            onPress={() => irPara('financeiro')}
          >
            <Text style={[estatisticas.numero, precisamDeAcao > 0 && estatisticas.numeroAlerta]}>{precisamDeAcao}</Text>
            <Text style={estatisticas.rotulo}>Cobranças com erro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estatisticas.card} onPress={() => irPara('financeiro')}>
            <Text style={estatisticas.numero}>{vencendo}</Text>
            <Text style={estatisticas.rotulo}>Matrículas vencendo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {tarefasPendentes.length > 0 && (
        <View style={estilos.secaoLista}>
          <View style={estilos.linhaTituloFunil}>
            <Text style={estilos.secaoTitulo}>Follow-ups pendentes</Text>
            {tarefasFunilPendentes > 0 && (
              <View style={estilos.badgeAlerta}>
                <Text style={estilos.badgeAlertaTexto}>{tarefasFunilPendentes}</Text>
              </View>
            )}
          </View>
          {tarefasPendentes.map((t) => (
            <View key={t.id} style={estilos.cardReposicao}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomePessoa}>{t.lead?.nome}</Text>
                <Text style={estilos.emailPessoa}>{t.descricao} · {new Date(t.dataPrevista).toLocaleDateString('pt-BR')}</Text>
              </View>
              <TouchableOpacity style={estilos.botaoFinalizar} onPress={() => concluirTarefa(t.id)}>
                <Text style={estilos.botaoFinalizarTexto}>Concluir</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {reposicoesParaFinalizar.length > 0 && (
        <View style={estilos.secaoLista}>
          <Text style={estilos.secaoTitulo}>Reposições pra finalizar ({reposicoesParaFinalizar.length})</Text>
          {reposicoesParaFinalizar.map((r) => (
            <View key={r.id} style={estilos.cardReposicao}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomePessoa}>{r.aluno?.nome} · com {r.professor?.nome}</Text>
                <Text style={estilos.emailPessoa}>{r.dataProposta} — {r.motivo}</Text>
              </View>
              <TouchableOpacity style={estilos.botaoFinalizar} onPress={() => finalizarReposicao(r.id)}>
                <Text style={estilos.botaoFinalizarTexto}>Finalizar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {tarefasPendentes.length === 0 && reposicoesParaFinalizar.length === 0 && (
        <View style={estilos.secaoLista}>
          <Text style={estilos.textoVazio}>Nenhuma pendência agora — tudo em dia.</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const estatisticas = {
  grade: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  card: {
    flexBasis: '47%' as const, flexGrow: 1, paddingVertical: 16, paddingHorizontal: 14,
    backgroundColor: CORES.superficie, borderRadius: 14, borderWidth: 1, borderColor: CORES.borda,
  },
  cardAlerta: { backgroundColor: '#FDECEA', borderColor: '#F3C1BC' },
  numero: { fontSize: 24, fontWeight: 'bold' as const, color: CORES.primaria },
  numeroAlerta: { color: CORES.erro },
  rotulo: { fontSize: 12, color: CORES.secundaria, marginTop: 2 },
};
