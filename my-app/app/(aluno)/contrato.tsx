import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { CORES } from '../../constants/theme';
import { BASE_URL, fetchComRetry } from '../api';

// Aba Contrato (INSTITUTION Sprint 23, briefing 23/09/2026) — o aluno vê e
// baixa o contrato que a escola/professor anexou no cadastro dele.
export default function ContratoAluno() {
  const [carregando, setCarregando] = useState(true);
  const [contratoUrl, setContratoUrl] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/contrato`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setContratoUrl((await res.json()).contratoUrl);
    } catch {
      // tela mostra "sem contrato" se falhar, sem travar
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const abrirContrato = async () => {
    if (!contratoUrl) return;
    try {
      await WebBrowser.openBrowserAsync(contratoUrl);
    } catch {
      Linking.openURL(contratoUrl);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 8 }}>
          <Ionicons name="arrow-back" size={22} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>CONTRATO</Text>
        <Text style={styles.subtitulo}>O contrato anexado pela sua escola/professor</Text>
      </View>

      {carregando ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={CORES.primaria} /></View>
      ) : !contratoUrl ? (
        <View style={styles.vazio}>
          <Ionicons name="document-text-outline" size={40} color={CORES.secundaria} />
          <Text style={styles.semContrato}>Nenhum contrato anexado ainda.</Text>
        </View>
      ) : (
        <View style={{ padding: 20 }}>
          <TouchableOpacity style={styles.botaoAbrir} onPress={abrirContrato} activeOpacity={0.8}>
            <Ionicons name="document-text" size={20} color="#fff" />
            <Text style={styles.botaoAbrirTexto}>Ver / baixar contrato</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  titulo: { fontSize: 20, fontWeight: 'bold', color: CORES.primaria, letterSpacing: 1 },
  subtitulo: { fontSize: 13, color: CORES.secundaria, marginTop: 4 },
  vazio: { alignItems: 'center', paddingTop: 60, gap: 12 },
  semContrato: { color: CORES.secundaria, fontSize: 14 },
  botaoAbrir: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: CORES.acento, paddingVertical: 14, borderRadius: 10,
  },
  botaoAbrirTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
