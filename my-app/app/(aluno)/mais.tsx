// Tela "Mais" — abriga os itens que não cabem na tab bar (estilo X: 4
// ícones fixos + "Mais" leva a uma lista). Sem lógica de negócio própria,
// só navegação e logout.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ListaNav from '../../components/ui/ListaNav';
import { CORES } from '../../constants/theme';
import { useConta } from '../_contaContexto';

export default function MaisAluno() {
  const router = useRouter();
  const { vinculos, trocarVinculo } = useConta();

  const sair = async () => {
    await SecureStore.deleteItemAsync('kav_token');
    await SecureStore.deleteItemAsync('kav_papel');
    await SecureStore.deleteItemAsync('kav_aluno_id');
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.titulo}>Mais</Text>

      <ListaNav
        itens={[
          { chave: 'materiais', icone: 'book-outline', rotulo: 'Material Didático', aoPressionar: () => router.push('/(aluno)/materiais') },
          { chave: 'pagamento', icone: 'wallet-outline', rotulo: 'Financeiro', aoPressionar: () => router.push('/(aluno)/pagamento') },
          { chave: 'reposicoes', icone: 'repeat-outline', rotulo: 'Reposições', aoPressionar: () => router.push('/(aluno)/reposicoes') },
          { chave: 'escanear-presenca', icone: 'qr-code-outline', rotulo: 'Escanear Presença', aoPressionar: () => router.push('/(aluno)/escanear-presenca') },
          { chave: 'checkin-presenca', icone: 'finger-print-outline', rotulo: 'Confirmar Presença', aoPressionar: () => router.push('/(aluno)/checkin-presenca') },
          { chave: 'perfil', icone: 'person-outline', rotulo: 'Meu Perfil', aoPressionar: () => router.push('/(aluno)/perfil') },
        ]}
      />

      {vinculos.length > 1 && (
        <View style={styles.trocarContaBox}>
          <Text style={styles.trocarContaTitulo}>Trocar de conta</Text>
          {vinculos.map((v) => (
            <TouchableOpacity key={`${v.papel}-${v.id}`} style={styles.trocarContaItem} onPress={() => trocarVinculo(v)}>
              <Ionicons name="swap-horizontal-outline" size={16} color={CORES.secundaria} />
              <Text style={styles.trocarContaTexto} numberOfLines={1}>{v.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ marginTop: 8 }}>
        <ListaNav itens={[{ chave: 'sair', icone: 'log-out-outline', rotulo: 'Sair', aoPressionar: sair, tom: 'perigo' }]} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  titulo: { fontSize: 24, fontWeight: 'bold', color: CORES.primaria, marginBottom: 14 },
  trocarContaBox: { marginTop: 10, paddingTop: 14 },
  trocarContaTitulo: { fontSize: 11, color: CORES.secundaria, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  trocarContaItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  trocarContaTexto: { color: CORES.primaria, fontSize: 13, flexShrink: 1 },
});
