import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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

interface Mensagem {
  id: string;
  texto: string;
  remetente: string;
  nome: string;
  hora: string;
}

interface Conversa {
  aluno: { id: string; nome: string; fotoUrl: string | null; status: string };
  ultimaMensagem: { texto: string; remetente: string; createdAt: string } | null;
}

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatProfessor() {
  const navigation = useNavigation();
  const [aba, setAba] = useState<'conversas' | 'mural'>('conversas');
  const [alunoAberto, setAlunoAberto] = useState<{ id: string; nome: string } | null>(null);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {!alunoAberto && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
              <Ionicons name="menu" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.tituloHeader}>MENSAGENS</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={styles.abas}>
            <TouchableOpacity style={[styles.aba, aba === 'conversas' && styles.abaAtiva]} onPress={() => setAba('conversas')}>
              <Text style={[styles.abaTexto, aba === 'conversas' && styles.abaTextoAtivo]}>Conversas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.aba, aba === 'mural' && styles.abaAtiva]} onPress={() => setAba('mural')}>
              <Text style={[styles.abaTexto, aba === 'mural' && styles.abaTextoAtivo]}>Mural da turma</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {alunoAberto ? (
        <Thread aluno={alunoAberto} onVoltar={() => setAlunoAberto(null)} />
      ) : aba === 'conversas' ? (
        <ListaConversas onAbrirAluno={(id, nome) => setAlunoAberto({ id, nome })} />
      ) : (
        <Mural />
      )}
    </View>
  );
}

function ListaConversas({ onAbrirAluno }: { onAbrirAluno: (id: string, nome: string) => void }) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/professor/conversas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) setConversas(await resposta.json());
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => {
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <FlatList
      data={conversas}
      keyExtractor={(item) => item.aluno.id}
      contentContainerStyle={{ padding: 12, flexGrow: 1 }}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 60 }}>
          <Ionicons name="chatbubbles-outline" size={48} color="#D0D8DC" />
          <Text style={{ color: '#999', fontSize: 15 }}>Nenhum aluno cadastrado ainda.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const ultima = item.ultimaMensagem;
        const souEu = ultima?.remetente === 'professor';
        const preview = ultima
          ? `${souEu ? 'Você: ' : ''}${ultima.texto}`
          : 'Nenhuma mensagem ainda — toque para iniciar a conversa.';
        return (
          <TouchableOpacity style={styles.linhaConversa} onPress={() => onAbrirAluno(item.aluno.id, item.aluno.nome)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetra}>{item.aluno.nome?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nomeConversa}>{item.aluno.nome}</Text>
              <Text style={styles.previewConversa} numberOfLines={1}>{preview}</Text>
            </View>
            {ultima && <Text style={styles.horaConversa}>{formatarHora(ultima.createdAt)}</Text>}
          </TouchableOpacity>
        );
      }}
    />
  );
}

function Thread({ aluno, onVoltar }: { aluno: { id: string; nome: string }; onVoltar: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const carregar = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/professor/mensagens/${aluno.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) {
        const dados = await resposta.json();
        setMensagens(dados.map((m: any) => ({
          id: m.id,
          texto: m.texto,
          remetente: m.remetente,
          nome: m.remetente === 'professor' ? 'Você' : aluno.nome,
          hora: formatarHora(m.createdAt),
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar conversa:', error);
    } finally {
      setCarregando(false);
    }
  }, [aluno.id, aluno.nome]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const enviarMensagem = async () => {
    const texto = novaMensagem.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/professor/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alunoId: aluno.id, texto }),
      });
      if (resposta.ok) {
        setNovaMensagem('');
        await carregar();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    } finally {
      setEnviando(false);
    }
  };

  const renderMensagem = ({ item }: { item: Mensagem }) => {
    const isProfessor = item.remetente === 'professor';
    return (
      <View style={[styles.balaoContainer, isProfessor ? styles.balaoProfessor : styles.balaoAluno]}>
        <Text style={[styles.textoMensagem, isProfessor && styles.textoMensagemProf]}>{item.texto}</Text>
        <Text style={[styles.horaMensagem, isProfessor && styles.horaMensagemProf]}>{item.hora}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} style={styles.hamburger}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.tituloHeader}>{aluno.nome.toUpperCase()}</Text>
        <View style={{ width: 32 }} />
      </View>

      {carregando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <SyncLoader size="large" color="#000000" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensagens}
          keyExtractor={(item) => item.id}
          renderItem={renderMensagem}
          contentContainerStyle={[styles.listaMensagens, mensagens.length === 0 && { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#D0D8DC" />
              <Text style={{ color: '#999', fontSize: 15 }}>Nenhuma mensagem ainda com {aluno.nome}.</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={`Mensagem para ${aluno.nome.split(' ')[0]}...`}
          placeholderTextColor="#999"
          value={novaMensagem}
          onChangeText={setNovaMensagem}
          multiline
          autoCorrect
          spellCheck
        />
        <TouchableOpacity style={[styles.botaoEnviar, enviando && { opacity: 0.6 }]} onPress={enviarMensagem} disabled={enviando}>
          {enviando ? <SyncLoader size="small" color="#ffffff" /> : <Ionicons name="send" size={20} color="#ffffff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Mural() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const carregarMensagens = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/mural`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) {
        const dados = await resposta.json();
        setMensagens(dados.map((m: any) => ({
          id: m.id, texto: m.texto, remetente: m.remetente, nome: 'Você', hora: formatarHora(m.createdAt),
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar mural:', error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregarMensagens(); }, [carregarMensagens]);
  useEffect(() => {
    const intervalo = setInterval(carregarMensagens, 5000);
    return () => clearInterval(intervalo);
  }, [carregarMensagens]);

  const enviarMensagem = async () => {
    const texto = novaMensagem.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/mural`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto }),
      });
      if (resposta.ok) {
        setNovaMensagem('');
        await carregarMensagens();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      console.error('Erro ao enviar aviso:', error);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {carregando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <SyncLoader size="large" color="#000000" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensagens}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.balaoContainer, styles.balaoProfessor]}>
              <Text style={[styles.textoMensagem, styles.textoMensagemProf]}>{item.texto}</Text>
              <Text style={[styles.horaMensagem, styles.horaMensagemProf]}>{item.hora}</Text>
            </View>
          )}
          contentContainerStyle={[styles.listaMensagens, mensagens.length === 0 && { flex: 1, justifyContent: 'center', alignItems: 'center' }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="megaphone-outline" size={48} color="#D0D8DC" />
              <Text style={{ color: '#999', fontSize: 15, textAlign: 'center', paddingHorizontal: 30 }}>
                Nenhum aviso ainda. Use o mural pra recados que valem pra toda a turma — pra falar com um aluno só, use Conversas.
              </Text>
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
          autoCorrect
          spellCheck
        />
        <TouchableOpacity style={[styles.botaoEnviar, enviando && { opacity: 0.6 }]} onPress={enviarMensagem} disabled={enviando}>
          {enviando ? <SyncLoader size="small" color="#ffffff" /> : <Ionicons name="send" size={20} color="#ffffff" />}
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
  hamburger: { padding: 4, width: 32 },
  tituloHeader: { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },

  abas: { flexDirection: 'row', backgroundColor: '#ffffff', paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#D0D8DC' },
  aba: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#F0F4F8' },
  abaAtiva: { backgroundColor: '#000000' },
  abaTexto: { fontSize: 13, fontWeight: '700', color: '#666' },
  abaTextoAtivo: { color: '#ffffff' },

  linhaConversa: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#32BCAD', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { color: '#fff', fontSize: 16, fontWeight: '700' },
  nomeConversa: { fontSize: 14.5, fontWeight: '700', color: '#000' },
  previewConversa: { fontSize: 12.5, color: '#888', marginTop: 2 },
  horaConversa: { fontSize: 11, color: '#aaa' },

  listaMensagens: { padding: 16, flexGrow: 1 },
  balaoContainer: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
  balaoProfessor: { alignSelf: 'flex-end', backgroundColor: '#000000', borderBottomRightRadius: 4 },
  balaoAluno: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#D0D8DC', borderBottomLeftRadius: 4 },
  textoMensagem: { color: '#333', fontSize: 15, lineHeight: 20 },
  textoMensagemProf: { color: '#ffffff' },
  horaMensagem: { color: '#999', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  horaMensagemProf: { color: '#A0B0B9' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  input: { flex: 1, backgroundColor: '#F0F4F8', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: '#333', maxHeight: 100 },
  botaoEnviar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#32BCAD', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});
