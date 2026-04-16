import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ⚠️ AJUSTE SEU IP AQUI PARA TESTAR
const ipDaSuaMaquina = "10.1.6.238"; 

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

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/aluno/materiais?alunoId=${alunoId}`, {
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
            color="#000000" 
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
                <Ionicons name="download-outline" size={20} color="#000000" />
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
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.titulo}>Material Didático</Text>
        <Text style={styles.subtitulo}>Seu histórico de estudos</Text>
      </View>

      {aulas.length === 0 ? (
        <Text style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>Nenhum material disponibilizado ainda.</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  titulo: {
    color: '#000000',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitulo: {
    color: '#666',
    fontSize: 16,
    marginTop: 5,
  },
  listaContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  cardContainer: {
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D0D8DC'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  infoAula: {
    flex: 1,
  },
  dataAula: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'capitalize'
  },
  temaAula: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '600',
  },
  cardContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  linhaDivisoria: {
    height: 1,
    backgroundColor: '#D0D8DC',
    marginBottom: 15,
  },
  tituloAnexos: {
    color: '#666',
    fontSize: 14,
    marginBottom: 10,
  },
  botaoAnexo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D0D8DC',
  },
  textoAnexo: {
    color: '#000000',
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
  }
});