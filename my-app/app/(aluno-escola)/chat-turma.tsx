// Chat da Turma do aluno INSTITUTION — conecta automaticamente ao chat da
// turma do professor em que está matriculado (mesmo vínculo automático do
// lado do professor, ver resolverAcessoChatTurma no backend). GET/POST
// /api/professores/:id/chat-turma já aceita token de aluno, endpoint
// 100% pronto — o gap era só frontend.
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EstadoVazio, PageHeader } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

type Mensagem = { id: string; texto: string; autorTipo: 'PROFESSOR' | 'ALUNO'; autorId: string; createdAt: string };

export default function ChatTurmaAlunoEscola() {
  const { nome, fotoUrl, escolaNome, alunoId, professorId, professorNome, sair } = useAlunoEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const carregar = useCallback(async () => {
    if (!professorId) { setCarregando(false); return; }
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professores/${professorId}/chat-turma`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMensagens(await res.json());
        setErroAcesso(null);
      } else {
        const dados = await res.json();
        setErroAcesso(dados.erro || 'Não foi possível acessar o chat da turma.');
      }
    } catch {
      // sem conexão — dá pra reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, [professorId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async () => {
    if (!texto.trim() || !professorId) return;
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

  const nomeAutor = (m: Mensagem) => {
    if (m.autorTipo === 'PROFESSOR') return professorNome || 'Professor';
    if (m.autorId === alunoId) return nome || 'Você';
    return 'Colega de turma';
  };

  return (
    <MobileErpShell
      titulo="Chat da Turma"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Chat da Turma" subtitulo={professorNome ? `Turma do prof. ${professorNome}` : 'Sua turma'} />

      {erroAcesso ? (
        <EstadoVazio icone="lock-closed-outline" texto={erroAcesso} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={estilos.caixa}>
            <ScrollView ref={scrollRef} style={estilos.lista} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
              {mensagens.length === 0 ? (
                <EstadoVazio icone="chatbubbles-outline" texto="Nenhuma mensagem ainda." />
              ) : (
                mensagens.map((m) => {
                  const minha = m.autorTipo === 'ALUNO' && m.autorId === alunoId;
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
      )}
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
