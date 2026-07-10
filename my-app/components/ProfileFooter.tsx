import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORES } from '../constants/theme';

interface Props {
  nome: string;
  fotoUrl: string | null;
  onPress: () => void;
}

function doisPrimeirosNomes(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/);
  return partes.slice(0, 2).join(' ');
}

export default function ProfileFooter({ nome, fotoUrl, onPress }: Props) {
  const insets = useSafeAreaInsets();
  const inicial = nome?.[0]?.toUpperCase() || '?';

  return (
    <TouchableOpacity
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      {fotoUrl ? (
        <Image source={{ uri: fotoUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarLetra}>{inicial}</Text>
        </View>
      )}

      <View style={styles.textBox}>
        <Text style={styles.nome} numberOfLines={1}>{doisPrimeirosNomes(nome)}</Text>
        <Text style={styles.label}>meu perfil</Text>
      </View>

      <Ionicons name="chevron-forward" size={14} color="#C8C8C8" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E2E2',
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CORES.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetra: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  textBox: {
    flex: 1,
  },
  nome: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  label: {
    color: '#AAAAAA',
    fontSize: 11,
    marginTop: 1,
  },
});
