import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Alert, Image, Linking,
  Modal, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import * as FileSystem from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { CORES } from '../../constants/theme';

const API_URL = BASE_URL;

interface Anexo {
  id: string;
  tipo: string;
  titulo: string;
  url?: string | null;
  conteudo?: string | null;
}

interface AulaMaterial {
  id: string;
  data: string;
  tema: string;
  anexos: Anexo[];
}

interface MateriaisResposta {
  aulas: AulaMaterial[];
  materiaisAvulsos: Anexo[];
}

export default function MateriaisScreen() {
  const navigation = useNavigation();
  const [aulas, setAulas] = useState<AulaMaterial[]>([]);
  const [materiaisAvulsos, setMateriaisAvulsos] = useState<Anexo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aulaExpandida, setAulaExpandida] = useState<string | null>(null);
  const [modalImagem, setModalImagem] = useState<{ titulo: string; uri: string } | null>(null);
  const [modalTexto, setModalTexto] = useState<{ titulo: string; conteudo: string } | null>(null);

  const carregarMateriais = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';

      const resposta = await fetchComRetry(`${API_URL}/api/aluno/materiais?alunoId=${alunoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resposta.ok) {
        const dados: MateriaisResposta = await resposta.json();

        const aulasFormatadas: AulaMaterial[] = (dados.aulas || []).map((aula: any) => ({
          id: aula.id,
          data: new Date(aula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
          tema: aula.tipo === 'REGULAR' ? 'Aula Regular' : 'Aula de Reposição',
          anexos: aula.materiais.map((mat: any) => ({
            id: mat.id,
            tipo: mat.tipo,
            titulo: mat.titulo,
            url: mat.url || null,
            conteudo: mat.conteudo || null,
          })),
        }));

        const avulsos: Anexo[] = (dados.materiaisAvulsos || []).map((mat: any) => ({
          id: mat.id,
          tipo: mat.tipo,
          titulo: mat.titulo,
          url: mat.url || null,
          conteudo: mat.conteudo || null,
        }));

        setAulas(aulasFormatadas);
        setMateriaisAvulsos(avulsos);
      }
    } catch (error) {
      console.error('Erro em materiais:', error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarMateriais(); }, [carregarMateriais]));

  const alternarCard = (id: string) => {
    setAulaExpandida(aulaExpandida === id ? null : id);
  };

  const abrirURL = async (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await WebBrowser.openBrowserAsync(url);
    } else {
      await Linking.openURL(url);
    }
  };

  const abrirArquivoBase64 = async (anexo: Anexo) => {
    const matches = anexo.conteudo!.match(/^data:([^;]+);base64,(.+)$/s);
    if (!matches) {
      Alert.alert('Erro', 'Formato de arquivo não reconhecido.');
      return;
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileUri = `${FileSystem.cacheDirectory}kav_${anexo.id}.${ext}`;
    await FileSystem.writeAsStringAsync(fileUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Linking.openURL(fileUri);
  };

  const abrirMaterial = async (anexo: Anexo) => {
    const tipo = anexo.tipo.toLowerCase();

    try {
      // Imagem: exibe modal interno
      if (tipo === 'imagem') {
        const uri = anexo.url || anexo.conteudo;
        if (uri) {
          setModalImagem({ titulo: anexo.titulo, uri });
        } else {
          Alert.alert('Sem conteúdo', 'Imagem não disponível.');
        }
        return;
      }

      // Texto: exibe modal interno com scroll
      if (tipo === 'texto') {
        if (anexo.conteudo) {
          setModalTexto({ titulo: anexo.titulo, conteudo: anexo.conteudo });
        } else {
          Alert.alert('Sem conteúdo', 'Texto não disponível.');
        }
        return;
      }

      // Link e vídeo: abre no navegador
      if (tipo === 'link' || tipo === 'video') {
        if (anexo.url) {
          await abrirURL(anexo.url);
        } else {
          Alert.alert('Sem link', 'Nenhum link disponível para este material.');
        }
        return;
      }

      // PDF, arquivo, áudio: URL abre no navegador; base64 salva em cache e abre
      if (tipo === 'pdf' || tipo === 'arquivo' || tipo === 'audio') {
        if (anexo.url) {
          await abrirURL(anexo.url);
          return;
        }
        if (anexo.conteudo) {
          await abrirArquivoBase64(anexo);
          return;
        }
        Alert.alert('Sem conteúdo', 'Este arquivo não está disponível.');
        return;
      }

      // Fallback genérico
      if (anexo.url) {
        await abrirURL(anexo.url);
      } else if (anexo.conteudo) {
        setModalTexto({ titulo: anexo.titulo, conteudo: anexo.conteudo });
      } else {
        Alert.alert('Sem conteúdo', 'Este material não possui link ou conteúdo disponível.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir este material.');
    }
  };

  const renderIconeAnexo = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'link':    return <Ionicons name="link" size={24} color="#0275D8" />;
      case 'imagem':  return <Ionicons name="image" size={24} color="#5BC0DE" />;
      case 'pdf':     return <Ionicons name="document-text" size={24} color="#D9534F" />;
      case 'video':   return <Ionicons name="play-circle" size={24} color="#0275D8" />;
      case 'audio':   return <Ionicons name="musical-notes" size={24} color="#F0AD4E" />;
      case 'texto':   return <Ionicons name="reader-outline" size={24} color="#5BC0DE" />;
      case 'arquivo': return <Ionicons name="attach" size={24} color="#666666" />;
      default:        return <Ionicons name="document-outline" size={24} color="#000000" />;
    }
  };

  const renderIconeAcao = (tipo: string) => {
    const t = tipo.toLowerCase();
    if (t === 'imagem' || t === 'texto') {
      return <Ionicons name="eye-outline" size={20} color={CORES.acento} />;
    }
    return <Ionicons name="open-outline" size={20} color={CORES.acento} />;
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color={CORES.acento} />
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

      {aulas.length === 0 && materiaisAvulsos.length === 0 ? (
        <Text style={styles.semMateriais}>Nenhum material disponibilizado ainda.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.listaContainer} showsVerticalScrollIndicator={false}>

          {materiaisAvulsos.length > 0 && (
            <>
              <Text style={styles.labelSecao}>MATERIAIS GERAIS</Text>
              {materiaisAvulsos.map((anexo) => (
                <TouchableOpacity
                  key={anexo.id}
                  style={styles.botaoAnexo}
                  onPress={() => abrirMaterial(anexo)}
                  activeOpacity={0.7}
                >
                  {renderIconeAnexo(anexo.tipo)}
                  <Text style={styles.textoAnexo} numberOfLines={2}>{anexo.titulo}</Text>
                  {renderIconeAcao(anexo.tipo)}
                </TouchableOpacity>
              ))}
              <View style={styles.separador} />
            </>
          )}

          {aulas.length > 0 && (
            <>
              <Text style={styles.labelSecao}>MATERIAIS POR AULA</Text>
              {aulas.map((item) => (
                <View key={item.id} style={styles.cardContainer}>
                  <TouchableOpacity style={styles.cardHeader} onPress={() => alternarCard(item.id)} activeOpacity={0.7}>
                    <View style={styles.infoAula}>
                      <Text style={styles.dataAula}>{item.data}</Text>
                      <Text style={styles.temaAula}>{item.tema}</Text>
                    </View>
                    <Ionicons name={aulaExpandida === item.id ? 'chevron-up' : 'chevron-down'} size={24} color={CORES.secundaria} />
                  </TouchableOpacity>

                  {aulaExpandida === item.id && (
                    <View style={styles.cardContent}>
                      <View style={styles.linhaDivisoria} />
                      <Text style={styles.tituloAnexos}>Materiais desta aula:</Text>
                      {item.anexos.length === 0 ? (
                        <Text style={styles.semMateriais}>Nenhum material nesta aula.</Text>
                      ) : (
                        item.anexos.map((anexo) => (
                          <TouchableOpacity
                            key={anexo.id}
                            style={styles.botaoAnexo}
                            onPress={() => abrirMaterial(anexo)}
                            activeOpacity={0.7}
                          >
                            {renderIconeAnexo(anexo.tipo)}
                            <Text style={styles.textoAnexo} numberOfLines={2}>{anexo.titulo}</Text>
                            {renderIconeAcao(anexo.tipo)}
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Modal de Imagem */}
      <Modal visible={!!modalImagem} transparent animationType="fade" onRequestClose={() => setModalImagem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalImagem(null)}>
          <Pressable style={styles.modalImagemContainer} onPress={() => {}}>
            <Text style={styles.modalTitulo} numberOfLines={2}>{modalImagem?.titulo}</Text>
            {modalImagem && (
              <Image
                source={{ uri: modalImagem.uri }}
                style={styles.imagemCompleta}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity style={styles.botaoFechar} onPress={() => setModalImagem(null)}>
              <Text style={styles.textoBotaoFechar}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de Texto */}
      <Modal visible={!!modalTexto} transparent animationType="slide" onRequestClose={() => setModalTexto(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalTextoContainer}>
            <Text style={styles.modalTitulo} numberOfLines={2}>{modalTexto?.titulo}</Text>
            <View style={styles.linhaDivisoria} />
            <ScrollView style={styles.scrollTexto} showsVerticalScrollIndicator>
              <Text style={styles.textoConteudo}>{modalTexto?.conteudo}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.botaoFechar} onPress={() => setModalTexto(null)}>
              <Text style={styles.textoBotaoFechar}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  titulo: { color: CORES.primaria, fontSize: 13, fontWeight: 'bold', letterSpacing: 3 },
  subtitulo: { color: CORES.secundaria, fontSize: 13, marginTop: 4 },
  listaContainer: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 16 },
  semMateriais: { textAlign: 'center', color: CORES.secundaria, marginTop: 40, fontSize: 14 },
  labelSecao: {
    color: CORES.secundaria, fontSize: 11, fontWeight: 'bold',
    letterSpacing: 2, marginBottom: 12, marginTop: 4,
  },
  separador: { height: 1, backgroundColor: CORES.borda, marginVertical: 16 },
  cardContainer: {
    backgroundColor: CORES.superficie, borderRadius: 12, marginBottom: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: CORES.borda,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 18,
  },
  infoAula: { flex: 1 },
  dataAula: {
    color: CORES.secundaria, fontSize: 11, fontWeight: 'bold',
    marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase',
  },
  temaAula: { color: CORES.primaria, fontSize: 15, fontWeight: '600' },
  cardContent: { paddingHorizontal: 18, paddingBottom: 18 },
  linhaDivisoria: { height: 1, backgroundColor: CORES.borda, marginBottom: 14 },
  tituloAnexos: { color: CORES.secundaria, fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  botaoAnexo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.fundo,
    padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: CORES.borda,
  },
  textoAnexo: { color: CORES.primaria, flex: 1, marginLeft: 12, fontSize: 14 },
  // Modais
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalImagemContainer: {
    backgroundColor: CORES.superficie, borderRadius: 16, padding: 20,
    width: '100%', maxHeight: '85%', alignItems: 'center',
  },
  modalTextoContainer: {
    backgroundColor: CORES.superficie, borderRadius: 16, padding: 20,
    width: '100%', maxHeight: '80%',
  },
  modalTitulo: {
    color: CORES.primaria, fontSize: 16, fontWeight: '700',
    marginBottom: 14, textAlign: 'center',
  },
  imagemCompleta: { width: '100%', height: 320, borderRadius: 8, marginBottom: 16 },
  scrollTexto: { maxHeight: 400, marginBottom: 12 },
  textoConteudo: { color: CORES.primaria, fontSize: 15, lineHeight: 24 },
  botaoFechar: {
    backgroundColor: CORES.acento, borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 32,
    alignSelf: 'center', marginTop: 8,
  },
  textoBotaoFechar: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
