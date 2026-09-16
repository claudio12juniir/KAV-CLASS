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
  ActivityIndicator,
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

type Autor = { tipo: 'professor' | 'escola'; id: string; nome: string; fotoUrl: string | null };

type Post = {
  id: string;
  conteudo: string | null;
  midiaUrl: string | null;
  exclusivo: boolean;
  bloqueado: boolean;
  createdAt: string;
  autor: Autor;
  totalCurtidas: number;
  totalComentarios: number;
  curtidoPeloUsuario: boolean;
};

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

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Feed</Text>

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
            <TouchableOpacity style={styles.composerBotao} onPress={publicar} disabled={publicando || !novoConteudo.trim()}>
              {publicando ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.composerBotaoTexto}>Publicar</Text>}
            </TouchableOpacity>
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
            <View style={styles.card}>
              <View style={styles.cardTopo}>
                {item.autor.fotoUrl ? (
                  <Image source={{ uri: item.autor.fotoUrl }} style={styles.autorFoto} />
                ) : (
                  <View style={styles.autorFotoFallback}>
                    <Text style={styles.autorFotoLetra}>{item.autor.nome[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.autorNome}>{item.autor.nome}</Text>
                  <Text style={styles.dataTexto}>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</Text>
                </View>
                {papel === 'professor' && item.autor.id === meuId && (
                  <TouchableOpacity onPress={() => apagar(item)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={18} color={CORES.secundaria} />
                  </TouchableOpacity>
                )}
              </View>

              {item.exclusivo && (
                <View style={styles.exclusivoBadge}>
                  <Ionicons name="star" size={11} color="#E6A700" />
                  <Text style={styles.exclusivoBadgeTexto}>Conteúdo exclusivo</Text>
                </View>
              )}

              {item.bloqueado ? (
                <TouchableOpacity style={styles.bloqueadoBox} onPress={() => verPerfilDoAutor(item)} activeOpacity={0.85}>
                  <Ionicons name="lock-closed" size={22} color={CORES.secundaria} />
                  <Text style={styles.bloqueadoTexto}>
                    Assine o conteúdo exclusivo de {item.autor.nome} pra ver este post.
                  </Text>
                  <Text style={styles.bloqueadoLink}>Ver perfil e assinar</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.conteudo}>{item.conteudo}</Text>
                  {item.midiaUrl ? <Image source={{ uri: item.midiaUrl }} style={styles.midia} /> : null}
                </>
              )}

              <View style={styles.acoes}>
                <TouchableOpacity style={styles.acaoBotao} onPress={() => curtir(item)}>
                  <Ionicons name={item.curtidoPeloUsuario ? 'heart' : 'heart-outline'} size={20} color={item.curtidoPeloUsuario ? CORES.erro : CORES.secundaria} />
                  <Text style={styles.acaoTexto}>{item.totalCurtidas}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acaoBotao} onPress={() => item.bloqueado ? verPerfilDoAutor(item) : alternarComentarios(item.id)}>
                  <Ionicons name="chatbubble-outline" size={18} color={CORES.secundaria} />
                  <Text style={styles.acaoTexto}>{item.totalComentarios}</Text>
                </TouchableOpacity>
              </View>

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
  composer: { backgroundColor: CORES.superficie, borderRadius: 12, padding: 14, marginBottom: 16 },
  composerInput: { minHeight: 50, color: CORES.primaria, fontSize: 14, textAlignVertical: 'top' },
  composerRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  exclusivoToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exclusivoToggleTexto: { fontSize: 12, color: CORES.secundaria, fontWeight: '600' },
  composerBotao: { backgroundColor: CORES.primaria, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center' },
  composerBotaoTexto: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: CORES.superficie, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  autorFoto: { width: 38, height: 38, borderRadius: 19 },
  autorFotoFallback: { width: 38, height: 38, borderRadius: 19, backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center' },
  autorFotoLetra: { color: '#ffffff', fontWeight: '700' },
  autorNome: { fontSize: 14, fontWeight: '700', color: CORES.primaria },
  dataTexto: { fontSize: 11, color: CORES.secundaria },
  conteudo: { fontSize: 14, color: CORES.primaria, lineHeight: 20, marginBottom: 8 },
  midia: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8 },
  exclusivoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  exclusivoBadgeTexto: { fontSize: 11, color: '#E6A700', fontWeight: '700' },
  bloqueadoBox: { backgroundColor: CORES.fundo, borderRadius: 10, borderWidth: 1, borderColor: CORES.borda, borderStyle: 'dashed', padding: 16, alignItems: 'center', gap: 6, marginBottom: 8 },
  bloqueadoTexto: { fontSize: 13, color: CORES.secundaria, textAlign: 'center' },
  bloqueadoLink: { fontSize: 13, color: CORES.acento, fontWeight: '700' },
  acoes: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 8, marginTop: 4 },
  acaoBotao: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acaoTexto: { fontSize: 12, color: CORES.secundaria, fontWeight: '600' },
  comentariosBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 10, gap: 8 },
  comentarioItem: { marginBottom: 2 },
  comentarioAutor: { fontSize: 12, fontWeight: '700', color: CORES.primaria },
  comentarioTexto: { fontSize: 12, color: CORES.secundaria },
  comentarioNovoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  comentarioInput: { flex: 1, backgroundColor: CORES.fundo, borderRadius: 8, borderWidth: 1, borderColor: CORES.borda, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: CORES.primaria },
});
