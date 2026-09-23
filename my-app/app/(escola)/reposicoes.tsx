import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, EstadoVazio, ErpShell, Modal, PageHeader, SectionCard, useEhDesktop } from './_ui';

type Reposicao = {
  id: string;
  aluno: { nome: string };
  professor: { nome: string };
  dataOriginal: string | null;
  dataProposta: string | null;
  motivo: string;
  status: string;
  origem: 'PROFESSOR' | 'ALUNO' | 'ESCOLA';
  createdAt: string;
  aulaOriginal: { id: string; dataHora: string } | null;
  aulaReposicao: { id: string; dataHora: string; professor: { nome: string } } | null;
};

const STATUS_LABEL: Record<string, string> = {
  AGUARDANDO: 'Aguardando aluno confirmar',
  SOLICITANDO_OUTRO: 'Aluno pediu outra data',
  SOLICITADA: 'Aguardando professor aprovar',
  PENDENTE_AGENDAMENTO: 'Falta registrada — sem data ainda',
  CONFIRMADA: 'Confirmada pelo aluno',
  AUTORIZADA: 'Autorizada pelo professor',
  AGENDADA: 'Agendada pela escola',
};

function horaCurta(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Quadro de 3 colunas pra reposição de aula (INSTITUTION Sprint 15, briefing
// 22/09/2026; motor automático no Sprint 20, briefing 23/09/2026). Junta os
// 3 fluxos que podem gerar uma reposição (professor propõe → aluno
// confirma; aluno pede → professor aprova → escola finaliza; ou a própria
// escola marca falta na Grade de hoje) numa visão única. "Agendar" cria uma
// Aula de reposição de verdade — a partir daí ela aparece em todo o resto
// do sistema (Grade de hoje, dashboard do aluno, folha de pagamento) e essa
// linha vira FINALIZADA sozinha quando a aula acontecer.
export default function ReposicoesEscola() {
  const ehDesktop = useEhDesktop();
  const [carregando, setCarregando] = useState(true);
  const [paraRepor, setParaRepor] = useState<Reposicao[]>([]);
  const [agendadas, setAgendadas] = useState<Reposicao[]>([]);
  const [concluidas, setConcluidas] = useState<Reposicao[]>([]);
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);

  const [agendando, setAgendando] = useState<Reposicao | null>(null);
  const [dataAgendar, setDataAgendar] = useState('');
  const [horaAgendar, setHoraAgendar] = useState('');
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);

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

  const abrirAgendar = (r: Reposicao) => {
    setAgendando(r);
    setDataAgendar('');
    setHoraAgendar('');
  };

  const confirmarAgendamento = async () => {
    if (!agendando || !dataAgendar.trim() || !horaAgendar.trim()) {
      Alert.alert('Atenção', 'Informe data e horário da reposição.');
      return;
    }
    setSalvandoAgendamento(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const dataHora = `${dataAgendar.trim()}T${horaAgendar.trim()}:00`;
      const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${agendando.id}/agendar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataHora }),
      });
      const dados = await res.json();
      if (res.ok) { setAgendando(null); carregar(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível agendar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoAgendamento(false);
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
      <PageHeader titulo="Reposições" subtitulo="Para repor, agendadas e concluídas — os 3 jeitos de nascer uma reposição (proposta do professor, pedido do aluno, ou falta marcada na Grade de hoje) numa visão só." />

      <View style={estilos.colunas}>
        <SectionCard titulo="Para repor" subtitulo={`${paraRepor.length} ${paraRepor.length === 1 ? 'pendente' : 'pendentes'}`} style={{ flex: 1, minWidth: ehDesktop ? 300 : undefined }}>
          {paraRepor.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nada pendente." />
          ) : (
            paraRepor.map((r) => (
              <View key={r.id} style={estilos.cartao}>
                <Text style={estilos.nome}>{r.aluno.nome} · com {r.professor.nome}</Text>
                <Text style={estilos.sub}>
                  {r.aulaOriginal ? `Faltou em ${horaCurta(r.aulaOriginal.dataHora)}` : r.dataProposta ? r.dataProposta : 'Sem data ainda'} — {r.motivo}
                </Text>
                <Badge texto={STATUS_LABEL[r.status] || r.status} tom="aviso" />
                <View style={{ marginTop: 8 }}>
                  <Botao texto="Agendar reposição" variante="secundario" onPress={() => abrirAgendar(r)} />
                </View>
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
                <Text style={estilos.nome}>{r.aluno.nome} · com {r.aulaReposicao?.professor.nome || r.professor.nome}</Text>
                <Text style={estilos.sub}>
                  {r.aulaReposicao ? horaCurta(r.aulaReposicao.dataHora) : r.dataProposta} — {r.motivo}
                </Text>
                <Badge texto={STATUS_LABEL[r.status] || r.status} tom="info" />
                {!r.aulaReposicao && (
                  <View style={{ marginTop: 8 }}>
                    <Botao texto="Marcar como concluída" variante="secundario" onPress={() => finalizar(r)} carregando={finalizandoId === r.id} />
                  </View>
                )}
                {r.aulaReposicao && (
                  <Text style={estilos.avisoAuto}>Fecha sozinha quando a aula acontecer.</Text>
                )}
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
                <Text style={estilos.sub}>
                  {r.aulaReposicao ? horaCurta(r.aulaReposicao.dataHora) : r.dataProposta} · lecionada por {r.aulaReposicao?.professor.nome || r.professor.nome}
                </Text>
                {r.aulaOriginal && <Text style={estilos.sub}>Repondo a aula de {horaCurta(r.aulaOriginal.dataHora)}</Text>}
                <Badge texto="Concluída" tom="sucesso" />
              </View>
            ))
          )}
        </SectionCard>
      </View>

      <Modal visivel={!!agendando} titulo={`Agendar reposição · ${agendando?.aluno.nome || ''}`} onFechar={() => setAgendando(null)}>
        <Text style={{ color: ERP.textoSecundario, fontSize: 12.5, marginBottom: 14 }}>
          Isso cria a aula de reposição de verdade — ela passa a aparecer na Grade de hoje e no app do aluno e do professor.
        </Text>
        <Campo label="Data (AAAA-MM-DD)" value={dataAgendar} onChangeText={setDataAgendar} placeholder="Ex: 2026-10-05" />
        <Campo label="Horário (HH:mm)" value={horaAgendar} onChangeText={setHoraAgendar} placeholder="Ex: 14:00" />
        <Botao texto="Agendar" onPress={confirmarAgendamento} carregando={salvandoAgendamento} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  colunas: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cartao: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 4 },
  nome: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  sub: { fontSize: 12, color: ERP.textoSecundario },
  avisoAuto: { fontSize: 11, color: ERP.textoMuted, fontStyle: 'italic', marginTop: 4 },
});
