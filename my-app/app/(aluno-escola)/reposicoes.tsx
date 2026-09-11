// Reposição de aula — lado aluno INSTITUTION. Mirror de
// (aluno)/reposicoes.tsx, em estilo ERP. Duas máquinas de estado convivem no
// mesmo model Reposicao/StatusReposicao (distinguidas por `origem`):
// PROFESSOR propõe (AGUARDANDO → o aluno confirma ou pede outro horário) e
// ALUNO solicita (SOLICITADA → AUTORIZADA/NEGADA pelo professor → FINALIZADA
// pela Escola).
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Botao, Campo, EstadoVazio, Modal, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

type Reposicao = {
  id: string; dataOriginal: string | null; dataProposta: string; motivo: string;
  status: string; origem: 'PROFESSOR' | 'ALUNO';
  professor?: { nome: string };
};

const STATUS_CFG: Record<string, { tom: 'sucesso' | 'alerta' | 'aviso' | 'info'; label: string }> = {
  SOLICITADA: { tom: 'aviso', label: 'Aguardando professor' },
  AUTORIZADA: { tom: 'sucesso', label: 'Autorizada' },
  NEGADA: { tom: 'alerta', label: 'Negada' },
  FINALIZADA: { tom: 'info', label: 'Finalizada' },
};

function formatarData(valor: string) {
  const d = new Date(valor);
  if (isNaN(d.getTime())) return valor;
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ReposicoesAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [dataSelecionada, setDataSelecionada] = useState(new Date());
  const [mostrarPickerData, setMostrarPickerData] = useState(false);
  const [mostrarPickerHora, setMostrarPickerHora] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/reposicoes`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setReposicoes(await res.json());
    } catch {
      // sem conexão — usuário pode reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => { carregar(); }, [carregar]);

  const abrirPedido = () => {
    setMotivo('');
    setDataSelecionada(new Date());
    setModalAberto(true);
  };

  const enviarPedido = async () => {
    if (!motivo.trim()) { Alert.alert('Atenção', 'Preencha o motivo.'); return; }
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/reposicoes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataProposta: dataSelecionada.toISOString(), motivo: motivo.trim() }),
      });
      const dados = await res.json();
      if (!res.ok) { Alert.alert('Erro', dados.erro || 'Não foi possível enviar o pedido.'); return; }
      Alert.alert('Enviado!', 'Pedido de reposição enviado ao professor.');
      setModalAberto(false);
      carregar();
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const responder = async (id: string, acao: 'confirmar' | 'solicitar-outro') => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${id}/${acao}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) carregar();
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível processar.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const aguardandoConfirmacao = reposicoes.filter((r) => r.origem === 'PROFESSOR' && r.status === 'AGUARDANDO');
  const meusPedidos = reposicoes.filter((r) => r.origem === 'ALUNO');
  const agendadas = reposicoes.filter((r) => r.status === 'CONFIRMADA');

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
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Reposições" subtitulo="Peça reposição ou responda propostas do professor" />

      <View style={{ marginBottom: 16 }}>
        <Botao texto="Pedir reposição" icone="add-circle-outline" onPress={abrirPedido} />
      </View>

      {aguardandoConfirmacao.length > 0 && (
        <SectionCard titulo="Aguardando sua confirmação">
          {aguardandoConfirmacao.map((r) => (
            <View key={r.id} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.professor}>Prof. {r.professor?.nome || 'Professor'}</Text>
                {r.dataOriginal && <Text style={estilos.dataOriginal}>{r.dataOriginal}</Text>}
                <Text style={estilos.detalhe}>{formatarData(r.dataProposta)} · {r.motivo}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao texto="Outro horário" variante="secundario" onPress={() => responder(r.id, 'solicitar-outro')} />
                <Botao texto="Confirmar" onPress={() => responder(r.id, 'confirmar')} />
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      <SectionCard titulo="Meus pedidos">
        {meusPedidos.length === 0 ? (
          <EstadoVazio icone="swap-horizontal-outline" texto="Nenhum pedido de reposição ainda." />
        ) : (
          meusPedidos.map((r) => (
            <View key={r.id} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.detalhe}>{formatarData(r.dataProposta)} · {r.motivo}</Text>
              </View>
              <Badge texto={STATUS_CFG[r.status]?.label || r.status} tom={STATUS_CFG[r.status]?.tom || 'default'} />
            </View>
          ))
        )}
      </SectionCard>

      {agendadas.length > 0 && (
        <SectionCard titulo="Reposições agendadas">
          {agendadas.map((r) => (
            <View key={r.id} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.professor}>Prof. {r.professor?.nome || 'Professor'}</Text>
                <Text style={estilos.detalhe}>{formatarData(r.dataProposta)}</Text>
              </View>
              <Badge texto="Confirmada" tom="sucesso" />
            </View>
          ))}
        </SectionCard>
      )}

      <Modal visivel={modalAberto} titulo="Pedir reposição" onFechar={() => setModalAberto(false)}>
        <Text style={estilos.label}>Data e horário desejado</Text>
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

        <Campo label="Motivo" placeholder="Ex: consulta médica, viagem" value={motivo} onChangeText={setMotivo} multiline />

        <View style={{ marginTop: 8 }}>
          <Botao texto="Enviar pedido" onPress={enviarPedido} carregando={enviando} />
        </View>
      </Modal>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 12,
  },
  professor: { fontSize: 14, fontWeight: '700', color: ERP.texto },
  dataOriginal: { fontSize: 12, color: ERP.textoMuted, textDecorationLine: 'line-through', marginTop: 2 },
  detalhe: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.texto, marginBottom: 8 },
  botaoData: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: ERP.raio.sm, borderWidth: 1, borderColor: ERP.bordaForte, marginBottom: 14,
  },
  textoData: { fontSize: 13.5, color: ERP.texto, fontWeight: '600' },
  roleta: { marginBottom: 14, alignItems: 'center' },
});
