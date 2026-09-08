import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

type Aula = {
  id: string;
  dataHora: string;
  presencaProfessorEm: string | null;
  presencaAlunoEm: string | null;
  professor?: { nome: string };
};

export default function CheckinPresencaAluno() {
  const navigation = useNavigation();
  const [carregando, setCarregando] = useState(true);
  const [proximaAula, setProximaAula] = useState<Aula | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/aluno/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const dados = await res.json();
        setProximaAula(dados.proximaAula || null);
      }
    } catch {
      // sem conexão — usuário pode reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const confirmarPresenca = async () => {
    if (!proximaAula) return;
    try {
      const temHardware = await LocalAuthentication.hasHardwareAsync();
      const inscrito = await LocalAuthentication.isEnrolledAsync();
      if (temHardware && inscrito) {
        const resultado = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirmar presença',
          fallbackLabel: 'Usar senha do dispositivo',
          cancelLabel: 'Cancelar',
        });
        if (!resultado.success) return;
      }

      setConfirmando(true);
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/aulas/${proximaAula.id}/checkin-aluno`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Presença confirmada!', dados.mensagem);
        carregar();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível confirmar.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmando(false);
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  const confirmado = !!proximaAula?.presencaAlunoEm;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.titulo}>CONFIRMAR PRESENÇA</Text>
        <View style={{ width: 40 }} />
      </View>

      {!proximaAula ? (
        <View style={styles.vazio}>
          <Ionicons name="calendar-outline" size={40} color="#999" />
          <Text style={styles.vazioTexto}>Nenhuma aula agendada.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.nomeProfessor}>Aula com {proximaAula.professor?.nome || 'seu professor'}</Text>
          <Text style={styles.horario}>{new Date(proximaAula.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
          {proximaAula.presencaProfessorEm ? (
            <Text style={styles.tagOk}>Professor já confirmou</Text>
          ) : (
            <Text style={styles.tagPendente}>Professor ainda não confirmou</Text>
          )}

          <TouchableOpacity
            style={[styles.botao, confirmado && styles.botaoConfirmado]}
            onPress={confirmarPresenca}
            disabled={confirmado || confirmando}
          >
            {confirmando ? (
              <SyncLoader size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={confirmado ? 'checkmark-circle' : 'finger-print-outline'} size={20} color="#fff" />
                <Text style={styles.botaoTexto}>{confirmado ? 'Presença confirmada' : 'Confirmar minha presença'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#D0D8DC', backgroundColor: '#ffffff',
  },
  hamburger: { padding: 4 },
  titulo: { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  vazio: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  vazioTexto: { color: '#999', fontSize: 14 },
  card: {
    margin: 20, padding: 22, backgroundColor: '#F0F4F8', borderRadius: 16,
    borderWidth: 1, borderColor: '#D0D8DC', alignItems: 'center', gap: 6,
  },
  nomeProfessor: { fontSize: 17, fontWeight: '700', color: '#000', textAlign: 'center' },
  horario: { fontSize: 14, color: '#555' },
  tagOk: { fontSize: 12.5, color: '#1B7A3D', fontWeight: '600', marginBottom: 8 },
  tagPendente: { fontSize: 12.5, color: '#B26A00', fontWeight: '600', marginBottom: 8 },
  botao: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#000',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14, marginTop: 10,
  },
  botaoConfirmado: { backgroundColor: '#1B7A3D' },
  botaoTexto: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
