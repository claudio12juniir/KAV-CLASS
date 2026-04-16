import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ⚠️ IP DA SUA MÁQUINA
const ipDaSuaMaquina = "10.0.0.210"; 

export default function AlunosProfessorScreen() {
  const [alunos, setAlunos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  
  // Controle do Modal
  const [modalVisivel, setModalVisivel] = useState(false);
  const [alunoSelecionado, setAlunoSelecionado] = useState<any | null>(null);

  useEffect(() => {
    carregarAlunos();
  }, []);

  const carregarAlunos = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/meus-alunos?professorId=${professorId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        setAlunos(dados);
      }
    } catch (error) {
      Alert.alert("Erro", "Não foi possível carregar a lista de alunos.");
    } finally {
      setCarregando(false);
    }
  };

  const abrirPerfil = (aluno: any) => {
    setAlunoSelecionado(aluno);
    setModalVisivel(true);
  };

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
        <Text style={styles.titulo}>Meus Alunos</Text>
        <Text style={styles.subtitulo}>{alunos.length} alunos matriculados</Text>
      </View>

      <FlatList
        data={alunos}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.vazioContainer}>
            <Ionicons name="people-outline" size={48} color="#D0D8DC" />
            <Text style={styles.textoVazio}>Nenhum aluno cadastrado ainda.</Text>
            <Text style={styles.subtextoVazio}>Compartilhe o seu código de convite para eles se registrarem.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.cardAluno} onPress={() => abrirPerfil(item)}>
            <View style={styles.avatar}>
              <Text style={styles.letraAvatar}>{item.nome.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nomeAluno}>{item.nome}</Text>
              <Text style={styles.cursoAluno}>Ver histórico e evolução</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A0B0B9" />
          </TouchableOpacity>
        )}
      />

      {/* MODAL DO PERFIL DO ALUNO */}
      <Modal visible={modalVisivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisivel(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisivel(false)} style={styles.botaoFechar}>
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.modalTitulo}>Perfil do Aluno</Text>
            <View style={{ width: 40 }} />
          </View>

          {alunoSelecionado && (
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.perfilInfo}>
                <View style={[styles.avatar, { width: 80, height: 80, borderRadius: 40, marginBottom: 15 }]}>
                  <Text style={[styles.letraAvatar, { fontSize: 32 }]}>{alunoSelecionado.nome.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.perfilNome}>{alunoSelecionado.nome}</Text>
                <Text style={styles.perfilCurso}>{alunoSelecionado.email}</Text>
              </View>

              <View style={styles.linhaSeparadora} />

              <View style={styles.secaoTituloRow}>
                <Text style={styles.secaoTitulo}>Histórico de Aulas</Text>
              </View>

              {(!alunoSelecionado.aulas || alunoSelecionado.aulas.length === 0) ? (
                <Text style={styles.textoVazioHistorico}>Nenhuma aula registrada para este aluno.</Text>
              ) : (
                alunoSelecionado.aulas.map((aula: any) => (
                  <View key={aula.id} style={styles.cardHistorico}>
                    <View style={styles.topoHistorico}>
                      <Text style={styles.dataHistorico}>{new Date(aula.dataHora).toLocaleDateString('pt-BR')}</Text>
                      <View style={[styles.badgeIntensidade, { backgroundColor: '#E8F8EE' }]}>
                        <Text style={[styles.textoIntensidadeBadge, { color: '#154a22' }]}>{aula.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.conteudoHistorico}>{aula.tema || 'Aula regular'}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  titulo: { color: '#000000', fontSize: 26, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2 },
  
  lista: { paddingHorizontal: 20, paddingBottom: 40 },
  cardAluno: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4F8', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#D0D8DC' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  letraAvatar: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  nomeAluno: { color: '#000000', fontSize: 16, fontWeight: 'bold' },
  cursoAluno: { color: '#666', fontSize: 13, marginTop: 2 },

  vazioContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  textoVazio: { color: '#000000', fontSize: 18, fontWeight: 'bold', marginTop: 15, textAlign: 'center' },
  subtextoVazio: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  modalContainer: { flex: 1, backgroundColor: '#ffffff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  botaoFechar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center' },
  modalTitulo: { fontSize: 18, fontWeight: 'bold', color: '#000000' },
  modalContent: { padding: 20, paddingBottom: 60 },
  
  perfilInfo: { alignItems: 'center', marginBottom: 20 },
  perfilNome: { fontSize: 24, fontWeight: 'bold', color: '#000000' },
  perfilCurso: { fontSize: 15, color: '#666', marginTop: 4 },
  
  linhaSeparadora: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
  secaoTituloRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  secaoTitulo: { fontSize: 18, fontWeight: 'bold', color: '#000000' },
  
  textoVazioHistorico: { color: '#888', fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  cardHistorico: { backgroundColor: '#F0F4F8', borderRadius: 12, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#D0D8DC' },
  topoHistorico: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dataHistorico: { color: '#000000', fontWeight: 'bold', fontSize: 14 },
  badgeIntensidade: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  textoIntensidadeBadge: { fontSize: 12, fontWeight: 'bold' },
  conteudoHistorico: { color: '#555', fontSize: 14, lineHeight: 20 },
});