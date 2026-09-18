// Reels (Rede Social — Epic D, 18/09/2026). Player vertical em tela cheia,
// sempre em fundo preto — igual TikTok/Instagram Reels, deliberadamente
// alheio ao tema claro/escuro do app que o envolve (SELF ou INSTITUTION),
// pra funcionar igual nos dois pontos de entrada sem precisar de 2 versões.
// HLS via Cloudflare Stream: videodelivery.net serve o manifesto público
// sem precisar assinar URL nenhuma (mesmo domínio de entrega usado no
// player web deles).
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Avatar from './Avatar';

const { height: ALTURA_TELA } = Dimensions.get('window');

export type Reel = {
  id: string;
  videoId: string;
  thumbnailUrl: string | null;
  duracaoSegundos: number | null;
  descricao: string | null;
  createdAt: string;
  autor: { tipo: 'professor' | 'escola'; id: string; nome: string; fotoUrl: string | null };
  totalCurtidas: number;
  totalComentarios: number;
  curtidoPeloUsuario: boolean;
};

export function reelManifestUrl(videoId: string) {
  return `https://videodelivery.net/${videoId}/manifest/video.m3u8`;
}

export function reelThumbnailUrl(reel: Reel) {
  return reel.thumbnailUrl || `https://videodelivery.net/${reel.videoId}/thumbnails/thumbnail.jpg`;
}

function BotaoVertical({
  icone, ativo, contador, onPress,
}: { icone: keyof typeof Ionicons.glyphMap; ativo?: boolean; contador?: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={estilos.botaoVertical} onPress={onPress} hitSlop={8}>
      <Ionicons name={icone} size={28} color={ativo ? '#ff3b5c' : '#ffffff'} />
      {contador !== undefined && <Text style={estilos.botaoVerticalTexto}>{contador}</Text>}
    </TouchableOpacity>
  );
}

export default function ReelCard({
  reel, ativo, podeApagar, onVerPerfil, onCurtir, onAbrirComentarios, onApagar,
}: {
  reel: Reel;
  ativo: boolean;
  podeApagar: boolean;
  onVerPerfil: () => void;
  onCurtir: () => void;
  onAbrirComentarios: () => void;
  onApagar: () => void;
}) {
  const player = useVideoPlayer(reelManifestUrl(reel.videoId), (p) => {
    p.loop = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  React.useEffect(() => {
    if (ativo) player.play();
    else player.pause();
  }, [ativo, player]);

  const alternarPlayback = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  return (
    <View style={[estilos.container, { height: ALTURA_TELA }]}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={alternarPlayback}>
        {!isPlaying && (
          <View style={estilos.playOverlay}>
            <Ionicons name="play" size={64} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </TouchableOpacity>

      <View style={estilos.rodape}>
        <TouchableOpacity style={estilos.autorLinha} onPress={onVerPerfil} disabled={reel.autor.tipo !== 'professor'}>
          <Avatar fotoUrl={reel.autor.fotoUrl} nome={reel.autor.nome} tamanho={36} />
          <Text style={estilos.autorNome} numberOfLines={1}>{reel.autor.nome}</Text>
        </TouchableOpacity>
        {reel.descricao ? <Text style={estilos.descricao} numberOfLines={3}>{reel.descricao}</Text> : null}
      </View>

      <View style={estilos.acoes}>
        <BotaoVertical icone={reel.curtidoPeloUsuario ? 'heart' : 'heart-outline'} ativo={reel.curtidoPeloUsuario} contador={reel.totalCurtidas} onPress={onCurtir} />
        <BotaoVertical icone="chatbubble-outline" contador={reel.totalComentarios} onPress={onAbrirComentarios} />
        {podeApagar && <BotaoVertical icone="trash-outline" onPress={onApagar} />}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000000' },
  playOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rodape: { position: 'absolute', left: 16, right: 88, bottom: 32, gap: 8 },
  autorLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autorNome: { color: '#ffffff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  descricao: { color: '#ffffff', fontSize: 13, lineHeight: 18 },
  acoes: { position: 'absolute', right: 12, bottom: 40, alignItems: 'center', gap: 22 },
  botaoVertical: { alignItems: 'center', gap: 4 },
  botaoVerticalTexto: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
});
