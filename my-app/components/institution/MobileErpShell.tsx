// Shell do sistema INSTITUTION para professor "PROFESSOR" e aluno de uma
// Escola PACOTE_ESCOLA — mesma linguagem visual do painel (escola) (rail
// claro, ERP de constants/erpTheme.ts), mas construído do zero: o ErpShell
// de app/(escola)/_ui.tsx está amarrado a useEscolaContexto() (DONO/GESTOR)
// e a NAV_ESCOLA fixo, então não dá pra reusar sem editar um arquivo que já
// está em produção. Este componente é puramente apresentacional — recebe
// navGrupos e identidade via props, sem fazer fetch nenhum.
// Responsivo como o ErpShell: rail fixo em desktop, bottom tabs (4 ícones
// mais usados + "Mais") em mobile — os 4 pinados são os primeiros itens de
// navGrupos, na ordem em que a tela os define.
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useState } from 'react';
import {
  Image,
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import SyncLoader from '../SyncLoader';
import { ERP, ERP_BREAKPOINT_DESKTOP } from '../../constants/erpTheme';
import type { GrupoNav } from '../../app/(escola)/_ui';
import BottomTabBar from './BottomTabBar';

function useEhDesktop() {
  const { width } = useWindowDimensions();
  return width >= ERP_BREAKPOINT_DESKTOP;
}

function normalizar(rota: string, rotaBase: string) {
  return rota.replace(rotaBase, '') || '/';
}

function SidebarConteudo({
  navGrupos, rotaBase, nome, fotoUrl, subtitulo, tag, aoSair, onNavegar,
}: {
  navGrupos: GrupoNav[]; rotaBase: string;
  nome: string; fotoUrl: string | null; subtitulo: string; tag: string;
  aoSair: () => void; onNavegar?: () => void;
}) {
  const pathname = usePathname();

  return (
    <View style={estilos.sidebar}>
      <View style={estilos.marca}>
        <Text style={estilos.marcaKav}>KAV<Text style={estilos.marcaClass}> CLASS</Text></Text>
        <View style={estilos.tagEscola}>
          <Ionicons name="business" size={11} color={ERP.acento} />
          <Text style={estilos.tagEscolaTexto} numberOfLines={1}>{subtitulo || tag}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {navGrupos.map((grupo) => (
          <View key={grupo.titulo} style={estilos.grupoNav}>
            {grupo.titulo ? <Text style={estilos.grupoTitulo}>{grupo.titulo}</Text> : null}
            {grupo.itens.map((item) => {
              const ativo = normalizar(pathname, rotaBase) === normalizar(item.rota, rotaBase);
              return (
                <Pressable
                  key={item.chave}
                  style={({ hovered, pressed }: any) => [
                    estilos.itemNav,
                    ativo && estilos.itemNavAtivo,
                    !ativo && hovered && estilos.itemNavHover,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => { router.push(item.rota as any); onNavegar?.(); }}
                >
                  {ativo && <View style={estilos.itemNavBarraAtiva} />}
                  <Ionicons name={item.icone} size={18} color={ativo ? ERP.sidebarTextoAtivo : ERP.sidebarTexto} />
                  <Text style={[estilos.itemNavTexto, ativo && estilos.itemNavTextoAtivo]}>{item.rotulo}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={estilos.perfilRodape}>
        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={estilos.avatarFoto} />
        ) : (
          <View style={estilos.avatarFallback}>
            <Text style={estilos.avatarLetra}>{nome?.[0]?.toUpperCase() || '?'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={estilos.perfilNome} numberOfLines={1}>{nome || '—'}</Text>
          <Text style={estilos.perfilPapel}>{tag}</Text>
        </View>
      </View>
      <Pressable style={({ hovered }: any) => [estilos.sairBtn, hovered && estilos.itemNavHover]} onPress={aoSair}>
        <Ionicons name="log-out-outline" size={16} color={ERP.sidebarTextoMuted} />
        <Text style={estilos.sairTexto}>Sair</Text>
      </Pressable>
    </View>
  );
}

export function MobileErpShell({
  titulo, acao, children, navGrupos, rotaBase,
  identidade, tag, aoSair, carregando,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  navGrupos: GrupoNav[];
  rotaBase: string;
  identidade: { nome: string; fotoUrl: string | null; subtitulo: string };
  tag: string;
  aoSair: () => void;
  carregando?: boolean;
}) {
  const ehDesktop = useEhDesktop();
  const [menuAberto, setMenuAberto] = useState(false);
  const itensPinados = navGrupos.flatMap((g) => g.itens).slice(0, 4);

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ERP.fundo }}>
        <SyncLoader size="large" color={ERP.texto} />
      </View>
    );
  }

  return (
    <View style={estilos.appRow}>
      {ehDesktop && (
        <SidebarConteudo
          navGrupos={navGrupos}
          rotaBase={rotaBase}
          nome={identidade.nome}
          fotoUrl={identidade.fotoUrl}
          subtitulo={identidade.subtitulo}
          tag={tag}
          aoSair={aoSair}
        />
      )}

      {!ehDesktop && (
        <RNModal visible={menuAberto} animationType="fade" transparent onRequestClose={() => setMenuAberto(false)}>
          <TouchableOpacity style={estilos.overlay} activeOpacity={1} onPress={() => setMenuAberto(false)}>
            <TouchableOpacity activeOpacity={1} style={estilos.overlaySidebar}>
              <SidebarConteudo
                navGrupos={navGrupos}
                rotaBase={rotaBase}
                nome={identidade.nome}
                fotoUrl={identidade.fotoUrl}
                subtitulo={identidade.subtitulo}
                tag={tag}
                aoSair={aoSair}
                onNavegar={() => setMenuAberto(false)}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </RNModal>
      )}

      <View style={estilos.colunaDireita}>
        <View style={estilos.topbar}>
          <Text style={estilos.topbarTitulo}>{titulo}</Text>
          <View style={{ flex: 1 }} />
          {acao}
        </View>

        <ScrollView style={estilos.conteudo} contentContainerStyle={estilos.conteudoInner} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>

        {!ehDesktop && (
          <BottomTabBar itens={itensPinados} rotaBase={rotaBase} aoAbrirMais={() => setMenuAberto(true)} />
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  appRow: { flex: 1, flexDirection: 'row', backgroundColor: ERP.fundo },

  sidebar: { width: 280, backgroundColor: ERP.sidebarBg, borderRightWidth: 1, borderRightColor: ERP.sidebarBorda, paddingTop: 20, paddingBottom: 16 },
  marca: { paddingHorizontal: 20, paddingBottom: 18, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: ERP.sidebarBorda },
  marcaKav: { color: ERP.texto, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  marcaClass: { color: ERP.acento, fontWeight: '800' },
  tagEscola: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  tagEscolaTexto: { color: ERP.sidebarTexto, fontSize: 12, fontWeight: '600', flexShrink: 1 },

  grupoNav: { marginBottom: 18, paddingHorizontal: 12 },
  grupoTitulo: { color: ERP.sidebarTextoMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginLeft: 8 },
  itemNav: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 11, borderRadius: ERP.raio.sm,
    marginBottom: 1, position: 'relative',
  },
  itemNavHover: { backgroundColor: ERP.sidebarBgHover },
  itemNavAtivo: { backgroundColor: ERP.sidebarBgAtivo },
  itemNavBarraAtiva: { position: 'absolute', left: -12, top: 6, bottom: 6, width: 3, borderRadius: 2, backgroundColor: ERP.acento },
  itemNavTexto: { color: ERP.sidebarTexto, fontSize: 14, fontWeight: '500' },
  itemNavTextoAtivo: { color: ERP.sidebarTextoAtivo, fontWeight: '700' },

  perfilRodape: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: ERP.sidebarBorda },
  avatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center' },
  avatarFoto: { width: 32, height: 32, borderRadius: 16, backgroundColor: ERP.sidebarBgAtivo },
  avatarLetra: { color: '#fff', fontSize: 13, fontWeight: '700' },
  perfilNome: { color: ERP.texto, fontSize: 13, fontWeight: '600' },
  perfilPapel: { color: ERP.sidebarTextoMuted, fontSize: 11, marginTop: 1 },
  sairBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  sairTexto: { color: ERP.sidebarTextoMuted, fontSize: 12.5, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row' },
  overlaySidebar: { height: '100%' },

  colunaDireita: { flex: 1, minWidth: 0 },
  topbar: {
    flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 20,
    backgroundColor: ERP.superficie, borderBottomWidth: 1, borderBottomColor: ERP.borda,
    ...ERP.sombra.xs, zIndex: 1,
  },
  topbarTitulo: { fontSize: 15, fontWeight: '700', color: ERP.texto, letterSpacing: 0.1 },

  conteudo: { flex: 1 },
  conteudoInner: { padding: 18, paddingBottom: 60 },
});
