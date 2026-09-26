import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { BASE_URL, fetchComRetry } from '../api';

type Papel = 'DONO' | 'GESTOR' | 'PROFESSOR' | 'SECRETARIA' | 'FUNCIONARIO';
type Pacote = 'PACOTE_PROFESSOR' | 'PACOTE_ESCOLA';

type EscolaContextoValor = {
  carregando: boolean;
  papel: Papel | null;
  pacote: Pacote | null;
  nomeEscola: string;
  nomeAdmin: string;
  fotoAdmin: string | null;
  professorId: string;
  ehDono: boolean;
  // Limitador de acesso por função (INSTITUTION, 21/09/2026) — só tem
  // sentido quando papel === 'SECRETARIA'; DONO/GESTOR/PROFESSOR sempre
  // enxergam tudo, sem checar esta lista (ver SidebarNavGrupos filtrando
  // NAV_ESCOLA e server.js exigirPapelNaEscola conferindo o mesmo lado).
  permissoesSecretaria: string[];
  recarregarPerfil: () => Promise<void>;
};

const EscolaContexto = createContext<EscolaContextoValor | null>(null);

export function EscolaProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [nomeEscola, setNomeEscola] = useState('');
  const [nomeAdmin, setNomeAdmin] = useState('');
  const [fotoAdmin, setFotoAdmin] = useState<string | null>(null);
  const [professorId, setProfessorId] = useState('');
  const [permissoesSecretaria, setPermissoesSecretaria] = useState<string[]>([]);

  const recarregarPerfil = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const id = (await SecureStore.getItemAsync('kav_professor_id')) || '';
      setProfessorId(id);
      const res = await fetchComRetry(`${BASE_URL}/api/professor/perfil?professorId=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const perfil = await res.json();
        setPapel(perfil.papel || null);
        setPacote(perfil.escola?.pacote || 'PACOTE_PROFESSOR');
        setNomeEscola(perfil.escola?.nome || '');
        setNomeAdmin(perfil.nome || '');
        setFotoAdmin(perfil.fotoUrl || null);
        setPermissoesSecretaria(perfil.permissoesSecretaria || []);
      }
    } catch (err) {
      console.error('Erro ao carregar perfil da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  // 27/09/2026: reavalia a cada foco, não só no mount — sem isso, trocar de
  // conta (logout + login com outro usuário) sem fechar o app reaproveitava
  // esta mesma instância de EscolaProvider e nunca recarregava o perfil
  // novo, deixando o usuário preso nos dados da conta anterior (ver mesmo
  // comentário em (professor)/_layout.tsx). `ultimoTokenRef` evita refazer
  // essa checagem (e piscar o loader) toda vez que só se navega dentro do
  // próprio ERP com a mesma conta.
  const ultimoTokenRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const token = await SecureStore.getItemAsync('kav_token');
        if (token && token === ultimoTokenRef.current) return;
        ultimoTokenRef.current = token;
        recarregarPerfil();
      })();
    }, [recarregarPerfil]),
  );

  const valor: EscolaContextoValor = {
    carregando, papel, pacote, nomeEscola, nomeAdmin, fotoAdmin, professorId,
    ehDono: papel === 'DONO',
    permissoesSecretaria,
    recarregarPerfil,
  };

  return <EscolaContexto.Provider value={valor}>{children}</EscolaContexto.Provider>;
}

export function useEscolaContexto() {
  const ctx = useContext(EscolaContexto);
  if (!ctx) throw new Error('useEscolaContexto precisa estar dentro de <EscolaProvider>');
  return ctx;
}
