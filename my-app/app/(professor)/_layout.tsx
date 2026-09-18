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

// DONO/GESTOR de uma Escola no Pacote Escola não usam mais o app mobile do
// professor autônomo — a experiência inteira deles é o painel institucional
// em app/(escola)/. Esse gate decide isso uma vez, com dado fresco (não
// cache), antes de montar o Drawer, pra ninguém ver o shell errado nem por
// um instante. Ver docs/roadmap-escola.md.
function RedirecionadorEscola({ children }: { children: React.ReactNode }) {
  const [decidido, setDecidido] = useState(false);
  const [vaiRedirecionar, setVaiRedirecionar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('kav_token');
        const professorId = (await SecureStore.getItemAsync('kav_professor_id')) || '';
        const res = await fetchComRetry(`${BASE_URL}/api/professor/perfil?professorId=${professorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const perfil = await res.json();
          const ehAdminDeEscola = (perfil.papel === 'DONO' || perfil.papel === 'GESTOR') && perfil.escola?.pacote === 'PACOTE_ESCOLA';
          if (ehAdminDeEscola) {
            setVaiRedirecionar(true);
            router.replace('/(escola)');
            return;
          }

          // Professor raso (não DONO/GESTOR) de uma Escola de verdade também
          // não usa mais o app do professor autônomo — tem shell próprio,
          // tema escuro, em app/(professor-escola)/. Ver plano INSTITUTION.
          const ehProfessorDeEscola = perfil.papel === 'PROFESSOR' && perfil.escola?.pacote === 'PACOTE_ESCOLA';
          if (ehProfessorDeEscola) {
            setVaiRedirecionar(true);
            router.replace('/(professor-escola)' as any);
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

export default function ProfessorLayout() {
  usePushToken();

  return (
    <RedirecionadorEscola>
      <ProfessorTabs />
    </RedirecionadorEscola>
  );
}

// Bottom tabs estilo X: 4 ícones fixos + "Mais" leva ao resto (Alunos,
// Agenda, Financeiro, Reposições, Relatórios, Escanear/Confirmar
// Presença, Perfil). Rotas escondidas da tab bar (`href: null`) continuam
// navegáveis normalmente via router.push, usadas pela tela "Mais".
function ProfessorTabs() {
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

      <Tabs.Screen name="alunos" options={{ href: null }} />
      <Tabs.Screen name="calendario" options={{ href: null }} />
      <Tabs.Screen name="agendamento" options={{ href: null }} />
      <Tabs.Screen name="pagamento" options={{ href: null }} />
      <Tabs.Screen name="reposicoes" options={{ href: null }} />
      <Tabs.Screen name="relatorios" options={{ href: null }} />
      <Tabs.Screen name="escanear-presenca" options={{ href: null }} />
      <Tabs.Screen name="checkin-presenca" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}
