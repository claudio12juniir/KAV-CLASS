// Tela de gravação/upload de Reel (Rede Social — Epic D, 18/09/2026). Fora
// de qualquer grupo de rota de propósito — igual perfil-publico.tsx e
// escolher-plano.tsx: é a mesma tela pra professor SELF ou professor/DONO/
// GESTOR de uma Escola (INSTITUTION), todos chegam aqui via router.push.
// Upload direto pro Cloudflare Stream (Direct Creator Upload) — o vídeo
// nunca passa pelo nosso servidor, só a URL descartável (POST
// /api/reels/upload-url) e o descricao/comoInstituicao.
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, RAIO } from '../constants/theme';
import { apiFetch, BASE_URL } from './api';

const DURACAO_MAXIMA_SEGUNDOS = 90;

type VideoEscolhido = { uri: string; nome: string; tipo: string };

export default function GravarReelScreen() {
  const [carregandoPerfil, setCarregandoPerfil] = useState(true);
  const [podePostarComoInstituicao, setPodePostarComoInstituicao] = useState(false);
  const [comoInstituicao, setComoInstituicao] = useState(false);
  const [video, setVideo] = useState<VideoEscolhido | null>(null);
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('kav_token');
        const professorId = (await SecureStore.getItemAsync('kav_professor_id')) || '';
        const res = await fetch(`${BASE_URL}/api/professor/perfil?professorId=${professorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const perfil = await res.json();
          setPodePostarComoInstituicao(['DONO', 'GESTOR'].includes(perfil.papel) && perfil.escola?.pacote === 'PACOTE_ESCOLA');
        }
      } catch {
        // sem conexão — segue sem a opção de postar como instituição
      } finally {
        setCarregandoPerfil(false);
      }
    })();
  }, []);

  const escolherVideo = async (fonte: 'galeria' | 'camera') => {
    const permissao = fonte === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', fonte === 'camera' ? 'Precisamos da câmera pra gravar.' : 'Precisamos acessar suas fotos e vídeos.');
      return;
    }

    const opcoes: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['videos'],
      videoMaxDuration: DURACAO_MAXIMA_SEGUNDOS,
      quality: 0.8,
    };
    const resultado = fonte === 'camera'
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes);

    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];
    if (asset.duration && asset.duration / 1000 > DURACAO_MAXIMA_SEGUNDOS + 1) {
      Alert.alert('Vídeo muito longo', `O Reel precisa ter no máximo ${DURACAO_MAXIMA_SEGUNDOS} segundos.`);
      return;
    }
    setVideo({ uri: asset.uri, nome: asset.fileName || 'reel.mp4', tipo: asset.mimeType || 'video/mp4' });
  };

  const enviarParaCloudflare = (uploadURL: string, arquivo: VideoEscolhido) => {
    return new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append('file', { uri: arquivo.uri, name: arquivo.nome, type: arquivo.tipo } as any);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadURL);
      xhr.upload.onprogress = (evento) => {
        if (evento.lengthComputable) setProgresso(Math.round((evento.loaded / evento.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Falha no upload do vídeo.')));
      xhr.onerror = () => reject(new Error('Falha de conexão durante o upload.'));
      xhr.send(form);
    });
  };

  const publicar = async () => {
    if (!video) return;
    setEnviando(true);
    setProgresso(0);
    try {
      const res = await apiFetch('/reels/upload-url', {
        method: 'POST',
        body: JSON.stringify({ descricao: descricao.trim() || undefined, comoInstituicao }),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || 'Não foi possível preparar o upload.');

      await enviarParaCloudflare(dados.uploadURL, video);

      Alert.alert('Reel publicado!', 'Seu vídeo está sendo processado e vai aparecer no feed em instantes.');
      router.back();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível publicar o Reel.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topo}>
        <TouchableOpacity onPress={() => router.back()} style={styles.voltar} disabled={enviando}>
          <Ionicons name="close" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.topoTitulo}>Novo Reel</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.corpo}>
        {video ? (
          <View style={styles.previewBox}>
            <Image source={{ uri: video.uri }} style={styles.previewThumb} />
            <TouchableOpacity style={styles.trocarVideo} onPress={() => setVideo(null)} disabled={enviando}>
              <Ionicons name="close-circle" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.escolhaLinha}>
            <TouchableOpacity style={styles.escolhaBotao} onPress={() => escolherVideo('camera')}>
              <Ionicons name="videocam-outline" size={28} color={CORES.acento} />
              <Text style={styles.escolhaTexto}>Gravar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.escolhaBotao} onPress={() => escolherVideo('galeria')}>
              <Ionicons name="images-outline" size={28} color={CORES.acento} />
              <Text style={styles.escolhaTexto}>Da galeria</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.dica}>Até {DURACAO_MAXIMA_SEGUNDOS} segundos.</Text>

        <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
        <TextInput
          style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Conte sobre esse Reel..."
          placeholderTextColor={CORES.secundaria}
          multiline
          maxLength={280}
          editable={!enviando}
        />

        {!carregandoPerfil && podePostarComoInstituicao && (
          <View style={styles.instituicaoLinha}>
            <Text style={styles.fieldLabel}>Publicar como instituição</Text>
            <Switch value={comoInstituicao} onValueChange={setComoInstituicao} trackColor={{ true: CORES.acento }} disabled={enviando} />
          </View>
        )}

        <TouchableOpacity
          style={[styles.btnPublicar, (!video || enviando) && { opacity: 0.5 }]}
          onPress={publicar}
          disabled={!video || enviando}
          activeOpacity={0.85}
        >
          {enviando ? (
            <>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.btnPublicarTexto}>Enviando... {progresso}%</Text>
            </>
          ) : (
            <Text style={styles.btnPublicarTexto}>Publicar Reel</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  voltar: { padding: 4 },
  topoTitulo: { fontSize: 16, fontWeight: '700', color: CORES.primaria },
  corpo: { padding: 20 },
  escolhaLinha: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  escolhaBotao: {
    flex: 1, aspectRatio: 1, borderRadius: 14, borderWidth: 1, borderColor: CORES.borda,
    backgroundColor: CORES.superficie, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  escolhaTexto: { color: CORES.primaria, fontSize: 13, fontWeight: '600' },
  dica: { color: CORES.secundaria, fontSize: 11, marginBottom: 18, textAlign: 'center' },
  previewBox: { alignSelf: 'center', width: 160, aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', marginBottom: 8, backgroundColor: '#000' },
  previewThumb: { width: '100%', height: '100%' },
  trocarVideo: { position: 'absolute', top: 6, right: 6 },
  fieldLabel: { color: CORES.secundaria, fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: CORES.superficie, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    color: CORES.primaria, fontSize: 15, marginBottom: 14,
    borderWidth: 1, borderColor: CORES.borda,
  },
  instituicaoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  btnPublicar: {
    flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CORES.acento, borderRadius: RAIO.pill, paddingVertical: 14, marginTop: 8,
  },
  btnPublicarTexto: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
