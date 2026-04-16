import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function CustomDrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.drawerHeader}>
        <Text style={styles.brandKav}>KAV</Text>
        <Text style={styles.brandClass}>CLASS</Text>
        <Text style={styles.roleTag}>PAINEL DO PROFESSOR</Text>
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

export default function ProfessorLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerActiveBackgroundColor: '#000000ff',
          drawerActiveTintColor: '#ffffff',
          drawerInactiveTintColor: '#333333',
          drawerLabelStyle: { fontWeight: '600', fontSize: 15 },
          drawerStyle: { backgroundColor: '#ffffff', width: 280 },
        }}
      >
        <Drawer.Screen name="index"         options={{ drawerLabel: 'Início',         drawerIcon: ({ color }) => <Ionicons name="home-outline"       size={22} color={color} /> }} />
        <Drawer.Screen name="alunos"        options={{ drawerLabel: 'Meus Alunos',    drawerIcon: ({ color }) => <Ionicons name="people-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="calendario"    options={{ drawerLabel: 'Agenda',         drawerIcon: ({ color }) => <Ionicons name="calendar-outline"   size={22} color={color} /> }} />
        <Drawer.Screen name="agendamento"   options={{ drawerLabel: 'Agendamentos',   drawerIcon: ({ color }) => <Ionicons name="add-circle-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="pagamento"     options={{ drawerLabel: 'Financeiro',     drawerIcon: ({ color }) => <Ionicons name="cash-outline"       size={22} color={color} /> }} />
        <Drawer.Screen name="reposicoes"    options={{ drawerLabel: 'Reposições',     drawerIcon: ({ color }) => <Ionicons name="repeat-outline"     size={22} color={color} /> }} />
        <Drawer.Screen name="relatorios"    options={{ drawerLabel: 'Relatórios',     drawerIcon: ({ color }) => <Ionicons name="bar-chart-outline"  size={22} color={color} /> }} />
        <Drawer.Screen name="chat"          options={{ drawerLabel: 'Mural da Turma', drawerIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} /> }} />
        <Drawer.Screen name="configuracoes" options={{ drawerLabel: 'Configurações',  drawerIcon: ({ color }) => <Ionicons name="settings-outline"   size={22} color={color} /> }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerHeader: { padding: 25, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 10 },
  brandKav:    { fontSize: 18, color: '#000000ff', fontWeight: '300', letterSpacing: 2 },
  brandClass:  { fontSize: 24, color: '#000000ff', fontWeight: 'bold', marginTop: -5 },
  roleTag:     { fontSize: 10, color: '#32BCAD', fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
});
