import React, { useState, useRef } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

interface Mensagem {
  id: string;
  texto: string;
  autor: 'eu' | 'outro';
  hora: string;
  nome?: string;
}

interface ChatScreenProps {
  titulo: string;
  subtitulo: string;
  mensagensIniciais: Mensagem[];
  meuNome: string;
}

export function ChatScreen({ titulo, subtitulo, mensagensIniciais, meuNome }: ChatScreenProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(mensagensIniciais);
  const [texto, setTexto] = useState('');
  const flatRef = useRef<FlatList>(null);

  const enviar = () => {
    if (!texto.trim()) return;
    const nova: Mensagem = {
      id: Date.now().toString(),
      texto: texto.trim(),
      autor: 'eu',
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      nome: meuNome,
    };
    setMensagens(prev => [...prev, nova]);
    setTexto('');
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderMensagem = ({ item }: { item: Mensagem }) => {
    const isEu = item.autor === 'eu';
    return (
      <View style={[styles.bolhaContainer, isEu ? styles.bolhaContainerEu : styles.bolhaContainerOutro]}>
        {!isEu && item.nome && (
          <Text style={styles.nomeRemetente}>{item.nome}</Text>
        )}
        <View style={[styles.bolha, isEu ? styles.bolhaEu : styles.bolhaOutro]}>
          <Text style={[styles.textoBolha, isEu ? styles.textoEu : styles.textoOutro]}>
            {item.texto}
          </Text>
          <Text style={[styles.hora, isEu ? styles.horaEu : styles.horaOutro]}>
            {item.hora}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.cabecalho}>
        <View style={styles.avatarCabecalho}>
          <Text style={styles.avatarLetra}>{titulo.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.tituloCabecalho}>{titulo}</Text>
          <Text style={styles.subtituloCabecalho}>{subtitulo}</Text>
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={mensagens}
        keyExtractor={item => item.id}
        renderItem={renderMensagem}
        contentContainerStyle={styles.listaMensagens}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Digite uma mensagem..."
          placeholderTextColor="#999"
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.botaoEnviar, !texto.trim() && styles.botaoEnviarDesativado]}
          onPress={enviar}
          disabled={!texto.trim()}
        >
          <Ionicons name="send" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Tela do Professor ───────────────────────────────────────────────────────
const MSGS_PROFESSOR: Mensagem[] = [
  { id: '1', texto: 'Professor, qual método vamos usar essa semana?', autor: 'outro', hora: '14:02', nome: 'João Pedro' },
  { id: '2', texto: 'Vamos continuar o Stick Control, página 14!', autor: 'eu', hora: '14:05' },
  { id: '3', texto: 'Entendido! Vou praticar antes da aula.', autor: 'outro', hora: '14:06', nome: 'João Pedro' },
];

export function ChatProfessorScreen() {
  return (
    <ChatScreen
      titulo="Turma de Bateria"
      subtitulo="3 alunos • Chat da turma"
      mensagensIniciais={MSGS_PROFESSOR}
      meuNome="Prof. Carlos"
    />
  );
}

// ─── Tela do Aluno ───────────────────────────────────────────────────────────
const MSGS_ALUNO: Mensagem[] = [
  { id: '1', texto: 'Vamos continuar o Stick Control, página 14!', autor: 'outro', hora: '14:05', nome: 'Prof. Carlos' },
  { id: '2', texto: 'Entendido! Vou praticar antes da aula.', autor: 'eu', hora: '14:06' },
  { id: '3', texto: 'Ótimo! Qualquer dúvida me chama aqui.', autor: 'outro', hora: '14:07', nome: 'Prof. Carlos' },
];

export function ChatAlunoScreen() {
  return (
    <ChatScreen
      titulo="Prof. Carlos"
      subtitulo="Bateria • Online"
      mensagensIniciais={MSGS_ALUNO}
      meuNome="João Pedro"
    />
  );
}

// ─── Tela da Secretaria ──────────────────────────────────────────────────────
const MSGS_SECRETARIA: Mensagem[] = [
  { id: '1', texto: 'Boa tarde! A turma de amanhã começa às 14h como combinado.', autor: 'eu', hora: '13:00' },
  { id: '2', texto: 'Perfeito, obrigado pelo aviso!', autor: 'outro', hora: '13:05', nome: 'Prof. Carlos' },
];

export function ChatSecretariaScreen() {
  return (
    <ChatScreen
      titulo="Prof. Carlos — Bateria"
      subtitulo="Chat da secretaria com o professor"
      mensagensIniciais={MSGS_SECRETARIA}
      meuNome="Secretaria"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#D0D8DC',
    backgroundColor: '#ffffff',
  },
  avatarCabecalho: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#0F3D4C', alignItems: 'center', justifyContent: 'center',
  },
  avatarLetra: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  tituloCabecalho: { color: '#0F3D4C', fontSize: 16, fontWeight: 'bold' },
  subtituloCabecalho: { color: '#999', fontSize: 12, marginTop: 1 },
  listaMensagens: { padding: 20, gap: 8 },
  bolhaContainer: { maxWidth: '80%', marginBottom: 8 },
  bolhaContainerEu: { alignSelf: 'flex-end' },
  bolhaContainerOutro: { alignSelf: 'flex-start' },
  nomeRemetente: { color: '#32BCAD', fontSize: 12, fontWeight: 'bold', marginBottom: 3, marginLeft: 4 },
  bolha: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bolhaEu: { backgroundColor: '#0F3D4C', borderBottomRightRadius: 4 },
  bolhaOutro: { backgroundColor: '#F0F4F8', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#D0D8DC' },
  textoBolha: { fontSize: 15, lineHeight: 21 },
  textoEu: { color: '#ffffff' },
  textoOutro: { color: '#0F3D4C' },
  hora: { fontSize: 10, marginTop: 4 },
  horaEu: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  horaOutro: { color: '#999' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 12, borderTopWidth: 1, borderTopColor: '#D0D8DC',
    backgroundColor: '#ffffff',
  },
  input: {
    flex: 1, backgroundColor: '#F0F4F8', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: '#0F3D4C', fontSize: 15, maxHeight: 100,
    borderWidth: 1, borderColor: '#D0D8DC',
  },
  botaoEnviar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0F3D4C', alignItems: 'center', justifyContent: 'center',
  },
  botaoEnviarDesativado: { backgroundColor: '#D0D8DC' },
});
