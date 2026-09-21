// Lista de navegação do rail lateral (desktop) e do modal "Mais" (mobile) do
// INSTITUTION. Extraído de app/(escola)/_ui.tsx e MobileErpShell.tsx — os
// dois desenhavam a mesma árvore de grupoNav/itemNav com estilos idênticos,
// e ambos agora precisam do mesmo comportamento de accordion (categorias
// como Social/Gestão/Crescimento/Operação clicáveis, expandindo a lista de
// sub-itens). Grupo com `colapsavel: false` (ou sem itens suficientes pra
// valer virar accordion, como "Principal" só com o Painel) renderiza liso,
// sem cabeçalho clicável — igual ao comportamento antigo.
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ERP } from '../../constants/erpTheme';
import type { GrupoNav } from '../../app/(escola)/_ui';

function normalizar(rota: string, rotaBase: string) {
  return rota.replace(rotaBase, '') || '/';
}

function grupoContemRotaAtiva(grupo: GrupoNav, pathname: string, rotaBase: string) {
  return grupo.itens.some((item) => {
    const atual = normalizar(pathname, rotaBase);
    const doItem = normalizar(item.rota, rotaBase);
    return atual === doItem || (item.chave !== 'painel' && atual.startsWith(doItem));
  });
}

export default function SidebarNavGrupos({
  navGrupos, rotaBase, onNavegar,
}: { navGrupos: GrupoNav[]; rotaBase: string; onNavegar?: () => void }) {
  const pathname = usePathname();
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(navGrupos.filter((g) => grupoContemRotaAtiva(g, pathname, rotaBase)).map((g) => g.titulo)),
  );

  // Ao navegar pra dentro de um grupo ainda fechado (ex.: veio de um link
  // fora do menu), abre ele automaticamente sem mexer nos outros que o
  // usuário já tenha aberto/fechado manualmente.
  useEffect(() => {
    const grupoAtivo = navGrupos.find((g) => grupoContemRotaAtiva(g, pathname, rotaBase));
    if (grupoAtivo && !abertos.has(grupoAtivo.titulo)) {
      setAbertos((atual) => new Set(atual).add(grupoAtivo.titulo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const alternar = (titulo: string) => {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(titulo)) novo.delete(titulo); else novo.add(titulo);
      return novo;
    });
  };

  return (
    <>
      {navGrupos.map((grupo, idx) => {
        const chaveGrupo = `${grupo.titulo || '_'}-${idx}`;
        const colapsavel = grupo.colapsavel !== false && !!grupo.titulo && grupo.itens.length > 1;

        if (!colapsavel) {
          return (
            <View key={chaveGrupo} style={estilos.grupoNav}>
              {grupo.titulo ? <Text style={estilos.grupoTitulo}>{grupo.titulo}</Text> : null}
              {grupo.itens.map((item) => (
                <ItemNavLink key={item.chave} item={item} pathname={pathname} rotaBase={rotaBase} onNavegar={onNavegar} />
              ))}
            </View>
          );
        }

        const aberto = abertos.has(grupo.titulo);
        const ativo = grupoContemRotaAtiva(grupo, pathname, rotaBase);
        return (
          <View key={chaveGrupo} style={estilos.grupoNav}>
            <Pressable
              style={({ hovered }: any) => [estilos.grupoHeader, hovered && estilos.itemNavHover]}
              onPress={() => alternar(grupo.titulo)}
            >
              <Text style={[estilos.grupoTitulo, estilos.grupoTituloClicavel, ativo && estilos.grupoTituloAtivo]}>{grupo.titulo}</Text>
              <Ionicons name={aberto ? 'chevron-down' : 'chevron-forward'} size={13} color={ativo ? ERP.sidebarTextoAtivo : ERP.sidebarTextoMuted} />
            </Pressable>
            {aberto && grupo.itens.map((item) => (
              <ItemNavLink key={item.chave} item={item} pathname={pathname} rotaBase={rotaBase} onNavegar={onNavegar} />
            ))}
          </View>
        );
      })}
    </>
  );
}

function ItemNavLink({ item, pathname, rotaBase, onNavegar }: {
  item: GrupoNav['itens'][number]; pathname: string; rotaBase: string; onNavegar?: () => void;
}) {
  const ativo = normalizar(pathname, rotaBase) === normalizar(item.rota, rotaBase) ||
    (item.chave !== 'painel' && normalizar(pathname, rotaBase).startsWith(normalizar(item.rota, rotaBase)));
  return (
    <Pressable
      style={({ hovered, pressed }: any) => [
        estilos.itemNav,
        ativo && estilos.itemNavAtivo,
        !ativo && hovered && estilos.itemNavHover,
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => { router.push(item.rota as any); onNavegar?.(); }}
    >
      {ativo && <View style={estilos.itemNavBarraAtiva} />}
      <Ionicons name={item.icone} size={17} color={ativo ? ERP.sidebarTextoAtivo : ERP.sidebarTexto} />
      <Text style={[estilos.itemNavTexto, ativo && estilos.itemNavTextoAtivo]}>{item.rotulo}</Text>
      {!!item.badge && (
        <View style={estilos.badgeNav}>
          <Text style={estilos.badgeNavTexto}>{item.badge > 99 ? '99+' : item.badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  grupoNav: { marginBottom: 10, paddingHorizontal: 12 },
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 8, borderRadius: ERP.raio.sm, marginBottom: 2,
  },
  grupoTitulo: { color: ERP.sidebarTextoMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginLeft: 8 },
  grupoTituloClicavel: { marginBottom: 0, marginLeft: 0 },
  grupoTituloAtivo: { color: ERP.sidebarTextoAtivo },
  itemNavHover: { backgroundColor: ERP.sidebarBgHover },
  itemNav: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 10, borderRadius: ERP.raio.sm,
    marginBottom: 1, position: 'relative',
  },
  itemNavAtivo: { backgroundColor: ERP.sidebarBgAtivo },
  itemNavBarraAtiva: { position: 'absolute', left: -12, top: 6, bottom: 6, width: 3, borderRadius: 2, backgroundColor: ERP.acento },
  itemNavTexto: { color: ERP.sidebarTexto, fontSize: 14, fontWeight: '500', flex: 1 },
  itemNavTextoAtivo: { color: ERP.sidebarTextoAtivo, fontWeight: '700' },
  badgeNav: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeNavTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
