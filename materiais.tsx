import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES } from '../../constants/theme';

const API_URL = "https://kav-class-1.onrender.com";

interface Anexo {
  id: string;
  tipo: 'pdf' | 'video' | 'audio' | 'texto' | string;
  titulo: string;
}

interface AulaMaterial {
  id: string;
  data: string;
  tema: string;
  anexos: Anexo[];
}

export default function MateriaisScreen() {
  const navigation = useNavigation();
  const [aulas, setAulas] = useState<AulaMaterial[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aulaExpandida, setAulaExpandida] = useState<string | null>(null);

  useEffect(() => {
    carregarMateriais();
  }, []);

  const carregarMateriais = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || "";

      const resposta = await fetch(`${API_URL}/api/aluno/materiais?alunoId=${alunoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        
        // Mapeia os dados do banco (Prisma) para o formato do seu Layout
        const dadosFormatados: AulaMaterial[] = dados.map((aula: any) => ({
          id: aula.id,
          data: new Date(aula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
          tema: aula.tipo === 'REGULAR' ? 'Aula Regular' : 'Aula de Reposição', // No futuro pode puxar um campo "tema" real do banco
          anexos: aula.materiais.map((mat: any) => ({
            id: mat.id,
            tipo: mat.tipo,
            titulo: mat.titulo
          }))
        }));

        setAulas(dadosFormatados);
      }
    } catch (error) {
      console.error("Erro em materiais:", error);
    } finally {
      setCarregando(false);
    }
  };

  const alternarCard = (id: string) => {
    setAulaExpandida(aulaExpandida === id ? null : id);
  };

  const renderIconeAnexo = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'pdf': return <Ionicons name="document-text" size={24} color="#D9534F" />; 
      case 'video': return <Ionicons name="play-circle" size={24} color="#0275D8" />; 
      case 'audio': return <Ionicons name="musical-notes" size={24} color="#F0AD4E" />; 
      case 'texto': return <Ionicons name="text" size={24} color="#5BC0DE" />; 
      default: return <Ionicons name="document-outline" size={24} color="#000000" />;
    }
  };

  const renderAula = ({ item }: { item: AulaMaterial }) => {
    const estaAberto = aulaExpandida === item.id;

    return (
      <View style={styles.cardContainer}>
        <TouchableOpacity 
          style={styles.cardHeader} 
          onPress={() => alternarCard(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.infoAula}>
            <Text style={styles.dataAula}>{item.data}</Text>
            <Text style={styles.temaAula}>{item.tema}</Text>
          </View>
          <Ionicons 
            name={estaAberto ? "chevron-up" : "chevron-down"} 
            size={24}
            color={CORES.secundaria}
          />
        </TouchableOpacity>

        {estaAberto && (
          <View style={styles.cardContent}>
            <View style={styles.linhaDivisoria} />
            <Text style={styles.tituloAnexos}>Materiais desta aula:</Text>
            
            {item.anexos.map((anexo) => (
              <TouchableOpacity key={anexo.id} style={styles.botaoAnexo}>
                {renderIconeAnexo(anexo.tipo)}
                <Text style={styles.textoAnexo}>{anexo.titulo}</Text>
                <Ionicons name="download-outline" size={20} color={CORES.acento} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={CORES.acento} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={{ padding: 4, marginBottom: 12 }}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>MATERIAL DIDÁTICO</Text>
        <Text style={styles.subtitulo}>Seu histórico de estudos</Text>
      </View>

      {aulas.length === 0 ? (
        <Text style={{ textAlign: 'center', color: CORES.secundaria, marginTop: 40 }}>Nenhum material disponibilizado ainda.</Text>
      ) : (
        <FlatList
          data={aulas}
          keyExtractor={item => item.id}
          renderItem={renderAula}
          contentContainerStyle={styles.listaContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  titulo: { color: CORES.primaria, fontSize: 13, fontWeight: 'bold', letterSpacing: 3 },
  subtitulo: { color: CORES.secundaria, fontSize: 13, marginTop: 4 },
  listaContainer: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 16 },
  cardContainer: {
    backgroundColor: CORES.superficie, borderRadius: 12, marginBottom: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: CORES.borda,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  infoAula: { flex: 1 },
  dataAula: { color: CORES.secundaria, fontSize: 11, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' },
  temaAula: { color: CORES.primaria, fontSize: 15, fontWeight: '600' },
  cardContent: { paddingHorizontal: 18, paddingBottom: 18 },
  linhaDivisoria: { height: 1, backgroundColor: CORES.borda, marginBottom: 14 },
  tituloAnexos: { color: CORES.secundaria, fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  botaoAnexo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.fundo,
    padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: CORES.borda,
  },
  textoAnexo: { color: CORES.primaria, flex: 1, marginLeft: 12, fontSize: 14 },
});