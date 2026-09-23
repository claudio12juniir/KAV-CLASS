// Tela pública de confirmação do convite "puxar conta existente pra virar
// aluno" (INSTITUTION Sprint 25, briefing 23/09/2026). O token É a
// credencial (mesmo padrão já usado nas páginas públicas de captação de
// lead, do lado do servidor) — não exige estar logado. Alcançada via o
// deep link do push notification, ou abrindo o link direto.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES } from '../../constants/theme';
import { BASE_URL, fetchComRetry } from '../api';

type Convite = {
  status: 'PENDENTE' | 'ACEITO' | 'RECUSADO';
  curso: string | null;
  conta: { nome: string | null };
  escola: { nome: string };
  professor: { nome: string };
};

export default function ConviteAlunoContaScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [carregando, setCarregando] = useState(true);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetchComRetry(`${BASE_URL}/api/publico/convite-aluno/${token}`);
      const dados = await res.json();
      if (res.ok) setConvite(dados);
      else setErro(dados.erro || 'Convite inválido.');
    } catch {
      setErro('Não foi possível carregar o convite. Verifique sua conexão.');
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (aceitar: boolean) => {
    setRespondendo(true);
    try {
      const res = await fetchComRetry(`${BASE_URL}/api/publico/convite-aluno/${token}/aceitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aceitar }),
      });
      const dados = await res.json();
      if (!res.ok) { setErro(dados.erro || 'Não foi possível responder.'); return; }

      if (!aceitar) {
        setConvite((c) => (c ? { ...c, status: 'RECUSADO' } : c));
        return;
      }

      await SecureStore.setItemAsync('kav_token', dados.token);
      await SecureStore.setItemAsync('kav_papel', 'aluno');
      await SecureStore.setItemAsync('kav_aluno_id', String(dados.aluno.id));
      router.replace('/(aluno)');
    } catch {
      setErro('Sem conexão. Tente novamente.');
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      {carregando ? (
        <ActivityIndicator size="large" color={CORES.acento} />
      ) : erro ? (
        <Text style={styles.erro}>{erro}</Text>
      ) : !convite ? (
        <Text style={styles.erro}>Convite não encontrado.</Text>
      ) : convite.status === 'ACEITO' ? (
        <Text style={styles.mensagem}>Você já aceitou este convite. Faça login normalmente.</Text>
      ) : convite.status === 'RECUSADO' ? (
        <Text style={styles.mensagem}>Você recusou este convite.</Text>
      ) : (
        <>
          <Text style={styles.titulo}>Convite pra ser aluno</Text>
          <Text style={styles.mensagem}>
            <Text style={styles.destaque}>{convite.escola.nome}</Text> quer te adicionar como aluno,
            com <Text style={styles.destaque}>{convite.professor.nome}</Text> como professor{convite.curso ? ` em ${convite.curso}` : ''}.
          </Text>
          <Text style={styles.sub}>Você confirma?</Text>

          <View style={styles.botoes}>
            <TouchableOpacity style={styles.botaoAceitar} onPress={() => responder(true)} disabled={respondendo}>
              <Text style={styles.botaoTexto}>Sim, sou aluno dessa escola</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botaoRecusar} onPress={() => responder(false)} disabled={respondendo}>
              <Text style={[styles.botaoTexto, { color: CORES.erro }]}>Não, recusar</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo, alignItems: 'center', justifyContent: 'center', padding: 24 },
  titulo: { fontSize: 20, fontWeight: 'bold', color: CORES.primaria, marginBottom: 14, textAlign: 'center' },
  mensagem: { fontSize: 15, color: CORES.primaria, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  destaque: { fontWeight: 'bold' },
  sub: { fontSize: 13, color: CORES.secundaria, marginTop: 8, marginBottom: 24 },
  erro: { fontSize: 15, color: CORES.erro, textAlign: 'center' },
  botoes: { width: '100%', gap: 12 },
  botaoAceitar: { backgroundColor: CORES.acento, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  botaoRecusar: { backgroundColor: 'transparent', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: CORES.erro },
  botaoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
