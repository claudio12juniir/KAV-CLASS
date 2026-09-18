// Avatar circular estilo X: foto ou fallback com a inicial do nome sobre
// o teal da marca. Usado no feed, em perfis e nos shells de navegação.
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CORES } from '../../constants/theme';

export default function Avatar({
  fotoUrl, nome, tamanho = 40,
}: { fotoUrl?: string | null; nome?: string | null; tamanho?: number }) {
  const raio = tamanho / 2;
  if (fotoUrl) {
    return <Image source={{ uri: fotoUrl }} style={{ width: tamanho, height: tamanho, borderRadius: raio }} />;
  }
  return (
    <View style={[styles.fallback, { width: tamanho, height: tamanho, borderRadius: raio }]}>
      <Text style={[styles.letra, { fontSize: tamanho * 0.42 }]}>{nome?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center' },
  letra: { color: '#ffffff', fontWeight: '700' },
});
