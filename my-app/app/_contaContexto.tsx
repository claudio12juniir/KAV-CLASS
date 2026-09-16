// Fundação de identidade unificada (Rede Social Fase 1, Step 1) — camada de
// troca de vínculo acima dos grupos de rota existentes. Não substitui os
// _contexto.tsx de (aluno-escola)/(professor-escola), que continuam
// modelando exatamente o vínculo ATIVO agora; este Provider só guarda a
// LISTA de vínculos que a Conta logada possui (vinda do login) e sabe pedir
// um token novo pra outro vínculo sem re-pedir senha.
//
// Nesta Step, toda Conta ainda tem no máximo 1 vínculo (Aluno/Professor.email
// continuam @unique globais no backend) — então `vinculos` nunca terá mais
// de 1 item em produção até a Step 2 (multi-vínculo) ser ativada. O item
// "Trocar de conta" nos drawers já fica pronto, só oculto por
// `vinculos.length <= 1`.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { apiFetch } from './api';

export type Vinculo = {
  id: string;
  papel: 'professor' | 'aluno';
  nome: string;
  escolaId?: string | null;
};

type ContaContextoTipo = {
  vinculos: Vinculo[];
  carregarVinculos: () => Promise<void>;
  trocarVinculo: (vinculo: Vinculo) => Promise<boolean>;
};

const ContaContexto = createContext<ContaContextoTipo>({
  vinculos: [],
  carregarVinculos: async () => {},
  trocarVinculo: async () => false,
});

export function useConta() {
  return useContext(ContaContexto);
}

export function ContaProvider({ children }: { children: React.ReactNode }) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const router = useRouter();

  const carregarVinculos = useCallback(async () => {
    try {
      const salvo = await SecureStore.getItemAsync('kav_vinculos');
      setVinculos(salvo ? JSON.parse(salvo) : []);
    } catch {
      setVinculos([]);
    }
  }, []);

  useEffect(() => {
    carregarVinculos();
  }, [carregarVinculos]);

  const trocarVinculo = useCallback(async (vinculo: Vinculo) => {
    try {
      const resposta = await apiFetch('/contas/trocar-vinculo', {
        method: 'POST',
        body: JSON.stringify({ vinculoId: vinculo.id, papel: vinculo.papel }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) return false;

      await SecureStore.setItemAsync('kav_token', dados.token);
      await SecureStore.setItemAsync('kav_papel', vinculo.papel);
      if (vinculo.papel === 'professor') {
        await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
        await SecureStore.deleteItemAsync('kav_aluno_id');
        router.replace('/(professor)');
      } else {
        await SecureStore.setItemAsync('kav_aluno_id', String(dados.usuario.id));
        await SecureStore.deleteItemAsync('kav_professor_id');
        router.replace('/(aluno)');
      }
      return true;
    } catch {
      return false;
    }
  }, [router]);

  return (
    <ContaContexto.Provider value={{ vinculos, carregarVinculos, trocarVinculo }}>
      {children}
    </ContaContexto.Provider>
  );
}
