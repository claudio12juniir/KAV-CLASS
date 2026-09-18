// Rede Social Fase 4 — Feed. Comunidade fechada por Escola: o backend
// (GET /api/feed) já escopa pelo vínculo ativo de quem está logado, então
// esta tela só precisa renderizar o que vier — nenhum filtro extra aqui.
// Compartilhada entre (professor) e (aluno); só professor vê o composer de
// post novo (aluno só curte/comenta).

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES } from '../constants/theme';
import { apiFetch } from '../app/api';
import SyncLoader from './SyncLoader';
import Pill from './ui/Pill';
import PostCard, { Post } from './ui/PostCard';
import { Reel, reelThumbnailUrl } from './ui/ReelCard';

// Carrossel de Reels intercalado no topo do feed (Rede Social — Epic D,
// 18/09/2026): isca de captação, precisa aparecer mesmo pra quem só usa o
// Feed de texto e nunca abriu a aba própria de Reels. Carrega uma vez, não
// pagina (é só uma vitrine, a lista completa vive na aba Reels).
function CarrosselReels({ reels, aoAbrir }: { reels: Reel[]; aoAbrir: () => void }) {
  if (!reels.length) return null;
  return (
    <View style={styles.carrosselWrap}>
      <View style={styles.carrosselTopo}>
        <Text style={styles.carrosselTitulo}>Reels</Text>
        <TouchableOpacity onPress={aoAbrir}><Text style={styles.carrosselVerTodos}>Ver todos</Text></TouchableOpacity>
      </View>
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.carrosselItem} onPress={aoAbrir} activeOpacity={0.85}>
            <Image source={{ uri: reelThumbnailUrl(item) }} style={styles.carrosselThumb} />
            <View style={styles.carrosselPlayIcone}>
              <Ionicons name="play" size={14} color="#ffffff" />
            </View>
            <Text style={styles.carrosselAutor} numberOfLines={1}>{item.autor.nome}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

type Comentario = {
  id: string;
  conteudo: string;
  createdAt: string;
  autor: { tipo: 'professor' | 'aluno'; id: string; nome: string; fotoUrl: string | null };
};

export default function Feed() {
  const router = useRouter();
  const [papel, setPapel] = useState<string | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoConteudo, setNovoConteudo] = useState('');
  const [novoExclusivo, setNovoExclusivo] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [comentariosAbertos, setComentariosAbertos] = useState<Record<string, Comentario[]>>({});
  const [novoComentario, setNovoComentario] = useState<Record<string, string>>({});
  const [reels, setReels] = useState<Reel[]>([]);

  const carregarFeed = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await apiFetch('/feed');
      if (resposta.ok) {
        const dados = await resposta.json();
        setPosts(dados.posts || []);
      }
    } catch {
      // silencioso — tela mostra lista vazia, usuário pode puxar pra atualizar depois
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    apiFetch('/reels').then((r) => r.ok && r.json()).then((d) => d && setReels((d.reels || []).slice(0, 10))).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const p = await SecureStore.getItemAsync('kav_papel');
      setPapel(p);
      setMeuId(await SecureStore.getItemAsync(p === 'professor' ? 'kav_professor_id' : 'kav_aluno_id'));
    })();
    carregarFeed();
  }, [carregarFeed]);

  const publicar = async () => {
    if (!novoConteudo.trim()) return;
    setPublicando(true);
    try {
      const resposta = await apiFetch('/posts', { method: 'POST', body: JSON.stringify({ conteudo: novoConteudo.trim(), exclusivo: novoExclusivo }) });
      if (resposta.ok) {
        setNovoConteudo('');
        setNovoExclusivo(false);
        carregarFeed();
      } else {
        const dados = await resposta.json().catch(() => ({}));
        Alert.alert('Erro', dados.erro || 'Não foi possível publicar.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Não foi possível falar com o servidor.');
    } finally {
      setPublicando(false);
    }
  };

  const verPerfilDoAutor = (post: Post) => {
    if (post.autor.tipo !== 'professor') return;
    router.push({ pathname: '/perfil-publico', params: { id: post.autor.id, tipo: 'professor' } } as any);
  };

  const curtir = async (post: Post) => {
    if (post.bloqueado) { verPerfilDoAutor(post); return; }
    // Otimista: atualiza a UI na hora, sem esperar a resposta.
    setPosts((atual) => atual.map((p) => p.id === post.id
      ? { ...p, curtidoPeloUsuario: !p.curtidoPeloUsuario, totalCurtidas: p.totalCurtidas + (p.curtidoPeloUsuario ? -1 : 1) }
      : p));
    try {
      await apiFetch(`/posts/${post.id}/curtir`, { method: 'POST' });
    } catch {
      carregarFeed(); // se falhar, ressincroniza com o servidor
    }
  };

  const apagar = (post: Post) => {
    Alert.alert('Apagar post?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          const resposta = await apiFetch(`/posts/${post.id}`, { method: 'DELETE' });
          if (resposta.ok) setPosts((atual) => atual.filter((p) => p.id !== post.id));
          else Alert.alert('Erro', 'Não foi possível apagar este post.');
        },
      },
    ]);
  };

  const alternarComentarios = async (postId: string) => {
    if (comentariosAbertos[postId]) {
      setComentariosAbertos((atual) => { const novo = { ...atual }; delete novo[postId]; return novo; });
      return;
    }
    try {
      const resposta = await apiFetch(`/posts/${postId}/comentarios`);
      const dados = await resposta.json();
      setComentariosAbertos((atual) => ({ ...atual, [postId]: dados.comentarios || [] }));
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os comentários.');
    }
  };

  const comentar = async (postId: string) => {
    const texto = (novoComentario[postId] || '').trim();
    if (!texto) return;
    try {
      const resposta = await apiFetch(`/posts/${postId}/comentarios`, { method: 'POST', body: JSON.stringify({ conteudo: texto }) });
      if (resposta.ok) {
        setNovoComentario((atual) => ({ ...atual, [postId]: '' }));
        const dadosComentarios = await (await apiFetch(`/posts/${postId}/comentarios`)).json();
        setComentariosAbertos((atual) => ({ ...atual, [postId]: dadosComentarios.comentarios || [] }));
        setPosts((atual) => atual.map((p) => p.id === postId ? { ...p, totalComentarios: p.totalComentarios + 1 } : p));
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível comentar.');
    }
  };

  const abrirReels = () => {
    router.push((papel === 'professor' ? '/(professor)/reels' : '/(aluno)/reels') as any);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Feed</Text>

      <CarrosselReels reels={reels} aoAbrir={abrirReels} />

      {papel === 'professor' && (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="Compartilhe uma dica, novidade ou aviso..."
            placeholderTextColor={CORES.secundaria}
            value={novoConteudo}
            onChangeText={setNovoConteudo}
            multiline
          />
          <View style={styles.composerRodape}>
            <TouchableOpacity style={styles.exclusivoToggle} onPress={() => setNovoExclusivo((v) => !v)}>
              <Ionicons name={novoExclusivo ? 'star' : 'star-outline'} size={16} color={novoExclusivo ? '#E6A700' : CORES.secundaria} />
              <Text style={[styles.exclusivoToggleTexto, novoExclusivo && { color: '#E6A700' }]}>Exclusivo p/ assinantes</Text>
            </TouchableOpacity>
            <Pill texto="Publicar" onPress={publicar} disabled={!novoConteudo.trim()} carregando={publicando} tamanho="sm" />
          </View>
        </View>
      )}

      {carregando ? (
        <View style={styles.centro}><SyncLoader size="large" color={CORES.primaria} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          onRefresh={carregarFeed}
          refreshing={false}
          ListEmptyComponent={<Text style={styles.vazio}>Nenhuma novidade por aqui ainda.</Text>}
          renderItem={({ item }) => (
            <View style={styles.postWrapper}>
              <PostCard
                post={item}
                podeApagar={papel === 'professor' && item.autor.id === meuId}
                onVerPerfil={() => verPerfilDoAutor(item)}
                onCurtir={() => curtir(item)}
                onToggleComentarios={() => item.bloqueado ? verPerfilDoAutor(item) : alternarComentarios(item.id)}
                onApagar={() => apagar(item)}
              />

              {!item.bloqueado && comentariosAbertos[item.id] && (
                <View style={styles.comentariosBox}>
                  {comentariosAbertos[item.id].map((c) => (
                    <View key={c.id} style={styles.comentarioItem}>
                      <Text style={styles.comentarioAutor}>{c.autor.nome}</Text>
                      <Text style={styles.comentarioTexto}>{c.conteudo}</Text>
                    </View>
                  ))}
                  <View style={styles.comentarioNovoLinha}>
                    <TextInput
                      style={styles.comentarioInput}
                      placeholder="Escreva um comentário..."
                      placeholderTextColor={CORES.secundaria}
                      value={novoComentario[item.id] || ''}
                      onChangeText={(t) => setNovoComentario((atual) => ({ ...atual, [item.id]: t }))}
                    />
                    <TouchableOpacity onPress={() => comentar(item.id)}>
                      <Ionicons name="send" size={18} color={CORES.acento} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo, padding: 20 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: CORES.primaria, marginBottom: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vazio: { textAlign: 'center', color: CORES.secundaria, marginTop: 30, fontSize: 13 },
  carrosselWrap: { marginBottom: 16 },
  carrosselTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  carrosselTitulo: { fontSize: 14, fontWeight: '700', color: CORES.primaria },
  carrosselVerTodos: { fontSize: 12, color: CORES.acento, fontWeight: '600' },
  carrosselItem: { width: 84, height: 130, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  carrosselThumb: { width: '100%', height: '100%' },
  carrosselPlayIcone: { position: 'absolute', top: 6, right: 6 },
  carrosselAutor: { position: 'absolute', bottom: 4, left: 6, right: 6, color: '#ffffff', fontSize: 10, fontWeight: '700' },
  composer: { borderBottomWidth: 1, borderBottomColor: CORES.borda, paddingBottom: 14, marginBottom: 4 },
  composerInput: { minHeight: 50, color: CORES.primaria, fontSize: 15, textAlignVertical: 'top' },
  composerRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  exclusivoToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exclusivoToggleTexto: { fontSize: 12, color: CORES.secundaria, fontWeight: '600' },
  postWrapper: { borderBottomWidth: 1, borderBottomColor: CORES.borda },
  comentariosBox: { marginTop: -4, marginBottom: 10, gap: 8 },
  comentarioItem: { marginBottom: 2 },
  comentarioAutor: { fontSize: 12, fontWeight: '700', color: CORES.primaria },
  comentarioTexto: { fontSize: 12, color: CORES.secundaria },
  comentarioNovoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  comentarioInput: { flex: 1, backgroundColor: CORES.fundo, borderRadius: 8, borderWidth: 1, borderColor: CORES.borda, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: CORES.primaria },
});
