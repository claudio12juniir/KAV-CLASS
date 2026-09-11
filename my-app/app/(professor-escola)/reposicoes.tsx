// Reposição de aula — lado professor INSTITUTION. Mirror de
// (professor)/reposicoes.tsx (mesmo padrão de DateTimePicker iOS/Android,
// já testado no SELF), em estilo ERP. Duas máquinas de estado convivem no
// mesmo model Reposicao/StatusReposicao (distinguidas por `origem`):
// PROFESSOR propõe (AGUARDANDO → CONFIRMADA/SOLICITANDO_OUTRO) e ALUNO
// solicita (SOLICITADA → AUTORIZADA/NEGADA → FINALIZADA pela Escola).
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Botao, Campo, EstadoVazio, Modal, PageHeader, SectionCard, Tabela } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

type Reposicao = {
  id: string; dataOriginal: string | null; dataProposta: string; motivo: string;
  status: string; origem: 'PROFESSOR' | 'ALUNO';
  aluno?: { nome: string };
};
type Aluno = { id: string; nome: string };

const STATUS_CFG: Record<string, { tom: 'sucesso' | 'alerta' | 'aviso' | 'info'; label: string }> = {
  AGUARDANDO: { tom: 'aviso', label: 'Aguardando aluno' },
  CONFIRMADA: { tom: 'sucesso', label: 'Confirmada' },
  SOLICITANDO_OUTRO: { tom: 'alerta', label: 'Aluno pediu outro horário' },
  SOLICITADA: { tom: 'aviso', label: 'Pedido do aluno' },
  AUTORIZADA: { tom: 'sucesso', label: 'Autorizada' },
  NEGADA: { tom: 'alerta', label: 'Negada' },
  FINALIZADA: { tom: 'info', label: 'Finalizada' },
};

function formatarData(valor: string) {
  const d = new Date(valor);
  if (isNaN(d.getTime())) return valor;
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ReposicoesProfessorEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useProfessorEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);

  // null = fechado; 'novo' = propor reposição nova; qualquer outro valor = id
  // da reposição que está recebendo uma nova data proposta.
  const [modalAberto, setModalAberto] = useState<'novo' | string | null>(null);
  const [alunoIdSelecionado, setAlunoIdSelecionado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [dataSelecionada, setDataSelecionada] = useState(new Date());
  const [mostrarPickerData, setMostrarPickerData] = useState(false);
  const [mostrarPickerHora, setMostrarPickerHora] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resAlunos, resRepos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/meus-alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/professor/reposicoes`, { headers }),
      ]);
      if (resAlunos.ok) setAlunos(await resAlunos.json());
      if (resRepos.ok) setReposicoes(await resRepos.json());
    } catch {
      // sem conexão — usuário pode reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => {
    setAlunoIdSelecionado(null);
    setMotivo('');
    setDataSelecionada(new Date());
    setModalAberto('novo');
  };

  const abrirNovaData = (reposicaoId: string) => {
    setMotivo('');
    setDataSelecionada(new Date());
    setModalAberto(reposicaoId);
  };

  const confirmar = async () => {
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      if (modalAberto === 'novo') {
        if (!alunoIdSelecionado || !motivo.trim()) { Alert.alert('Atenção', 'Selecione um aluno e preencha o motivo.'); setEnviando(false); return; }
        const res = await fetchComRetry(`${BASE_URL}/api/reposicoes`, {
          method: 'POST', headers,
          body: JSON.stringify({ alunoId: alunoIdSelecionado, dataProposta: dataSelecionada.toISOString(), motivo: motivo.trim() }),
        });
        const dados = await res.json();
        if (!res.ok) { Alert.alert('Erro', dados.erro || 'Não foi possível propor a reposição.'); setEnviando(false); return; }
        Alert.alert('Enviado!', 'Reposição proposta ao aluno.');
      } else if (modalAberto) {
        const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${modalAberto}/nova-data`, {
          method: 'PUT', headers,
          body: JSON.stringify({ dataProposta: dataSelecionada.toISOString() }),
        });
        const dados = await res.json();
        if (!res.ok) { Alert.alert('Erro', dados.erro || 'Não foi possível propor nova data.'); setEnviando(false); return; }
        Alert.alert('Enviado!', 'Nova data proposta ao aluno.');
      }
      setModalAberto(null);
      carregar();
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const responderPedido = async (id: string, acao: 'aprovar' | 'negar') => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${id}/${acao}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert(acao === 'aprovar' ? 'Autorizado!' : 'Negado', dados.mensagem); carregar(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível processar o pedido.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const pedidosDeAlunos = reposicoes.filter((r) => r.origem === 'ALUNO' && r.status === 'SOLICITADA');

  const aoMudarDataIOS = (_e: any, d?: Date) => { if (d) setDataSelecionada(d); };
  const aoMudarDataAndroid = (_e: any, d?: Date) => {
    if (d) { const n = new Date(dataSelecionada); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setDataSelecionada(n); }
  };
  const aoMudarHoraAndroid = (_e: any, d?: Date) => {
    if (d) { const n = new Date(dataSelecionada); n.setHours(d.getHours(), d.getMinutes()); setDataSelecionada(n); }
  };

  return (
    <MobileErpShell
      titulo="Reposições"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Reposições" subtitulo="Proponha reposições e responda pedidos dos alunos" />

      <View style={{ marginBottom: 16 }}>
        <Botao texto="Propor reposição" icone="add-circle-outline" onPress={abrirNovo} />
      </View>

      {pedidosDeAlunos.length > 0 && (
        <SectionCard titulo="Pedidos de alunos">
          {pedidosDeAlunos.map((r) => (
            <View key={r.id} style={estilos.linhaPedido}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomeAluno}>{r.aluno?.nome || 'Aluno'}</Text>
                <Text style={estilos.detalhe}>{formatarData(r.dataProposta)} · {r.motivo}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao texto="Negar" variante="secundario" onPress={() => responderPedido(r.id, 'negar')} />
                <Botao texto="Autorizar" onPress={() => responderPedido(r.id, 'aprovar')} />
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      <SectionCard titulo="Todas as solicitações">
        {reposicoes.length === 0 ? (
          <EstadoVazio icone="swap-horizontal-outline" texto="Nenhuma reposição registrada ainda." />
        ) : (
          <Tabela
            vazioTexto=""
            dados={reposicoes}
            colunas={[
              { chave: 'aluno', titulo: 'Aluno', flex: 2, render: (r: Reposicao) => (
                <View>
                  <Text style={estilos.nomeAluno}>{r.aluno?.nome || 'Aluno'}</Text>
                  <Text style={estilos.detalhe}>{formatarData(r.dataProposta)} · {r.motivo}</Text>
                </View>
              )},
              { chave: 'status', titulo: 'Status', flex: 1, render: (r: Reposicao) => (
                <Badge texto={STATUS_CFG[r.status]?.label || r.status} tom={STATUS_CFG[r.status]?.tom || 'default'} />
              )},
              { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (r: Reposicao) => (
                r.status === 'SOLICITANDO_OUTRO'
                  ? <Botao texto="Propor nova data" variante="secundario" onPress={() => abrirNovaData(r.id)} />
                  : null
              )},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={!!modalAberto} titulo={modalAberto === 'novo' ? 'Propor reposição' : 'Propor nova data'} onFechar={() => setModalAberto(null)}>
        {modalAberto === 'novo' && (
          <>
            <Text style={estilos.label}>Para qual aluno?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {alunos.length === 0 ? (
                  <Text style={estilos.detalhe}>Nenhum aluno cadastrado.</Text>
                ) : (
                  alunos.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[estilos.chip, alunoIdSelecionado === a.id && estilos.chipAtivo]}
                      onPress={() => setAlunoIdSelecionado(a.id)}
                    >
                      <Text style={[estilos.chipTexto, alunoIdSelecionado === a.id && { color: '#fff' }]}>{a.nome}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </ScrollView>
          </>
        )}

        <Text style={estilos.label}>Data e horário proposto</Text>
        <TouchableOpacity style={estilos.botaoData} onPress={() => setMostrarPickerData(true)}>
          <Ionicons name="calendar-outline" size={18} color={ERP.textoSecundario} />
          <Text style={estilos.textoData}>
            {dataSelecionada.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} às {dataSelecionada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && mostrarPickerData && (
          <View style={estilos.roleta}>
            <DateTimePicker value={dataSelecionada} mode="datetime" display="spinner" onChange={aoMudarDataIOS} locale="pt-BR" />
            <Botao texto="Confirmar horário" variante="secundario" onPress={() => setMostrarPickerData(false)} />
          </View>
        )}
        {Platform.OS === 'android' && mostrarPickerData && (
          <View style={estilos.roleta}>
            <DateTimePicker value={dataSelecionada} mode="date" display="spinner" onChange={aoMudarDataAndroid} />
            <Botao texto="Próximo" variante="secundario" onPress={() => { setMostrarPickerData(false); setMostrarPickerHora(true); }} />
          </View>
        )}
        {Platform.OS === 'android' && mostrarPickerHora && (
          <View style={estilos.roleta}>
            <DateTimePicker value={dataSelecionada} mode="time" display="spinner" onChange={aoMudarHoraAndroid} is24Hour />
            <Botao texto="Confirmar horário" variante="secundario" onPress={() => setMostrarPickerHora(false)} />
          </View>
        )}

        {modalAberto === 'novo' && (
          <Campo label="Motivo" placeholder="Ex: feriado, imprevisto" value={motivo} onChangeText={setMotivo} multiline />
        )}

        <View style={{ marginTop: 8 }}>
          <Botao texto="Enviar" onPress={confirmar} carregando={enviando} />
        </View>
      </Modal>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  linhaPedido: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 12,
  },
  nomeAluno: { fontSize: 14, fontWeight: '700', color: ERP.texto },
  detalhe: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.texto, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: ERP.bordaForte, backgroundColor: ERP.superficie,
  },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.texto },
  botaoData: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: ERP.raio.sm, borderWidth: 1, borderColor: ERP.bordaForte, marginBottom: 14,
  },
  textoData: { fontSize: 13.5, color: ERP.texto, fontWeight: '600' },
  roleta: { marginBottom: 14, alignItems: 'center' },
});
