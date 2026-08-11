import { BASE_URL, fetchComRetry } from './api';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import {
  Alert, Image, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import SyncLoader from '../components/SyncLoader';

// ─── Catálogo de cursos (igual ao de register.tsx) ─────────────────────────
const CATEGORIAS_CURSOS = [
  {
    categoria: 'Idiomas',
    cursos: [
      { id: 'ingles', label: 'Inglês' },
      { id: 'espanhol', label: 'Espanhol' },
      { id: 'portugues', label: 'Português (Estrangeiros)' },
      { id: 'frances', label: 'Francês' },
      { id: 'libras', label: 'LIBRAS' },
    ],
  },
  {
    categoria: 'Apoio Escolar e Concursos',
    cursos: [
      { id: 'matematica', label: 'Matemática / Física' },
      { id: 'redacao', label: 'Redação' },
      { id: 'quimica', label: 'Química / Biologia' },
      { id: 'enem', label: 'Preparatório ENEM / Vestibular' },
      { id: 'concursos', label: 'Preparatório Concursos' },
    ],
  },
  {
    categoria: 'Tecnologia e Design',
    cursos: [
      { id: 'programacao', label: 'Programação / Lógica' },
      { id: 'excel', label: 'Pacote Office / Excel' },
      { id: 'design', label: 'Design Gráfico / Edição' },
      { id: 'marketing', label: 'Marketing Digital' },
    ],
  },
  {
    categoria: 'Música e Artes',
    cursos: [
      { id: 'violao_guitarra', label: 'Violão / Guitarra' },
      { id: 'teclas', label: 'Piano / Teclado' },
      { id: 'bateria', label: 'Bateria / Percussão' },
      { id: 'canto', label: 'Canto / Técnica Vocal' },
      { id: 'desenho', label: 'Desenho / Pintura' },
    ],
  },
  {
    categoria: 'Bem-estar e Outros',
    cursos: [
      { id: 'artesmarciais', label: 'Artes Marciais / Luta' },
      { id: 'musculacao', label: 'Musculação' },
      { id: 'natacao', label: 'Natação' },
      { id: 'danca', label: 'Dança' },
      { id: 'outros', label: 'Outros' },
    ],
  },
];

function calcularIdade(dataBR: string): number | null {
  if (dataBR.length < 10) return null;
  const [dia, mes, ano] = dataBR.split('/').map(Number);
  const nasc = new Date(ano, mes - 1, dia);
  if (
    isNaN(nasc.getTime()) ||
    nasc.getDate() !== dia ||
    nasc.getMonth() !== mes - 1 ||
    nasc.getFullYear() !== ano
  ) return null;
  if (nasc > new Date()) return -1;
  return (Date.now() - nasc.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

const mascaraData = (t: string) => {
  const v = t.replace(/\D/g, '').slice(0, 8);
  if (v.length >= 5) return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
  if (v.length >= 3) return `${v.slice(0, 2)}/${v.slice(2)}`;
  return v;
};

const mascaraTelefone = (t: string) => {
  const v = t.replace(/\D/g, '').slice(0, 11);
  if (v.length >= 8) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  if (v.length >= 3) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  return v;
};

export default function GoogleCompletarCadastroScreen() {
  const { idToken, email, nome, fotoUrl, papel: papelParam } = useLocalSearchParams<{
    idToken: string; email: string; nome: string; fotoUrl: string; papel: string;
  }>();

  const [papel, setPapel] = useState<'aluno' | 'professor' | ''>(
    papelParam === 'professor' || papelParam === 'aluno' ? papelParam : ''
  );
  const [telefone, setTelefone] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [codigoConvite, setCodigoConvite] = useState('');
  const [cursosSelecionados, setCursosSelecionados] = useState<string[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [erroData, setErroData] = useState('');
  const [erroTelefone, setErroTelefone] = useState('');

  const toggleCurso = (id: string) =>
    setCursosSelecionados(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );

  const concluirCadastro = async () => {
    if (!papel) {
      Alert.alert('Atenção', 'Selecione se você é aluno ou professor.');
      return;
    }

    let ok = true;

    if (!dataNascimento) { setErroData('Campo obrigatório.'); ok = false; }
    else {
      const idade = calcularIdade(dataNascimento);
      if (idade === null) { setErroData('Data inválida.'); ok = false; }
      else if (idade === -1) { setErroData('A data não pode ser no futuro.'); ok = false; }
      else if (idade > 90) { setErroData('Idade máxima: 90 anos.'); ok = false; }
      else setErroData('');
    }

    if (!telefone || telefone.length < 14) { setErroTelefone('Informe o número completo com DDD.'); ok = false; }
    else setErroTelefone('');

    if (papel === 'professor' && cursosSelecionados.length === 0) {
      Alert.alert('Atenção', 'Selecione ao menos um curso que você leciona.');
      ok = false;
    }

    if (papel === 'aluno' && !codigoConvite.trim()) {
      Alert.alert('Atenção', 'Informe o código de convite do seu professor.');
      ok = false;
    }

    if (!ok) return;

    setEnviando(true);
    try {
      const resposta = await fetchComRetry(`${BASE_URL}/api/auth/google/cadastrar`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          papel,
          telefone,
          dataNascimento,
          cursos: papel === 'professor' ? cursosSelecionados : undefined,
          codigoConvite: papel === 'aluno' ? codigoConvite.toUpperCase().trim() : undefined,
        }),
      });
      let dados: any;
      try { dados = JSON.parse(await resposta.text()); }
      catch { Alert.alert('Erro no Servidor', 'Resposta inesperada. Tente novamente.'); return; }
      if (!resposta.ok) { Alert.alert('Atenção', dados.erro || 'Não foi possível concluir o cadastro.'); return; }

      await SecureStore.setItemAsync('kav_token', dados.token);
      await SecureStore.setItemAsync('kav_papel', papel);
      if (papel === 'professor') {
        await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
        router.replace('/(professor)');
      } else {
        await SecureStore.setItemAsync('kav_aluno_id', String(dados.usuario.id));
        router.replace('/(aluno)');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.\nVerifique sua internet e tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#000000" />

      <View style={styles.hero}>
        <TouchableOpacity style={styles.voltarBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>

        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={30} color="#666" />
          </View>
        )}
        <Text style={styles.heroNome}>{nome || 'Bem-vindo(a)'}</Text>
        <Text style={styles.heroEmail}>{email}</Text>
        <Text style={styles.heroSub}>Só falta completar seu cadastro no KAV Class</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!papelParam && (
          <>
            <Text style={styles.label}>Você é:</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleButton, papel === 'aluno' && styles.roleButtonActive]}
                onPress={() => setPapel('aluno')}
              >
                <Ionicons name="school-outline" size={16} color={papel === 'aluno' ? '#fff' : '#888'} />
                <Text style={[styles.roleText, papel === 'aluno' && styles.roleTextActive]}>  Aluno</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, papel === 'professor' && styles.roleButtonActive]}
                onPress={() => setPapel('professor')}
              >
                <Ionicons name="person-outline" size={16} color={papel === 'professor' ? '#fff' : '#888'} />
                <Text style={[styles.roleText, papel === 'professor' && styles.roleTextActive]}>  Professor</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.label}>Data de Nascimento</Text>
        <TextInput
          style={[styles.input, erroData ? styles.inputErro : null]}
          placeholder="DD/MM/AAAA"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          maxLength={10}
          value={dataNascimento}
          onChangeText={t => setDataNascimento(mascaraData(t))}
        />
        {erroData ? <Text style={styles.erroTexto}>{erroData}</Text> : null}

        <Text style={styles.label}>Telefone</Text>
        <TextInput
          style={[styles.input, erroTelefone ? styles.inputErro : null]}
          placeholder="(11) 99999-9999"
          placeholderTextColor="#aaa"
          keyboardType="phone-pad"
          maxLength={15}
          value={telefone}
          onChangeText={t => setTelefone(mascaraTelefone(t))}
        />
        {erroTelefone ? <Text style={styles.erroTexto}>{erroTelefone}</Text> : null}

        {papel === 'aluno' && (
          <>
            <Text style={styles.label}>Código de Convite do Professor</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: KAV-7X9P"
              placeholderTextColor="#aaa"
              autoCapitalize="characters"
              value={codigoConvite}
              onChangeText={setCodigoConvite}
            />
          </>
        )}

        {papel === 'professor' && (
          <View style={styles.dropdownContainer}>
            <Text style={styles.label}>O que você ensina?</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setDropdownAberto(!dropdownAberto)}
            >
              <Text style={[styles.dropdownButtonText, cursosSelecionados.length > 0 && styles.dropdownButtonTextSelected]}>
                {cursosSelecionados.length === 0 ? 'Selecione suas áreas de ensino...' : `${cursosSelecionados.length} áreas selecionadas`}
              </Text>
              <Ionicons name={dropdownAberto ? 'chevron-up' : 'chevron-down'} size={20} color="#000000" />
            </TouchableOpacity>
            {dropdownAberto && (
              <View style={styles.dropdownBody}>
                {CATEGORIAS_CURSOS.map((bloco, index) => (
                  <View key={index} style={styles.categoriaContainer}>
                    <Text style={styles.categoriaTitulo}>{bloco.categoria}</Text>
                    {bloco.cursos.map((curso) => {
                      const isSel = cursosSelecionados.includes(curso.id);
                      return (
                        <TouchableOpacity key={curso.id} style={styles.itemCurso} onPress={() => toggleCurso(curso.id)}>
                          <View style={[styles.checkbox, isSel && styles.checkboxSelected]}>
                            {isSel && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                          </View>
                          <Text style={styles.textoCurso}>{curso.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={concluirCadastro} disabled={enviando}>
          {enviando ? <SyncLoader color="#ffffff" /> : <Text style={styles.buttonText}>Concluir cadastro</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },

  hero: {
    backgroundColor: '#000000',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  voltarBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 42,
    left: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginTop: 12, borderWidth: 2, borderColor: '#32BCAD' },
  avatarPlaceholder: {
    width: 72, height: 72, borderRadius: 36, marginTop: 12,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#32BCAD',
  },
  heroNome: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginTop: 12 },
  heroEmail: { color: '#A0B0B9', fontSize: 13, marginTop: 2 },
  heroSub: { color: '#32BCAD', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5, marginTop: 10, textAlign: 'center' },

  scrollContainer: { padding: 20, paddingBottom: 48 },

  label: {
    color: '#000000', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginTop: 14,
  },
  input: {
    width: '100%', height: 50, backgroundColor: '#f4f4f4',
    borderRadius: 10, paddingHorizontal: 15, color: '#000000',
    marginBottom: 4, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0',
  },
  inputErro: { borderColor: '#D9534F', backgroundColor: '#FFF5F5' },
  erroTexto: { color: '#D9534F', fontSize: 12, marginBottom: 10, marginLeft: 2 },

  roleContainer: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  roleButton: {
    flex: 1, height: 50, backgroundColor: '#f4f4f4',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', borderWidth: 1, borderColor: '#e0e0e0',
  },
  roleButtonActive: { backgroundColor: '#000000', borderColor: '#000000' },
  roleText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
  roleTextActive: { color: '#ffffff' },

  dropdownContainer: { marginBottom: 4 },
  dropdownButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f4f4f4', height: 50, borderRadius: 10,
    paddingHorizontal: 15, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4,
  },
  dropdownButtonText: { color: '#aaa', fontSize: 15 },
  dropdownButtonTextSelected: { color: '#000000', fontWeight: 'bold' },
  dropdownBody: {
    backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e0e0e0',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    padding: 15, marginTop: -4, marginBottom: 12,
  },
  categoriaContainer: { marginBottom: 15 },
  categoriaTitulo: {
    fontSize: 13, fontWeight: 'bold', color: '#000', backgroundColor: '#ebebeb',
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4,
    marginBottom: 10, alignSelf: 'flex-start',
  },
  itemCurso: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingLeft: 5 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#000',
    marginRight: 10, alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#000000' },
  textoCurso: { fontSize: 15, color: '#333' },

  button: {
    width: '100%', height: 52, backgroundColor: '#000000',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
});
