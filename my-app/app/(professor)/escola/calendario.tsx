import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { BASE_URL, fetchComRetry } from '../../api';
import { useEscolaContexto } from './_contexto';
import { estilosConteudo as estilos } from './_estilos';

export default function CalendarioEscola() {
  const { podeGerenciar } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [diasNaoLetivos, setDiasNaoLetivos] = useState<any[]>([]);
  const [novaDataFeriado, setNovaDataFeriado] = useState('');
  const [novaDescricaoFeriado, setNovaDescricaoFeriado] = useState('');
  const [novoTipoFeriado, setNovoTipoFeriado] = useState<'FERIADO' | 'RECESSO'>('FERIADO');
  const [salvandoFeriado, setSalvandoFeriado] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetchComRetry(`${BASE_URL}/api/escola/calendario`, { headers });
      if (res.ok) setDiasNaoLetivos(await res.json());
    } catch (err) {
      console.error('Erro ao carregar Calendário da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const adicionarDiaNaoLetivo = async () => {
    const dataNorm = novaDataFeriado.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNorm) || !novaDescricaoFeriado.trim()) {
      Alert.alert('Atenção', 'Informe a data (AAAA-MM-DD) e uma descrição.');
      return;
    }
    setSalvandoFeriado(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/calendario`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataNorm, descricao: novaDescricaoFeriado.trim(), tipo: novoTipoFeriado }),
      });
      const dados = await res.json();
      if (res.ok) {
        setNovaDataFeriado('');
        setNovaDescricaoFeriado('');
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível adicionar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoFeriado(false);
    }
  };

  const removerDiaNaoLetivo = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/calendario/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível remover.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
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
        <Text style={estilos.subTitulo}>Calendário</Text>
        <Text style={estilos.subtitulo}>
          Feriados e recessos bloqueiam automaticamente o agendamento de aula avulsa nesse dia.
        </Text>
      </View>

      {podeGerenciar && (
        <View style={estilos.cardForm}>
          <TextInput
            style={estilos.input}
            placeholder="AAAA-MM-DD"
            placeholderTextColor="#aaa"
            value={novaDataFeriado}
            onChangeText={setNovaDataFeriado}
          />
          <TextInput
            style={estilos.input}
            placeholder="Descrição (ex: Feriado municipal)"
            placeholderTextColor="#aaa"
            value={novaDescricaoFeriado}
            onChangeText={setNovaDescricaoFeriado}
          />
          <View style={estilos.papelRow}>
            {(['FERIADO', 'RECESSO'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[estilos.chipPapel, novoTipoFeriado === t && estilos.chipPapelAtivo]}
                onPress={() => setNovoTipoFeriado(t)}
              >
                <Text style={[estilos.textoChip, novoTipoFeriado === t && { color: '#fff' }]}>
                  {t === 'FERIADO' ? 'Feriado' : 'Recesso'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[estilos.botaoPrimario, salvandoFeriado && { opacity: 0.6 }]}
            onPress={adicionarDiaNaoLetivo}
            disabled={salvandoFeriado}
          >
            {salvandoFeriado ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>Adicionar ao calendário</Text>}
          </TouchableOpacity>
        </View>
      )}

      <View style={estilos.secaoLista}>
        {diasNaoLetivos.length === 0 ? (
          <Text style={estilos.textoVazio}>Nenhum feriado ou recesso cadastrado.</Text>
        ) : (
          diasNaoLetivos.map((d) => (
            <View key={d.id} style={estilos.cardReposicao}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomePessoa}>
                  {new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} · {d.tipo === 'FERIADO' ? 'Feriado' : 'Recesso'}
                </Text>
                <Text style={estilos.emailPessoa}>{d.descricao}</Text>
              </View>
              {podeGerenciar && (
                <TouchableOpacity style={estilos.botaoIcone} onPress={() => removerDiaNaoLetivo(d.id)}>
                  <Ionicons name="trash-outline" size={18} color="#B00020" />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
