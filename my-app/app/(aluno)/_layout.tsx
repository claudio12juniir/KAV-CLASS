import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { CORES } from '../../constants/theme';
import { usePushToken } from '../../hooks/usePushToken';
import { BASE_URL, fetchComRetry } from '../api';

function icone(nome: keyof typeof Ionicons.glyphMap, nomeAtivo: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? nomeAtivo : nome} size={24} color={color} />
  );
}

// Aluno de uma Escola de verdade (PACOTE_ESCOLA) não usa mais o app do
// aluno SELF — tem shell próprio, tema escuro, em app/(aluno-escola)/. Esse
// gate decide isso uma vez, com dado fresco, antes de montar o Drawer, no
// mesmo espírito de RedirecionadorEscola em (professor)/_layout.tsx. Falha
// de rede não bloqueia ninguém (fail-open): segue pro app normal.
function RedirecionadorEscolaAluno({ children }: { children: React.ReactNode }) {
  const [decidido, setDecidido] = useState(false);
  const [vaiRedirecionar, setVaiRedirecionar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('kav_token');
        const res = await fetchComRetry(`${BASE_URL}/api/aluno/perfil`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const perfil = await res.json();
          if (perfil.escola?.pacote === 'PACOTE_ESCOLA') {
            setVaiRedirecionar(true);
            router.replace('/(aluno-escola)' as any);
            return;
          }
        }
      } catch {
        // Sem conexão: segue pro app mobile normal, que já tem seu próprio tratamento de erro por tela.
      }
      setDecidido(true);
    })();
  }, []);

  if (!decidido || vaiRedirecionar) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function AlunoLayout() {
  usePushToken();
  return (
    <RedirecionadorEscolaAluno>
      <AlunoTabs />
    </RedirecionadorEscolaAluno>
  );
}

// Bottom tabs estilo X: 4 ícones fixos + "Mais" leva ao resto (Material,
// Financeiro, Reposições, Escanear/Confirmar Presença, Perfil). Rotas
// escondidas da tab bar (`href: null`) continuam navegáveis normalmente
// via router.push, usadas pela tela "Mais".
function AlunoTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: CORES.acento,
        tabBarInactiveTintColor: CORES.secundaria,
        tabBarStyle: { backgroundColor: CORES.fundo, borderTopWidth: 1, borderTopColor: CORES.borda, height: 56 },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: icone('home-outline', 'home') }} />
      <Tabs.Screen name="feed" options={{ tabBarIcon: icone('newspaper-outline', 'newspaper') }} />
      <Tabs.Screen name="reels" options={{ tabBarIcon: icone('film-outline', 'film') }} />
      <Tabs.Screen name="busca" options={{ tabBarIcon: icone('search-outline', 'search') }} />
      <Tabs.Screen name="chat" options={{ tabBarIcon: icone('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="mais" options={{ tabBarIcon: icone('ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle') }} />

      <Tabs.Screen name="materiais" options={{ href: null }} />
      <Tabs.Screen name="pagamento" options={{ href: null }} />
      <Tabs.Screen name="reposicoes" options={{ href: null }} />
      <Tabs.Screen name="contrato" options={{ href: null }} />
      <Tabs.Screen name="escanear-presenca" options={{ href: null }} />
      <Tabs.Screen name="checkin-presenca" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}
