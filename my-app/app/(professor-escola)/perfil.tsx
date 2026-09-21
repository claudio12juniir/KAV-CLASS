// Perfil (Rede Social — Social/Perfil, INSTITUTION Fase 1): mesma tela do
// SELF, já preparada pra professor com ou sem escola (ver campo `escola?`
// em app/(professor)/perfil.tsx) — reaproveitada aqui em vez de duplicar
// ~900 linhas, igual ao padrão já usado por reels.tsx/feed.tsx.
import PerfilProfessor from '../(professor)/perfil';

export default function PerfilProfessorEscola() {
  return <PerfilProfessor />;
}
