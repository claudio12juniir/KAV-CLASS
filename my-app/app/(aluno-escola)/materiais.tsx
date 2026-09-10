// Material Didático do aluno INSTITUTION — idêntico ao SELF
// ((aluno)/materiais.tsx), mesmo GET /api/aluno/materiais (sem branch de
// pacote). Arquivo copiado como base, só tema ERP + shell da INSTITUTION.
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

const API_URL = BASE_URL;

interface Anexo { id: string; tipo: string; titulo: string; url?: string | null; conteudo?: string | null }
interface AulaMaterial { id: string; data: string; tema: string; anexos: Anexo[] }
interface MateriaisResposta { aulas: AulaMaterial[]; materiaisAvulsos: Anexo[] }

export default function MateriaisAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();

  const [aulas, setAulas] = useState<AulaMaterial[]>([]);
  const [materiaisAvulsos, setMateriaisAvulsos] = useState<Anexo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aulaExpandida, setAulaExpandida] = useState<string | null>(null);
  const [modalImagem, setModalImagem] = useState<{ titulo: string; uri: string } | null>(null);
  const [modalTexto, setModalTexto] = useState<{ titulo: string; conteudo: string } | null>(null);

  const carregarMateriais = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/aluno/materiais`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) {
        const dados: MateriaisResposta = await resposta.json();
        setAulas((dados.aulas || []).map((aula: any) => ({
          id: aula.id,
          data: new Date(aula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
          tema: aula.tipo === 'REGULAR' ? 'Aula Regular' : 'Aula de Reposição',
          anexos: aula.materiais.map((mat: any) => ({ id: mat.id, tipo: mat.tipo, titulo: mat.titulo, url: mat.url || null, conteudo: mat.conteudo || null })),
        })));
        setMateriaisAvulsos((dados.materiaisAvulsos || []).map((mat: any) => ({ id: mat.id, tipo: mat.tipo, titulo: mat.titulo, url: mat.url || null, conteudo: mat.conteudo || null })));
      }
    } catch (error) {
      console.error('Erro em materiais:', error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregarMateriais(); }, [carregarMateriais]);

  const alternarCard = (id: string) => setAulaExpandida(aulaExpandida === id ? null : id);

  const abrirURL = async (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) await WebBrowser.openBrowserAsync(url);
    else await Linking.openURL(url);
  };

  const abrirArquivoBase64 = async (anexo: Anexo) => {
    const matches = anexo.conteudo!.match(/^data:([^;]+);base64,(.+)$/s);
    if (!matches) { Alert.alert('Erro', 'Formato de arquivo não reconhecido.'); return; }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileUri = `${FileSystem.cacheDirectory}kav_${anexo.id}.${ext}`;
    await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: anexo.titulo });
    else await Linking.openURL(fileUri);
  };

  const abrirMaterial = async (anexo: Anexo) => {
    const tipo = anexo.tipo.toLowerCase();
    try {
      if (tipo === 'imagem') {
        const uri = anexo.url || anexo.conteudo;
        if (uri) setModalImagem({ titulo: anexo.titulo, uri });
        else Alert.alert('Sem conteúdo', 'Imagem não disponível.');
        return;
      }
      if (tipo === 'texto') {
        if (anexo.conteudo) setModalTexto({ titulo: anexo.titulo, conteudo: anexo.conteudo });
        else Alert.alert('Sem conteúdo', 'Texto não disponível.');
        return;
      }
      if (tipo === 'link' || tipo === 'video') {
        if (anexo.url) await abrirURL(anexo.url);
        else Alert.alert('Sem link', 'Nenhum link disponível para este material.');
        return;
      }
      if (tipo === 'pdf' || tipo === 'arquivo' || tipo === 'audio') {
        if (anexo.url) { await abrirURL(anexo.url); return; }
        if (anexo.conteudo) { await abrirArquivoBase64(anexo); return; }
        Alert.alert('Sem conteúdo', 'Este arquivo não está disponível.');
        return;
      }
      if (anexo.url) await abrirURL(anexo.url);
      else if (anexo.conteudo) setModalTexto({ titulo: anexo.titulo, conteudo: anexo.conteudo });
      else Alert.alert('Sem conteúdo', 'Este material não possui link ou conteúdo disponível.');
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir este material.');
    }
  };

  const iconeAnexo = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'link': return <Ionicons name="link" size={22} color={ERP.info} />;
      case 'imagem': return <Ionicons name="image" size={22} color="#5BC0DE" />;
      case 'pdf': return <Ionicons name="document-text" size={22} color={ERP.perigo} />;
      case 'video': return <Ionicons name="play-circle" size={22} color={ERP.info} />;
      case 'audio': return <Ionicons name="musical-notes" size={22} color={ERP.aviso} />;
      case 'texto': return <Ionicons name="reader-outline" size={22} color="#5BC0DE" />;
      case 'arquivo': return <Ionicons name="attach" size={22} color={ERP.textoMuted} />;
      default: return <Ionicons name="document-outline" size={22} color={ERP.texto} />;
    }
  };

  const iconeAcao = (tipo: string) => {
    const t = tipo.toLowerCase();
    return <Ionicons name={t === 'imagem' || t === 'texto' ? 'eye-outline' : 'open-outline'} size={18} color={ERP.acentoForte} />;
  };

  const renderAnexo = (anexo: Anexo) => (
    <TouchableOpacity key={anexo.id} style={estilos.linhaAnexo} onPress={() => abrirMaterial(anexo)} activeOpacity={0.7}>
      {iconeAnexo(anexo.tipo)}
      <Text style={estilos.textoAnexo} numberOfLines={2}>{anexo.titulo}</Text>
      {iconeAcao(anexo.tipo)}
    </TouchableOpacity>
  );

  return (
    <MobileErpShell
      titulo="Material Didático"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Material Didático" subtitulo="Seu histórico de estudos" />

      {aulas.length === 0 && materiaisAvulsos.length === 0 ? (
        <SectionCard><EstadoVazio icone="book-outline" texto="Nenhum material disponibilizado ainda." /></SectionCard>
      ) : (
        <>
          {materiaisAvulsos.length > 0 && (
            <SectionCard titulo="Materiais gerais">
              {materiaisAvulsos.map(renderAnexo)}
            </SectionCard>
          )}

          {aulas.length > 0 && (
            <SectionCard titulo="Materiais por aula">
              {aulas.map((item) => (
                <View key={item.id} style={estilos.cardAula}>
                  <TouchableOpacity style={estilos.cardAulaHeader} onPress={() => alternarCard(item.id)} activeOpacity={0.7}>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.dataAula}>{item.data}</Text>
                      <Text style={estilos.temaAula}>{item.tema}</Text>
                    </View>
                    <Ionicons name={aulaExpandida === item.id ? 'chevron-up' : 'chevron-down'} size={20} color={ERP.textoMuted} />
                  </TouchableOpacity>
                  {aulaExpandida === item.id && (
                    <View style={estilos.cardAulaContent}>
                      {item.anexos.length === 0 ? (
                        <Text style={estilos.semAnexos}>Nenhum material nesta aula.</Text>
                      ) : (
                        item.anexos.map(renderAnexo)
                      )}
                    </View>
                  )}
                </View>
              ))}
            </SectionCard>
          )}
        </>
      )}

      <Modal visible={!!modalImagem} transparent animationType="fade" onRequestClose={() => setModalImagem(null)}>
        <Pressable style={estilos.modalOverlay} onPress={() => setModalImagem(null)}>
          <Pressable style={estilos.modalImagemContainer} onPress={() => {}}>
            <Text style={estilos.modalTitulo} numberOfLines={2}>{modalImagem?.titulo}</Text>
            {modalImagem && <Image source={{ uri: modalImagem.uri }} style={estilos.imagemCompleta} resizeMode="contain" />}
            <TouchableOpacity style={estilos.botaoFechar} onPress={() => setModalImagem(null)}>
              <Text style={estilos.textoBotaoFechar}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!modalTexto} transparent animationType="slide" onRequestClose={() => setModalTexto(null)}>
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalTextoContainer}>
            <Text style={estilos.modalTitulo} numberOfLines={2}>{modalTexto?.titulo}</Text>
            <View style={estilos.linhaDivisoria} />
            <ScrollView style={{ maxHeight: 400, marginBottom: 12 }}>
              <Text style={estilos.textoConteudo}>{modalTexto?.conteudo}</Text>
            </ScrollView>
            <TouchableOpacity style={estilos.botaoFechar} onPress={() => setModalTexto(null)}>
              <Text style={estilos.textoBotaoFechar}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  linhaAnexo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ERP.fundo,
    padding: 12, borderRadius: ERP.raio.sm, marginBottom: 8, borderWidth: 1, borderColor: ERP.borda,
  },
  textoAnexo: { color: ERP.texto, flex: 1, fontSize: 13.5 },
  cardAula: { borderWidth: 1, borderColor: ERP.borda, borderRadius: ERP.raio.md, marginBottom: 10, overflow: 'hidden' },
  cardAulaHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  dataAula: { color: ERP.textoMuted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 3 },
  temaAula: { color: ERP.texto, fontSize: 14, fontWeight: '700' },
  cardAulaContent: { paddingHorizontal: 14, paddingBottom: 14 },
  semAnexos: { color: ERP.textoMuted, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalImagemContainer: { backgroundColor: ERP.superficie, borderRadius: 16, padding: 20, width: '100%', maxHeight: '85%', alignItems: 'center' },
  modalTextoContainer: { backgroundColor: ERP.superficie, borderRadius: 16, padding: 20, width: '100%', maxHeight: '80%' },
  modalTitulo: { color: ERP.texto, fontSize: 16, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  imagemCompleta: { width: '100%', height: 320, borderRadius: 8, marginBottom: 16 },
  linhaDivisoria: { height: 1, backgroundColor: ERP.bordaSuave, marginBottom: 14 },
  textoConteudo: { color: ERP.texto, fontSize: 15, lineHeight: 24 },
  botaoFechar: { backgroundColor: ERP.acento, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 32, alignSelf: 'center', marginTop: 8 },
  textoBotaoFechar: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
