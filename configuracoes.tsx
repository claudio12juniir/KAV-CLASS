import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ConfiguracoesScreen() {
  const router = useRouter();

  const fazerLogout = () => {
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Conta</Text>

        <TouchableOpacity style={styles.botaoSair} onPress={fazerLogout}>
          <Ionicons name="log-out-outline" size={24} color="#D9534F" />
          <Text style={styles.textoSair}>Encerrar Sessão</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  secao: {
    marginTop: 60,
    paddingHorizontal: 20,
  },
  tituloSecao: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 15,
  },
  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
    padding: 15,
    borderRadius: 12,
    gap: 12,
  },
  textoSair: {
    color: '#D9534F',
    fontSize: 16,
    fontWeight: 'bold',
  },
});