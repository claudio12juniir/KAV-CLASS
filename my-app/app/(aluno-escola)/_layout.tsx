// Espelha app/(professor-escola)/_layout.tsx do lado do aluno. Só entra quem
// pertence a uma Escola PACOTE_ESCOLA — senão volta pro app do aluno SELF.
import { Slot, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { AlunoEscolaProvider, useAlunoEscolaContexto } from './_contexto';

function AlunoEscolaGate() {
  const { carregando, pacote } = useAlunoEscolaContexto();

  useEffect(() => {
    if (carregando) return;
    if (pacote !== 'PACOTE_ESCOLA') router.replace('/(aluno)');
  }, [carregando, pacote]);

  if (carregando || pacote !== 'PACOTE_ESCOLA') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ERP.fundo }}>
        <SyncLoader size="large" color={ERP.texto} />
      </View>
    );
  }

  return <Slot />;
}

export default function AlunoEscolaLayout() {
  return (
    <AlunoEscolaProvider>
      <StatusBar style="light" backgroundColor={ERP.sidebarBg} />
      <AlunoEscolaGate />
    </AlunoEscolaProvider>
  );
}
