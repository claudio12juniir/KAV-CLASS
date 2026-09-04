import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, SectionCard, Tabela } from './_ui';

export default function CalendarioEscola() {
  const [carregando, setCarregando] = useState(true);
  const [diasNaoLetivos, setDiasNaoLetivos] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<'FERIADO' | 'RECESSO'>('FERIADO');
  const [salvando, setSalvando] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/calendario`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDiasNaoLetivos(await res.json());
    } catch (err) {
      console.error('Erro ao carregar Calendário:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const adicionar = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.trim()) || !descricao.trim()) {
      Alert.alert('Atenção', 'Informe a data (AAAA-MM-DD) e uma descrição.');
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/calendario`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data.trim(), descricao: descricao.trim(), tipo }),
      });
      const dados = await res.json();
      if (res.ok) { setModalAberto(false); setData(''); setDescricao(''); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível adicionar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/calendario/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível remover.');
  };

  if (carregando) {
    return <ErpShell titulo="Calendário"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Calendário" acao={<Botao texto="Novo dia" icone="add" onPress={() => setModalAberto(true)} />}>
      <Text style={estilos.titulo}>Calendário letivo</Text>
      <Text style={estilos.subtitulo}>Feriados e recessos bloqueiam automaticamente o agendamento de aula avulsa nesse dia</Text>

      <SectionCard>
        {diasNaoLetivos.length === 0 ? (
          <EstadoVazio icone="calendar-outline" texto="Nenhum feriado ou recesso cadastrado." />
        ) : (
          <Tabela
            vazioTexto=""
            dados={diasNaoLetivos}
            colunas={[
              { chave: 'data', titulo: 'Data', flex: 2, render: (d: any) => (
                <Text style={estilos.linhaTitulo}>{new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</Text>
              )},
              { chave: 'tipo', titulo: 'Tipo', flex: 2, render: (d: any) => <Badge texto={d.tipo === 'FERIADO' ? 'Feriado' : 'Recesso'} tom={d.tipo === 'FERIADO' ? 'info' : 'default'} /> },
              { chave: 'descricao', titulo: 'Descrição', flex: 4 },
              { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (d: any) => (
                <TouchableOpacity onPress={() => remover(d.id)}><Ionicons name="trash-outline" size={18} color={ERP.perigo} /></TouchableOpacity>
              )},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={modalAberto} titulo="Adicionar dia não letivo" onFechar={() => setModalAberto(false)}>
        <Campo label="Data (AAAA-MM-DD)" value={data} onChangeText={setData} placeholder="2026-12-25" />
        <Campo label="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Ex: Feriado municipal" />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {(['FERIADO', 'RECESSO'] as const).map((t) => (
            <Botao key={t} texto={t === 'FERIADO' ? 'Feriado' : 'Recesso'} variante={tipo === t ? 'primario' : 'secundario'} onPress={() => setTipo(t)} />
          ))}
        </View>
        <Botao texto="Adicionar ao calendário" onPress={adicionar} carregando={salvando} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13, color: ERP.textoSecundario, marginTop: 3, marginBottom: 20 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
});
