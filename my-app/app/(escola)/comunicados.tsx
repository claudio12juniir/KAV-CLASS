import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, SectionCard, Tabela } from './_ui';

export default function ComunicadosEscola() {
  const [carregando, setCarregando] = useState(true);
  const [comunicados, setComunicados] = useState<any[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [corpo, setCorpo] = useState('');
  const [publico, setPublico] = useState<'ALUNOS' | 'PROFESSORES' | 'TODOS'>('ALUNOS');
  const [salvando, setSalvando] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/comunicados`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setComunicados(await res.json());
    } catch (err) {
      console.error('Erro ao carregar Comunicados:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const limparForm = () => { setEditandoId(null); setTitulo(''); setCorpo(''); setPublico('ALUNOS'); };
  const abrirNovo = () => { limparForm(); setModalAberto(true); };
  const abrirEdicao = (c: any) => { setEditandoId(c.id); setTitulo(c.titulo); setCorpo(c.corpo); setPublico(c.publico); setModalAberto(true); };

  const salvar = async () => {
    if (!titulo.trim() || !corpo.trim()) {
      Alert.alert('Atenção', 'Preencha título e texto do comunicado.');
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const url = editandoId ? `${BASE_URL}/api/comunicados/${editandoId}` : `${BASE_URL}/api/comunicados`;
      const res = await fetchComRetry(url, {
        method: editandoId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), corpo: corpo.trim(), publico }),
      });
      const dados = await res.json();
      if (res.ok) { setModalAberto(false); limparForm(); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/comunicados/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível apagar.');
  };

  const duplicar = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/comunicados/${id}/duplicar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível duplicar.');
  };

  const enviarConfirmado = async (id: string) => {
    setEnviandoId(id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/comunicados/${id}/enviar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Enviado!', dados.mensagem); carregarDados(); }
      else Alert.alert('Não foi possível enviar', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoId(null);
    }
  };

  const confirmarEnvio = (id: string, pub: string) => {
    Alert.alert('Enviar comunicado?',
      `Isso envia o e-mail pra ${pub === 'TODOS' ? 'todos os alunos e professores' : pub === 'ALUNOS' ? 'todos os alunos' : 'todos os professores'} da escola. Depois de enviado, não dá pra desfazer.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Enviar', style: 'destructive', onPress: () => enviarConfirmado(id) }]);
  };

  const rotuloPublico = (p: string) => p === 'ALUNOS' ? 'Alunos' : p === 'PROFESSORES' ? 'Professores' : 'Todos';

  if (carregando) {
    return <ErpShell titulo="Comunicados"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Comunicados" acao={<Botao texto="Novo comunicado" icone="add" onPress={abrirNovo} />}>
      <Text style={estilos.titulo}>Comunicados</Text>
      <Text style={estilos.subtitulo}>Broadcast por e-mail pra escola toda. Rascunho edita/apaga livre — depois de enviado, não dá pra desfazer</Text>

      <SectionCard>
        {comunicados.length === 0 ? (
          <EstadoVazio icone="mail-outline" texto="Nenhum comunicado ainda." />
        ) : (
          <Tabela
            vazioTexto=""
            dados={comunicados}
            colunas={[
              { chave: 'titulo', titulo: 'Comunicado', flex: 4, render: (c: any) => (
                <TouchableOpacity onPress={() => c.status === 'RASCUNHO' && abrirEdicao(c)}>
                  <Text style={estilos.linhaTitulo}>{c.titulo}</Text>
                  <Text style={estilos.linhaSub} numberOfLines={1}>{c.corpo}</Text>
                </TouchableOpacity>
              )},
              { chave: 'publico', titulo: 'Público', flex: 2, render: (c: any) => <Text style={estilos.linhaSub}>{rotuloPublico(c.publico)}</Text> },
              { chave: 'status', titulo: 'Status', flex: 2, render: (c: any) => <Badge texto={c.status === 'ENVIADO' ? 'Enviado' : 'Rascunho'} tom={c.status === 'ENVIADO' ? 'sucesso' : 'default'} /> },
              { chave: 'acoes', titulo: '', flex: 3, alinhar: 'right', render: (c: any) => (
                <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'flex-end' }}>
                  {c.status === 'RASCUNHO' ? (
                    <>
                      <TouchableOpacity onPress={() => apagar(c.id)}><Text style={[estilos.link, { color: ERP.perigo }]}>Apagar</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmarEnvio(c.id, c.publico)} disabled={enviandoId === c.id}>
                        {enviandoId === c.id ? <SyncLoader color={ERP.texto} /> : <Text style={[estilos.link, { color: ERP.info, fontWeight: '800' }]}>Enviar</Text>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => duplicar(c.id)}><Text style={estilos.link}>Duplicar</Text></TouchableOpacity>
                  )}
                </View>
              )},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={modalAberto} titulo={editandoId ? 'Editar comunicado' : 'Novo comunicado'} onFechar={() => setModalAberto(false)} largura={520}>
        <Campo label="Título" value={titulo} onChangeText={setTitulo} placeholder="Título do comunicado" />
        <Text style={estilos.campoLabel}>Texto</Text>
        <TextInput
          style={estilos.textarea} value={corpo} onChangeText={setCorpo} multiline
          placeholder="Texto do comunicado" placeholderTextColor={ERP.textoMuted}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>
          {(['ALUNOS', 'PROFESSORES', 'TODOS'] as const).map((p) => (
            <Botao key={p} texto={rotuloPublico(p)} variante={publico === p ? 'primario' : 'secundario'} onPress={() => setPublico(p)} />
          ))}
        </View>
        <Botao texto={editandoId ? 'Salvar alterações' : 'Salvar rascunho'} onPress={salvar} carregando={salvando} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13, color: ERP.textoSecundario, marginTop: 3, marginBottom: 20 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '600', color: ERP.textoSecundario },
  campoLabel: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 6 },
  textarea: {
    minHeight: 110, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: 8,
    paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, color: ERP.texto,
    backgroundColor: ERP.superficie, textAlignVertical: 'top',
  },
});
