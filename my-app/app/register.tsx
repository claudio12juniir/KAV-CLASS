import { BASE_URL, fetchComRetry } from './api';
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from "react";
import {
  Alert, Image, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import GoogleButton from '../components/GoogleButton';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

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

function nomeEhCompleto(nome: string): boolean {
  return nome.trim().split(/\s+/).filter(Boolean).length >= 2;
}

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

export default function RegisterScreen() {
  const router = useRouter();

  const [papel, setPapel] = useState<'aluno' | 'professor'>('aluno');
  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmSenhaVisivel, setConfirmSenhaVisivel] = useState(false);
  const [cadastroEnviado, setCadastroEnviado] = useState(false);
  const [codigoConvite, setCodigoConvite] = useState('');
  const [cursosSelecionados, setCursosSelecionados] = useState<string[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);

  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  const { disponivel: googleDisponivel, carregando: carregandoGoogle, entrarComGoogle } = useGoogleAuth(papel);

  const [erroNome, setErroNome] = useState('');
  const [erroData, setErroData] = useState('');
  const [erroTelefone, setErroTelefone] = useState('');
  const [erroEmail, setErroEmail] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const [erroConfirm, setErroConfirm] = useState('');

  const selecionarFoto = () => {
    Alert.alert('Foto de Perfil', 'Escolha a origem (opcional)', [
      {
        text: 'Câmera', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1] });
          if (!res.canceled && res.assets[0].base64) setFotoUrl(`data:image/jpeg;base64,${res.assets[0].base64}`);
        },
      },
      {
        text: 'Galeria', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) return;
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1] });
          if (!res.canceled && res.assets[0].base64) setFotoUrl(`data:image/jpeg;base64,${res.assets[0].base64}`);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

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

  const toggleCurso = (id: string) =>
    setCursosSelecionados(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );

  const vNome = () => {
    if (!nome.trim()) { setErroNome('Campo obrigatório.'); return; }
    if (!nomeEhCompleto(nome)) { setErroNome('Informe nome e sobrenome.'); return; }
    setErroNome('');
  };

  const vData = () => {
    if (!dataNascimento) { setErroData('Campo obrigatório.'); return; }
    const idade = calcularIdade(dataNascimento);
    if (idade === null) { setErroData('Data inválida. Verifique dia, mês e ano.'); return; }
    if (idade === -1) { setErroData('A data não pode ser no futuro.'); return; }
    if (idade > 90) { setErroData('Idade máxima permitida: 90 anos.'); return; }
    setErroData('');
  };

  const vTelefone = () => {
    if (telefone && telefone.length < 14) { setErroTelefone('Informe o número completo com DDD.'); return; }
    setErroTelefone('');
  };

  const vEmail = () => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) { setErroEmail('Campo obrigatório.'); return; }
    if (!re.test(email)) { setErroEmail('Formato de e-mail inválido.'); return; }
    setErroEmail('');
  };

  const vSenha = () => {
    if (!senha) { setErroSenha('Campo obrigatório.'); return; }
    if (senha.length < 6) { setErroSenha('Mínimo de 6 caracteres.'); return; }
    setErroSenha('');
    if (confirmarSenha && confirmarSenha !== senha) setErroConfirm('As senhas não coincidem.');
    else if (confirmarSenha) setErroConfirm('');
  };

  const vConfirm = () => {
    if (!confirmarSenha) { setErroConfirm('Confirme sua senha.'); return; }
    if (confirmarSenha !== senha) { setErroConfirm('As senhas não coincidem.'); return; }
    setErroConfirm('');
  };

  const finalizarCadastro = async () => {
    let ok = true;

    if (!nome.trim()) { setErroNome('Campo obrigatório.'); ok = false; }
    else if (!nomeEhCompleto(nome)) { setErroNome('Informe nome e sobrenome.'); ok = false; }
    else setErroNome('');

    if (!dataNascimento) { setErroData('Campo obrigatório.'); ok = false; }
    else {
      const idade = calcularIdade(dataNascimento);
      if (idade === null) { setErroData('Data inválida.'); ok = false; }
      else if (idade === -1) { setErroData('A data não pode ser no futuro.'); ok = false; }
      else if (idade > 90) { setErroData('Idade máxima: 90 anos.'); ok = false; }
      else setErroData('');
    }

    if (telefone && telefone.length < 14) { setErroTelefone('Informe o número completo com DDD.'); ok = false; }
    else setErroTelefone('');

    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) { setErroEmail('Campo obrigatório.'); ok = false; }
    else if (!re.test(email)) { setErroEmail('Formato de e-mail inválido.'); ok = false; }
    else setErroEmail('');

    if (!senha) { setErroSenha('Campo obrigatório.'); ok = false; }
    else if (senha.length < 6) { setErroSenha('Mínimo de 6 caracteres.'); ok = false; }
    else setErroSenha('');

    if (!confirmarSenha) { setErroConfirm('Confirme sua senha.'); ok = false; }
    else if (confirmarSenha !== senha) { setErroConfirm('As senhas não coincidem.'); ok = false; }
    else setErroConfirm('');

    if (papel === 'aluno' && !codigoConvite.trim()) {
      Alert.alert('Atenção', 'Informe o código de convite do seu professor.');
      ok = false;
    }

    if (!ok) return;

    if (papel === 'professor') {
      try {
        const resposta = await fetchComRetry(`${BASE_URL}/api/professores/cadastro`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nome.trim(),
            email: email.toLowerCase().trim(),
            senha,
            telefone,
            cursos: cursosSelecionados,
            fotoUrl: fotoUrl || undefined,
          }),
        });
        let dados: any;
        try { dados = JSON.parse(await resposta.text()); }
        catch { Alert.alert('Erro no Servidor', 'Resposta inesperada. Tente novamente.'); return; }
        if (!resposta.ok) { Alert.alert('Atenção', dados.erro || 'Não foi possível criar a conta.'); return; }

        await SecureStore.setItemAsync('kav_token', dados.token);
        await SecureStore.setItemAsync('kav_papel', 'professor');
        await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
        router.replace('/(professor)');
      } catch {
        Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.\nVerifique sua internet e tente novamente.');
      }
      return;
    }

    try {
      const resposta = await fetchComRetry(`${BASE_URL}/api/alunos/cadastro`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.toLowerCase().trim(),
          senha,
          telefone,
          dataNascimento,
          codigoConvite: codigoConvite.toUpperCase().trim(),
          fotoUrl: fotoUrl || undefined,
        }),
      });
      let dados: any;
      try { dados = JSON.parse(await resposta.text()); }
      catch { Alert.alert('Erro no Servidor', 'Resposta inesperada. Tente novamente.'); return; }
      if (resposta.ok) setCadastroEnviado(true);
      else Alert.alert('Atenção', dados.erro || 'Não foi possível criar a conta.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.\nVerifique sua internet e tente novamente.');
    }
  };

  if (cadastroEnviado) {
    return (
      <View style={styles.successContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="checkmark-circle" size={72} color="#32BCAD" style={{ marginBottom: 20 }} />
        <Text style={styles.successTitle}>Cadastro Concluído!</Text>
        <Text style={styles.successSubtitle}>Aguarde o professor ativar sua conta para começar.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
          <Text style={styles.buttonText}>Ir para o Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const nomeLabel = papel === 'professor'
    ? 'Como podemos te chamar, caro professor?'
    : 'Como podemos te chamar, caro aluno?';

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <TouchableOpacity style={styles.voltarBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#000000" />
      </TouchableOpacity>

      <Text style={styles.title}>Criar Conta</Text>
      <Text style={styles.subtitle}>Preencha com cuidado — cada detalhe importa.</Text>

      {/* Papel */}
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

      {googleDisponivel && (
        <GoogleButton onPress={entrarComGoogle} carregando={carregandoGoogle} texto="Cadastrar com Google" />
      )}

      {/* Nome */}
      <Text style={styles.label}>{nomeLabel}</Text>
      <TextInput
        style={[styles.input, erroNome ? styles.inputErro : null]}
        placeholder="Nome e sobrenome"
        placeholderTextColor="#aaa"
        value={nome}
        onChangeText={setNome}
        onBlur={vNome}
        autoCapitalize="words"
      />
      {erroNome ? <Text style={styles.erroTexto}>{erroNome}</Text> : null}

      {/* Foto de Perfil (opcional) */}
      <Text style={styles.label}>Foto de Perfil <Text style={{ color: '#aaa', fontWeight: '400' }}>(opcional)</Text></Text>
      <TouchableOpacity style={styles.fotoContainer} onPress={selecionarFoto} activeOpacity={0.8}>
        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={styles.fotoPreview} />
        ) : (
          <View style={styles.fotoPlaceholder}>
            <Ionicons name="camera-outline" size={28} color="#aaa" />
            <Text style={styles.fotoPlaceholderTexto}>Adicionar foto</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Data de Nascimento */}
      <Text style={styles.label}>Data de Nascimento</Text>
      <TextInput
        style={[styles.input, erroData ? styles.inputErro : null]}
        placeholder="DD/MM/AAAA"
        placeholderTextColor="#aaa"
        keyboardType="numeric"
        maxLength={10}
        value={dataNascimento}
        onChangeText={t => setDataNascimento(mascaraData(t))}
        onBlur={vData}
      />
      {erroData
        ? <Text style={styles.erroTexto}>{erroData}</Text>
        : <Text style={styles.ajudaTexto}>Permitido para pessoas de até 90 anos.</Text>
      }

      {/* Telefone */}
      <Text style={styles.label}>Telefone</Text>
      <TextInput
        style={[styles.input, erroTelefone ? styles.inputErro : null]}
        placeholder="(11) 99999-9999"
        placeholderTextColor="#aaa"
        keyboardType="phone-pad"
        maxLength={15}
        value={telefone}
        onChangeText={t => setTelefone(mascaraTelefone(t))}
        onBlur={vTelefone}
      />
      {erroTelefone
        ? <Text style={styles.erroTexto}>{erroTelefone}</Text>
        : <Text style={styles.ajudaTexto}>Será um meio de contato entre você e a plataforma.</Text>
      }

      {/* Código de convite (aluno) */}
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

      {/* Cursos (professor) */}
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

      {/* Destaque login */}
      <View style={styles.destaqueLogin}>
        <View style={styles.destaqueIconeWrap}>
          <Ionicons name="lock-closed" size={22} color="#32BCAD" />
        </View>
        <View style={styles.destaqueTextoWrap}>
          <Text style={styles.destaqueTitulo}>Capriche nestes campos</Text>
          <Text style={styles.destaqueSubtitulo}>
            E-mail e senha serão seus únicos meios de acesso permanentes ao KAV Class.
          </Text>
        </View>
      </View>

      {/* Email */}
      <Text style={styles.label}>E-mail</Text>
      <TextInput
        style={[styles.input, erroEmail ? styles.inputErro : null]}
        placeholder="seuemail@exemplo.com"
        placeholderTextColor="#aaa"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        onBlur={vEmail}
      />
      {erroEmail ? <Text style={styles.erroTexto}>{erroEmail}</Text> : null}

      {/* Senha */}
      <Text style={styles.label}>Senha</Text>
      <View style={[styles.senhaWrap, erroSenha ? styles.inputErro : null]}>
        <TextInput
          style={styles.senhaInput}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="#aaa"
          secureTextEntry={!senhaVisivel}
          value={senha}
          onChangeText={setSenha}
          onBlur={vSenha}
        />
        <TouchableOpacity onPress={() => setSenhaVisivel(v => !v)} style={styles.olho}>
          <Ionicons name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
        </TouchableOpacity>
      </View>
      {erroSenha ? <Text style={styles.erroTexto}>{erroSenha}</Text> : null}

      {/* Confirmar Senha */}
      <Text style={styles.label}>Confirmar Senha</Text>
      <View style={[styles.senhaWrap, erroConfirm ? styles.inputErro : null]}>
        <TextInput
          style={styles.senhaInput}
          placeholder="Repita sua senha"
          placeholderTextColor="#aaa"
          secureTextEntry={!confirmSenhaVisivel}
          value={confirmarSenha}
          onChangeText={setConfirmarSenha}
          onBlur={vConfirm}
        />
        <TouchableOpacity onPress={() => setConfirmSenhaVisivel(v => !v)} style={styles.olho}>
          <Ionicons name={confirmSenhaVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
        </TouchableOpacity>
      </View>
      {erroConfirm ? <Text style={styles.erroTexto}>{erroConfirm}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={finalizarCadastro}>
        <Text style={styles.buttonText}>Finalizar Cadastro</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Cancelar e voltar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  scrollContainer: { padding: 20, paddingTop: 56, paddingBottom: 48 },

  voltarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, alignSelf: 'flex-start',
  },

  title: { color: '#000000', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 24 },

  fotoContainer: { marginBottom: 8, alignSelf: 'flex-start' },
  fotoPreview: { width: 80, height: 80, borderRadius: 40 },
  fotoPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F0F4F8', borderWidth: 1.5, borderColor: '#D0D8DC',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  fotoPlaceholderTexto: { color: '#aaa', fontSize: 10, textAlign: 'center' },

  label: {
    color: '#000000', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginTop: 6,
  },
  input: {
    width: '100%', height: 50, backgroundColor: '#f4f4f4',
    borderRadius: 10, paddingHorizontal: 15, color: '#000000',
    marginBottom: 4, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0',
  },
  inputErro: {
    borderColor: '#D9534F', backgroundColor: '#FFF5F5',
  },
  erroTexto: {
    color: '#D9534F', fontSize: 12, marginBottom: 10, marginLeft: 2,
  },
  ajudaTexto: {
    color: '#999', fontSize: 12, marginBottom: 10, marginLeft: 2, fontStyle: 'italic',
  },

  roleContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
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

  destaqueLogin: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E8F8F6', borderRadius: 14,
    padding: 16, marginTop: 10, marginBottom: 20,
    borderWidth: 1.5, borderColor: '#32BCAD', gap: 14,
  },
  destaqueIconeWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#b2ece7',
  },
  destaqueTextoWrap: { flex: 1 },
  destaqueTitulo: { color: '#000000', fontWeight: 'bold', fontSize: 14, marginBottom: 3 },
  destaqueSubtitulo: { color: '#555', fontSize: 12, lineHeight: 18 },

  senhaWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f4f4f4', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
    marginBottom: 4, paddingRight: 10, height: 50,
  },
  senhaInput: {
    flex: 1, height: 50, color: '#000000',
    paddingHorizontal: 15, fontSize: 15,
  },
  olho: { padding: 4 },

  button: {
    width: '100%', height: 52, backgroundColor: '#000000',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18,
  },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
  backButton: { marginTop: 20, alignItems: 'center' },
  backButtonText: { color: '#888', fontSize: 15 },

  successContainer: {
    flex: 1, backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center', padding: 30,
  },
  successTitle: { color: '#000000', fontSize: 26, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  successSubtitle: { color: '#666', fontSize: 15, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
});
