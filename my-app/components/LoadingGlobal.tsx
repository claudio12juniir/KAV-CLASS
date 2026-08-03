import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CORES } from '../constants/theme';
import SyncLoader from './SyncLoader';

export default function LoadingGlobal() {
  return (
    <View style={styles.container}>
      <SyncLoader size="large" color={CORES.acento} />
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
