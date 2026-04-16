import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Catálogo de cursos disponíveis ──────────────────────────────────────────
const CURSOS_DISPONIVEIS = [
  { id: 'bateria',   label: 'Bateria',   icone: 'musical-notes' },
  { id: 'violao',    label: 'Violão',    icone: 'musical-note'  },
  { id: 'guitarra',  label: 'Guitarra',  icone: 'musical-note'  },
  { id: 'baixo',     label: 'Baixo',     icone: 'musical-note'  },
  { id: 'piano',     label: 'Piano',     icone: 'musical-notes' },
  { id: 'teclado',   label: 'Teclado',   icone: 'musical-notes' },
  { id: 'canto',     label: 'Canto',     icone: 'mic'           },
  { id: 'flauta',    label: 'Flauta',    icone: 'musical-note'  },
  { id: 'violino',   label: 'Violino',   icone: 'musical-note'  },
  { id: 'percussao', label: 'Percussão', icone: 'musical-notes' },
  { id: 'saxofone',  label: 'Saxofone',  icone: 'musical-note'  },
  { id: 'trompete',  label: 'Trompete',  icone: 'musical-note'  },
] as const;

type Tela = 'login' | 'cursos';

export default function LoginProfessorScreen() {
  const router = useRouter();

  const [tela, setTela] = useState<Tela>('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [cursosSelecionados, setCursosSelecionados] = useState<string[]>([]);

  // ── Toggle de curso ───────────────────────────────────────────────────────
  const toggleCurso = (id: string) => {
    if (cursosSelecionados.includes(id)) {
      setCursosSelecionados(prev => prev.filter(c => c !== id));
      return;
    }
    if (cursosSelecionados.length >= 5) {
      Alert.alert('Limite atingido', 'Você pode selecionar até 5 cursos.');
      return;
    }
    setCursosSelecionados(prev => [...prev, id]);
  };

  // ── Avançar do login para seleção de cursos ───────────────────────────────
  const avancarParaCursos = () => {
    if (!email.trim() || !senha.trim()) {
      Alert.alert('Atenção', 'Preencha e-mail e senha para continuar.');
      return;
    }
    setTela('cursos');
  };

  // ── Finalizar login ───────────────────────────────────────────────────────
  const finalizarLogin = () => {
    if (cursosSelecionados.length === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos um curso que você leciona.');
      return;
    }
    // Aqui salvar cursosSelecionados no contexto/banco antes de navegar
    router.replace('/(professor)');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TELA 1 — Login
  // ─────────────────────────────────────────────────────────────────────────
  if (tela === 'login') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar style="light" backgroundColor="#000000" />

        <View style={styles.hero}>
          <Text style={styles.heroKav}>KAV</Text>
          <Text style={styles.heroClass}>CLASS</Text>
          <Text style={styles.heroRole}>PORTAL DO PROFESSOR</Text>
        </View>

        <View style={styles.formBox}>
          <Text style={styles.formTitulo}>Entrar na sua conta</Text>

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="professor@email.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Senha</Text>
          <View style={styles.inputSenhaWrap}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
              placeholder="••••••••"
              placeholderTextColor="#999"
              secureTextEntry={!senhaVisivel}
              value={senha}
              onChangeText={setSenha}
            />
            <TouchableOpacity onPress={() => setSenhaVisivel(v => !v)} style={styles.olho}>
              <Ionicons name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.botaoPrincipal} onPress={avancarParaCursos}>
            <Text style={styles.textoBotaoPrincipal}>Continuar</Text>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkEsqueci}>
            <Text style={styles.textoLinkEsqueci}>Esqueci minha senha</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TELA 2 — Seleção de Cursos
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#000000" />

      <View style={styles.cursosHeader}>
        <TouchableOpacity onPress={() => setTela('login')} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.cursosTitulo}>O que você leciona?</Text>
          <Text style={styles.cursosSub}>Selecione até 5 cursos</Text>
        </View>
        {/* Contador */}
        <View style={styles.contadorBox}>
          <Text style={styles.contadorTexto}>{cursosSelecionados.length}/5</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.cursosGrid} showsVerticalScrollIndicator={false}>
        {CURSOS_DISPONIVEIS.map(curso => {
          const sel = cursosSelecionados.includes(curso.id);
          return (
            <TouchableOpacity
              key={curso.id}
              style={[styles.cursosCard, sel && styles.cursosCardSel]}
              onPress={() => toggleCurso(curso.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.cursosIconeBox, sel && styles.cursosIconeBoxSel]}>
                <Ionicons
                  name={curso.icone as any}
                  size={26}
                  color={sel ? '#ffffff' : '#555'}
                />
              </View>
              <Text style={[styles.cursosLabel, sel && styles.cursosLabelSel]}>
                {curso.label}
              </Text>
              {sel && (
                <View style={styles.checkSelo}>
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Botão fixo no rodapé */}
      <View style={styles.rodape}>
        {cursosSelecionados.length > 0 && (
          <View style={styles.cursosSelecionadosPill}>
            <Text style={styles.cursosSelecionadosTexto} numberOfLines={1}>
              {cursosSelecionados
                .map(id => CURSOS_DISPONIVEIS.find(c => c.id === id)?.label)
                .join(' · ')}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.botaoPrincipal, cursosSelecionados.length === 0 && { opacity: 0.4 }]}
          onPress={finalizarLogin}
          disabled={cursosSelecionados.length === 0}
        >
          <Text style={styles.textoBotaoPrincipal}>Entrar no painel</Text>
          <Ionicons name="arrow-forward" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },

  // Hero (login)
  hero: {
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
    paddingHorizontal: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroKav:   { color: '#ffffff', fontSize: 18, fontWeight: '300', letterSpacing: 4 },
  heroClass: { color: '#ffffff', fontSize: 38, fontWeight: 'bold', marginTop: -6 },
  heroRole:  { color: '#32BCAD', fontSize: 11, fontWeight: 'bold', letterSpacing: 2, marginTop: 6 },

  // Form
  formBox: { padding: 28, flex: 1 },
  formTitulo: { color: '#000000', fontSize: 22, fontWeight: 'bold', marginBottom: 24 },
  label: { color: '#666', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: '#F0F4F8', borderRadius: 12, padding: 14,
    color: '#000000', fontSize: 15, borderWidth: 1, borderColor: '#D0D8DC', marginBottom: 16,
  },
  inputSenhaWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0F4F8', borderRadius: 12, borderWidth: 1,
    borderColor: '#D0D8DC', paddingRight: 12, marginBottom: 24,
  },
  olho: { padding: 4 },

  botaoPrincipal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#000000', borderRadius: 14, padding: 18,
  },
  textoBotaoPrincipal: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  linkEsqueci: { alignItems: 'center', marginTop: 20 },
  textoLinkEsqueci: { color: '#888', fontSize: 14 },

  // Header seleção de cursos
  cursosHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 24, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    gap: 14,
  },
  botaoVoltar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  cursosTitulo: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  cursosSub:    { color: '#A0B0B9', fontSize: 13, marginTop: 2 },
  contadorBox: {
    backgroundColor: '#32BCAD', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  contadorTexto: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  // Grid de cursos
  cursosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 12,
  },
  cursosCard: {
    width: '46%',
    flexGrow: 1,
    backgroundColor: '#F0F4F8',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D0D8DC',
    position: 'relative',
  },
  cursosCardSel: {
    borderColor: '#000000',
    backgroundColor: '#000000',
  },
  cursosIconeBox: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  cursosIconeBoxSel: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  cursosLabel: { color: '#333', fontWeight: '700', fontSize: 15 },
  cursosLabelSel: { color: '#ffffff' },
  checkSelo: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#32BCAD',
    alignItems: 'center', justifyContent: 'center',
  },

  // Rodapé
  rodape: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1, borderTopColor: '#eee',
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 12,
  },
  cursosSelecionadosPill: {
    backgroundColor: '#F0F4F8', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#D0D8DC',
  },
  cursosSelecionadosTexto: { color: '#555', fontSize: 13, fontWeight: '600' },
});
