import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { BASE_URL, fetchComRetry } from '../../api';
import { estilosConteudo as estilos } from './_estilos';

export default function ComunicadosEscola() {
  const [carregando, setCarregando] = useState(true);
  const [comunicados, setComunicados] = useState<any[]>([]);
  const [editandoComunicadoId, setEditandoComunicadoId] = useState<string | null>(null);
  const [tituloComunicado, setTituloComunicado] = useState('');
  const [corpoComunicado, setCorpoComunicado] = useState('');
  const [publicoComunicado, setPublicoComunicado] = useState<'ALUNOS' | 'PROFESSORES' | 'TODOS'>('ALUNOS');
  const [salvandoComunicado, setSalvandoComunicado] = useState(false);
  const [enviandoComunicadoId, setEnviandoComunicadoId] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetchComRetry(`${BASE_URL}/api/comunicados`, { headers });
      if (res.ok) setComunicados(await res.json());
    } catch (err) {
      console.error('Erro ao carregar Comunicados:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const limparFormComunicado = () => {
    setEditandoComunicadoId(null);
    setTituloComunicado('');
    setCorpoComunicado('');
    setPublicoComunicado('ALUNOS');
  };

  const editarComunicado = (c: any) => {
    setEditandoComunicadoId(c.id);
    setTituloComunicado(c.titulo);
    setCorpoComunicado(c.corpo);
    setPublicoComunicado(c.publico);
  };

  const salvarComunicado = async () => {
    if (!tituloComunicado.trim() || !corpoComunicado.trim()) {
      Alert.alert('Atenção', 'Preencha título e texto do comunicado.');
      return;
    }
    setSalvandoComunicado(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const url = editandoComunicadoId ? `${BASE_URL}/api/comunicados/${editandoComunicadoId}` : `${BASE_URL}/api/comunicados`;
      const res = await fetchComRetry(url, {
        method: editandoComunicadoId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: tituloComunicado.trim(), corpo: corpoComunicado.trim(), publico: publicoComunicado }),
      });
      const dados = await res.json();
      if (res.ok) {
        limparFormComunicado();
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível salvar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoComunicado(false);
    }
  };

  const apagarComunicado = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/comunicados/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (editandoComunicadoId === id) limparFormComunicado();
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível apagar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const duplicarComunicado = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/comunicados/${id}/duplicar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível duplicar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const enviarComunicadoConfirmado = async (id: string) => {
    setEnviandoComunicadoId(id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/comunicados/${id}/enviar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Enviado!', dados.mensagem);
        carregarDados();
      } else {
        Alert.alert('Não foi possível enviar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoComunicadoId(null);
    }
  };

  const confirmarEnvioComunicado = (id: string, publico: string) => {
    Alert.alert(
      'Enviar comunicado?',
      `Isso envia o e-mail pra ${publico === 'TODOS' ? 'todos os alunos e professores' : publico === 'ALUNOS' ? 'todos os alunos' : 'todos os professores'} da escola. Depois de enviado, não dá pra desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', style: 'destructive', onPress: () => enviarComunicadoConfirmado(id) },
      ]
    );
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
        <Text style={estilos.subTitulo}>Comunicados</Text>
        <Text style={estilos.subtitulo}>
          Broadcast por e-mail pra escola toda. Rascunho edita/apaga livre — depois de enviado, não dá pra desfazer.
        </Text>
      </View>

      <View style={estilos.cardForm}>
        <TextInput
          style={estilos.input}
          placeholder="Título"
          placeholderTextColor="#aaa"
          value={tituloComunicado}
          onChangeText={setTituloComunicado}
        />
        <TextInput
          style={[estilos.input, { height: 90, paddingTop: 12, textAlignVertical: 'top' }]}
          placeholder="Texto do comunicado"
          placeholderTextColor="#aaa"
          value={corpoComunicado}
          onChangeText={setCorpoComunicado}
          multiline
        />
        <View style={estilos.papelRow}>
          {(['ALUNOS', 'PROFESSORES', 'TODOS'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[estilos.chipPapel, publicoComunicado === p && estilos.chipPapelAtivo]}
              onPress={() => setPublicoComunicado(p)}
            >
              <Text style={[estilos.textoChip, publicoComunicado === p && { color: '#fff' }]}>
                {p === 'ALUNOS' ? 'Alunos' : p === 'PROFESSORES' ? 'Professores' : 'Todos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {editandoComunicadoId && (
            <TouchableOpacity style={[estilos.botaoPrimario, { flex: 1, backgroundColor: '#888' }]} onPress={limparFormComunicado}>
              <Text style={estilos.botaoPrimarioTexto}>Cancelar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[estilos.botaoPrimario, { flex: 1 }, salvandoComunicado && { opacity: 0.6 }]}
            onPress={salvarComunicado}
            disabled={salvandoComunicado}
          >
            {salvandoComunicado ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>{editandoComunicadoId ? 'Salvar alterações' : 'Salvar rascunho'}</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={estilos.secaoLista}>
        {comunicados.length === 0 ? (
          <Text style={estilos.textoVazio}>Nenhum comunicado ainda.</Text>
        ) : (
          comunicados.map((c) => (
            <View key={c.id} style={estilos.cardComunicado}>
              <View style={estilos.linhaTituloFunil}>
                <Text style={estilos.nomePessoa}>{c.titulo}</Text>
                <View style={[estilos.badgeStatus, c.status === 'ENVIADO' && estilos.badgeStatusEnviado]}>
                  <Text style={estilos.badgeStatusTexto}>{c.status === 'ENVIADO' ? 'Enviado' : 'Rascunho'}</Text>
                </View>
              </View>
              <Text style={estilos.emailPessoa} numberOfLines={2}>{c.corpo}</Text>
              <Text style={[estilos.emailPessoa, { marginTop: 4 }]}>
                {c.publico === 'ALUNOS' ? 'Alunos' : c.publico === 'PROFESSORES' ? 'Professores' : 'Todos'} · {c.autor?.nome}
              </Text>
              <View style={estilos.acoesComunicado}>
                {c.status === 'RASCUNHO' ? (
                  <>
                    <TouchableOpacity onPress={() => editarComunicado(c)}>
                      <Text style={estilos.linkAcao}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => apagarComunicado(c.id)}>
                      <Text style={[estilos.linkAcao, { color: '#B00020' }]}>Apagar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmarEnvioComunicado(c.id, c.publico)}
                      disabled={enviandoComunicadoId === c.id}
                    >
                      {enviandoComunicadoId === c.id
                        ? <SyncLoader color="#000000" />
                        : <Text style={[estilos.linkAcao, { color: '#0D47A1', fontWeight: 'bold' }]}>Enviar</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => duplicarComunicado(c.id)}>
                    <Text style={estilos.linkAcao}>Duplicar pra reenviar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
