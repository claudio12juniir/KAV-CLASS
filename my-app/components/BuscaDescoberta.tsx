// Rede Social Fase 3 — tela de Busca/Descoberta, compartilhada entre
// (professor) e (aluno) (mesma UI, independente do papel de quem está
// logado). Consome GET /api/busca/professores e /api/busca/escolas
// (server.js) — só professor com SELF pago aparece na busca por aula
// particular; escola aparece sempre que for PACOTE_ESCOLA.

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES } from '../constants/theme';
import { apiFetch } from '../app/api';

type Tipo = 'professor' | 'escola';

type ResultadoProfessor = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
  cursos: string[];
};

type ResultadoEscola = {
  id: string;
  nome: string;
  logoUrl: string | null;
  bio: string | null;
  cidade: string | null;
  estado: string | null;
};

type Resultado = (ResultadoProfessor | ResultadoEscola) & { _tipo: Tipo };

export default function BuscaDescoberta() {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>('professor');
  const [curso, setCurso] = useState('');
  const [cidade, setCidade] = useState('');
  const [q, setQ] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setJaBuscou(true);
    try {
      const params = new URLSearchParams();
      if (curso.trim()) params.set('curso', curso.trim());
      if (cidade.trim()) params.set('cidade', cidade.trim());
      if (q.trim()) params.set('q', q.trim());

      const endpoint = tipo === 'professor' ? '/busca/professores' : '/busca/escolas';
      const resposta = await apiFetch(`${endpoint}?${params.toString()}`);
      if (!resposta.ok) { setResultados([]); return; }
      const dados = await resposta.json();
      const lista: any[] = tipo === 'professor' ? dados.professores : dados.escolas;
      setResultados((lista || []).map((item) => ({ ...item, _tipo: tipo })));
    } catch {
      setResultados([]);
    } finally {
      setCarregando(false);
    }
  }, [tipo, curso, cidade, q]);

  const abrirPerfil = (item: Resultado) => {
    router.push({ pathname: '/perfil-publico', params: { id: item.id, tipo: item._tipo } } as any);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Explorar</Text>
      <Text style={styles.subtitulo}>Encontre professores particulares e escolas parceiras</Text>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, tipo === 'professor' && styles.tabAtiva]}
          onPress={() => setTipo('professor')}
        >
          <Text style={[styles.tabTexto, tipo === 'professor' && styles.tabTextoAtivo]}>Professores</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tipo === 'escola' && styles.tabAtiva]}
          onPress={() => setTipo('escola')}
        >
          <Text style={[styles.tabTexto, tipo === 'escola' && styles.tabTextoAtivo]}>Escolas</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filtros}>
        <TextInput
          style={styles.input}
          placeholder="Curso (ex: Violão)"
          placeholderTextColor={CORES.secundaria}
          value={curso}
          onChangeText={setCurso}
        />
        <View style={styles.filtrosLinha}>
          <TextInput
            style={[styles.input, styles.inputMetade]}
            placeholder="Cidade"
            placeholderTextColor={CORES.secundaria}
            value={cidade}
            onChangeText={setCidade}
          />
          <TextInput
            style={[styles.input, styles.inputMetade]}
            placeholder="Nome"
            placeholderTextColor={CORES.secundaria}
            value={q}
            onChangeText={setQ}
          />
        </View>
        <TouchableOpacity style={styles.botaoBuscar} onPress={buscar} disabled={carregando}>
          {carregando ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="search" size={18} color="#ffffff" />
              <Text style={styles.botaoBuscarTexto}>Buscar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={resultados}
        keyExtractor={(item) => `${item._tipo}-${item.id}`}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          jaBuscou && !carregando ? (
            <Text style={styles.vazio}>Nenhum resultado. Tente outro filtro.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const foto = 'fotoUrl' in item ? item.fotoUrl : item.logoUrl;
          const cursos = 'cursos' in item ? item.cursos : undefined;
          return (
            <TouchableOpacity style={styles.card} onPress={() => abrirPerfil(item)} activeOpacity={0.7}>
              {foto ? (
                <Image source={{ uri: foto }} style={styles.cardFoto} />
              ) : (
                <View style={styles.cardFotoFallback}>
                  <Text style={styles.cardFotoLetra}>{item.nome[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardNome} numberOfLines={1}>{item.nome}</Text>
                {(item.cidade || item.estado) && (
                  <Text style={styles.cardLocal}>{[item.cidade, item.estado].filter(Boolean).join(' - ')}</Text>
                )}
                {item.bio ? <Text style={styles.cardBio} numberOfLines={2}>{item.bio}</Text> : null}
                {cursos && cursos.length > 0 && (
                  <Text style={styles.cardCursos} numberOfLines={1}>{cursos.join(' • ')}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={CORES.secundaria} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo, padding: 20 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: CORES.primaria },
  subtitulo: { fontSize: 13, color: CORES.secundaria, marginTop: 2, marginBottom: 16 },
  tabsRow: { flexDirection: 'row', backgroundColor: CORES.superficie, borderRadius: 10, padding: 4, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabAtiva: { backgroundColor: CORES.primaria },
  tabTexto: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },
  tabTextoAtivo: { color: '#ffffff' },
  filtros: { marginBottom: 16 },
  filtrosLinha: { flexDirection: 'row', gap: 10 },
  inputMetade: { flex: 1 },
  input: {
    backgroundColor: CORES.superficie,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORES.borda,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: CORES.primaria,
    marginBottom: 10,
    fontSize: 14,
  },
  botaoBuscar: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CORES.primaria, borderRadius: 8, paddingVertical: 12,
  },
  botaoBuscarTexto: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  vazio: { textAlign: 'center', color: CORES.secundaria, marginTop: 30, fontSize: 13 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CORES.superficie, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  cardFoto: { width: 48, height: 48, borderRadius: 24 },
  cardFotoFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center',
  },
  cardFotoLetra: { color: '#ffffff', fontWeight: '700', fontSize: 18 },
  cardNome: { fontSize: 15, fontWeight: '700', color: CORES.primaria },
  cardLocal: { fontSize: 12, color: CORES.secundaria, marginTop: 1 },
  cardBio: { fontSize: 12, color: CORES.secundaria, marginTop: 4 },
  cardCursos: { fontSize: 11, color: CORES.acento, marginTop: 4, fontWeight: '600' },
});
