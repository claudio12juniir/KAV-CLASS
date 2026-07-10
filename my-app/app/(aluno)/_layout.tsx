import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { usePushToken } from '../../hooks/usePushToken';

function CustomDrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.drawerHeader}>
        <Text style={styles.brandKav}>KAV</Text>
        <Text style={styles.brandClass}>CLASS</Text>
        <Text style={styles.roleTag}>PORTAL DO ALUNO</Text>
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

export default function AlunoLayout() {
  usePushToken();
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
        <Drawer.Screen name="materiais" options={{ drawerLabel: 'Material Didático', drawerIcon: ({ color }) => <Ionicons name="book-outline"      size={22} color={color} /> }} />
        <Drawer.Screen name="pagamento" options={{ drawerLabel: 'Financeiro',       drawerIcon: ({ color }) => <Ionicons name="wallet-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="reposicoes" options={{ drawerLabel: 'Reposições',      drawerIcon: ({ color }) => <Ionicons name="repeat-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="chat"      options={{ drawerLabel: 'Mural da Turma',   drawerIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} /> }} />
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
});
