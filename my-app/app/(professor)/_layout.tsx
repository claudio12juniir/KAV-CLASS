import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import { router, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SyncLoader from '../../components/SyncLoader';
import { usePushToken } from '../../hooks/usePushToken';
import { BASE_URL, fetchComRetry } from '../api';

function doisPrimeirosNomes(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/);
  return partes.slice(0, 2).join(' ');
}

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('kav_cache_prof_nome').then(n => { if (n) setNome(n); });
    SecureStore.getItemAsync('kav_cache_prof_foto').then(f => { if (f) setFotoUrl(f); });
  }, []);

  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.drawerHeader}>
        <Text style={styles.brandKav}>KAV</Text>
        <Text style={styles.brandClass}>CLASS</Text>
        <Text style={styles.roleTag}>PAINEL DO PROFESSOR</Text>

        {nome ? (
          <TouchableOpacity
            style={styles.perfilBtn}
            onPress={() => {
              props.navigation.closeDrawer();
              router.push('/(professor)/perfil');
            }}
            activeOpacity={0.7}
          >
            {fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={styles.perfilFoto} />
            ) : (
              <View style={styles.perfilFotoFallback}>
                <Text style={styles.perfilLetra}>{nome[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.perfilNome} numberOfLines={1}>{doisPrimeirosNomes(nome)}</Text>
              <Text style={styles.perfilLabel}>meu perfil</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#C8C8C8" />
          </TouchableOpacity>
        ) : null}
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
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
      <ProfessorDrawer />
    </RedirecionadorEscola>
  );
}

function ProfessorDrawer() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerActiveBackgroundColor: '#000000',
          drawerActiveTintColor: '#ffffff',
          drawerInactiveTintColor: '#333333',
          drawerLabelStyle: { fontWeight: '600', fontSize: 15 },
          drawerStyle: { backgroundColor: '#ffffff', width: 280 },
        }}
      >
        <Drawer.Screen name="index"       options={{ drawerLabel: 'Início',         drawerIcon: ({ color }) => <Ionicons name="home-outline"       size={22} color={color} /> }} />
        <Drawer.Screen name="alunos"      options={{ drawerLabel: 'Meus Alunos',    drawerIcon: ({ color }) => <Ionicons name="people-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="calendario"  options={{ drawerLabel: 'Agenda',         drawerIcon: ({ color }) => <Ionicons name="calendar-outline"   size={22} color={color} /> }} />
        <Drawer.Screen name="agendamento" options={{ drawerLabel: 'Agendamentos',   drawerIcon: ({ color }) => <Ionicons name="add-circle-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="pagamento"   options={{ drawerLabel: 'Financeiro',     drawerIcon: ({ color }) => <Ionicons name="cash-outline"       size={22} color={color} /> }} />
        <Drawer.Screen name="reposicoes"  options={{ drawerLabel: 'Reposições',     drawerIcon: ({ color }) => <Ionicons name="repeat-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="relatorios"  options={{ drawerLabel: 'Relatórios',     drawerIcon: ({ color }) => <Ionicons name="bar-chart-outline"  size={22} color={color} /> }} />
        <Drawer.Screen name="chat"        options={{ drawerLabel: 'Mural da Turma', drawerIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="escanear-presenca" options={{ drawerLabel: 'Escanear Presença', drawerIcon: ({ color }) => <Ionicons name="qr-code-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="perfil"      options={{ drawerItemStyle: { display: 'none' } }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerHeader: { padding: 25, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 10 },
  brandKav:    { fontSize: 18, color: '#000000', fontWeight: '300', letterSpacing: 2 },
  brandClass:  { fontSize: 24, color: '#000000', fontWeight: 'bold', marginTop: -5 },
  roleTag:     { fontSize: 10, color: '#32BCAD', fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  perfilBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  perfilFoto:         { width: 36, height: 36, borderRadius: 18 },
  perfilFotoFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#32BCAD', alignItems: 'center', justifyContent: 'center',
  },
  perfilLetra: { color: '#fff', fontSize: 14, fontWeight: '700' },
  perfilNome:  { color: '#000', fontSize: 13, fontWeight: '600' },
  perfilLabel: { color: '#AAAAAA', fontSize: 10, marginTop: 1 },
});
