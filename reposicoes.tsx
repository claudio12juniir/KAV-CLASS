import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ⚠️ AJUSTE O IP DO SEU MAC AQUI
const ipDaSuaMaquina = "192.168.0.0"; 

const statusConfig = {
  aguardando: { cor: '#E65100', bg: '#FFF4E5', label: 'Aguardando' },
  aprovada:   { cor: '#154a22', bg: '#E8F8EE', label: 'Aprovada' },
  recusada:   { cor: '#C62828', bg: '#FFEBEE', label: 'Recusada' },
};

export default function ReposicoesScreen() {
  const [reposicoes, setReposicoes] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  
  // Estados do Formulário
  const [alunoIdSelecionado, setAlunoIdSelecionado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  
  // 🕒 Novos Estados para a Roleta de Data/Hora
  const [dataSelecionada, setDataSelecionada] = useState(new Date());
  const [mostrarRoleta, setMostrarRoleta] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const [resAlunos, resRepos] = await Promise.all([
        fetch(`http://${ipDaSuaMaquina}:3000/api/meus-alunos?professorId=${professorId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`http://${ipDaSuaMaquina}:3000/api/reposicoes?professorId=${professorId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const listaAlunos = await resAlunos.json();
      const listaRepos = await resRepos.json();

      setAlunos(listaAlunos);
      setReposicoes(listaRepos);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setCarregando(false);
    }
  };

  const aoMudarData = (event: any, dataReal?: Date) => {
    if (Platform.OS === 'android') {
      setMostrarRoleta(false); // No Android o modal fecha sozinho após escolher
    }
    if (dataReal) {
      setDataSelecionada(dataReal);
    }
  };

  const fecharRoletaIOS = () => {
    setMostrarRoleta(false);
  };

  const enviarSolicitacao = async () => {
    if (!alunoIdSelecionado || !motivo) {
      Alert.alert("Atenção", "Selecione um aluno e preencha o motivo.");
      return;
    }

    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/reposicoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          professorId,
          alunoId: alunoIdSelecionado,
          // Enviamos a data como Timestamp ISO (Ex: 2026-04-15T14:00:00.000Z) para o banco!
          dataProposta: dataSelecionada.toISOString(), 
          motivo
        })
      });

      if (resposta.ok) {
        Alert.alert("Sucesso", "Solicitação enviada com sucesso!");
        setMotivo('');
        setAlunoIdSelecionado(null);
        setDataSelecionada(new Date()); // Reseta o relógio para hoje
        carregarDados();
      }
    } catch (error) {
      Alert.alert("Erro", "Falha ao conectar com o servidor.");
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.titulo}>Reposições</Text>
        <Text style={styles.subtitulo}>Ajuste sua agenda e evite faltas</Text>
      </View>

      <View style={styles.cardForm}>
        <Text style={styles.labelInput}>Para qual aluno?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollAlunos}>
          {alunos.map((aluno) => (
            <TouchableOpacity 
              key={aluno.id} 
              style={[styles.chipAluno, alunoIdSelecionado === aluno.id && styles.chipAlunoAtivo]} 
              onPress={() => setAlunoIdSelecionado(aluno.id)}
            >
              <Text style={[styles.textoChip, alunoIdSelecionado === aluno.id && { color: '#fff' }]}>{aluno.nome}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.labelInput}>Data e Horário Proposto</Text>
        
        {/* BOTÃO QUE ABRE A ROLETA */}
        <TouchableOpacity 
          style={styles.botaoData} 
          onPress={() => setMostrarRoleta(!mostrarRoleta)}
        >
          <Ionicons name="calendar-outline" size={20} color="#555" />
          <Text style={styles.textoData}>
            {dataSelecionada.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} às {dataSelecionada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>

        {/* ROLETA NATIVA (APARECE QUANDO CLICADO) */}
        {mostrarRoleta && (
          <View style={styles.containerRoleta}>
            <DateTimePicker
              value={dataSelecionada}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={aoMudarData}
              themeVariant="light"
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.botaoOkRoleta} onPress={fecharRoletaIOS}>
                <Text style={styles.textoOkRoleta}>Confirmar Horário</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.labelInput}>Motivo</Text>
        <TextInput 
          style={[styles.input, { height: 60 }]} 
          placeholder="Ex: Feriado ou Imprevisto" 
          value={motivo} 
          onChangeText={setMotivo} 
          multiline
        />

        <TouchableOpacity style={styles.botaoEnviar} onPress={enviarSolicitacao}>
          <Text style={styles.textoBotaoEnviar}>Solicitar Reposição</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Solicitações Recentes</Text>
        
        {reposicoes.length === 0 ? (
          <Text style={styles.textoVazio}>Nenhuma reposição encontrada.</Text>
        ) : (
          reposicoes.map((item) => {
            const config = statusConfig[item.status.toLowerCase() as keyof typeof statusConfig] || statusConfig.aguardando;
            
            // Tratamento caso a data guardada seja um ISO string
            let dataFormatada = item.dataProposta;
            if (item.dataProposta.includes('T')) {
              const d = new Date(item.dataProposta);
              dataFormatada = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            }

            return (
              <View key={item.id} style={[styles.card, { borderLeftColor: config.cor }]}>
                <View style={styles.topoCard}>
                  <Text style={styles.nomeAluno}>{item.aluno?.nome || 'Aluno'}</Text>
                  <View style={[styles.badgeStatus, { backgroundColor: config.bg }]}>
                    <Text style={[styles.textoBadge, { color: config.cor }]}>{config.label}</Text>
                  </View>
                </View>
                <Text style={styles.motivoTexto}><Text style={{fontWeight: 'bold'}}>Motivo:</Text> {item.motivo}</Text>
                <Text style={styles.dataTexto}><Text style={{fontWeight: 'bold'}}>Proposta:</Text> {dataFormatada}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 10 },
  titulo: { color: '#000000', fontSize: 26, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2 },

  cardForm: { margin: 20, padding: 20, backgroundColor: '#F0F4F8', borderRadius: 16, borderWidth: 1, borderColor: '#D0D8DC' },
  labelInput: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  scrollAlunos: { marginBottom: 15 },
  chipAluno: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#D0D8DC' },
  chipAlunoAtivo: { backgroundColor: '#000', borderColor: '#000' },
  textoChip: { fontSize: 13, fontWeight: '600', color: '#555' },
  
  // Estilos da nova Data
  botaoData: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 15, borderWidth: 1, borderColor: '#D0D8DC', gap: 10 },
  textoData: { fontSize: 15, color: '#000', fontWeight: '500' },
  containerRoleta: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  botaoOkRoleta: { marginTop: 10, backgroundColor: '#E8F8EE', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  textoOkRoleta: { color: '#154a22', fontWeight: 'bold' },

  input: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#D0D8DC', textAlignVertical: 'top' },
  botaoEnviar: { backgroundColor: '#000', borderRadius: 10, padding: 15, alignItems: 'center' },
  textoBotaoEnviar: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  secao: { paddingHorizontal: 20 },
  tituloSecao: { color: '#000', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { backgroundColor: '#F0F4F8', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: '#D0D8DC' },
  topoCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  nomeAluno: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  badgeStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  textoBadge: { fontSize: 11, fontWeight: 'bold' },
  motivoTexto: { color: '#666', fontSize: 13, marginBottom: 4 },
  dataTexto: { color: '#000', fontSize: 13 },
  textoVazio: { color: '#999', textAlign: 'center', marginTop: 10 }
});