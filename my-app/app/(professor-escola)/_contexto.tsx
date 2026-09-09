// Espelha app/(escola)/_contexto.tsx — um único fetch de /api/professor/perfil
// compartilhado entre o gate (_layout.tsx) e todas as telas via contexto, em
// vez de cada tela buscar o perfil de novo só pra montar o shell.
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { BASE_URL, fetchComRetry } from '../api';

type Papel = 'DONO' | 'GESTOR' | 'PROFESSOR';
type Pacote = 'PACOTE_PROFESSOR' | 'PACOTE_ESCOLA';

type ProfessorEscolaContextoValor = {
  carregando: boolean;
  professorId: string;
  nome: string;
  fotoUrl: string | null;
  telefone: string;
  papel: Papel | null;
  pacote: Pacote | null;
  escolaNome: string;
  cursos: string[];
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
};

const ProfessorEscolaContexto = createContext<ProfessorEscolaContextoValor | null>(null);

export function ProfessorEscolaProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [professorId, setProfessorId] = useState('');
  const [nome, setNome] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [telefone, setTelefone] = useState('');
  const [papel, setPapel] = useState<Papel | null>(null);
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [escolaNome, setEscolaNome] = useState('');
  const [cursos, setCursos] = useState<string[]>([]);

  const recarregarPerfil = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const id = (await SecureStore.getItemAsync('kav_professor_id')) || '';
      setProfessorId(id);
      const res = await fetchComRetry(`${BASE_URL}/api/professor/perfil`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const perfil = await res.json();
        setNome(perfil.nome || '');
        setFotoUrl(perfil.fotoUrl || null);
        setTelefone(perfil.telefone || '');
        setPapel(perfil.papel || null);
        setPacote(perfil.escola?.pacote || null);
        setEscolaNome(perfil.escola?.nome || '');
        setCursos(Array.isArray(perfil.cursos) ? perfil.cursos : []);
      }
    } catch (err) {
      console.error('Erro ao carregar perfil do professor (INSTITUTION):', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregarPerfil(); }, [recarregarPerfil]);

  const sair = useCallback(async () => {
    await SecureStore.deleteItemAsync('kav_token');
    await SecureStore.deleteItemAsync('kav_papel');
    await SecureStore.deleteItemAsync('kav_professor_id');
    router.replace('/login');
  }, []);

  const valor: ProfessorEscolaContextoValor = {
    carregando, professorId, nome, fotoUrl, telefone, papel, pacote, escolaNome, cursos,
    recarregarPerfil, sair,
  };

  return <ProfessorEscolaContexto.Provider value={valor}>{children}</ProfessorEscolaContexto.Provider>;
}

export function useProfessorEscolaContexto(): ProfessorEscolaContextoValor {
  const ctx = useContext(ProfessorEscolaContexto);
  if (!ctx) throw new Error('useProfessorEscolaContexto precisa estar dentro de ProfessorEscolaProvider.');
  return ctx;
}
