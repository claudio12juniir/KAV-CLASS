// Lista de navegação estilo X ("Mais"/configurações): linha com ícone,
// rótulo e chevron, separadas por divisor hairline.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES } from '../../constants/theme';

export type ItemListaNav = {
  chave: string;
  icone: keyof typeof Ionicons.glyphMap;
  rotulo: string;
  aoPressionar: () => void;
  tom?: 'default' | 'perigo';
};

export default function ListaNav({ itens }: { itens: ItemListaNav[] }) {
  return (
    <View>
      {itens.map((item) => (
        <TouchableOpacity key={item.chave} style={styles.linha} onPress={item.aoPressionar} activeOpacity={0.7}>
          <Ionicons name={item.icone} size={20} color={item.tom === 'perigo' ? CORES.erro : CORES.primaria} />
          <Text style={[styles.texto, item.tom === 'perigo' && { color: CORES.erro }]}>{item.rotulo}</Text>
          <Ionicons name="chevron-forward" size={16} color={CORES.secundaria} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  texto: { flex: 1, fontSize: 15, fontWeight: '600', color: CORES.primaria },
});
