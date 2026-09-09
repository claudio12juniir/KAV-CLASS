// Espelha app/(professor-escola)/_contexto.tsx, do lado do aluno — um único
// fetch de /api/aluno/perfil compartilhado entre o gate e todas as telas.
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { BASE_URL, fetchComRetry } from '../api';

type Pacote = 'PACOTE_PROFESSOR' | 'PACOTE_ESCOLA';

type AlunoEscolaContextoValor = {
  carregando: boolean;
  alunoId: string;
  nome: string;
  fotoUrl: string | null;
  telefone: string;
  status: string | null;
  pacote: Pacote | null;
  escolaNome: string;
  professorId: string | null;
  professorNome: string;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
};

const AlunoEscolaContexto = createContext<AlunoEscolaContextoValor | null>(null);

export function AlunoEscolaProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [alunoId, setAlunoId] = useState('');
  const [nome, setNome] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [telefone, setTelefone] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [escolaNome, setEscolaNome] = useState('');
  const [professorId, setProfessorId] = useState<string | null>(null);
  const [professorNome, setProfessorNome] = useState('');
  // Só a 1ª carga precisa bloquear a tela com o spinner do AlunoEscolaGate —
  // ver mesmo comentário em (professor-escola)/_contexto.tsx.
  const primeiraCarga = useRef(true);

  const recarregarPerfil = useCallback(async () => {
    if (primeiraCarga.current) setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const id = (await SecureStore.getItemAsync('kav_aluno_id')) || '';
      setAlunoId(id);
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/perfil`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const perfil = await res.json();
        setNome(perfil.nome || '');
        setFotoUrl(perfil.fotoUrl || null);
        setTelefone(perfil.telefone || '');
        setStatus(perfil.status || null);
        setPacote(perfil.escola?.pacote || null);
        setEscolaNome(perfil.escola?.nome || '');
        setProfessorId(perfil.professor?.id || null);
        setProfessorNome(perfil.professor?.nome || '');
      }
    } catch (err) {
      console.error('Erro ao carregar perfil do aluno (INSTITUTION):', err);
    } finally {
      setCarregando(false);
      primeiraCarga.current = false;
    }
  }, []);

  useEffect(() => { recarregarPerfil(); }, [recarregarPerfil]);

  const sair = useCallback(async () => {
    await SecureStore.deleteItemAsync('kav_token');
    await SecureStore.deleteItemAsync('kav_papel');
    await SecureStore.deleteItemAsync('kav_aluno_id');
    router.replace('/login');
  }, []);

  const valor: AlunoEscolaContextoValor = {
    carregando, alunoId, nome, fotoUrl, telefone, status, pacote, escolaNome, professorId, professorNome,
    recarregarPerfil, sair,
  };

  return <AlunoEscolaContexto.Provider value={valor}>{children}</AlunoEscolaContexto.Provider>;
}

export function useAlunoEscolaContexto(): AlunoEscolaContextoValor {
  const ctx = useContext(AlunoEscolaContexto);
  if (!ctx) throw new Error('useAlunoEscolaContexto precisa estar dentro de AlunoEscolaProvider.');
  return ctx;
}
