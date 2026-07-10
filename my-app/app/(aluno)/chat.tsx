import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { CORES } from '../../constants/theme';
import {
    ActivityIndicator,
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

const API_URL = BASE_URL;

export default function ChatAlunoScreen() {
  const navigation = useNavigation();
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [meuId, setMeuId] = useState('');
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    carregarMural();
    
    // Atualiza o chat a cada 5 segundos para receber novas mensagens
    const intervalo = setInterval(carregarMural, 5000); 
    return () => clearInterval(intervalo);
  }, []);

  const carregarMural = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || "";
      setMeuId(alunoId); // Guarda o ID para saber quais mensagens são minhas

      const resposta = await fetchComRetry(`${API_URL}/api/mural?alunoId=${alunoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        setMensagens(dados);
      }
    } catch (error) {
      console.error("Erro no mural:", error);
    } finally {
      setCarregando(false);
    }
  };

  const enviarMensagem = async () => {
    if (input.trim() === '') return;

    // Guarda o texto e limpa o input imediatamente (sensação de rapidez)
    const textoEnviado = input;
    setInput('');

    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || "";

      const resposta = await fetchComRetry(`${API_URL}/api/aluno/mensagens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          alunoId,
          texto: textoEnviado
        })
      });

      if (resposta.ok) {
        carregarMural(); // Recarrega para mostrar a mensagem oficial do banco
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
      } else {
        // Se falhar, devolve o texto pro input
        setInput(textoEnviado);
        Alert.alert("Erro", "Não foi possível enviar a mensagem.");
      }
    } catch (error) {
      setInput(textoEnviado);
      Alert.alert("Erro", "Falha na conexão.");
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    // Se o remetente for o meu próprio ID, a mensagem é minha
    const isMe = item.remetente === meuId;
    const isProfessor = item.remetente === 'professor';

    return (
      <View style={[styles.wrapper, isMe ? styles.wrapperMe : styles.wrapperOther]}>
        <View style={[styles.balao, isMe ? styles.balaoMe : styles.balaoOther]}>
          {!isMe && (
            <Text style={[styles.nomeRemetente, isProfessor && { color: CORES.aviso }]}>
              {isProfessor ? 'Professor(a)' : item.nome}
            </Text>
          )}
          <Text style={styles.textoMensagem}>{item.texto}</Text>
          <Text style={styles.horaMensagem}>
            {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (carregando && mensagens.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={CORES.acento} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={{ padding: 4, marginRight: 14 }}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>MURAL DA TURMA</Text>
          <Text style={styles.headerSub}>Converse com o professor</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={mensagens}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>
            Nenhuma mensagem ainda. Seja o primeiro a escrever!
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
        />
        <TouchableOpacity 
          style={[styles.botaoEnviar, input.trim() === '' && { opacity: 0.5 }]} 
          onPress={enviarMensagem}
          disabled={input.trim() === ''}
        >
          <Ionicons name="send" size={18} color={CORES.fundo} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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