// Rede Social — Mensagens diretas abertas, estilo Instagram (18/09/2026).
// Substitui o antigo chat 1:1 (só aluno com o PRÓPRIO professor): agora
// qualquer professor ou aluno manda mensagem pra qualquer outro, sem
// exigir vínculo/matrícula. Compartilhado entre (professor) e (aluno) —
// só professor pode postar no Mural da turma (aluno só lê).
import { BASE_URL, fetchComRetry } from '../app/api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { CORES } from '../constants/theme';
import { apiFetch } from '../app/api';
import Avatar from './ui/Avatar';
import SyncLoader from './SyncLoader';

const API_URL = BASE_URL;

type Papel = 'professor' | 'aluno';
type Outro = { tipo: Papel; id: string; nome: string; fotoUrl: string | null };

type ItemConversa = {
  id: string;
  outro: Outro;
  ultimaMensagem: { texto: string; autorTipo: Papel; autorId: string; createdAt: string } | null;
  naoLidas: number;
  ultimaMensagemEm: string;
};

type MensagemDM = { id: string; texto: string; autorTipo: Papel; autorId: string; createdAt: string };

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Mensagens({ abrirDireto }: { abrirDireto?: Outro } = {}) {
  const [papel, setPapel] = useState<Papel | null>(null);
  const [aba, setAba] = useState<'conversas' | 'mural'>('conversas');
  const [conversaAberta, setConversaAberta] = useState<Outro | null>(abrirDireto || null);

  useEffect(() => { SecureStore.getItemAsync('kav_papel').then((p) => setPapel(p as Papel)); }, []);

  return (
    <View style={styles.container}>
      {!conversaAberta && (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitulo}>MENSAGENS</Text>
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

      {conversaAberta ? (
        <Thread outro={conversaAberta} onVoltar={() => setConversaAberta(null)} />
      ) : aba === 'conversas' ? (
        <ListaConversas onAbrir={setConversaAberta} />
      ) : (
        <Mural podePostar={papel === 'professor'} />
      )}
    </View>
  );
}

function ListaConversas({ onAbrir }: { onAbrir: (outro: Outro) => void }) {
  const [conversas, setConversas] = useState<ItemConversa[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const resposta = await apiFetch('/mensagens/conversas');
      if (resposta.ok) {
        const dados = await resposta.json();
        setConversas(dados.conversas || []);
      }
    } catch {
      // sem conexão — mantém a última lista carregada
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
    return <View style={styles.centro}><SyncLoader size="large" color={CORES.primaria} /></View>;
  }

  return (
    <FlatList
      data={conversas}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 12, flexGrow: 1 }}
      ListEmptyComponent={
        <View style={styles.vazioWrap}>
          <Ionicons name="chatbubbles-outline" size={44} color={CORES.borda} />
          <Text style={styles.vazioTexto}>Nenhuma conversa ainda.{'\n'}Mande mensagem a partir do perfil de alguém.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const ultimaEDoOutro = item.ultimaMensagem?.autorTipo === item.outro.tipo && item.ultimaMensagem?.autorId === item.outro.id;
        const preview = item.ultimaMensagem
          ? `${ultimaEDoOutro ? '' : 'Você: '}${item.ultimaMensagem.texto}`
          : 'Toque para iniciar a conversa.';
        return (
          <TouchableOpacity style={styles.linhaConversa} onPress={() => onAbrir(item.outro)}>
            <Avatar fotoUrl={item.outro.fotoUrl} nome={item.outro.nome} tamanho={46} />
            <View style={{ flex: 1 }}>
              <Text style={styles.nomeConversa} numberOfLines={1}>{item.outro.nome}</Text>
              <Text style={[styles.previewConversa, item.naoLidas > 0 && styles.previewNaoLida]} numberOfLines={1}>{preview}</Text>
            </View>
            {item.ultimaMensagem && <Text style={styles.horaConversa}>{formatarHora(item.ultimaMensagem.createdAt)}</Text>}
            {item.naoLidas > 0 && <View style={styles.badgeNaoLida}><Text style={styles.badgeNaoLidaTexto}>{item.naoLidas}</Text></View>}
          </TouchableOpacity>
        );
      }}
    />
  );
}

function Thread({ outro, onVoltar }: { outro: Outro; onVoltar: () => void }) {
  const [mensagens, setMensagens] = useState<MensagemDM[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await apiFetch(`/mensagens/conversas/${outro.tipo}/${outro.id}`);
      if (resposta.ok) {
        const dados = await resposta.json();
        setMensagens(dados.mensagens || []);
      }
    } catch {
      // sem conexão — mantém o histórico já carregado
    } finally {
      setCarregando(false);
    }
  }, [outro.tipo, outro.id]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const enviar = async () => {
    const texto = novaMensagem.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    setNovaMensagem('');
    try {
      const resposta = await apiFetch(`/mensagens/conversas/${outro.tipo}/${outro.id}`, { method: 'POST', body: JSON.stringify({ texto }) });
      if (resposta.ok) {
        await carregar();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        setNovaMensagem(texto);
        Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
      }
    } catch {
      setNovaMensagem(texto);
      Alert.alert('Erro de conexão', 'Não foi possível falar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.headerThread}>
        <TouchableOpacity onPress={onVoltar} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={CORES.primaria} />
        </TouchableOpacity>
        <Avatar fotoUrl={outro.fotoUrl} nome={outro.nome} tamanho={32} />
        <Text style={styles.nomeThread} numberOfLines={1}>{outro.nome}</Text>
      </View>

      {carregando ? (
        <View style={styles.centro}><SyncLoader size="large" color={CORES.primaria} /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensagens}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.lista, mensagens.length === 0 && styles.listaVazia]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={styles.vazioTexto}>Nenhuma mensagem ainda com {outro.nome}.</Text>
          }
          renderItem={({ item }) => {
            // Compara por identidade (tipo+id), não só tipo — numa conversa
            // aluno↔aluno ou professor↔professor os dois lados têm o mesmo
            // tipo, então só o id distingue quem escreveu.
            const souEu = !(item.autorTipo === outro.tipo && item.autorId === outro.id);
            return (
              <View style={[styles.wrapper, souEu ? styles.wrapperMe : styles.wrapperOther]}>
                <View style={[styles.balao, souEu ? styles.balaoMe : styles.balaoOther]}>
                  <Text style={[styles.textoMensagem, souEu && styles.textoMensagemMe]}>{item.texto}</Text>
                  <Text style={[styles.horaMensagem, souEu && styles.horaMensagemMe]}>{formatarHora(item.createdAt)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={styles.inputArea}>
        <TextInput
          style={styles.textInput}
          placeholder="Escreva uma mensagem..."
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
          value={novaMensagem}
          onChangeText={setNovaMensagem}
          multiline
        />
        <TouchableOpacity style={[styles.botaoEnviar, !novaMensagem.trim() && { opacity: 0.5 }]} onPress={enviar} disabled={!novaMensagem.trim() || enviando}>
          <Ionicons name="send" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Mural({ podePostar }: { podePostar: boolean }) {
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const carregar = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/mural`, { headers: { Authorization: `Bearer ${token}` } });
      if (resposta.ok) setMensagens(await resposta.json());
    } catch {
      // sem conexão
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => {
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const enviar = async () => {
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
        await carregar();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      Alert.alert('Erro de conexão', 'Não foi possível falar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return <View style={styles.centro}><SyncLoader size="large" color={CORES.primaria} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={flatListRef}
        data={mensagens}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.lista, mensagens.length === 0 && styles.listaVazia]}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={styles.vazioTexto}>
            {podePostar ? 'Nenhum aviso enviado ainda.' : 'Nenhum aviso do professor ainda.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.wrapper, styles.wrapperOther]}>
            <View style={[styles.balao, styles.balaoOther]}>
              <Text style={styles.nomeRemetente}>Professor(a)</Text>
              <Text style={styles.textoMensagem}>{item.texto}</Text>
              <Text style={styles.horaMensagem}>{formatarHora(item.createdAt)}</Text>
            </View>
          </View>
        )}
      />
      {podePostar && (
        <View style={styles.inputArea}>
          <TextInput
            style={styles.textInput}
            placeholder="Digite um aviso para a turma..."
            placeholderTextColor={CORES.secundaria}
            selectionColor={CORES.acento}
            value={novaMensagem}
            onChangeText={setNovaMensagem}
            multiline
          />
          <TouchableOpacity style={[styles.botaoEnviar, !novaMensagem.trim() && { opacity: 0.5 }]} onPress={enviar} disabled={!novaMensagem.trim() || enviando}>
            <Ionicons name="send" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  headerTitulo: { fontSize: 12, fontWeight: 'bold', color: CORES.primaria, letterSpacing: 3 },
  abas: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  aba: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda },
  abaAtiva: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  abaTexto: { fontSize: 13, fontWeight: '700', color: CORES.secundaria },
  abaTextoAtivo: { color: '#ffffff' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vazioWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  vazioTexto: { textAlign: 'center', color: CORES.secundaria, fontSize: 13, lineHeight: 19 },
  linhaConversa: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  nomeConversa: { fontSize: 14.5, fontWeight: '700', color: CORES.primaria },
  previewConversa: { fontSize: 12.5, color: CORES.secundaria, marginTop: 2 },
  previewNaoLida: { color: CORES.primaria, fontWeight: '600' },
  horaConversa: { fontSize: 11, color: CORES.secundaria },
  badgeNaoLida: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeNaoLidaTexto: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  headerThread: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  nomeThread: { fontSize: 15, fontWeight: '700', color: CORES.primaria, flexShrink: 1 },
  lista: { padding: 16, paddingBottom: 10, flexGrow: 1 },
  listaVazia: { justifyContent: 'center', alignItems: 'center' },
  wrapper: { marginBottom: 12, flexDirection: 'row' },
  wrapperMe: { justifyContent: 'flex-end' },
  wrapperOther: { justifyContent: 'flex-start' },
  balao: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  balaoMe: { backgroundColor: CORES.acento, borderBottomRightRadius: 4 },
  balaoOther: { backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda, borderBottomLeftRadius: 4 },
  nomeRemetente: { fontSize: 11, fontWeight: 'bold', color: CORES.acento, marginBottom: 4 },
  textoMensagem: { fontSize: 14, color: CORES.primaria, lineHeight: 20 },
  textoMensagemMe: { color: '#ffffff' },
  horaMensagem: { fontSize: 10, color: CORES.secundaria, alignSelf: 'flex-end', marginTop: 4 },
  horaMensagemMe: { color: 'rgba(255,255,255,0.7)' },
  inputArea: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
    backgroundColor: CORES.superficie, borderTopWidth: 1, borderTopColor: CORES.borda,
  },
  textInput: {
    flex: 1, backgroundColor: CORES.fundo, borderRadius: 20,
    paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10,
    color: CORES.primaria, maxHeight: 100, borderWidth: 1, borderColor: CORES.borda,
  },
  botaoEnviar: { width: 42, height: 42, borderRadius: 21, backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center' },
});
