import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard, Tabela } from './_ui';

type Tipo = 'FERIADO' | 'RECESSO' | 'PALESTRA' | 'PASSEIO' | 'FESTIVAL' | 'APRESENTACAO' | 'FERIAS';

const TIPOS: { chave: Tipo; rotulo: string; tom: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }[] = [
  { chave: 'FERIADO', rotulo: 'Feriado', tom: 'info' },
  { chave: 'RECESSO', rotulo: 'Recesso', tom: 'default' },
  { chave: 'FERIAS', rotulo: 'Férias', tom: 'default' },
  { chave: 'PALESTRA', rotulo: 'Palestra', tom: 'aviso' },
  { chave: 'PASSEIO', rotulo: 'Passeio', tom: 'aviso' },
  { chave: 'FESTIVAL', rotulo: 'Festival', tom: 'sucesso' },
  { chave: 'APRESENTACAO', rotulo: 'Apresentação', tom: 'sucesso' },
];

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={onPress}>
      <Text style={[estilos.chipTexto, ativo && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Cronograma, ex-Calendário (INSTITUTION Sprint 10, briefing 08/09/2026):
// evento com intervalo de datas (dataFim) e cursos afetados (cursosIds) —
// bloqueia agenda dos cursos selecionados no intervalo, sem contar falta.
export default function CronogramaEscola() {
  const [carregando, setCarregando] = useState(true);
  const [eventos, setEventos] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [data, setData] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<Tipo>('FERIADO');
  const [cursosSelecionados, setCursosSelecionados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resEventos, resCursos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/calendario`, { headers }),
        fetchComRetry(`${BASE_URL}/api/cursos`, { headers }),
      ]);
      if (resEventos.ok) setEventos(await resEventos.json());
      if (resCursos.ok) setCursos(await resCursos.json());
    } catch (err) {
      console.error('Erro ao carregar Cronograma:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const abrirModal = () => {
    setData(''); setDataFim(''); setDescricao(''); setTipo('FERIADO'); setCursosSelecionados([]);
    setModalAberto(true);
  };

  const alternarCurso = (id: string) => {
    setCursosSelecionados((atual) => atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id]);
  };

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
        body: JSON.stringify({
          data: data.trim(), dataFim: dataFim.trim() || undefined, descricao: descricao.trim(), tipo,
          cursosIds: cursosSelecionados.length > 0 ? cursosSelecionados : undefined,
        }),
      });
      const dados = await res.json();
      if (res.ok) { setModalAberto(false); carregarDados(); }
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
    return <ErpShell titulo="Cronograma"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Cronograma" acao={<Botao texto="Novo evento" icone="add" onPress={abrirModal} />}>
      <PageHeader
        titulo="Cronograma da instituição"
        subtitulo="Feriados, recessos, férias e eventos — bloqueiam automaticamente a agenda dos cursos afetados, sem contar falta"
      />

      <SectionCard>
        {eventos.length === 0 ? (
          <EstadoVazio icone="calendar-outline" texto="Nenhum evento cadastrado." />
        ) : (
          <Tabela
            vazioTexto=""
            dados={eventos}
            colunas={[
              { chave: 'data', titulo: 'Data', flex: 2, render: (d: any) => (
                <Text style={estilos.linhaTitulo}>
                  {new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  {d.dataFim ? ` – ${new Date(d.dataFim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}
                </Text>
              )},
              { chave: 'tipo', titulo: 'Tipo', flex: 2, render: (d: any) => {
                const t = TIPOS.find((x) => x.chave === d.tipo) || TIPOS[0];
                return <Badge texto={t.rotulo} tom={t.tom} />;
              }},
              { chave: 'descricao', titulo: 'Descrição', flex: 3 },
              { chave: 'cursos', titulo: 'Cursos', flex: 2, render: (d: any) => (
                <Text style={estilos.linhaSub}>{d.cursos?.length ? d.cursos.map((c: any) => c.curso.nome).join(', ') : 'Escola inteira'}</Text>
              )},
              { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (d: any) => (
                <TouchableOpacity onPress={() => remover(d.id)}><Ionicons name="trash-outline" size={18} color={ERP.perigo} /></TouchableOpacity>
              )},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={modalAberto} titulo="Novo evento" onFechar={() => setModalAberto(false)}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Campo label="Data início" value={data} onChangeText={setData} placeholder="2026-12-25" /></View>
          <View style={{ flex: 1 }}><Campo label="Data fim (opcional)" value={dataFim} onChangeText={setDataFim} placeholder="Se for só 1 dia, deixe vazio" /></View>
        </View>
        <Campo label="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Ex: Festival de fim de ano" />

        <Text style={estilos.label}>Tipo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TIPOS.map((t) => <Chip key={t.chave} label={t.rotulo} ativo={tipo === t.chave} onPress={() => setTipo(t.chave)} />)}
          </View>
        </ScrollView>

        <Text style={estilos.label}>Cursos afetados (nenhum selecionado = escola inteira)</Text>
        {cursos.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: ERP.textoMuted, marginBottom: 16 }}>Nenhum curso cadastrado ainda.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {cursos.map((c: any) => <Chip key={c.id} label={c.nome} ativo={cursosSelecionados.includes(c.id)} onPress={() => alternarCurso(c.id)} />)}
            </View>
          </ScrollView>
        )}

        <Botao texto="Adicionar ao cronograma" onPress={adicionar} carregando={salvando} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario },
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
