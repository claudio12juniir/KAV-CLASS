import React from 'react';
import { EstadoVazio } from '../(escola)/_ui';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

export default function ConfiguracoesProfessorEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useProfessorEscolaContexto();
  return (
    <MobileErpShell
      titulo="Configurações"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
    >
      <EstadoVazio icone="construct-outline" texto="Em construção" />
    </MobileErpShell>
  );
}
