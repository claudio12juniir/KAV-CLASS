// Aba Contrato do aluno INSTITUTION (Sprint 23, briefing 23/09/2026) —
// mesmo GET /api/aluno/contrato do SELF, só tema ERP + shell da INSTITUTION
// (mesmo padrão já usado em materiais.tsx deste grupo).
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { Botao, EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

export default function ContratoAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [contratoUrl, setContratoUrl] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/contrato`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setContratoUrl((await res.json()).contratoUrl);
    } catch {
      // tela mostra "sem contrato" se falhar
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => { carregar(); }, [carregar]);

  const abrirContrato = async () => {
    if (!contratoUrl) return;
    try {
      await WebBrowser.openBrowserAsync(contratoUrl);
    } catch {
      Linking.openURL(contratoUrl);
    }
  };

  return (
    <MobileErpShell
      titulo="Contrato"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Contrato" subtitulo={`O contrato anexado por ${escolaNome || 'sua escola'}`} />

      <SectionCard>
        {!contratoUrl ? (
          <EstadoVazio icone="document-text-outline" texto="Nenhum contrato anexado ainda." />
        ) : (
          <Botao texto="Ver / baixar contrato" icone="document-text-outline" onPress={abrirContrato} />
        )}
      </SectionCard>
    </MobileErpShell>
  );
}
