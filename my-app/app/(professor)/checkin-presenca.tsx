import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

type Aula = {
  id: string;
  dataHora: string;
  presenca: string | null;
  presencaProfessorEm: string | null;
  presencaAlunoEm: string | null;
  aluno?: { nome: string };
};

type Experimental = {
  id: string;
  dataHora: string;
  status: string;
  lead?: { nome: string };
};

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CheckinPresencaProfessor() {
  const navigation = useNavigation();
  const [carregando, setCarregando] = useState(true);
  const [aulasHoje, setAulasHoje] = useState<Aula[]>([]);
  const [experimentaisHoje, setExperimentaisHoje] = useState<Experimental[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [assuntos, setAssuntos] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resAulas, resExperimentais] = await Promise.all([
        fetchComRetry(`${API_URL}/api/aulas`, { headers }),
        fetchComRetry(`${API_URL}/api/aulas-experimentais?apenasMeu=1`, { headers }),
      ]);
      const hoje = new Date();
      if (resAulas.ok) {
        const todas: Aula[] = await resAulas.json();
        setAulasHoje(todas.filter((a) => mesmoDia(new Date(a.dataHora), hoje)));
      }
      if (resExperimentais.ok) {
        const todas: Experimental[] = await resExperimentais.json();
        setExperimentaisHoje(todas.filter((e) => mesmoDia(new Date(e.dataHora), hoje) && e.status === 'AGENDADA'));
      }
    } catch {
      // sem conexão — lista fica vazia, usuário pode puxar pra atualizar de novo ao reabrir
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const confirmarPresenca = async (aula: Aula) => {
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

      setConfirmandoId(aula.id);
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/aulas/${aula.id}/checkin-professor`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assuntoTratado: assuntos[aula.id] || '' }),
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
      setConfirmandoId(null);
    }
  };

  // Presença da experimental via biometria (INSTITUTION Sprint 11, briefing
  // 08/09/2026) — mesmo fluxo de biometria do checkin regular, endpoint
  // próprio porque AulaExperimental não é uma Aula.
  const confirmarExperimental = async (exp: Experimental) => {
    try {
      const temHardware = await LocalAuthentication.hasHardwareAsync();
      const inscrito = await LocalAuthentication.isEnrolledAsync();
      if (temHardware && inscrito) {
        const resultado = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirmar presença da experimental',
          fallbackLabel: 'Usar senha do dispositivo',
          cancelLabel: 'Cancelar',
        });
        if (!resultado.success) return;
      }

      setConfirmandoId(exp.id);
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/aulas-experimentais/${exp.id}/checkin-biometrico`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Presença confirmada!', dados.mensagem); carregar(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível confirmar.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmandoId(null);
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hamburger}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.titulo}>CONFIRMAR PRESENÇA</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subTitulo}>Aulas de hoje</Text>
        <Text style={styles.subtitulo}>Confirme sua presença — o aluno confirma a dele de forma independente.</Text>
      </View>

      {aulasHoje.length === 0 ? (
        <View style={styles.vazio}>
          <Ionicons name="calendar-outline" size={40} color="#999" />
          <Text style={styles.vazioTexto}>Nenhuma aula hoje.</Text>
        </View>
      ) : (
        aulasHoje.map((aula) => {
          const confirmado = !!aula.presencaProfessorEm;
          return (
            <View key={aula.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomeAluno}>{aula.aluno?.nome || 'Aluno'}</Text>
                <Text style={styles.horario}>{new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                {aula.presencaAlunoEm ? (
                  <Text style={styles.tagOk}>Aluno já confirmou</Text>
                ) : (
                  <Text style={styles.tagPendente}>Aluno ainda não confirmou</Text>
                )}
                {!confirmado && (
                  <TextInput
                    style={styles.inputAssunto}
                    placeholder="Assunto dado na aula (opcional)"
                    placeholderTextColor="#999"
                    value={assuntos[aula.id] || ''}
                    onChangeText={(v) => setAssuntos((atual) => ({ ...atual, [aula.id]: v }))}
                  />
                )}
              </View>
              <TouchableOpacity
                style={[styles.botao, confirmado && styles.botaoConfirmado]}
                onPress={() => confirmarPresenca(aula)}
                disabled={confirmado || confirmandoId === aula.id}
              >
                {confirmandoId === aula.id ? (
                  <SyncLoader size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={confirmado ? 'checkmark-circle' : 'finger-print-outline'} size={18} color="#fff" />
                    <Text style={styles.botaoTexto}>{confirmado ? 'Confirmado' : 'Confirmar'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {experimentaisHoje.length > 0 && (
        <>
          <View style={styles.subHeader}>
            <Text style={styles.subTitulo}>Experimentais de hoje</Text>
          </View>
          {experimentaisHoje.map((exp) => (
            <View key={exp.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomeAluno}>{exp.lead?.nome || 'Interessado'}</Text>
                <Text style={styles.horario}>{new Date(exp.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <TouchableOpacity style={styles.botao} onPress={() => confirmarExperimental(exp)} disabled={confirmandoId === exp.id}>
                {confirmandoId === exp.id ? (
                  <SyncLoader size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="finger-print-outline" size={18} color="#fff" />
                    <Text style={styles.botaoTexto}>Confirmar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </>
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
  subHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  subTitulo: { color: '#000000', fontSize: 22, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2, marginBottom: 4 },
  vazio: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  vazioTexto: { color: '#999', fontSize: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, margin: 20, marginBottom: 0, marginTop: 14,
    padding: 16, backgroundColor: '#F0F4F8', borderRadius: 16, borderWidth: 1, borderColor: '#D0D8DC',
  },
  nomeAluno: { fontSize: 15, fontWeight: '700', color: '#000' },
  horario: { fontSize: 13, color: '#555', marginTop: 2 },
  tagOk: { fontSize: 11.5, color: '#1B7A3D', fontWeight: '600', marginTop: 4 },
  tagPendente: { fontSize: 11.5, color: '#B26A00', fontWeight: '600', marginTop: 4 },
  inputAssunto: {
    marginTop: 8, borderWidth: 1, borderColor: '#D0D8DC', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: '#000', backgroundColor: '#fff',
  },
  botao: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#000',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  botaoConfirmado: { backgroundColor: '#1B7A3D' },
  botaoTexto: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
