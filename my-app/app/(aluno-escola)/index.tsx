import React from 'react';
import { EstadoVazio } from '../(escola)/_ui';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

export default function PainelAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();
  return (
    <MobileErpShell
      titulo="Painel"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
    >
      <EstadoVazio icone="construct-outline" texto="Em construção" />
    </MobileErpShell>
  );
}
