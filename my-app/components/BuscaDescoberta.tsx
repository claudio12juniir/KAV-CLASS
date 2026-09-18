// Rede Social Fase 3 — tela de Busca/Descoberta, compartilhada entre
// (professor) e (aluno) (mesma UI, independente do papel de quem está
// logado). Consome GET /api/busca/professores e /api/busca/escolas
// (server.js) — só professor com SELF pago aparece na busca por aula
// particular; escola aparece sempre que for PACOTE_ESCOLA.
//
// Layout simplificado (18/09/2026, pedido do usuário): só input de busca +
// ícone de filtros (modal), sem nada mais fixo na tela. Antes de buscar,
// mostra uma marca d'água central convidando a explorar.

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES } from '../constants/theme';
import { apiFetch } from '../app/api';
import Avatar from './ui/Avatar';

type Tipo = 'professor' | 'escola';
type ModalidadeEnsino = 'PRESENCIAL' | 'REMOTO' | 'ONLINE';
const MODALIDADES_FILTRO: { valor: ModalidadeEnsino; label: string }[] = [
  { valor: 'PRESENCIAL', label: 'Presencial' },
  { valor: 'REMOTO', label: 'Remoto' },
  { valor: 'ONLINE', label: 'Online' },
];

type ResultadoProfessor = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  cursos: string[];
  modalidadeEnsino: ModalidadeEnsino[];
};

type ResultadoEscola = {
  id: string;
  nome: string;
  logoUrl: string | null;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  modalidadeEnsino: ModalidadeEnsino[];
};

type Resultado = (ResultadoProfessor | ResultadoEscola) & { _tipo: Tipo };

function contarFiltrosAtivos(tipo: Tipo, curso: string, cidade: string, modalidade: ModalidadeEnsino | null) {
  return (tipo === 'escola' ? 1 : 0) + (curso.trim() ? 1 : 0) + (cidade.trim() ? 1 : 0) + (modalidade ? 1 : 0);
}

export default function BuscaDescoberta() {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>('professor');
  const [curso, setCurso] = useState('');
  const [cidade, setCidade] = useState('');
  const [q, setQ] = useState('');
  const [modalidade, setModalidade] = useState<ModalidadeEnsino | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  const buscar = useCallback(async (overrides?: { tipo?: Tipo }) => {
    const tipoAlvo = overrides?.tipo ?? tipo;
    setCarregando(true);
    setJaBuscou(true);
    try {
      const params = new URLSearchParams();
      if (curso.trim()) params.set('curso', curso.trim());
      if (cidade.trim()) params.set('cidade', cidade.trim());
      if (q.trim()) params.set('q', q.trim());
      if (modalidade) params.set('modalidade', modalidade);

      const endpoint = tipoAlvo === 'professor' ? '/busca/professores' : '/busca/escolas';
      const resposta = await apiFetch(`${endpoint}?${params.toString()}`);
      if (!resposta.ok) { setResultados([]); return; }
      const dados = await resposta.json();
      const lista: any[] = tipoAlvo === 'professor' ? dados.professores : dados.escolas;
      setResultados((lista || []).map((item) => ({ ...item, _tipo: tipoAlvo })));
    } catch {
      setResultados([]);
    } finally {
      setCarregando(false);
    }
  }, [tipo, curso, cidade, q, modalidade]);

  const abrirPerfil = (item: Resultado) => {
    router.push({ pathname: '/perfil-publico', params: { id: item.id, tipo: item._tipo } } as any);
  };

  const aplicarFiltros = () => {
    setFiltrosAbertos(false);
    buscar();
  };

  const limparFiltros = () => {
    setTipo('professor');
    setCurso('');
    setCidade('');
    setModalidade(null);
  };

  const totalFiltros = contarFiltrosAtivos(tipo, curso, cidade, modalidade);

  return (
    <View style={styles.container}>
      <View style={styles.buscaLinha}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={CORES.secundaria} />
          <TextInput
            style={styles.input}
            placeholder="Buscar por nome ou curso..."
            placeholderTextColor={CORES.secundaria}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => buscar()}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.botaoFiltro} onPress={() => setFiltrosAbertos(true)} activeOpacity={0.8}>
          <Ionicons name="options-outline" size={20} color={CORES.primaria} />
          {totalFiltros > 0 && (
            <View style={styles.filtroBadge}><Text style={styles.filtroBadgeTexto}>{totalFiltros}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {carregando ? (
        <View style={styles.centro}><ActivityIndicator color={CORES.primaria} /></View>
      ) : !jaBuscou ? (
        <View style={styles.marcaDaguaWrap}>
          <Text style={styles.marcaDaguaEmoji}>😉</Text>
          <Text style={styles.marcaDaguaTexto}>Encontre a melhor didática pra você!</Text>
        </View>
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(item) => `${item._tipo}-${item.id}`}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.vazio}>Nenhum resultado. Tente outro filtro.</Text>}
          renderItem={({ item }) => {
            const foto = 'fotoUrl' in item ? item.fotoUrl : item.logoUrl;
            const cursos = 'cursos' in item ? item.cursos : undefined;
            return (
              <TouchableOpacity style={styles.card} onPress={() => abrirPerfil(item)} activeOpacity={0.7}>
                <Avatar fotoUrl={foto} nome={item.nome} tamanho={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNome} numberOfLines={1}>{item.nome}</Text>
                  {(item.cidade || item.estado) && (
                    <Text style={styles.cardLocal}>{[item.cidade, item.estado].filter(Boolean).join(' - ')}</Text>
                  )}
                  {item.bio ? <Text style={styles.cardBio} numberOfLines={2}>{item.bio}</Text> : null}
                  {cursos && cursos.length > 0 && (
                    <Text style={styles.cardCursos} numberOfLines={1}>{cursos.join(' • ')}</Text>
                  )}
                  {item.modalidadeEnsino?.length > 0 && (
                    <Text style={styles.cardModalidade} numberOfLines={1}>
                      {item.modalidadeEnsino.map((m) => MODALIDADES_FILTRO.find((op) => op.valor === m)?.label || m).join(' • ')}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={CORES.secundaria} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={filtrosAbertos} animationType="slide" transparent onRequestClose={() => setFiltrosAbertos(false)}>
        <View style={styles.modalFundo}>
          <View style={styles.modalConteudo}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Filtros</Text>
              <TouchableOpacity onPress={() => setFiltrosAbertos(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={CORES.primaria} />
              </TouchableOpacity>
            </View>

            <Text style={styles.filtroLabel}>O que você procura?</Text>
            <View style={styles.tabsRow}>
              <TouchableOpacity style={[styles.tab, tipo === 'professor' && styles.tabAtiva]} onPress={() => setTipo('professor')}>
                <Text style={[styles.tabTexto, tipo === 'professor' && styles.tabTextoAtivo]}>Professores</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, tipo === 'escola' && styles.tabAtiva]} onPress={() => setTipo('escola')}>
                <Text style={[styles.tabTexto, tipo === 'escola' && styles.tabTextoAtivo]}>Escolas</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.filtroLabel}>Curso</Text>
            <TextInput
              style={styles.filtroInput}
              placeholder="Ex: Violão"
              placeholderTextColor={CORES.secundaria}
              value={curso}
              onChangeText={setCurso}
            />

            <Text style={styles.filtroLabel}>Cidade</Text>
            <TextInput
              style={styles.filtroInput}
              placeholder="Ex: Recife"
              placeholderTextColor={CORES.secundaria}
              value={cidade}
              onChangeText={setCidade}
            />

            <Text style={styles.filtroLabel}>Modalidade</Text>
            <View style={styles.filtrosLinha}>
              {MODALIDADES_FILTRO.map((op) => {
                const ativo = modalidade === op.valor;
                return (
                  <TouchableOpacity
                    key={op.valor}
                    style={[styles.modalidadeChip, ativo && styles.modalidadeChipAtivo]}
                    onPress={() => setModalidade(ativo ? null : op.valor)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.modalidadeChipTexto, ativo && styles.modalidadeChipTextoAtivo]}>{op.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalRodape}>
              <TouchableOpacity style={styles.botaoLimpar} onPress={limparFiltros}>
                <Text style={styles.botaoLimparTexto}>Limpar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botaoAplicar} onPress={aplicarFiltros}>
                <Text style={styles.botaoAplicarTexto}>Aplicar filtros</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo, padding: 20 },
  buscaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CORES.superficie, borderRadius: 12, borderWidth: 1, borderColor: CORES.borda,
    paddingHorizontal: 14, height: 46,
  },
  input: { flex: 1, color: CORES.primaria, fontSize: 14 },
  botaoFiltro: {
    width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: CORES.borda,
    backgroundColor: CORES.superficie, alignItems: 'center', justifyContent: 'center',
  },
  filtroBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filtroBadgeTexto: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marcaDaguaWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  marcaDaguaEmoji: { fontSize: 88, opacity: 0.12 },
  marcaDaguaTexto: { fontSize: 16, fontWeight: '600', color: CORES.secundaria, opacity: 0.45, textAlign: 'center' },
  vazio: { textAlign: 'center', color: CORES.secundaria, marginTop: 30, fontSize: 13 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderBottomColor: CORES.borda, paddingVertical: 14,
  },
  cardNome: { fontSize: 15, fontWeight: '700', color: CORES.primaria },
  cardLocal: { fontSize: 12, color: CORES.secundaria, marginTop: 1 },
  cardBio: { fontSize: 12, color: CORES.secundaria, marginTop: 4 },
  cardCursos: { fontSize: 11, color: CORES.acento, marginTop: 4, fontWeight: '600' },
  cardModalidade: { fontSize: 11, color: CORES.secundaria, marginTop: 2 },
  modalFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalConteudo: { backgroundColor: CORES.fundo, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalTitulo: { fontSize: 17, fontWeight: '700', color: CORES.primaria },
  filtroLabel: { fontSize: 12, fontWeight: '700', color: CORES.secundaria, marginBottom: 8, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabsRow: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: CORES.borda, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabAtiva: { backgroundColor: CORES.primaria },
  tabTexto: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },
  tabTextoAtivo: { color: '#ffffff' },
  filtroInput: {
    backgroundColor: CORES.superficie, borderRadius: 8, borderWidth: 1, borderColor: CORES.borda,
    paddingHorizontal: 14, paddingVertical: 10, color: CORES.primaria, fontSize: 14,
  },
  filtrosLinha: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modalidadeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
    borderColor: CORES.borda, backgroundColor: CORES.superficie,
  },
  modalidadeChipAtivo: { backgroundColor: CORES.acento, borderColor: CORES.acento },
  modalidadeChipTexto: { fontSize: 12, fontWeight: '600', color: CORES.secundaria },
  modalidadeChipTextoAtivo: { color: '#ffffff', fontWeight: '700' },
  modalRodape: { flexDirection: 'row', gap: 10, marginTop: 24 },
  botaoLimpar: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: CORES.borda, paddingVertical: 13, alignItems: 'center' },
  botaoLimparTexto: { color: CORES.secundaria, fontWeight: '700', fontSize: 14 },
  botaoAplicar: { flex: 2, borderRadius: 10, backgroundColor: CORES.primaria, paddingVertical: 13, alignItems: 'center' },
  botaoAplicarTexto: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
