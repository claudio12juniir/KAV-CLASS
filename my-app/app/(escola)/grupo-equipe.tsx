import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Badge, Botao, ErpShell, EstadoVazio, PageHeader, SectionCard } from './_ui';

type MensagemEquipe = {
  id: string;
  texto: string;
  fixado: boolean;
  autor: { id: string; nome: string };
  createdAt: string;
};

// Grupo interno dos professores (INSTITUTION Sprint 17, briefing
// 22/09/2026) — distinto do Chat da Turma (professor↔alunos): aqui é só
// DONO/GESTOR/PROFESSOR da mesma Escola, pra avisos internos e mídia/
// mensagem fixada (ex.: link fixo de aula ao vivo via Meet).
export default function GrupoEquipeEscola() {
  const { papel } = useEscolaContexto();
  const podeFixar = papel === 'DONO' || papel === 'GESTOR';
  const [carregando, setCarregando] = useState(true);
  const [mensagens, setMensagens] = useState<MensagemEquipe[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fixandoId, setFixandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/mensagens-equipe`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMensagens(await res.json());
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/mensagens-equipe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto.trim() }),
      });
      if (res.ok) { setTexto(''); carregar(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível enviar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const alternarFixado = async (m: MensagemEquipe) => {
    setFixandoId(m.id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/mensagens-equipe/${m.id}/fixar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixado: !m.fixado }),
      });
      if (res.ok) carregar();
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível atualizar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setFixandoId(null);
    }
  };

  const fixadas = mensagens.filter((m) => m.fixado);
  const outras = mensagens.filter((m) => !m.fixado);

  if (carregando) {
    return (
      <ErpShell titulo="Grupo da Equipe">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      </ErpShell>
    );
  }

  return (
    <ErpShell titulo="Grupo da Equipe">
      <PageHeader titulo="Grupo da Equipe" subtitulo="Avisos internos entre professores, gestão e dono — separado do chat com alunos." />

      {fixadas.length > 0 && (
        <SectionCard titulo="Fixadas" style={{ borderColor: ERP.acento }}>
          {fixadas.map((m) => (
            <MensagemLinha key={m.id} mensagem={m} podeFixar={podeFixar} onAlternarFixado={() => alternarFixado(m)} carregandoFixar={fixandoId === m.id} />
          ))}
        </SectionCard>
      )}

      <SectionCard>
        {outras.length === 0 && fixadas.length === 0 ? (
          <EstadoVazio icone="chatbubbles-outline" texto="Nenhuma mensagem no grupo ainda." />
        ) : (
          outras.map((m) => (
            <MensagemLinha key={m.id} mensagem={m} podeFixar={podeFixar} onAlternarFixado={() => alternarFixado(m)} carregandoFixar={fixandoId === m.id} />
          ))
        )}
      </SectionCard>

      <SectionCard>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <TextInput
            style={estilos.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Escreva um aviso pro grupo..."
            multiline
          />
          <Botao texto="Enviar" onPress={enviar} carregando={enviando} />
        </View>
      </SectionCard>
    </ErpShell>
  );
}

function MensagemLinha({ mensagem, podeFixar, onAlternarFixado, carregandoFixar }: {
  mensagem: MensagemEquipe; podeFixar: boolean; onAlternarFixado: () => void; carregandoFixar: boolean;
}) {
  return (
    <View style={estilos.linha}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={estilos.autor}>{mensagem.autor.nome}</Text>
          {mensagem.fixado && <Badge texto="Fixada" tom="info" />}
        </View>
        <Text style={estilos.texto}>{mensagem.texto}</Text>
        <Text style={estilos.data}>{new Date(mensagem.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
      </View>
      {podeFixar && (
        <Botao texto={mensagem.fixado ? 'Desafixar' : 'Fixar'} variante="secundario" onPress={onAlternarFixado} carregando={carregandoFixar} />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  autor: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario },
  texto: { fontSize: 13.5, color: ERP.texto, marginTop: 2 },
  data: { fontSize: 10.5, color: ERP.textoMuted, marginTop: 3 },
  input: { flex: 1, minHeight: 40, maxHeight: 100, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: ERP.raio.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13.5, color: ERP.texto, backgroundColor: ERP.superficie },
});
