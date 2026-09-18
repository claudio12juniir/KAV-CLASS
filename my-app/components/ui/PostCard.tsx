// Post do feed em layout de lista contínua estilo X: sem card
// flutuante/sombra — o divisor entre posts é responsabilidade de quem
// renderiza a lista (Feed.tsx), este componente só cuida do conteúdo.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES } from '../../constants/theme';
import Avatar from './Avatar';
import IconAction from './IconAction';

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
        <TouchableOpacity onPress={onVerPerfil} disabled={post.autor.tipo !== 'professor'}>
          <Avatar fotoUrl={post.autor.fotoUrl} nome={post.autor.nome} tamanho={40} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.autorNome}>{post.autor.nome}</Text>
          <Text style={styles.dataTexto}>{new Date(post.createdAt).toLocaleDateString('pt-BR')}</Text>
        </View>
        {podeApagar && (
          <TouchableOpacity onPress={onApagar} hitSlop={10}>
            <Ionicons name="trash-outline" size={18} color={CORES.secundaria} />
          </TouchableOpacity>
        )}
      </View>

      {post.exclusivo && (
        <View style={styles.exclusivoBadge}>
          <Ionicons name="star" size={11} color="#E6A700" />
          <Text style={styles.exclusivoBadgeTexto}>Conteúdo exclusivo</Text>
        </View>
      )}

      {post.bloqueado ? (
        <TouchableOpacity style={styles.bloqueadoBox} onPress={onVerPerfil} activeOpacity={0.85}>
          <Ionicons name="lock-closed" size={22} color={CORES.secundaria} />
          <Text style={styles.bloqueadoTexto}>
            Assine o conteúdo exclusivo de {post.autor.nome} pra ver este post.
          </Text>
          <Text style={styles.bloqueadoLink}>Ver perfil e assinar</Text>
        </TouchableOpacity>
      ) : (
        <>
          {post.conteudo ? <Text style={styles.conteudo}>{post.conteudo}</Text> : null}
          {post.midiaUrl ? <Image source={{ uri: post.midiaUrl }} style={styles.midia} /> : null}
        </>
      )}

      <View style={styles.acoes}>
        <IconAction
          icone={post.curtidoPeloUsuario ? 'heart' : 'heart-outline'}
          contador={post.totalCurtidas}
          cor={post.curtidoPeloUsuario ? CORES.erro : undefined}
          onPress={onCurtir}
        />
        <IconAction
          icone="chatbubble-outline"
          contador={post.totalComentarios}
          onPress={onToggleComentarios}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 14 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  autorNome: { fontSize: 15, fontWeight: '700', color: CORES.primaria },
  dataTexto: { fontSize: 13, color: CORES.secundaria },
  conteudo: { fontSize: 15, color: CORES.primaria, lineHeight: 21, marginBottom: 8 },
  midia: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  exclusivoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  exclusivoBadgeTexto: { fontSize: 11, color: '#E6A700', fontWeight: '700' },
  bloqueadoBox: { borderRadius: 10, borderWidth: 1, borderColor: CORES.borda, borderStyle: 'dashed', padding: 16, alignItems: 'center', gap: 6, marginBottom: 8 },
  bloqueadoTexto: { fontSize: 13, color: CORES.secundaria, textAlign: 'center' },
  bloqueadoLink: { fontSize: 13, color: CORES.acento, fontWeight: '700' },
  acoes: { flexDirection: 'row', gap: 24, marginTop: 4 },
});
