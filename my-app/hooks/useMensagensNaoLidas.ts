// Badge de mensagens não lidas no menu do INSTITUTION (Rede Social — Social
// Fase 1, estilo Direct do Instagram). GET /api/mensagens/conversas já
// devolve `naoLidas` por conversa (ver components/Mensagens.tsx); aqui só
// somamos pra virar o número do badge, com refetch ao focar a tela e em
// intervalo curto — não há push/websocket de mensagens ainda.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../app/api';

const INTERVALO_MS = 30000;

export default function useMensagensNaoLidas() {
  const [total, setTotal] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const resposta = await apiFetch('/mensagens/conversas');
      if (!resposta.ok) return;
      const dados = await resposta.json();
      const conversas = dados.conversas || dados || [];
      setTotal(conversas.reduce((soma: number, c: any) => soma + (c.naoLidas || 0), 0));
    } catch {
      // silencioso — badge só é um extra visual, não pode travar o menu
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar();
    const id = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [carregar]));

  useEffect(() => { carregar(); }, [carregar]);

  return total;
}
