// Botão em pílula (raio total) estilo X — variante sólida (ação primária)
// ou outline (ação secundária).
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { CORES, RAIO } from '../../constants/theme';

export default function Pill({
  texto, onPress, disabled, carregando, variante = 'solido', tamanho = 'md',
}: {
  texto: string;
  onPress: () => void;
  disabled?: boolean;
  carregando?: boolean;
  variante?: 'solido' | 'outline';
  tamanho?: 'sm' | 'md';
}) {
  const solido = variante === 'solido';
  return (
    <TouchableOpacity
      style={[
        styles.base,
        tamanho === 'sm' ? styles.tamanhoSm : styles.tamanhoMd,
        solido ? styles.solido : styles.outline,
        (disabled || carregando) && styles.desabilitado,
      ]}
      onPress={onPress}
      disabled={disabled || carregando}
      activeOpacity={0.85}
    >
      {carregando ? (
        <ActivityIndicator color={solido ? '#ffffff' : CORES.primaria} size="small" />
      ) : (
        <Text style={[styles.texto, solido ? styles.textoSolido : styles.textoOutline]}>{texto}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: RAIO.pill, alignItems: 'center', justifyContent: 'center' },
  tamanhoMd: { paddingVertical: 10, paddingHorizontal: 20 },
  tamanhoSm: { paddingVertical: 6, paddingHorizontal: 14 },
  solido: { backgroundColor: CORES.primaria },
  outline: { borderWidth: 1, borderColor: CORES.borda, backgroundColor: 'transparent' },
  desabilitado: { opacity: 0.5 },
  texto: { fontWeight: '700', fontSize: 14 },
  textoSolido: { color: '#ffffff' },
  textoOutline: { color: CORES.primaria },
});
