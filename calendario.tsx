import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// ⚠️ IP DO SEU MAC
const ipDaSuaMaquina = "192.168.0.0"; 

export default function CalendarioProfessorScreen() {
  const [diaSelecionado, setDiaSelecionado] = useState(new Date().getDate());
  const [aulasMes, setAulasMes] = useState<Record<number, any[]>>({});
  const [carregando, setCarregando] = useState(true);

  // Dados do mês atual para o cabeçalho
  const hoje = new Date();
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long' });
  const anoAtual = hoje.getFullYear();

  useEffect(() => {
    carregarCalendario();
  }, []);

  const carregarCalendario = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";
      
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/calendario?professorId=${professorId}&mes=${mes}&ano=${ano}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const aulasAPI = await resposta.json();
        
        // 🔄 Transformamos a lista flat em um objeto agrupado por dia: { 13: [...], 14: [...] }
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

  const aulasDoDia = aulasMes[diaSelecionado] || [];

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.titulo}>Calendário</Text>
        <Text style={styles.subtitulo}>{nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} {anoAtual}</Text>
      </View>

      {/* Grid de Dias do Mês */}
      <View style={styles.calendarioGrid}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(dia => {
            const temAula = aulasMes[dia] && aulasMes[dia].length > 0;
            const isAtivo = diaSelecionado === dia;

            return (
              <TouchableOpacity 
                key={dia} 
                style={[styles.diaBotao, isAtivo && styles.diaBotaoAtivo]} 
                onPress={() => setDiaSelecionado(dia)}
              >
                <Text style={[styles.diaTexto, isAtivo && styles.diaTextoAtivo]}>{dia}</Text>
                {temAula && !isAtivo && <View style={styles.pontoAula} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.aulasLista} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.tituloAulas}>Aulas do dia {diaSelecionado}</Text>
        
        {aulasDoDia.length === 0 ? (
          <View style={styles.vazio}>
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
                <Text style={styles.curso}>{aula.tipo === 'REGULAR' ? 'Aula Regular' : 'Reposição'}</Text>
              </View>
              {aula.tipo === 'REPOSICAO' && <Ionicons name="repeat" size={20} color="#E65100" />}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  titulo: { color: '#000000', fontSize: 26, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 16, marginTop: 4, textTransform: 'capitalize' },

  calendarioGrid: { height: 80, marginBottom: 10 },
  diaBotao: { width: 50, height: 60, backgroundColor: '#F0F4F8', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10, borderWidth: 1, borderColor: '#D0D8DC' },
  diaBotaoAtivo: { backgroundColor: '#000000', borderColor: '#000000' },
  diaTexto: { fontSize: 18, fontWeight: 'bold', color: '#000000' },
  diaTextoAtivo: { color: '#ffffff' },
  pontoAula: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#32BCAD', marginTop: 4 },

  aulasLista: { flex: 1, backgroundColor: '#FAFAFA', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  tituloAulas: { fontSize: 18, fontWeight: 'bold', color: '#000000', marginBottom: 20 },
  cardAula: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  cardReposicao: { borderLeftWidth: 5, borderLeftColor: '#E65100' },
  horarioBox: { paddingRight: 15, marginRight: 15, borderRightWidth: 1, borderRightColor: '#eee' },
  textoHorario: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  nomeAluno: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  curso: { fontSize: 13, color: '#666', marginTop: 2 },
  vazio: { alignItems: 'center', marginTop: 40 },
  textoVazio: { color: '#999', fontSize: 15 }
});