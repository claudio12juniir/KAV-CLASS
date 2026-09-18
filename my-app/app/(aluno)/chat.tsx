import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { CORES } from '../../constants/theme';
import Mensagens from '../../components/Mensagens';

export default function ChatAlunoScreen() {
  const { tipo, id, nome, fotoUrl } = useLocalSearchParams<{ tipo?: string; id?: string; nome?: string; fotoUrl?: string }>();
  return (
    <>
      <StatusBar style="dark" backgroundColor={CORES.fundo} />
      <Mensagens
        abrirDireto={tipo && id ? { tipo: tipo as any, id, nome: nome || '', fotoUrl: fotoUrl || null } : undefined}
      />
    </>
  );
}
