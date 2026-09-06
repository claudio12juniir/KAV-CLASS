import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Botao, ErpShell, EstadoVazio, Kpi, SectionCard, Tabela, useEhDesktop } from './_ui';

export default function PainelEscola() {
  const { nomeEscola, pacote } = useEscolaContexto();
  const ehDesktop = useEhDesktop();
  const [carregando, setCarregando] = useState(true);

  const [totalProfessores, setTotalProfessores] = useState(0);
  const [totalAlunos, setTotalAlunos] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [conversao, setConversao] = useState<{ taxaConversao: number } | null>(null);
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

      const [resProfessores, resAlunos, resFunil, resConversao, resTarefas, resReposicoes, resResumoCobranca, resVencendo] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/funil/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/relatorios/conversao-experimental?de=${paraYYYYMMDD(trintaDiasAtras)}&ate=${paraYYYYMMDD(hoje)}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/tarefas-lead`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/reposicoes`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cobranca-automatica/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
      ]);

      if (resProfessores.ok) setTotalProfessores((await resProfessores.json()).length);
      if (resAlunos.ok) setTotalAlunos((await resAlunos.json()).length);
      if (resFunil.ok) setTotalLeads(((await resFunil.json()).estagios || []).reduce((s: number, e: any) => s + e.totalLeads, 0));
      if (resConversao.ok) setConversao(await resConversao.json());
      if (resTarefas.ok) setTarefasPendentes(await resTarefas.json());
      if (resReposicoes.ok) setReposicoesParaFinalizar(await resReposicoes.json());
      if (resResumoCobranca.ok) setPrecisamDeAcao((await resResumoCobranca.json()).precisamDeAcao?.length || 0);
      if (resVencendo.ok) setVencendo((await resVencendo.json()).length || 0);
    } catch (err) {
      console.error('Erro ao carregar Painel:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const concluirTarefa = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/tarefas-lead/${id}/concluir`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível concluir.');
  };

  const finalizarReposicao = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${id}/finalizar`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    const dados = await res.json();
    if (res.ok) { Alert.alert('Finalizada!', dados.mensagem); carregarDados(); }
    else Alert.alert('Erro', dados.erro || 'Não foi possível finalizar.');
  };

  if (carregando) {
    return (
      <ErpShell titulo="Painel">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      </ErpShell>
    );
  }

  return (
    <ErpShell titulo="Painel">
      <Text style={estilos.saudacao}>{nomeEscola || 'Sua escola'}</Text>
      <Text style={estilos.subtitulo}>Visão consolidada do dia a dia da instituição</Text>

      {pacote !== 'PACOTE_ESCOLA' && (
        <SectionCard style={{ backgroundColor: ERP.avisoSoft, borderColor: '#F5D9A8', marginTop: 20 }}>
          <Text style={{ color: '#8A5A00', fontSize: 13.5, lineHeight: 19 }}>
            Sua conta ainda está no Pacote Professor — algumas funções institucionais ficam liberadas só no Pacote Escola.
          </Text>
        </SectionCard>
      )}

      <View style={estilos.kpiGrade}>
        <Kpi label="Professores" valor={totalProfessores} onPress={() => router.push('/(escola)/equipe')} />
        <Kpi label="Alunos matriculados" valor={totalAlunos} onPress={() => router.push('/(escola)/alunos')} />
        <Kpi label="Leads no funil" valor={totalLeads} onPress={() => router.push('/(escola)/captacao')} />
        <Kpi label="Conversão (30d)" valor={`${conversao?.taxaConversao ?? 0}%`} onPress={() => router.push('/(escola)/captacao')} />
        <Kpi label="Cobranças com erro" valor={precisamDeAcao} tom={precisamDeAcao > 0 ? 'alerta' : 'default'} onPress={() => router.push('/(escola)/financeiro')} />
        <Kpi label="Matrículas vencendo" valor={vencendo} onPress={() => router.push('/(escola)/financeiro')} />
      </View>

      <View style={estilos.duasColunas}>
        <SectionCard style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          <Text style={estilos.cardTitulo}>Follow-ups pendentes</Text>
          {tarefasPendentes.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhum follow-up pendente." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={tarefasPendentes}
              colunas={[
                { chave: 'lead', titulo: 'Lead', flex: 2, render: (t: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{t.lead?.nome}</Text>
                    <Text style={estilos.linhaSub}>{t.descricao} · {new Date(t.dataPrevista).toLocaleDateString('pt-BR')}</Text>
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (t: any) => (
                  <Botao texto="Concluir" variante="secundario" onPress={() => concluirTarefa(t.id)} />
                )},
              ]}
            />
          )}
        </SectionCard>

        <SectionCard style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          <Text style={estilos.cardTitulo}>Reposições pra finalizar</Text>
          {reposicoesParaFinalizar.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma reposição pendente." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={reposicoesParaFinalizar}
              colunas={[
                { chave: 'aluno', titulo: 'Aluno', flex: 2, render: (r: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{r.aluno?.nome} · com {r.professor?.nome}</Text>
                    <Text style={estilos.linhaSub}>{r.dataProposta} — {r.motivo}</Text>
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (r: any) => (
                  <Botao texto="Finalizar" variante="secundario" onPress={() => finalizarReposicao(r.id)} />
                )},
              ]}
            />
          )}
        </SectionCard>
      </View>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  saudacao: { fontSize: 22, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13.5, color: ERP.textoSecundario, marginTop: 4 },
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 22 },
  duasColunas: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 22 },
  cardTitulo: { fontSize: 14.5, fontWeight: '800', color: ERP.texto, marginBottom: 14 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
});
