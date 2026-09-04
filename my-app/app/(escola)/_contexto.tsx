import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BASE_URL, fetchComRetry } from '../api';

type Papel = 'DONO' | 'GESTOR' | 'PROFESSOR';
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
      }
    } catch (err) {
      console.error('Erro ao carregar perfil da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregarPerfil(); }, [recarregarPerfil]);

  const valor: EscolaContextoValor = {
    carregando, papel, pacote, nomeEscola, nomeAdmin, fotoAdmin, professorId,
    ehDono: papel === 'DONO',
    recarregarPerfil,
  };

  return <EscolaContexto.Provider value={valor}>{children}</EscolaContexto.Provider>;
}

export function useEscolaContexto() {
  const ctx = useContext(EscolaContexto);
  if (!ctx) throw new Error('useEscolaContexto precisa estar dentro de <EscolaProvider>');
  return ctx;
}
