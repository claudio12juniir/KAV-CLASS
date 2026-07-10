import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CORES } from '../constants/theme';

export default function LoadingGlobal() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={CORES.acento} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.fundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
