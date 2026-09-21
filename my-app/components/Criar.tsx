// "Criar" — aba dedicada de composição (Rede Social, INSTITUTION Fase 1,
// 21/09/2026): mesma ação de publicar do composer embutido no topo do Feed
// (POST /api/posts — ver components/Feed.tsx), só que numa tela própria
// estilo "o que você quer postar" (Twitter/X), mais o atalho pra gravar um
// Reel (tela global /gravar-reel, compartilhada com o SELF). Compartilhada
// entre (escola)/(professor-escola)/(aluno-escola) — só professor publica
// texto (aluno só curte/comenta, mesma regra do Feed). Mesmo padrão visual
// do Feed (coluna centralizada, cabeçalho fixo, composer avatar+input) —
// referências reais em /exemples, 21/09/2026.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Alert } from 'react-native';
import { CORES } from '../constants/theme';
import { apiFetch } from '../app/api';
import Pill from './ui/Pill';

const LARGURA_MAX_COLUNA = 600;
const LARGURA_GATILHO_CENTRALIZAR = 680;

export default function Criar({ basePath }: { basePath?: string } = {}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const centralizado = width >= LARGURA_GATILHO_CENTRALIZAR;
  const [papel, setPapel] = useState<string | null>(null);
  const [conteudo, setConteudo] = useState('');
  const [exclusivo, setExclusivo] = useState(false);
  const [publicando, setPublicando] = useState(false);

  useEffect(() => { SecureStore.getItemAsync('kav_papel').then(setPapel); }, []);

  const publicar = async () => {
    if (!conteudo.trim()) return;
    setPublicando(true);
    try {
      const resposta = await apiFetch('/posts', { method: 'POST', body: JSON.stringify({ conteudo: conteudo.trim(), exclusivo }) });
      if (resposta.ok) {
        setConteudo('');
        setExclusivo(false);
        Alert.alert('Publicado!', 'Seu post já está no feed.', [
          { text: 'OK', style: 'cancel' },
          { text: 'Ver no feed', onPress: () => router.push(`${basePath || ''}/feed` as any) },
        ]);
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

  return (
    <View style={styles.fundo}>
      <View style={[styles.coluna, centralizado && styles.colunaCentralizada]}>
        <View style={styles.cabecalho}>
          <Text style={styles.titulo}>Criar</Text>
        </View>

        {papel === 'professor' ? (
          <View style={styles.composer}>
            <View style={styles.composerAvatar}>
              <Ionicons name="person" size={22} color={CORES.secundaria} />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder="O que você quer compartilhar?"
                placeholderTextColor={CORES.secundaria}
                value={conteudo}
                onChangeText={setConteudo}
                multiline
              />
              <View style={styles.rodape}>
                <TouchableOpacity style={styles.exclusivoToggle} onPress={() => setExclusivo((v) => !v)}>
                  <Ionicons name={exclusivo ? 'star' : 'star-outline'} size={16} color={exclusivo ? '#E6A700' : CORES.secundaria} />
                  <Text style={[styles.exclusivoToggleTexto, exclusivo && { color: '#E6A700' }]}>Exclusivo p/ assinantes</Text>
                </TouchableOpacity>
                <Pill texto="Publicar" onPress={publicar} disabled={!conteudo.trim()} carregando={publicando} tamanho="sm" />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.avisoBox}>
            <Ionicons name="information-circle-outline" size={18} color={CORES.secundaria} />
            <Text style={styles.avisoTexto}>Só quem dá aula publica texto no feed. Você pode curtir e comentar direto no Feed.</Text>
          </View>
        )}

        <View style={styles.conteudoPadding}>
          <TouchableOpacity style={styles.card} onPress={() => router.push('/gravar-reel' as any)}>
            <View style={styles.reelLinha}>
              <View style={styles.reelIconeBox}>
                <Ionicons name="film-outline" size={20} color={CORES.acento} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitulo}>Gravar um Reels</Text>
                <Text style={styles.cardSubtitulo}>Vídeo curto — ótima isca de captação</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CORES.secundaria} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: CORES.fundo, alignItems: 'center' },
  coluna: { flex: 1, width: '100%' },
  colunaCentralizada: { maxWidth: LARGURA_MAX_COLUNA, borderLeftWidth: 1, borderRightWidth: 1, borderColor: CORES.borda },

  cabecalho: {
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CORES.borda,
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0, backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' as any, zIndex: 2 } : null),
  },
  titulo: { fontSize: 19, fontWeight: '800', color: CORES.primaria, letterSpacing: -0.2 },

  composer: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  composerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: CORES.borda, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 60, color: CORES.primaria, fontSize: 17, textAlignVertical: 'top' },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  exclusivoToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exclusivoToggleTexto: { fontSize: 12, color: CORES.secundaria, fontWeight: '600' },

  conteudoPadding: { padding: 16 },
  card: { borderWidth: 1, borderColor: CORES.borda, borderRadius: 14, padding: 16 },
  cardTitulo: { fontSize: 14.5, fontWeight: '700', color: CORES.primaria },
  cardSubtitulo: { fontSize: 12, color: CORES.secundaria, marginTop: 2 },
  avisoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  avisoTexto: { flex: 1, fontSize: 12.5, color: CORES.secundaria, lineHeight: 18 },
  reelLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reelIconeBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E6F8F6', alignItems: 'center', justifyContent: 'center' },
});
