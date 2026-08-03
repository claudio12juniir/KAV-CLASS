import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;
const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes + 1, 0).getDate();
}

function primeiroDiaDaSemana(ano: number, mes: number) {
  return new Date(ano, mes, 1).getDay();
}

export default function CalendarioProfessorScreen() {
  const navigation = useNavigation();
  const hoje = new Date();
  const [mesAtual, setMesAtual] = useState(hoje.getMonth());
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [diaSelecionado, setDiaSelecionado] = useState(hoje.getDate());
  const [aulasMes, setAulasMes] = useState<Record<number, any[]>>({});
  const [carregando, setCarregando] = useState(true);

  // useFocusEffect já cobre o carregamento inicial (a tela nasce focada) e a
  // troca de mês/ano — o useEffect paralelo duplicava a mesma requisição.
  useFocusEffect(useCallback(() => { carregarCalendario(); }, [mesAtual, anoAtual]));

  const carregarCalendario = async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetchComRetry(
        `${API_URL}/api/calendario?professorId=${professorId}&mes=${mesAtual + 1}&ano=${anoAtual}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (resposta.ok) {
        const aulasAPI = await resposta.json();
        const mapaAulas: Record<number, any[]> = {};
        aulasAPI.forEach((aula: any) => {
          const dia = new Date(aula.dataHora).getDate();
          if (!mapaAulas[dia]) mapaAulas[dia] = [];
          mapaAulas[dia].push(aula);
        });
        setAulasMes(mapaAulas);
      }
    } catch (error) {
      console.error("Erro no calendário:", error);
    } finally {
      setCarregando(false);
    }
  };

  const irMesAnterior = () => {
    if (mesAtual === 0) { setMesAtual(11); setAnoAtual(a => a - 1); }
    else setMesAtual(m => m - 1);
    setDiaSelecionado(1);
  };

  const irProximoMes = () => {
    if (mesAtual === 11) { setMesAtual(0); setAnoAtual(a => a + 1); }
    else setMesAtual(m => m + 1);
    setDiaSelecionado(1);
  };

  const totalDias = diasNoMes(anoAtual, mesAtual);
  const offset = primeiroDiaDaSemana(anoAtual, mesAtual);
  const aulasDoDia = aulasMes[diaSelecionado] || [];

  const isHoje = (dia: number) =>
    dia === hoje.getDate() && mesAtual === hoje.getMonth() && anoAtual === hoje.getFullYear();

  // Monta o grid: células vazias + dias do mês
  const celulas: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];
  // Completa a última linha se necessário
  while (celulas.length % 7 !== 0) celulas.push(null);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.titulo}>AGENDA</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Navegação de mês */}
      <View style={styles.navMes}>
        <TouchableOpacity style={styles.navBotao} onPress={irMesAnterior}>
          <Ionicons name="chevron-back" size={20} color="#000" />
        </TouchableOpacity>
        <Text style={styles.labelMes}>{NOMES_MESES[mesAtual]} {anoAtual}</Text>
        <TouchableOpacity style={styles.navBotao} onPress={irProximoMes}>
          <Ionicons name="chevron-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Cabeçalho dos dias da semana */}
      <View style={styles.cabecalhoDias}>
        {NOMES_DIAS.map(d => (
          <Text key={d} style={styles.labelDiaSemana}>{d}</Text>
        ))}
      </View>

      {/* Grade do calendário */}
      {carregando ? (
        <View style={styles.loadingCalendario}>
          <SyncLoader size="small" color="#000" />
        </View>
      ) : (
        <View style={styles.grade}>
          {celulas.map((dia, idx) => {
            if (dia === null) return <View key={`vazio-${idx}`} style={styles.celula} />;
            const temAula = !!(aulasMes[dia] && aulasMes[dia].length > 0);
            const selecionado = diaSelecionado === dia;
            const ehHoje = isHoje(dia);
            return (
              <TouchableOpacity
                key={dia}
                style={[styles.celula, selecionado && styles.celulaAtiva, ehHoje && !selecionado && styles.celulaHoje]}
                onPress={() => setDiaSelecionado(dia)}
              >
                <Text style={[styles.diaTxt, selecionado && styles.diaTxtAtivo, ehHoje && !selecionado && styles.diaTxtHoje]}>
                  {dia}
                </Text>
                {temAula && <View style={[styles.ponto, selecionado && { backgroundColor: '#ffffff' }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Lista de aulas do dia selecionado */}
      <View style={styles.painelAulas}>
        <Text style={styles.tituloAulas}>
          Aulas de {diaSelecionado} de {NOMES_MESES[mesAtual]}
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {aulasDoDia.length === 0 ? (
            <View style={styles.vazio}>
              <Ionicons name="calendar-outline" size={36} color="#D0D8DC" />
              <Text style={styles.textoVazio}>Nenhuma aula para este dia.</Text>
            </View>
          ) : (
            aulasDoDia.map((aula) => (
              <View key={aula.id} style={[styles.cardAula, aula.tipo === 'REPOSICAO' && styles.cardReposicao]}>
                <View style={styles.horarioBox}>
                  <Text style={styles.textoHorario}>
                    {new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nomeAluno}>{aula.aluno?.nome || 'Aluno'}</Text>
                  <Text style={styles.tipoAula}>{aula.tipo === 'REGULAR' ? 'Aula Regular' : 'Reposição'}</Text>
                </View>
                {aula.tipo === 'REPOSICAO' && <Ionicons name="repeat" size={20} color="#E65100" />}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const CELL_SIZE = 44;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#D0D8DC',
  },
  hamburger: { padding: 4 },
  titulo: { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },

  navMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  navBotao: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0D8DC' },
  labelMes: { fontSize: 16, fontWeight: 'bold', color: '#000', textTransform: 'capitalize' },

  cabecalhoDias: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 10, marginBottom: 4 },
  labelDiaSemana: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 'bold', color: '#999', textTransform: 'uppercase' },

  loadingCalendario: { height: CELL_SIZE * 6, alignItems: 'center', justifyContent: 'center' },

  grade: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 4 },
  celula: { width: `${100 / 7}%`, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  celulaAtiva: { backgroundColor: '#000000' },
  celulaHoje: { backgroundColor: '#F0F4F8', borderWidth: 1.5, borderColor: '#000000' },
  diaTxt: { fontSize: 15, fontWeight: '500', color: '#333' },
  diaTxtAtivo: { color: '#ffffff', fontWeight: 'bold' },
  diaTxtHoje: { color: '#000000', fontWeight: 'bold' },
  ponto: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#32BCAD', marginTop: 2 },

  painelAulas: { flex: 1, backgroundColor: '#FAFAFA', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  tituloAulas: { fontSize: 16, fontWeight: 'bold', color: '#000000', marginBottom: 16, textTransform: 'capitalize' },
  cardAula: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 14, borderRadius: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, borderWidth: 1, borderColor: '#eee' },
  cardReposicao: { borderLeftWidth: 4, borderLeftColor: '#E65100' },
  horarioBox: { paddingRight: 14, marginRight: 14, borderRightWidth: 1, borderRightColor: '#eee' },
  textoHorario: { fontSize: 15, fontWeight: 'bold', color: '#000000' },
  nomeAluno: { fontSize: 15, fontWeight: 'bold', color: '#000000' },
  tipoAula: { fontSize: 12, color: '#666', marginTop: 2 },
  vazio: { alignItems: 'center', marginTop: 30, gap: 8 },
  textoVazio: { color: '#999', fontSize: 15 }
});
