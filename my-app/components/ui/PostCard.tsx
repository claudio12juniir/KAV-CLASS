// Post do feed em layout de lista contínua estilo X/Instagram/Facebook
// (referências reais em /exemples, 21/09/2026): avatar 48px, cabeçalho
// nome+tempo relativo compacto, mídia com cantos arredondados e borda,
// barra de ações espalhada (space-between) com alvo de toque circular no
// hover — mesmo padrão visual das quatro redes de referência, sem card
// flutuante/sombra (o divisor entre posts é responsabilidade de quem
// renderiza a lista, ver Feed.tsx).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CORES } from '../../constants/theme';
import { tempoRelativo } from '../../utils/tempoRelativo';
import Avatar from './Avatar';

export type Autor = { tipo: 'professor' | 'escola'; id: string; nome: string; fotoUrl: string | null };

export type Post = {
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

function BotaoAcao({ icone, contador, cor, corHover, onPress }: {
  icone: keyof typeof Ionicons.glyphMap; contador?: number; cor?: string; corHover: string; onPress: () => void;
}) {
  return (
    <Pressable style={({ hovered }: any) => [styles.acaoBotao, hovered && { backgroundColor: `${corHover}14` }]} onPress={onPress} hitSlop={6}>
      {({ hovered }: any) => (
        <>
          <Ionicons name={icone} size={18} color={cor || (hovered ? corHover : CORES.secundaria)} />
          {contador !== undefined && contador > 0 && (
            <Text style={[styles.acaoContador, { color: cor || (hovered ? corHover : CORES.secundaria) }]}>{contador}</Text>
          )}
        </>
      )}
    </Pressable>
  );
}

export default function PostCard({
  post, podeApagar, onVerPerfil, onCurtir, onToggleComentarios, onApagar,
}: {
  post: Post;
  podeApagar: boolean;
  onVerPerfil: () => void;
  onCurtir: () => void;
  onToggleComentarios: () => void;
  onApagar: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.topo}>
        <TouchableOpacityAvatar onPress={onVerPerfil} disabled={post.autor.tipo !== 'professor'}>
          <Avatar fotoUrl={post.autor.fotoUrl} nome={post.autor.nome} tamanho={48} />
        </TouchableOpacityAvatar>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cabecalhoLinha}>
            <Text style={styles.autorNome} numberOfLines={1}>{post.autor.nome}</Text>
            <Text style={styles.metaTexto}>· {tempoRelativo(post.createdAt)}</Text>
          </View>
        </View>

        {podeApagar && (
          <Pressable style={({ hovered }: any) => [styles.menuBotao, hovered && styles.menuBotaoHover]} onPress={onApagar} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={CORES.secundaria} />
          </Pressable>
        )}
      </View>

      {post.exclusivo && (
        <View style={styles.exclusivoBadge}>
          <Ionicons name="star" size={11} color="#E6A700" />
          <Text style={styles.exclusivoBadgeTexto}>Conteúdo exclusivo</Text>
        </View>
      )}

      {post.bloqueado ? (
        <Pressable style={styles.bloqueadoBox} onPress={onVerPerfil}>
          <Ionicons name="lock-closed" size={22} color={CORES.secundaria} />
          <Text style={styles.bloqueadoTexto}>
            Assine o conteúdo exclusivo de {post.autor.nome} pra ver este post.
          </Text>
          <Text style={styles.bloqueadoLink}>Ver perfil e assinar</Text>
        </Pressable>
      ) : (
        <View style={styles.corpo}>
          {post.conteudo ? <Text style={styles.conteudo}>{post.conteudo}</Text> : null}
          {post.midiaUrl ? <Image source={{ uri: post.midiaUrl }} style={styles.midia} resizeMode="cover" /> : null}
        </View>
      )}

      <View style={styles.acoes}>
        <BotaoAcao
          icone={post.curtidoPeloUsuario ? 'heart' : 'heart-outline'}
          contador={post.totalCurtidas}
          cor={post.curtidoPeloUsuario ? CORES.erro : undefined}
          corHover={CORES.erro}
          onPress={onCurtir}
        />
        <BotaoAcao
          icone="chatbubble-outline"
          contador={post.totalComentarios}
          corHover={CORES.acento}
          onPress={onToggleComentarios}
        />
      </View>
    </View>
  );
}

// Pressable simples só pra dar feedback de hover no avatar (web) sem mexer
// no componente Avatar em si.
function TouchableOpacityAvatar({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }: any) => pressed && !disabled && { opacity: 0.85 }}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 12 },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cabecalhoLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' },
  autorNome: { fontSize: 15, fontWeight: '800', color: CORES.primaria, flexShrink: 1 },
  metaTexto: { fontSize: 14.5, color: CORES.secundaria },
  menuBotao: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  menuBotaoHover: { backgroundColor: 'rgba(15,20,25,0.06)' },

  corpo: { marginTop: 2, marginLeft: 60 },
  conteudo: { fontSize: 15, color: CORES.primaria, lineHeight: 20.5 },
  midia: { width: '100%', aspectRatio: 1.5, borderRadius: 16, marginTop: 10, borderWidth: 1, borderColor: CORES.borda, backgroundColor: CORES.borda },

  exclusivoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginLeft: 60 },
  exclusivoBadgeTexto: { fontSize: 11, color: '#E6A700', fontWeight: '700' },
  bloqueadoBox: {
    marginLeft: 60, marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: CORES.borda, borderStyle: 'dashed',
    padding: 16, alignItems: 'center', gap: 6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
  },
  bloqueadoTexto: { fontSize: 13, color: CORES.secundaria, textAlign: 'center' },
  bloqueadoLink: { fontSize: 13, color: CORES.acento, fontWeight: '700' },

  acoes: { flexDirection: 'row', justifyContent: 'flex-start', gap: 8, marginTop: 8, marginLeft: 60 },
  acaoBotao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginLeft: -10 },
  acaoContador: { fontSize: 13, fontWeight: '600' },
});
