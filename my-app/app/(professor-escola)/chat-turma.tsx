// Chat da Turma do professor INSTITUTION — os próprios alunos da grade dele
// já estão automaticamente no chat (vínculo por aluno.professorId, sem
// passo manual — ver resolverAcessoChatTurma no backend). GET/POST
// /api/professores/:id/chat-turma já existe pronto, só texto/links.
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EstadoVazio, PageHeader } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

type Mensagem = { id: string; texto: string; autorTipo: 'PROFESSOR' | 'ALUNO'; autorId: string; createdAt: string };

export default function ChatTurmaProfessorEscola() {
  const { nome, fotoUrl, escolaNome, professorId, sair } = useProfessorEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [nomesAlunos, setNomesAlunos] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resMensagens, resAlunos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/professores/${professorId}/chat-turma`, { headers }),
        fetchComRetry(`${BASE_URL}/api/meus-alunos`, { headers }),
      ]);
      if (resMensagens.ok) setMensagens(await resMensagens.json());
      if (resAlunos.ok) {
        const alunos = await resAlunos.json();
        setNomesAlunos(Object.fromEntries(alunos.map((a: any) => [a.id, a.nome])));
      }
    } catch {
      // sem conexão — dá pra puxar de novo reabrindo a tela
    } finally {
      setCarregando(false);
    }
  }, [professorId]);

  useEffect(() => { if (professorId) carregar(); }, [carregar, professorId]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professores/${professorId}/chat-turma`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto.trim() }),
      });
      const dados = await res.json();
      if (res.ok) {
        setMensagens((prev) => [...prev, dados]);
        setTexto('');
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível enviar.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const nomeAutor = (m: Mensagem) => (m.autorTipo === 'PROFESSOR' ? nome || 'Você' : nomesAlunos[m.autorId] || 'Aluno');

  return (
    <MobileErpShell
      titulo="Chat da Turma"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Chat da Turma" subtitulo="Seus alunos ativos já estão aqui automaticamente" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={estilos.caixa}>
          <ScrollView ref={scrollRef} style={estilos.lista} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {mensagens.length === 0 ? (
              <EstadoVazio icone="chatbubbles-outline" texto="Nenhuma mensagem ainda. Comece a conversa." />
            ) : (
              mensagens.map((m) => {
                const minha = m.autorTipo === 'PROFESSOR';
                return (
                  <View key={m.id} style={[estilos.bolha, minha ? estilos.bolhaMinha : estilos.bolhaOutro]}>
                    {!minha && <Text style={estilos.autorTexto}>{nomeAutor(m)}</Text>}
                    <Text style={[estilos.textoMensagem, minha && { color: '#fff' }]}>{m.texto}</Text>
                    <Text style={[estilos.horaTexto, minha && { color: 'rgba(255,255,255,0.7)' }]}>
                      {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={estilos.inputLinha}>
            <TextInput
              style={estilos.input}
              placeholder="Mensagem para a turma..."
              placeholderTextColor={ERP.textoMuted}
              value={texto}
              onChangeText={setTexto}
              multiline
            />
            <TouchableOpacity style={estilos.enviarBtn} onPress={enviar} disabled={enviando || !texto.trim()}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  caixa: { flex: 1, minHeight: 420 },
  lista: { flex: 1 },
  bolha: { maxWidth: '80%', borderRadius: ERP.raio.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  bolhaMinha: { backgroundColor: ERP.texto, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  bolhaOutro: { backgroundColor: ERP.superficie, borderWidth: 1, borderColor: ERP.borda, alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  autorTexto: { fontSize: 10.5, fontWeight: '700', color: ERP.acentoForte, marginBottom: 2 },
  textoMensagem: { fontSize: 13.5, color: ERP.texto },
  horaTexto: { fontSize: 9.5, color: ERP.textoMuted, marginTop: 3, textAlign: 'right' },
  inputLinha: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: ERP.bordaSuave,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: ERP.raio.sm,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13.5, color: ERP.texto,
    backgroundColor: ERP.superficie, maxHeight: 100,
  },
  enviarBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: ERP.texto,
    alignItems: 'center', justifyContent: 'center',
  },
});
