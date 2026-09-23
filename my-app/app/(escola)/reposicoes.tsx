import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, ErpShell, EstadoVazio, PageHeader, SectionCard, useEhDesktop } from './_ui';

type Reposicao = {
  id: string;
  aluno: { nome: string };
  professor: { nome: string };
  dataOriginal: string | null;
  dataProposta: string;
  motivo: string;
  status: string;
  origem: 'PROFESSOR' | 'ALUNO';
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  AGUARDANDO: 'Aguardando aluno confirmar',
  SOLICITANDO_OUTRO: 'Aluno pediu outra data',
  SOLICITADA: 'Aguardando professor aprovar',
  CONFIRMADA: 'Confirmada pelo aluno',
  AUTORIZADA: 'Autorizada pelo professor',
};

// Quadro de 3 colunas pra reposição de aula (INSTITUTION Sprint 15,
// briefing 22/09/2026). Junta os dois fluxos que já existiam separados
// (professor propõe → aluno confirma; aluno pede → professor aprova →
// escola finaliza) numa visão única, categorizada por onde cada reposição
// está: ainda sem data travada, já agendada (só falta concluir) ou já
// concluída (FINALIZADA — único status terminal comum aos dois fluxos).
export default function ReposicoesEscola() {
  const ehDesktop = useEhDesktop();
  const [carregando, setCarregando] = useState(true);
  const [paraRepor, setParaRepor] = useState<Reposicao[]>([]);
  const [agendadas, setAgendadas] = useState<Reposicao[]>([]);
  const [concluidas, setConcluidas] = useState<Reposicao[]>([]);
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/reposicoes-quadro`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const dados = await res.json();
        setParaRepor(dados.paraRepor || []);
        setAgendadas(dados.agendadas || []);
        setConcluidas(dados.concluidas || []);
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const finalizar = async (r: Reposicao) => {
    setFinalizandoId(r.id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${r.id}/finalizar`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) carregar();
      else Alert.alert('Erro', dados.erro || 'Não foi possível finalizar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setFinalizandoId(null);
    }
  };

  if (carregando) {
    return (
      <ErpShell titulo="Reposições">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      </ErpShell>
    );
  }

  return (
    <ErpShell titulo="Reposições">
      <PageHeader titulo="Reposições" subtitulo="Para repor, agendadas e concluídas — os dois fluxos (proposto pelo professor ou pedido pelo aluno) numa visão só." />

      <View style={estilos.colunas}>
        <SectionCard titulo="Para repor" subtitulo={`${paraRepor.length} ${paraRepor.length === 1 ? 'pendente' : 'pendentes'}`} style={{ flex: 1, minWidth: ehDesktop ? 300 : undefined }}>
          {paraRepor.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nada pendente." />
          ) : (
            paraRepor.map((r) => (
              <View key={r.id} style={estilos.cartao}>
                <Text style={estilos.nome}>{r.aluno.nome} · com {r.professor.nome}</Text>
                <Text style={estilos.sub}>{r.dataProposta} — {r.motivo}</Text>
                <Badge texto={STATUS_LABEL[r.status] || r.status} tom="aviso" />
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard titulo="Reposições agendadas" subtitulo={`${agendadas.length} ${agendadas.length === 1 ? 'agendada' : 'agendadas'}`} style={{ flex: 1, minWidth: ehDesktop ? 300 : undefined }}>
          {agendadas.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma reposição agendada aguardando conclusão." />
          ) : (
            agendadas.map((r) => (
              <View key={r.id} style={estilos.cartao}>
                <Text style={estilos.nome}>{r.aluno.nome} · com {r.professor.nome}</Text>
                <Text style={estilos.sub}>{r.dataProposta} — {r.motivo}</Text>
                <Badge texto={STATUS_LABEL[r.status] || r.status} tom="info" />
                <View style={{ marginTop: 8 }}>
                  <Botao texto="Marcar como concluída" variante="secundario" onPress={() => finalizar(r)} carregando={finalizandoId === r.id} />
                </View>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard titulo="Reposições concluídas" subtitulo={`${concluidas.length} ${concluidas.length === 1 ? 'concluída' : 'concluídas'}`} style={{ flex: 1, minWidth: ehDesktop ? 300 : undefined }}>
          {concluidas.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma reposição concluída ainda." />
          ) : (
            concluidas.map((r) => (
              <View key={r.id} style={estilos.cartao}>
                <Text style={estilos.nome}>{r.aluno.nome}</Text>
                <Text style={estilos.sub}>{r.dataProposta} · lecionada por {r.professor.nome}</Text>
                <Badge texto="Concluída" tom="sucesso" />
              </View>
            ))
          )}
        </SectionCard>
      </View>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  colunas: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cartao: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 4 },
  nome: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  sub: { fontSize: 12, color: ERP.textoSecundario },
});
