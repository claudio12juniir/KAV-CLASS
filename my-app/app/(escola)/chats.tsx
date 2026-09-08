import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard, Tabela } from './_ui';

type ResumoChatTurma = {
  professorId: string;
  nomeProfessor: string;
  fotoProfessor: string | null;
  alunosAtivos: number;
  totalMensagens: number;
  ultimaMensagem: { texto: string; autorTipo: 'PROFESSOR' | 'ALUNO'; autor: string; createdAt: string } | null;
};

// Chats das Turmas (INSTITUTION): visão única pra Secretaria/gestão
// acompanhar tudo que acontece dentro de cada chat de turma (um por
// professor), sem precisar entrar em Equipe e abrir professor por
// professor. Somente leitura de propósito — a Escola acompanha a
// conversa, não participa como terceira voz (mesma regra do backend em
// resolverAcessoChatTurma).
export default function ChatsEscola() {
  const [carregando, setCarregando] = useState(true);
  const [turmas, setTurmas] = useState<ResumoChatTurma[]>([]);
  const [busca, setBusca] = useState('');

  const [modalTurma, setModalTurma] = useState<ResumoChatTurma | null>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [alunosDaTurma, setAlunosDaTurma] = useState<any[]>([]);
  const [carregandoThread, setCarregandoThread] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/chats-turma`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTurmas(await res.json());
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível carregar os chats.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const turmasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return turmas;
    return turmas.filter((t) => t.nomeProfessor.toLowerCase().includes(termo));
  }, [turmas, busca]);

  const abrirThread = async (turma: ResumoChatTurma) => {
    setModalTurma(turma);
    setCarregandoThread(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resChat, resAlunos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/professores/${turma.professorId}/chat-turma`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
      ]);
      if (resChat.ok) setMensagens(await resChat.json());
      else Alert.alert('Erro', (await resChat.json()).erro || 'Não foi possível abrir esta conversa.');
      if (resAlunos.ok) {
        const todos = await resAlunos.json();
        setAlunosDaTurma(todos.filter((a: any) => a.professor?.id === turma.professorId));
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregandoThread(false);
    }
  };

  if (carregando) {
    return <ErpShell titulo="Chats das Turmas"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  const totalMensagensGeral = turmas.reduce((soma, t) => soma + t.totalMensagens, 0);

  return (
    <ErpShell titulo="Chats das Turmas">
      <PageHeader
        titulo="Chats das Turmas"
        subtitulo="Acompanhe tudo o que acontece em cada chat de turma, entre professor e alunos"
      />

      <SectionCard>
        <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
          <View>
            <Text style={estilos.label}>Turmas com chat</Text>
            <Text style={estilos.numeroGrande}>{turmas.length}</Text>
          </View>
          <View>
            <Text style={estilos.label}>Mensagens trocadas (total)</Text>
            <Text style={estilos.numeroGrande}>{totalMensagensGeral}</Text>
          </View>
        </View>
        <Campo label="Buscar por professor" value={busca} onChangeText={setBusca} placeholder="Nome do professor..." />
      </SectionCard>

      <SectionCard titulo="Turmas">
        <Tabela<ResumoChatTurma & { id: string }>
          dados={turmasFiltradas.map((t) => ({ ...t, id: t.professorId }))}
          onLinhaPress={(t) => abrirThread(t)}
          vazioTexto="Nenhuma turma com chat encontrada."
          vazioIcone="chatbubbles-outline"
          colunas={[
            {
              chave: 'nomeProfessor', titulo: 'Turma', flex: 2,
              render: (t) => (
                <View>
                  <Text style={estilos.nomeProfessor}>{t.nomeProfessor}</Text>
                  <Text style={estilos.semDados}>{t.alunosAtivos} aluno(s) ativo(s) na turma</Text>
                </View>
              ),
            },
            {
              chave: 'ultimaMensagem', titulo: 'Última mensagem', flex: 3,
              render: (t) => t.ultimaMensagem ? (
                <View>
                  <Text style={estilos.previewMensagem} numberOfLines={1}>
                    <Text style={estilos.previewAutor}>{t.ultimaMensagem.autor}: </Text>
                    {t.ultimaMensagem.texto}
                  </Text>
                  <Text style={estilos.semDados}>{new Date(t.ultimaMensagem.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                </View>
              ) : <Text style={estilos.semDados}>Nenhuma mensagem ainda</Text>,
            },
            {
              chave: 'totalMensagens', titulo: 'Total', alinhar: 'right',
              render: (t) => <Badge texto={`${t.totalMensagens} msg`} tom={t.totalMensagens > 0 ? 'info' : 'default'} />,
            },
          ]}
        />
      </SectionCard>

      <Modal visivel={!!modalTurma} titulo={`Chat da turma · ${modalTurma?.nomeProfessor || ''}`} onFechar={() => setModalTurma(null)} largura={560}>
        <Text style={estilos.avisoSomenteLeitura}>A Secretaria acompanha esta conversa — quem participa é o professor e os alunos dele.</Text>
        {carregandoThread ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><SyncLoader size="small" color={ERP.texto} /></View>
        ) : mensagens.length === 0 ? (
          <EstadoVazio icone="chatbubbles-outline" texto="Nenhuma mensagem ainda nesta turma." />
        ) : (
          mensagens.map((m) => (
            <View key={m.id} style={estilos.linhaChat}>
              <Text style={estilos.autorChat}>{m.autorTipo === 'PROFESSOR' ? modalTurma?.nomeProfessor : (alunosDaTurma.find((a) => a.id === m.autorId)?.nome || 'Aluno')}</Text>
              <Text style={estilos.textoChat}>{m.texto}</Text>
              <Text style={estilos.dataChat}>{new Date(m.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
            </View>
          ))
        )}
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', color: ERP.textoMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  numeroGrande: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  semDados: { fontSize: 11.5, color: ERP.textoMuted, marginTop: 2 },
  nomeProfessor: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  previewMensagem: { fontSize: 13, color: ERP.texto },
  previewAutor: { fontWeight: '700', color: ERP.textoSecundario },
  avisoSomenteLeitura: { fontSize: 11.5, color: ERP.textoMuted, marginBottom: 12, fontStyle: 'italic' },
  linhaChat: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  autorChat: { fontSize: 12, fontWeight: '700', color: ERP.textoSecundario },
  textoChat: { fontSize: 13.5, color: ERP.texto, marginTop: 2 },
  dataChat: { fontSize: 10.5, color: ERP.textoMuted, marginTop: 3 },
});
