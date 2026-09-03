import { Slot, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { EscolaHeader, EscolaTabBar } from './_componentes';
import { EscolaProvider, useEscolaContexto } from './_contexto';
import { estilosConteudo } from './_estilos';

function EscolaGate() {
  const { carregando, papel } = useEscolaContexto();

  // Rota fica acessível por URL direta mesmo pra quem não vê o item no menu
  // (ver Drawer, mostrarEscola) — aqui é a barreira de verdade no cliente,
  // espelhando o que o backend já exige (DONO/GESTOR) em exigirPapelNaEscola.
  useEffect(() => {
    if (!carregando && papel && papel !== 'DONO' && papel !== 'GESTOR') {
      router.replace('/(professor)');
    }
  }, [carregando, papel]);

  if (carregando || (papel && papel !== 'DONO' && papel !== 'GESTOR')) {
    return (
      <View style={estilosConteudo.telaCentralizada}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <View style={estilosConteudo.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <EscolaHeader titulo="Minha Escola" />
      <EscolaTabBar />
      <Slot />
    </View>
  );
}

export default function EscolaLayout() {
  return (
    <EscolaProvider>
      <EscolaGate />
    </EscolaProvider>
  );
}
