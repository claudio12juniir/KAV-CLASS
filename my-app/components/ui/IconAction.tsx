// Ícone outline + contador, estilo ações de post do X (curtir/comentar).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { CORES } from '../../constants/theme';

export default function IconAction({
  icone, contador, cor, onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap;
  contador?: number;
  cor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.base} onPress={onPress} hitSlop={8}>
      <Ionicons name={icone} size={18} color={cor || CORES.secundaria} />
      {contador !== undefined && <Text style={[styles.texto, cor && { color: cor }]}>{contador}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  texto: { fontSize: 12, color: CORES.secundaria, fontWeight: '600' },
});
