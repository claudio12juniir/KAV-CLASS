import { Slot, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { EscolaProvider, useEscolaContexto } from './_contexto';

function EscolaGate() {
  const { carregando, papel, pacote } = useEscolaContexto();

  // Só DONO/GESTOR de uma Escola no Pacote Escola entram no ERP — qualquer
  // outra combinação (professor autônomo, PROFESSOR raso dentro de uma
  // Escola) volta pro app mobile do professor. Espelha exigirPapelNaEscola
  // no backend; aqui é só a barreira de navegação no cliente.
  useEffect(() => {
    if (carregando) return;
    const podeEntrar = (papel === 'DONO' || papel === 'GESTOR') && pacote === 'PACOTE_ESCOLA';
    if (!podeEntrar) router.replace('/(professor)');
  }, [carregando, papel, pacote]);

  const podeEntrar = (papel === 'DONO' || papel === 'GESTOR') && pacote === 'PACOTE_ESCOLA';
  if (carregando || !podeEntrar) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ERP.fundo }}>
        <SyncLoader size="large" color={ERP.texto} />
      </View>
    );
  }

  return <Slot />;
}

export default function EscolaLayout() {
  return (
    <EscolaProvider>
      <StatusBar style="dark" backgroundColor={ERP.fundo} />
      <EscolaGate />
    </EscolaProvider>
  );
}
