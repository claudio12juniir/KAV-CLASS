// Rede Social — Epic D (Reels, 18/09/2026). Feed vertical em tela cheia,
// estilo TikTok/Instagram Reels: um vídeo por vez, ativo só o que está
// visível (o resto fica pausado, ver onViewableItemsChanged). Comentários
// abrem num modal por cima — a lista de swipe vertical não pode "abrir
// espaço" pro comentário como o Feed de texto faz, senão perde o paging.
// Compartilhada entre (professor) e (aluno); só professor vê o botão de
// publicar novo Reel (aluno só curte/comenta, mesma regra do Feed).
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { CORES } from '../constants/theme';
import { apiFetch } from '../app/api';
import SyncLoader from './SyncLoader';
import ReelCard, { Reel } from './ui/ReelCard';

const { height: ALTURA_TELA } = Dimensions.get('window');

type Comentario = {
  id: string;
  conteudo: string;
  createdAt: string;
  autor: { tipo: 'professor' | 'aluno'; id: string; nome: string; fotoUrl: string | null };
};

export default function Reels() {
  const router = useRouter();
  const [papel, setPapel] = useState<string | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [indiceAtivo, setIndiceAtivo] = useState(0);

  const [reelComentarios, setReelComentarios] = useState<Reel | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [novoComentario, setNovoComentario] = useState('');

  const carregarReels = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await apiFetch('/reels');
      if (resposta.ok) {
        const dados = await resposta.json();
        setReels(dados.reels || []);
      }
    } catch {
      // silencioso — tela mostra lista vazia
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const p = await SecureStore.getItemAsync('kav_papel');
      setPapel(p);
      setMeuId(await SecureStore.getItemAsync(p === 'professor' ? 'kav_professor_id' : 'kav_aluno_id'));
    })();
    carregarReels();
  }, [carregarReels]);

  const verPerfilDoAutor = (reel: Reel) => {
    if (reel.autor.tipo !== 'professor') return;
    router.push({ pathname: '/perfil-publico', params: { id: reel.autor.id, tipo: 'professor' } } as any);
  };

  const curtir = async (reel: Reel) => {
    setReels((atual) => atual.map((r) => r.id === reel.id
      ? { ...r, curtidoPeloUsuario: !r.curtidoPeloUsuario, totalCurtidas: r.totalCurtidas + (r.curtidoPeloUsuario ? -1 : 1) }
      : r));
    try {
      await apiFetch(`/reels/${reel.id}/curtir`, { method: 'POST' });
    } catch {
      carregarReels();
    }
  };

  const apagar = (reel: Reel) => {
    Alert.alert('Apagar Reel?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          const resposta = await apiFetch(`/reels/${reel.id}`, { method: 'DELETE' });
          if (resposta.ok) setReels((atual) => atual.filter((r) => r.id !== reel.id));
          else Alert.alert('Erro', 'Não foi possível apagar este Reel.');
        },
      },
    ]);
  };

  const abrirComentarios = async (reel: Reel) => {
    setReelComentarios(reel);
    try {
      const resposta = await apiFetch(`/reels/${reel.id}/comentarios`);
      const dados = await resposta.json();
      setComentarios(dados.comentarios || []);
    } catch {
      setComentarios([]);
    }
  };

  const comentar = async () => {
    if (!reelComentarios || !novoComentario.trim()) return;
    const texto = novoComentario.trim();
    try {
      const resposta = await apiFetch(`/reels/${reelComentarios.id}/comentarios`, { method: 'POST', body: JSON.stringify({ conteudo: texto }) });
      if (resposta.ok) {
        setNovoComentario('');
        const dadosComentarios = await (await apiFetch(`/reels/${reelComentarios.id}/comentarios`)).json();
        setComentarios(dadosComentarios.comentarios || []);
        setReels((atual) => atual.map((r) => r.id === reelComentarios.id ? { ...r, totalComentarios: r.totalComentarios + 1 } : r));
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível comentar.');
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setIndiceAtivo(viewableItems[0].index);
    }
  }).current;

  if (carregando) {
    return <View style={styles.centro}><SyncLoader size="large" color="#ffffff" /></View>;
  }

  return (
    <View style={styles.container}>
      {papel === 'professor' && (
        <TouchableOpacity style={styles.botaoNovo} onPress={() => router.push('/gravar-reel' as any)}>
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      {reels.length === 0 ? (
        <View style={styles.centro}>
          <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text style={styles.vazioTexto}>Nenhum Reel por aqui ainda.</Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={ALTURA_TELA}
          decelerationRate="fast"
          onRefresh={carregarReels}
          refreshing={false}
          viewabilityConfig={{ itemVisiblePercentThreshold: 90 }}
          onViewableItemsChanged={onViewableItemsChanged}
          getItemLayout={(_, index) => ({ length: ALTURA_TELA, offset: ALTURA_TELA * index, index })}
          renderItem={({ item, index }) => (
            <ReelCard
              reel={item}
              ativo={index === indiceAtivo}
              podeApagar={papel === 'professor' && item.autor.id === meuId}
              onVerPerfil={() => verPerfilDoAutor(item)}
              onCurtir={() => curtir(item)}
              onAbrirComentarios={() => abrirComentarios(item)}
              onApagar={() => apagar(item)}
            />
          )}
        />
      )}

      <Modal visible={!!reelComentarios} animationType="slide" transparent onRequestClose={() => setReelComentarios(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalFundo}>
          <View style={styles.modalConteudo}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Comentários</Text>
              <TouchableOpacity onPress={() => setReelComentarios(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={CORES.primaria} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={comentarios}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={styles.modalVazio}>Nenhum comentário ainda.</Text>}
              renderItem={({ item }) => (
                <View style={styles.comentarioItem}>
                  <Text style={styles.comentarioAutor}>{item.autor.nome}</Text>
                  <Text style={styles.comentarioTexto}>{item.conteudo}</Text>
                </View>
              )}
            />
            <View style={styles.comentarioNovoLinha}>
              <TextInput
                style={styles.comentarioInput}
                placeholder="Escreva um comentário..."
                placeholderTextColor={CORES.secundaria}
                value={novoComentario}
                onChangeText={setNovoComentario}
              />
              <TouchableOpacity onPress={comentar} hitSlop={10}>
                <Ionicons name="send" size={20} color={CORES.acento} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000', gap: 10 },
  vazioTexto: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  botaoNovo: {
    position: 'absolute', top: 52, right: 16, zIndex: 10,
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalConteudo: { backgroundColor: CORES.fundo, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  modalTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitulo: { fontSize: 15, fontWeight: '700', color: CORES.primaria },
  modalVazio: { color: CORES.secundaria, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  comentarioItem: { marginBottom: 10 },
  comentarioAutor: { fontSize: 12, fontWeight: '700', color: CORES.primaria },
  comentarioTexto: { fontSize: 13, color: CORES.secundaria },
  comentarioNovoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 10 },
  comentarioInput: { flex: 1, backgroundColor: CORES.superficie, borderRadius: 8, borderWidth: 1, borderColor: CORES.borda, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: CORES.primaria },
});
