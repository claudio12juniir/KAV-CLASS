// Bottom tab bar estilo X para o INSTITUTION em telas estreitas: ícones
// fixos + "Mais" abre a lista completa de navegação (mesmo modal usado
// hoje). Em telas largas, ErpShell/MobileErpShell usam o rail lateral em
// vez desta barra.
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ERP } from '../../constants/erpTheme';
import type { ItemNav } from '../../app/(escola)/_ui';

function normalizar(rota: string, rotaBase: string) {
  return rota.replace(rotaBase, '') || '/';
}

export default function BottomTabBar({
  itens, rotaBase, aoAbrirMais,
}: { itens: ItemNav[]; rotaBase: string; aoAbrirMais: () => void }) {
  const pathname = usePathname();

  return (
    <View style={styles.barra}>
      {itens.map((item) => {
        const ativo = normalizar(pathname, rotaBase) === normalizar(item.rota, rotaBase);
        return (
          <TouchableOpacity key={item.chave} style={styles.item} onPress={() => router.push(item.rota as any)} hitSlop={6}>
            <Ionicons name={item.icone} size={23} color={ativo ? ERP.acento : ERP.textoMuted} />
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={styles.item} onPress={aoAbrirMais} hitSlop={6}>
        <Ionicons name="ellipsis-horizontal-circle-outline" size={23} color={ERP.textoMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    height: 56, backgroundColor: ERP.superficie, borderTopWidth: 1, borderTopColor: ERP.borda,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
});
