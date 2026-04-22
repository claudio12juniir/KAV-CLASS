import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const API_URL = "https://kav-class-1.onrender.com";

interface Mensagem {
  id: string;
  texto: string;
  remetente: 'professor' | 'aluno';
  nome: string;
  hora: string;
}

export default function ChatGrupoProfessor() {
  const navigation = useNavigation();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    carregarMensagens();
  }, []);

  const carregarMensagens = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetch(`${API_URL}/api/mural?professorId=${professorId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        const formatadas: Mensagem[] = dados.map((m: any) => ({
          id: m.id,
          texto: m.texto,
          remetente: m.remetente,
          nome: m.remetente === 'professor' ? 'Você' : (m.autor?.nome || 'Aluno'),
          hora: new Date(m.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }));
        setMensagens(formatadas);
      }
    } catch (error) {
      console.error("Erro ao carregar mural:", error);
    } finally {
      setCarregando(false);
    }
  };

  const enviarMensagem = async () => {
    const texto = novaMensagem.trim();
    if (!texto || enviando) return;

    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetch(`${API_URL}/api/mural`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ professorId, texto }),
      });

      if (resposta.ok) {
        const nova = await resposta.json();
        const msg: Mensagem = {
          id: nova.id ?? Date.now().toString(),
          texto,
          remetente: 'professor',
          nome: 'Você',
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
        setMensagens(prev => [...prev, msg]);
        setNovaMensagem('');
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    } finally {
      setEnviando(false);
    }
  };

  const renderMensagem = ({ item }: { item: Mensagem }) => {
    const isProfessor = item.remetente === 'professor';
    return (
      <View style={[styles.balaoContainer, isProfessor ? styles.balaoProfessor : styles.balaoAluno]}>
        {!isProfessor && <Text style={styles.nomeAluno}>{item.nome}</Text>}
        <Text style={[styles.textoMensagem, isProfessor && styles.textoMensagemProf]}>{item.texto}</Text>
        <Text style={[styles.horaMensagem, isProfessor && styles.horaMensagemProf]}>{item.hora}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.tituloHeader}>MURAL DA TURMA</Text>
        <View style={styles.iconeGrupo}>
          <Ionicons name="people" size={20} color="#ffffff" />
        </View>
      </View>

      {carregando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#000000" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensagens}
          keyExtractor={item => item.id}
          renderItem={renderMensagem}
          contentContainerStyle={[styles.listaMensagens, mensagens.length === 0 && { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D0D8DC" />
              <Text style={{ color: '#999', fontSize: 15 }}>Nenhuma mensagem ainda.</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Digite um aviso para a turma..."
          placeholderTextColor="#999"
          value={novaMensagem}
          onChangeText={setNovaMensagem}
          multiline
        />
        <TouchableOpacity
          style={[styles.botaoEnviar, enviando && { opacity: 0.6 }]}
          onPress={enviarMensagem}
          disabled={enviando}
        >
          {enviando
            ? <ActivityIndicator size="small" color="#ffffff" />
            : <Ionicons name="send" size={20} color="#ffffff" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#D0D8DC',
  },
  hamburger: { padding: 4 },
  iconeGrupo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  tituloHeader: { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  listaMensagens: { padding: 16, flexGrow: 1 },
  balaoContainer: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
  balaoProfessor: { alignSelf: 'flex-end', backgroundColor: '#000000', borderBottomRightRadius: 4 },
  balaoAluno: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#D0D8DC', borderBottomLeftRadius: 4 },
  nomeAluno: { color: '#32BCAD', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  textoMensagem: { color: '#333', fontSize: 15, lineHeight: 20 },
  textoMensagemProf: { color: '#ffffff' },
  horaMensagem: { color: '#999', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  horaMensagemProf: { color: '#A0B0B9' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  input: { flex: 1, backgroundColor: '#F0F4F8', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: '#333', maxHeight: 100 },
  botaoEnviar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#32BCAD', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});
