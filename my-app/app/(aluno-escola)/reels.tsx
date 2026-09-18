// Reels dentro do INSTITUTION (Epic D, 18/09/2026) — tela imersiva em
// tela cheia, de propósito FORA do MobileErpShell (que sempre desenha
// topbar+ScrollView com padding, incompatível com o paging vertical de
// vídeo). Mesmo componente usado no SELF — ver components/Reels.tsx.
import { Stack } from 'expo-router';
import Reels from '../../components/Reels';

export default function ReelsAlunoEscola() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Reels />
    </>
  );
}
