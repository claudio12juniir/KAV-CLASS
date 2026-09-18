import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CORES } from '../../constants/theme';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatAlunoScreen() {
  const [aba, setAba] = useState<'conversa' | 'mural'>('conversa');

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>MENSAGENS</Text>
          <Text style={styles.headerSub}>Fale com o seu professor</Text>
        </View>
      </View>

      <View style={styles.abas}>
        <TouchableOpacity style={[styles.aba, aba === 'conversa' && styles.abaAtiva]} onPress={() => setAba('conversa')}>
          <Text style={[styles.abaTexto, aba === 'conversa' && styles.abaTextoAtivo]}>Conversa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.aba, aba === 'mural' && styles.abaAtiva]} onPress={() => setAba('mural')}>
          <Text style={[styles.abaTexto, aba === 'mural' && styles.abaTextoAtivo]}>Mural da turma</Text>
        </TouchableOpacity>
      </View>

      {aba === 'conversa' ? <Conversa /> : <Mural />}
    </View>
  );
}

function Conversa() {
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const carregar = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/aluno/mensagens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) setMensagens(await resposta.json());
    } catch (error) {
      console.error('Erro na conversa:', error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => {
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const enviarMensagem = async () => {
    if (input.trim() === '') return;
    const textoEnviado = input;
    setInput('');
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/aluno/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto: textoEnviado }),
      });
      if (resposta.ok) {
        carregar();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
      } else {
        setInput(textoEnviado);
        Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
      }
    } catch (error) {
      setInput(textoEnviado);
      Alert.alert('Erro', 'Falha na conexão.');
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMe = item.remetente !== 'professor';
    return (
      <View style={[styles.wrapper, isMe ? styles.wrapperMe : styles.wrapperOther]}>
        <View style={[styles.balao, isMe ? styles.balaoMe : styles.balaoOther]}>
          {!isMe && <Text style={styles.nomeRemetente}>Professor(a)</Text>}
          <Text style={styles.textoMensagem}>{item.texto}</Text>
          <Text style={styles.horaMensagem}>{formatarHora(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (carregando && mensagens.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <SyncLoader size="large" color={CORES.acento} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={flatListRef}
        data={mensagens}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>
            Nenhuma mensagem ainda. Essa conversa é só entre você e o professor.
          </Text>
        }
      />

      <View style={styles.inputArea}>
        <TextInput
          style={styles.textInput}
          placeholder="Escreva uma mensagem..."
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
          value={input}
          onChangeText={setInput}
          multiline
          autoCorrect
          spellCheck
        />
        <TouchableOpacity style={[styles.botaoEnviar, input.trim() === '' && { opacity: 0.5 }]} onPress={enviarMensagem} disabled={input.trim() === ''}>
          <Ionicons name="send" size={18} color={CORES.fundo} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Mural() {
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/mural`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) setMensagens(await resposta.json());
    } catch (error) {
      console.error('Erro no mural:', error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => {
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  if (carregando && mensagens.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <SyncLoader size="large" color={CORES.acento} />
      </View>
    );
  }

  return (
    <FlatList
      data={mensagens}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.lista}
      renderItem={({ item }) => (
        <View style={[styles.wrapper, styles.wrapperOther]}>
          <View style={[styles.balao, styles.balaoOther]}>
            <Text style={[styles.nomeRemetente, { color: CORES.aviso }]}>Professor(a)</Text>
            <Text style={styles.textoMensagem}>{item.texto}</Text>
            <Text style={styles.horaMensagem}>{formatarHora(item.createdAt)}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', color: '#999', marginTop: 20, paddingHorizontal: 20 }}>
          Nenhum aviso do professor ainda. É só leitura — pra falar com ele diretamente, use a aba Conversa.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  headerTitle: { fontSize: 12, fontWeight: 'bold', color: CORES.primaria, letterSpacing: 3 },
  headerSub: { fontSize: 12, color: CORES.secundaria, marginTop: 2 },

  abas: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  aba: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda },
  abaAtiva: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  abaTexto: { fontSize: 13, fontWeight: '700', color: CORES.secundaria },
  abaTextoAtivo: { color: '#fff' },

  lista: { padding: 20, paddingBottom: 10, flexGrow: 1, justifyContent: 'flex-end' },
  wrapper: { marginBottom: 14, flexDirection: 'row' },
  wrapperMe: { justifyContent: 'flex-end' },
  wrapperOther: { justifyContent: 'flex-start' },
  balao: { maxWidth: '80%', padding: 12, borderRadius: 14 },
  balaoMe: { backgroundColor: '#E8F8EE', borderBottomRightRadius: 2 },
  balaoOther: { backgroundColor: CORES.superficie, borderBottomLeftRadius: 2, borderWidth: 1, borderColor: CORES.borda },
  nomeRemetente: { fontSize: 11, fontWeight: 'bold', color: CORES.sucesso, marginBottom: 4 },
  textoMensagem: { fontSize: 14, color: CORES.primaria, lineHeight: 20 },
  horaMensagem: { fontSize: 10, color: CORES.secundaria, alignSelf: 'flex-end', marginTop: 4 },
  inputArea: {
    flexDirection: 'row', padding: 14, backgroundColor: CORES.superficie,
    borderTopWidth: 1, borderTopColor: CORES.borda, alignItems: 'center', paddingBottom: 30,
  },
  textInput: {
    flex: 1, backgroundColor: CORES.fundo, borderRadius: 20,
    paddingHorizontal: 15, paddingTop: 12, paddingBottom: 12,
    color: CORES.primaria, maxHeight: 100,
    borderWidth: 1, borderColor: CORES.borda,
  },
  botaoEnviar: {
    width: 44, height: 44, backgroundColor: CORES.acento,
    borderRadius: 22, marginLeft: 10, alignItems: 'center', justifyContent: 'center',
  },
});
