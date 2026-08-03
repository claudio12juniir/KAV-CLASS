import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { CORES } from '../../constants/theme';

const API_URL = BASE_URL;

interface Reposicao {
  id: string;
  professor: { nome: string; cursos: string[] };
  dataOriginal: string | null;
  dataProposta: string;
  motivo: string;
  status: string;
}

export default function ReposicoesScreen() {
  const navigation = useNavigation();
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregarReposicoes = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';

      const resposta = await fetchComRetry(`${API_URL}/api/aluno/reposicoes?alunoId=${alunoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        setReposicoes(dados);
      }
    } catch (error) {
      console.error("Erro ao carregar reposições:", error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarReposicoes(); }, [carregarReposicoes]));

  const confirmarReposicao = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/reposicoes/${id}/confirmar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        Alert.alert("Confirmado!", "Reposição adicionada ao seu calendário.");
        carregarReposicoes();
      } else {
        Alert.alert("Erro", "Não foi possível confirmar a reposição.");
      }
    } catch {
      Alert.alert("Erro", "Falha na conexão com o servidor.");
    }
  };

  const solicitarNovoHorario = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/reposicoes/${id}/solicitar-outro`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        Alert.alert("Solicitação Enviada", "O professor será notificado e entrará em contato com novos horários.");
        carregarReposicoes();
      } else {
        Alert.alert("Erro", "Não foi possível enviar a solicitação.");
      }
    } catch {
      Alert.alert("Erro", "Falha na conexão com o servidor.");
    }
  };

  const pendentes = reposicoes.filter(r => r.status === 'AGUARDANDO');
  const confirmadas = reposicoes.filter(r => r.status === 'CONFIRMADA');

  if (carregando) {
    return (
      <View style={styles.loadingContainer}>
        <SyncLoader size="large" color={CORES.acento} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={{ padding: 4, marginBottom: 12 }}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>REPOSIÇÕES</Text>
        <Text style={styles.subtitulo}>Gerencie seus horários remarcados</Text>
      </View>

      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Aguardando sua confirmação</Text>

        {pendentes.length === 0 ? (
          <View style={styles.cardVazio}>
            <Ionicons name="checkmark-done-circle-outline" size={40} color={CORES.acento} />
            <Text style={styles.textoVazio}>Você não tem reposições pendentes.</Text>
          </View>
        ) : (
          pendentes.map((item) => (
            <View key={item.id} style={styles.cardPendente}>
              <View style={styles.avisoPendente}>
                <Ionicons name="alert-circle" size={20} color={CORES.aviso} />
                <Text style={styles.textoAvisoPendente}>Nova Proposta de Horário</Text>
              </View>

              <Text style={styles.nomeProfessor}>
                Prof. {item.professor.nome}
                {item.professor.cursos?.[0] ? ` (${item.professor.cursos[0]})` : ''}
              </Text>
              <Text style={styles.motivo}>Motivo da remarcação: {item.motivo}</Text>

              <View style={styles.boxDatas}>
                {item.dataOriginal && (
                  <View style={styles.linhaData}>
                    <Text style={styles.labelData}>Aula Original:</Text>
                    <Text style={styles.textoDataOriginal}>{item.dataOriginal}</Text>
                  </View>
                )}
                <View style={styles.linhaData}>
                  <Text style={styles.labelData}>Novo Horário:</Text>
                  <Text style={styles.textoDataProposta}>{item.dataProposta}</Text>
                </View>
              </View>

              <View style={styles.boxBotoes}>
                <TouchableOpacity
                  style={[styles.botaoAcao, styles.botaoRecusar]}
                  onPress={() => solicitarNovoHorario(item.id)}
                >
                  <Text style={styles.textoBotaoRecusar}>Outro Horário</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.botaoAcao, styles.botaoConfirmar]}
                  onPress={() => confirmarReposicao(item.id)}
                >
                  <Text style={styles.textoBotaoConfirmar}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Reposições Agendadas</Text>

        {confirmadas.length === 0 ? (
          <View style={styles.cardVazio}>
            <Ionicons name="calendar-outline" size={40} color={CORES.secundaria} />
            <Text style={styles.textoVazio}>Nenhuma reposição agendada.</Text>
          </View>
        ) : (
          confirmadas.map((item) => (
            <View key={item.id} style={styles.cardConfirmado}>
              <View style={styles.infoConfirmado}>
                <Text style={styles.nomeProfessorConfirmado}>
                  Prof. {item.professor.nome}
                  {item.professor.cursos?.[0] ? ` (${item.professor.cursos[0]})` : ''}
                </Text>
                <Text style={styles.textoDataConfirmada}>{item.dataProposta}</Text>
                {item.dataOriginal && (
                  <Text style={styles.motivoConfirmado}>Referente à falta de {item.dataOriginal}</Text>
                )}
              </View>
              <View style={styles.seloConfirmado}>
                <Ionicons name="checkmark-circle" size={28} color={CORES.sucesso} />
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CORES.fundo },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  titulo: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  subtitulo: { color: CORES.secundaria, fontSize: 13, marginTop: 4 },
  secao: { paddingHorizontal: 20, marginBottom: 25, marginTop: 20 },
  tituloSecao: { color: CORES.secundaria, fontSize: 11, fontWeight: 'bold', letterSpacing: 2, marginBottom: 14 },
  cardVazio: {
    backgroundColor: CORES.superficie, borderRadius: 12, padding: 30,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: CORES.borda, borderStyle: 'dashed',
  },
  textoVazio: { color: CORES.secundaria, fontSize: 14, marginTop: 10 },
  cardPendente: {
    backgroundColor: CORES.superficie, borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: CORES.aviso, marginBottom: 12,
  },
  avisoPendente: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  textoAvisoPendente: { color: CORES.aviso, fontWeight: 'bold', fontSize: 13 },
  nomeProfessor: { color: CORES.primaria, fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  motivo: { color: CORES.secundaria, fontSize: 13, marginBottom: 14 },
  boxDatas: { backgroundColor: CORES.fundo, padding: 14, borderRadius: 8, marginBottom: 18, borderWidth: 1, borderColor: CORES.borda },
  linhaData: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  labelData: { color: CORES.secundaria, fontSize: 13 },
  textoDataOriginal: { color: CORES.secundaria, fontSize: 13, textDecorationLine: 'line-through' },
  textoDataProposta: { color: CORES.acento, fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace' },
  boxBotoes: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  botaoAcao: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  botaoRecusar: { backgroundColor: 'transparent', borderWidth: 1, borderColor: CORES.borda },
  textoBotaoRecusar: { color: CORES.primaria, fontWeight: 'bold' },
  botaoConfirmar: { backgroundColor: CORES.acento },
  textoBotaoConfirmar: { color: CORES.fundo, fontWeight: 'bold' },
  cardConfirmado: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: CORES.superficie, padding: 15, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: CORES.borda,
  },
  infoConfirmado: { flex: 1 },
  nomeProfessorConfirmado: { color: CORES.primaria, fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  textoDataConfirmada: { color: CORES.acento, fontSize: 13, fontWeight: 'bold', marginBottom: 4, fontFamily: 'monospace' },
  motivoConfirmado: { color: CORES.secundaria, fontSize: 12 },
  seloConfirmado: { marginLeft: 15 },
});
