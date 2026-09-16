import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SyncLoader from '../../components/SyncLoader';
import { usePushToken } from '../../hooks/usePushToken';
import { BASE_URL, fetchComRetry } from '../api';
import { useConta } from '../_contaContexto';

function CustomDrawerContent(props: any) {
  const { vinculos, trocarVinculo } = useConta();

  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.drawerHeader}>
        <Text style={styles.brandKav}>KAV</Text>
        <Text style={styles.brandClass}>CLASS</Text>
        <Text style={styles.roleTag}>PORTAL DO ALUNO</Text>
      </View>
      <DrawerItemList {...props} />

      {/* Só aparece quando a Conta tem mais de 1 vínculo (fundação de
          identidade unificada) — hoje isso nunca acontece em produção. */}
      {vinculos.length > 1 && (
        <View style={styles.trocarContaBox}>
          <Text style={styles.trocarContaTitulo}>Trocar de conta</Text>
          {vinculos.map((v) => (
            <TouchableOpacity
              key={`${v.papel}-${v.id}`}
              style={styles.trocarContaItem}
              onPress={() => { props.navigation.closeDrawer(); trocarVinculo(v); }}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color="#555" />
              <Text style={styles.trocarContaTexto} numberOfLines={1}>{v.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </DrawerContentScrollView>
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
      <AlunoDrawer />
    </RedirecionadorEscolaAluno>
  );
}

function AlunoDrawer() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerActiveBackgroundColor: '#000000',
          drawerActiveTintColor: '#ffffff',
          drawerInactiveTintColor: '#333333',
          drawerLabelStyle: { fontWeight: '600', fontSize: 14 },
          drawerStyle: { backgroundColor: '#ffffff', width: 280 },
        }}
      >
        <Drawer.Screen name="index"     options={{ drawerLabel: 'Início',          drawerIcon: ({ color }) => <Ionicons name="home-outline"        size={22} color={color} /> }} />
        <Drawer.Screen name="feed"      options={{ drawerLabel: 'Feed',            drawerIcon: ({ color }) => <Ionicons name="newspaper-outline"   size={22} color={color} /> }} />
        <Drawer.Screen name="busca"     options={{ drawerLabel: 'Explorar',        drawerIcon: ({ color }) => <Ionicons name="search-outline"      size={22} color={color} /> }} />
        <Drawer.Screen name="materiais" options={{ drawerLabel: 'Material Didático', drawerIcon: ({ color }) => <Ionicons name="book-outline"      size={22} color={color} /> }} />
        <Drawer.Screen name="pagamento" options={{ drawerLabel: 'Financeiro',       drawerIcon: ({ color }) => <Ionicons name="wallet-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="reposicoes" options={{ drawerLabel: 'Reposições',      drawerIcon: ({ color }) => <Ionicons name="repeat-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="chat"      options={{ drawerLabel: 'Mensagens',   drawerIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="escanear-presenca" options={{ drawerLabel: 'Escanear Presença', drawerIcon: ({ color }) => <Ionicons name="qr-code-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="checkin-presenca" options={{ drawerLabel: 'Confirmar Presença', drawerIcon: ({ color }) => <Ionicons name="finger-print-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="perfil"    options={{ drawerItemStyle: { display: 'none' } }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerHeader: { padding: 25, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 10 },
  brandKav:   { fontSize: 18, color: '#000000', fontWeight: '300', letterSpacing: 2 },
  brandClass: { fontSize: 24, color: '#000000', fontWeight: 'bold', marginTop: -5 },
  roleTag:    { fontSize: 10, color: '#32BCAD', fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  trocarContaBox: { marginTop: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  trocarContaTitulo: { fontSize: 11, color: '#AAAAAA', fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
  trocarContaItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  trocarContaTexto: { color: '#333', fontSize: 13, flexShrink: 1 },
});
