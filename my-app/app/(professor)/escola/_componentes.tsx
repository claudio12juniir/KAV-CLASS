import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { CORES } from '../../../constants/theme';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type AbaEscola = {
  chave: string;
  rota: string;
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
};

export const ABAS_ESCOLA: AbaEscola[] = [
  { chave: 'painel',      rota: '/(professor)/escola',             rotulo: 'Painel',      icone: 'grid-outline' },
  { chave: 'equipe',      rota: '/(professor)/escola/equipe',      rotulo: 'Equipe',      icone: 'people-outline' },
  { chave: 'captacao',    rota: '/(professor)/escola/captacao',    rotulo: 'Captação',    icone: 'megaphone-outline' },
  { chave: 'calendario',  rota: '/(professor)/escola/calendario',  rotulo: 'Calendário',  icone: 'calendar-outline' },
  { chave: 'comunicados', rota: '/(professor)/escola/comunicados', rotulo: 'Comunicados', icone: 'mail-outline' },
  { chave: 'recursos',    rota: '/(professor)/escola/recursos',    rotulo: 'Recursos',    icone: 'business-outline' },
  { chave: 'financeiro',  rota: '/(professor)/escola/financeiro',  rotulo: 'Financeiro',  icone: 'cash-outline' },
];

/** Cabeçalho padrão das telas de Minha Escola: hamburger + título da aba atual. */
export function EscolaHeader({ titulo }: { titulo: string }) {
  const navigation = useNavigation();
  return (
    <View style={estilos.header}>
      <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={estilos.hamburger}>
        <Ionicons name="menu" size={24} color={CORES.primaria} />
      </TouchableOpacity>
      <Text style={estilos.tituloHeader}>MINHA ESCOLA</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

/** Barra de abas superior, rolável, com a rota atual destacada. */
export function EscolaTabBar() {
  const pathname = usePathname();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={estilos.tabBarContainer}
      contentContainerStyle={estilos.tabBarConteudo}
    >
      {ABAS_ESCOLA.map((aba) => {
        // usePathname() devolve a URL real, sem o segmento de grupo "(professor)".
        const ativa = pathname === aba.rota.replace('/(professor)', '');
        return (
          <TouchableOpacity
            key={aba.chave}
            style={[estilos.tabPill, ativa && estilos.tabPillAtiva]}
            onPress={() => router.push(aba.rota as any)}
          >
            <Ionicons name={aba.icone} size={15} color={ativa ? CORES.fundo : CORES.secundaria} />
            <Text style={[estilos.tabTexto, ativa && estilos.tabTextoAtivo]}>{aba.rotulo}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Segmented control simples pra sub-abas dentro de uma aba (ex: Salas | Estoque). */
export function SubAbas<T extends string>({
  opcoes, ativa, onMudar,
}: {
  opcoes: { chave: T; rotulo: string }[];
  ativa: T;
  onMudar: (chave: T) => void;
}) {
  return (
    <View style={estilos.subAbasContainer}>
      {opcoes.map((op) => (
        <TouchableOpacity
          key={op.chave}
          style={[estilos.subAba, ativa === op.chave && estilos.subAbaAtiva]}
          onPress={() => onMudar(op.chave)}
        >
          <Text style={[estilos.subAbaTexto, ativa === op.chave && estilos.subAbaTextoAtivo]}>{op.rotulo}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const estilos = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: CORES.fundo,
  },
  hamburger: { padding: 4 },
  tituloHeader: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },

  tabBarContainer: {
    flexGrow: 0, flexShrink: 0, height: 56,
    backgroundColor: CORES.fundo, borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  tabBarConteudo: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  tabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda,
  },
  tabPillAtiva: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  tabTexto: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },
  tabTextoAtivo: { color: CORES.fundo },

  subAbasContainer: {
    flexDirection: 'row', marginHorizontal: 20, marginTop: 20, marginBottom: 4,
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 4,
    borderWidth: 1, borderColor: CORES.borda,
  },
  subAba: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  subAbaAtiva: { backgroundColor: CORES.acento },
  subAbaTexto: { fontSize: 14, fontWeight: '600', color: CORES.secundaria },
  subAbaTextoAtivo: { color: CORES.fundo },
});
