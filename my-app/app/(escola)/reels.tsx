// Reels dentro do painel da Escola (DONO/GESTOR, Epic D, 18/09/2026) —
// tela imersiva em tela cheia, de propósito FORA do ErpShell (que sempre
// desenha rail+topbar+ScrollView, incompatível com o paging vertical de
// vídeo). Mesmo componente usado no SELF — ver components/Reels.tsx.
import { Stack } from 'expo-router';
import Reels from '../../components/Reels';

export default function ReelsEscola() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Reels />
    </>
  );
}
