// Histórico de notificações (Rede Social, INSTITUTION Fase 1) — AINDA NÃO
// LIGADO a dados reais. Curtidas/comentários/DM já existem no banco, mas
// não há hoje nenhuma tabela/consulta agregando isso em "notificação", e o
// aviso de "melhora/piora no posicionamento nas pesquisas" depende de um
// snapshot periódico de ranking que também não existe ainda — os dois
// pontos exigem desenho de schema (migração em produção) e por isso ficam
// pra uma próxima rodada, combinada com o usuário. Esta tela é só o
// destino do item de menu, pra não deixar o link quebrado.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CORES } from '../constants/theme';

export default function Notificacoes() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Notificações</Text>
      <View style={styles.vazio}>
        <Ionicons name="notifications-outline" size={32} color={CORES.secundaria} />
        <Text style={styles.vazioTexto}>
          Em breve: curtidas, comentários, mensagens novas e avisos de posicionamento nas pesquisas, tudo aqui.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo, padding: 20 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: CORES.primaria, marginBottom: 14 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  vazioTexto: { textAlign: 'center', color: CORES.secundaria, fontSize: 13, lineHeight: 19 },
});
