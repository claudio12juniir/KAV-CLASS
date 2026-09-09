// Espelha app/(escola)/_layout.tsx: Provider + Gate + Slot. Só entra quem é
// PROFESSOR (papel raso, não DONO/GESTOR) de uma Escola PACOTE_ESCOLA —
// qualquer outra combinação volta pro app do professor autônomo, e de lá o
// próprio RedirecionadorEscola de (professor)/_layout.tsx encaminha DONO/
// GESTOR pra (escola) se for o caso. Evita duplicar essa lógica aqui.
import { Slot, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { ProfessorEscolaProvider, useProfessorEscolaContexto } from './_contexto';

function ProfessorEscolaGate() {
  const { carregando, papel, pacote } = useProfessorEscolaContexto();

  useEffect(() => {
    if (carregando) return;
    const podeEntrar = papel === 'PROFESSOR' && pacote === 'PACOTE_ESCOLA';
    if (!podeEntrar) router.replace('/(professor)');
  }, [carregando, papel, pacote]);

  const podeEntrar = papel === 'PROFESSOR' && pacote === 'PACOTE_ESCOLA';
  if (carregando || !podeEntrar) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ERP.fundo }}>
        <SyncLoader size="large" color={ERP.texto} />
      </View>
    );
  }

  return <Slot />;
}

export default function ProfessorEscolaLayout() {
  return (
    <ProfessorEscolaProvider>
      <StatusBar style="light" backgroundColor={ERP.sidebarBg} />
      <ProfessorEscolaGate />
    </ProfessorEscolaProvider>
  );
}
