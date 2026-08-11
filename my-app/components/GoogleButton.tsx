import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from './SyncLoader';

type Props = {
  onPress: () => void;
  carregando?: boolean;
  texto?: string;
};

export default function GoogleButton({ onPress, carregando, texto = 'Continuar com Google' }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.divisorLinha}>
        <View style={styles.linha} />
        <Text style={styles.divisorTexto}>ou</Text>
        <View style={styles.linha} />
      </View>

      <TouchableOpacity
        style={[styles.botao, carregando && styles.botaoDesabilitado]}
        onPress={onPress}
        disabled={carregando}
        activeOpacity={0.8}
      >
        {carregando ? (
          <SyncLoader size="small" color="#4285F4" />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={styles.texto}>{texto}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  divisorLinha: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10,
  },
  linha: { flex: 1, height: 1, backgroundColor: '#e0e0e0' },
  divisorTexto: { color: '#999', fontSize: 12, fontWeight: '600' },

  botao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 50, borderRadius: 10,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dadce0',
  },
  botaoDesabilitado: { opacity: 0.6 },
  texto: { color: '#3c4043', fontSize: 15, fontWeight: '600' },
});
