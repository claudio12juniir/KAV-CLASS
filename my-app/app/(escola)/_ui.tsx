import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import {
  Modal as RNModal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP, ERP_BREAKPOINT_DESKTOP } from '../../constants/erpTheme';
import { useEscolaContexto } from './_contexto';

export function useEhDesktop() {
  const { width } = useWindowDimensions();
  return width >= ERP_BREAKPOINT_DESKTOP;
}

// ─── Navegação ──────────────────────────────────────────────────────────

export type ItemNav = { chave: string; rota: string; rotulo: string; icone: keyof typeof Ionicons.glyphMap };
export type GrupoNav = { titulo: string; itens: ItemNav[] };

export const NAV_ESCOLA: GrupoNav[] = [
  { titulo: 'Principal', itens: [
    { chave: 'painel', rota: '/(escola)', rotulo: 'Painel', icone: 'grid-outline' },
  ]},
  { titulo: 'Gestão', itens: [
    { chave: 'equipe', rota: '/(escola)/equipe', rotulo: 'Equipe', icone: 'people-outline' },
    { chave: 'alunos', rota: '/(escola)/alunos', rotulo: 'Alunos', icone: 'school-outline' },
    { chave: 'calendario', rota: '/(escola)/calendario', rotulo: 'Calendário', icone: 'calendar-outline' },
  ]},
  { titulo: 'Crescimento', itens: [
    { chave: 'captacao', rota: '/(escola)/captacao', rotulo: 'Captação', icone: 'megaphone-outline' },
    { chave: 'comunicados', rota: '/(escola)/comunicados', rotulo: 'Comunicados', icone: 'mail-outline' },
  ]},
  { titulo: 'Operação', itens: [
    { chave: 'recursos', rota: '/(escola)/recursos', rotulo: 'Recursos', icone: 'business-outline' },
    { chave: 'financeiro', rota: '/(escola)/financeiro', rotulo: 'Financeiro', icone: 'cash-outline' },
  ]},
];

function normalizar(rota: string) { return rota.replace('/(escola)', '') || '/'; }

function SidebarConteudo({ onNavegar }: { onNavegar?: () => void }) {
  const pathname = usePathname();
  const { nomeEscola, nomeAdmin, fotoAdmin, papel } = useEscolaContexto();

  const sair = async () => {
    await SecureStore.deleteItemAsync('kav_token');
    await SecureStore.deleteItemAsync('kav_papel');
    await SecureStore.deleteItemAsync('kav_professor_id');
    router.replace('/login');
  };

  return (
    <View style={estilos.sidebar}>
      <View style={estilos.marca}>
        <Text style={estilos.marcaKav}>KAV<Text style={estilos.marcaClass}> CLASS</Text></Text>
        <View style={estilos.tagEscola}>
          <Ionicons name="business" size={11} color={ERP.acento} />
          <Text style={estilos.tagEscolaTexto} numberOfLines={1}>{nomeEscola || 'Minha Escola'}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {NAV_ESCOLA.map((grupo) => (
          <View key={grupo.titulo} style={estilos.grupoNav}>
            <Text style={estilos.grupoTitulo}>{grupo.titulo}</Text>
            {grupo.itens.map((item) => {
              const ativo = normalizar(pathname) === normalizar(item.rota) ||
                (item.chave !== 'painel' && normalizar(pathname).startsWith(normalizar(item.rota)));
              return (
                <TouchableOpacity
                  key={item.chave}
                  style={[estilos.itemNav, ativo && estilos.itemNavAtivo]}
                  onPress={() => { router.push(item.rota as any); onNavegar?.(); }}
                >
                  <Ionicons name={item.icone} size={18} color={ativo ? ERP.sidebarTextoAtivo : ERP.sidebarTexto} />
                  <Text style={[estilos.itemNavTexto, ativo && estilos.itemNavTextoAtivo]}>{item.rotulo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={estilos.perfilRodape}
        onPress={() => { router.push('/(escola)/perfil' as any); onNavegar?.(); }}
      >
        {fotoAdmin ? (
          <View style={estilos.avatarFoto} />
        ) : (
          <View style={estilos.avatarFallback}>
            <Text style={estilos.avatarLetra}>{nomeAdmin?.[0]?.toUpperCase() || '?'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={estilos.perfilNome} numberOfLines={1}>{nomeAdmin || '—'}</Text>
          <Text style={estilos.perfilPapel}>{papel === 'DONO' ? 'Dono da escola' : 'Gestor'}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={estilos.sairBtn} onPress={sair}>
        <Ionicons name="log-out-outline" size={16} color={ERP.sidebarTextoMuted} />
        <Text style={estilos.sairTexto}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ErpShell({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  const ehDesktop = useEhDesktop();
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <View style={estilos.appRow}>
      {ehDesktop && <SidebarConteudo />}

      {!ehDesktop && (
        <RNModal visible={menuAberto} animationType="fade" transparent onRequestClose={() => setMenuAberto(false)}>
          <TouchableOpacity style={estilos.overlay} activeOpacity={1} onPress={() => setMenuAberto(false)}>
            <TouchableOpacity activeOpacity={1} style={estilos.overlaySidebar}>
              <SidebarConteudo onNavegar={() => setMenuAberto(false)} />
            </TouchableOpacity>
          </TouchableOpacity>
        </RNModal>
      )}

      <View style={estilos.colunaDireita}>
        <View style={estilos.topbar}>
          {!ehDesktop && (
            <TouchableOpacity onPress={() => setMenuAberto(true)} style={estilos.hamburger}>
              <Ionicons name="menu" size={22} color={ERP.texto} />
            </TouchableOpacity>
          )}
          <Text style={estilos.topbarTitulo}>{titulo}</Text>
          <View style={{ flex: 1 }} />
          {acao}
        </View>

        <ScrollView style={estilos.conteudo} contentContainerStyle={estilos.conteudoInner} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Blocos de UI reutilizáveis ─────────────────────────────────────────

export function SectionCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[estilos.card, style]}>{children}</View>;
}

export function Kpi({ label, valor, tom = 'default', onPress }: {
  label: string; valor: string | number; tom?: 'default' | 'alerta' | 'sucesso'; onPress?: () => void;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[estilos.kpi, tom === 'alerta' && estilos.kpiAlerta, tom === 'sucesso' && estilos.kpiSucesso]} onPress={onPress}>
      <Text style={[estilos.kpiValor, tom === 'alerta' && { color: ERP.perigo }]}>{valor}</Text>
      <Text style={estilos.kpiLabel}>{label}</Text>
    </Wrapper>
  );
}

export function Badge({ texto, tom = 'default' }: { texto: string; tom?: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }) {
  const cores: Record<string, [string, string]> = {
    default: [ERP.fundo, ERP.textoSecundario],
    sucesso: [ERP.sucessoSoft, ERP.sucesso],
    alerta: [ERP.perigoSoft, ERP.perigo],
    aviso: [ERP.avisoSoft, ERP.aviso],
    info: [ERP.infoSoft, ERP.info],
  };
  const [bg, cor] = cores[tom];
  return (
    <View style={[estilos.badge, { backgroundColor: bg }]}>
      <Text style={[estilos.badgeTexto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

export function Botao({ texto, onPress, variante = 'primario', carregando, icone, disabled }: {
  texto: string; onPress: () => void; variante?: 'primario' | 'secundario' | 'perigo';
  carregando?: boolean; icone?: keyof typeof Ionicons.glyphMap; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        estilos.botao,
        variante === 'secundario' && estilos.botaoSecundario,
        variante === 'perigo' && estilos.botaoPerigo,
        disabled && { opacity: 0.5 },
      ]}
      onPress={onPress}
      disabled={disabled || carregando}
    >
      {carregando ? (
        <SyncLoader color={variante === 'secundario' ? ERP.texto : '#fff'} />
      ) : (
        <>
          {icone && <Ionicons name={icone} size={16} color={variante === 'secundario' ? ERP.texto : '#fff'} />}
          <Text style={[estilos.botaoTexto, variante === 'secundario' && { color: ERP.texto }]}>{texto}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Campo({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={estilos.campoLabel}>{label}</Text>
      <TextInput placeholderTextColor={ERP.textoMuted} style={estilos.campoInput} {...props} />
    </View>
  );
}

export function Modal({ visivel, titulo, onFechar, children, largura = 460 }: {
  visivel: boolean; titulo: string; onFechar: () => void; children: React.ReactNode; largura?: number;
}) {
  return (
    <RNModal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={estilos.modalOverlay}>
        <View style={[estilos.modalCard, { maxWidth: largura, width: '100%' }]}>
          <View style={estilos.modalHeader}>
            <Text style={estilos.modalTitulo}>{titulo}</Text>
            <TouchableOpacity onPress={onFechar}><Ionicons name="close" size={22} color={ERP.textoSecundario} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 520 }}>{children}</ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

export function SubAbasSimples<T extends string>({ opcoes, ativa, onMudar }: {
  opcoes: { chave: T; rotulo: string }[]; ativa: T; onMudar: (chave: T) => void;
}) {
  return (
    <View style={estilos.subAbas}>
      {opcoes.map((op) => (
        <TouchableOpacity key={op.chave} style={[estilos.subAba, ativa === op.chave && estilos.subAbaAtiva]} onPress={() => onMudar(op.chave)}>
          <Text style={[estilos.subAbaTexto, ativa === op.chave && estilos.subAbaTextoAtiva]}>{op.rotulo}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function EstadoVazio({ icone, texto }: { icone: keyof typeof Ionicons.glyphMap; texto: string }) {
  return (
    <View style={estilos.vazio}>
      <Ionicons name={icone} size={28} color={ERP.textoMuted} />
      <Text style={estilos.vazioTexto}>{texto}</Text>
    </View>
  );
}

// ─── Tabela genérica ────────────────────────────────────────────────────

export type Coluna<T> = { chave: string; titulo: string; flex?: number; render?: (item: T) => React.ReactNode; alinhar?: 'left' | 'right' | 'center' };

export function Tabela<T extends { id: string }>({ colunas, dados, onLinhaPress, vazioTexto, vazioIcone = 'file-tray-outline' }: {
  colunas: Coluna<T>[]; dados: T[]; onLinhaPress?: (item: T) => void; vazioTexto: string; vazioIcone?: keyof typeof Ionicons.glyphMap;
}) {
  const ehDesktop = useEhDesktop();
  if (dados.length === 0) return <EstadoVazio icone={vazioIcone} texto={vazioTexto} />;

  // Abaixo do breakpoint desktop, uma linha de tabela com 3+ colunas em
  // flex-row espreme cada coluna a poucas dezenas de pixels — nome corta,
  // botão de ação vira alvo de toque minúsculo. Em vez disso, cada item vira
  // um card com as colunas empilhadas (rótulo em cima, conteúdo embaixo).
  // Coluna sem título (tipicamente a de ação) não repete rótulo nenhum.
  if (!ehDesktop) {
    return (
      <View>
        {dados.map((item) => {
          const Wrapper: any = onLinhaPress ? TouchableOpacity : View;
          return (
            <Wrapper key={item.id} style={estilos.tabelaCardMobile} onPress={onLinhaPress ? () => onLinhaPress(item) : undefined}>
              {colunas.map((c) => (
                <View key={c.chave} style={[estilos.tabelaCardCampo, c.alinhar === 'right' && { alignItems: 'flex-end' }]}>
                  {c.titulo ? <Text style={estilos.tabelaCardLabel}>{c.titulo}</Text> : null}
                  {c.render ? c.render(item) : <Text style={estilos.tabelaCelula}>{String((item as any)[c.chave] ?? '—')}</Text>}
                </View>
              ))}
            </Wrapper>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <View style={estilos.tabelaHeader}>
        {colunas.map((c) => (
          <Text key={c.chave} style={[estilos.tabelaHeaderTexto, { flex: c.flex ?? 1, textAlign: c.alinhar || 'left' }]}>{c.titulo}</Text>
        ))}
      </View>
      {dados.map((item) => {
        const Wrapper: any = onLinhaPress ? TouchableOpacity : View;
        return (
          <Wrapper key={item.id} style={estilos.tabelaLinha} onPress={onLinhaPress ? () => onLinhaPress(item) : undefined}>
            {colunas.map((c) => (
              <View key={c.chave} style={{ flex: c.flex ?? 1 }}>
                {c.render ? c.render(item) : <Text style={[estilos.tabelaCelula, { textAlign: c.alinhar || 'left' }]}>{String((item as any)[c.chave] ?? '—')}</Text>}
              </View>
            ))}
          </Wrapper>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  appRow: { flex: 1, flexDirection: 'row', backgroundColor: ERP.fundo },

  sidebar: { width: 248, backgroundColor: ERP.sidebarBg, paddingTop: 20, paddingBottom: 16 },
  marca: { paddingHorizontal: 20, paddingBottom: 18, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: ERP.sidebarBorda },
  marcaKav: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  marcaClass: { color: ERP.acento, fontWeight: '800' },
  tagEscola: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  tagEscolaTexto: { color: ERP.sidebarTexto, fontSize: 12, fontWeight: '600', flexShrink: 1 },

  grupoNav: { marginBottom: 18, paddingHorizontal: 12 },
  grupoTitulo: { color: ERP.sidebarTextoMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginLeft: 8 },
  itemNav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 9, borderRadius: ERP.raio.sm },
  itemNavAtivo: { backgroundColor: ERP.sidebarBgAtivo },
  itemNavTexto: { color: ERP.sidebarTexto, fontSize: 13.5, fontWeight: '500' },
  itemNavTextoAtivo: { color: ERP.sidebarTextoAtivo, fontWeight: '700' },

  perfilRodape: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: ERP.sidebarBorda },
  avatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center' },
  avatarFoto: { width: 32, height: 32, borderRadius: 16, backgroundColor: ERP.sidebarBgAtivo },
  avatarLetra: { color: '#fff', fontSize: 13, fontWeight: '700' },
  perfilNome: { color: '#fff', fontSize: 13, fontWeight: '600' },
  perfilPapel: { color: ERP.sidebarTextoMuted, fontSize: 11, marginTop: 1 },
  sairBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  sairTexto: { color: ERP.sidebarTextoMuted, fontSize: 12.5, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row' },
  overlaySidebar: { height: '100%' },

  colunaDireita: { flex: 1, minWidth: 0 },
  topbar: {
    flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 24,
    backgroundColor: ERP.superficie, borderBottomWidth: 1, borderBottomColor: ERP.borda,
  },
  hamburger: { marginRight: 14 },
  topbarTitulo: { fontSize: 15, fontWeight: '700', color: ERP.texto },

  conteudo: { flex: 1 },
  conteudoInner: { padding: 28, paddingBottom: 60, maxWidth: 1180, width: '100%', alignSelf: 'center' },

  card: { backgroundColor: ERP.superficie, borderRadius: ERP.raio.lg, borderWidth: 1, borderColor: ERP.borda, padding: 22 },

  kpi: { flexBasis: 220, flexGrow: 1, backgroundColor: ERP.superficie, borderRadius: ERP.raio.lg, borderWidth: 1, borderColor: ERP.borda, padding: 18 },
  kpiAlerta: { backgroundColor: ERP.perigoSoft, borderColor: '#F3C1BC' },
  kpiSucesso: { backgroundColor: ERP.sucessoSoft, borderColor: '#AEE6C9' },
  kpiValor: { fontSize: 28, fontWeight: '800', color: ERP.texto },
  kpiLabel: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 4, fontWeight: '600' },

  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  badgeTexto: { fontSize: 11, fontWeight: '700' },

  botao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: ERP.texto, borderRadius: ERP.raio.sm, paddingHorizontal: 16, height: 40,
  },
  botaoSecundario: { backgroundColor: ERP.superficie, borderWidth: 1, borderColor: ERP.bordaForte },
  botaoPerigo: { backgroundColor: ERP.perigo },
  botaoTexto: { color: '#fff', fontSize: 13.5, fontWeight: '700' },

  campoLabel: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 6 },
  campoInput: {
    height: 42, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: ERP.raio.sm,
    paddingHorizontal: 13, fontSize: 14, color: ERP.texto, backgroundColor: ERP.superficie,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: ERP.superficie, borderRadius: ERP.raio.lg, padding: 22 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitulo: { fontSize: 16, fontWeight: '800', color: ERP.texto },

  subAbas: {
    flexDirection: 'row', backgroundColor: ERP.fundo, borderRadius: ERP.raio.sm,
    padding: 3, marginBottom: 18, borderWidth: 1, borderColor: ERP.borda,
  },
  subAba: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: ERP.raio.sm - 2 },
  subAbaAtiva: { backgroundColor: ERP.superficie, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  subAbaTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
  subAbaTextoAtiva: { color: ERP.texto, fontWeight: '700' },

  vazio: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  vazioTexto: { color: ERP.textoMuted, fontSize: 13 },

  tabelaHeader: { flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: ERP.borda, marginBottom: 4 },
  tabelaHeaderTexto: { fontSize: 11, fontWeight: '700', color: ERP.textoMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  tabelaLinha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F1F3F6' },
  tabelaCelula: { fontSize: 13.5, color: ERP.texto },

  tabelaCardMobile: { borderWidth: 1, borderColor: ERP.borda, borderRadius: ERP.raio.md, padding: 14, marginBottom: 10, gap: 10, backgroundColor: ERP.superficie },
  tabelaCardCampo: { gap: 3 },
  tabelaCardLabel: { fontSize: 10.5, fontWeight: '700', color: ERP.textoMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
});
