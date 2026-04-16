import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

// ─── Catálogo Expandido e Categorizado ─────────────────────────────────────────
const CATEGORIAS_CURSOS = [
  {
    categoria: 'Idiomas',
    cursos: [
      { id: 'ingles', label: 'Inglês' },
      { id: 'espanhol', label: 'Espanhol' },
      { id: 'portugues', label: 'Português (Estrangeiros)' },
      { id: 'frances', label: 'Francês' },
      { id: 'libras', label: 'LIBRAS' },
    ]
  },
  {
    categoria: 'Apoio Escolar e Concursos',
    cursos: [
      { id: 'matematica', label: 'Matemática / Física' },
      { id: 'redacao', label: 'Redação' },
      { id: 'quimica', label: 'Química / Biologia' },
      { id: 'enem', label: 'Preparatório ENEM / Vestibular' },
      { id: 'concursos', label: 'Preparatório Concursos' },
    ]
  },
  {
    categoria: 'Tecnologia e Design',
    cursos: [
      { id: 'programacao', label: 'Programação / Lógica' },
      { id: 'excel', label: 'Pacote Office / Excel' },
      { id: 'design', label: 'Design Gráfico / Edição' },
      { id: 'marketing', label: 'Marketing Digital' },
    ]
  },
  {
    categoria: 'Música e Artes',
    cursos: [
      { id: 'violao_guitarra', label: 'Violão / Guitarra' },
      { id: 'teclas', label: 'Piano / Teclado' },
      { id: 'bateria', label: 'Bateria / Percussão' },
      { id: 'canto', label: 'Canto / Técnica Vocal' },
      { id: 'desenho', label: 'Desenho / Pintura' },
    ]
  },
  {
    categoria: 'Bem-estar e Outros',
    cursos: [
      { id: 'artesmarciais', label: 'Artes marciais/ Luta' },
      { id: 'musculacao', label: 'Musculação' },
      { id: 'natacao', label: 'Natação' },
      { id: 'danca', label: 'Dança' },
      { id: 'outros', label: 'Outros' },
    ]
  }
];

export default function RegisterScreen() {
  const router = useRouter();
  
  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [papel, setPapel] = useState('aluno');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [cadastroEnviado, setCadastroEnviado] = useState(false);
  
  const [codigoConvite, setCodigoConvite] = useState('');
  
  const [cursosSelecionados, setCursosSelecionados] = useState<string[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);

  // 🎭 Máscara para Data (DD/MM/YYYY)
  const aplicarMascaraData = (texto: string) => {
    let valor = texto.replace(/\D/g, ''); 
    if (valor.length > 8) valor = valor.slice(0, 8); 

    if (valor.length >= 5) {
      return `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4)}`;
    } else if (valor.length >= 3) {
      return `${valor.slice(0, 2)}/${valor.slice(2)}`;
    }
    return valor;
  };

  // 🎭 Máscara para Telefone (DDD) XXXXX-XXXX
  const aplicarMascaraTelefone = (texto: string) => {
    let valor = texto.replace(/\D/g, ''); 
    if (valor.length > 11) valor = valor.slice(0, 11); 

    if (valor.length >= 3) {
      if (valor.length >= 8) {
        return `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7)}`;
      }
      return `(${valor.slice(0, 2)}) ${valor.slice(2)}`;
    }
    return valor;
  };

  const toggleCurso = (id: string) => {
    setCursosSelecionados(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const finalizarCadastro = async () => {
    // 🛡️ 1. Validação de Campos Obrigatórios
    if (!nome || !email || !senha) {
      Alert.alert("Atenção", "Preencha nome, e-mail e senha para continuar.");
      return;
    }

    // 🛡️ 2. Validação de E-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("E-mail Inválido", "Por favor, insira um e-mail em um formato válido.");
      return;
    }

    // 🛡️ 3. Validação de Senha (Mínimo 6 caracteres e confirmação)
    if (senha.length < 6) {
      Alert.alert("Senha Curta", "Sua senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      Alert.alert("Atenção", "As senhas não coincidem.");
      return;
    }

    // 🛡️ 4. Validação de Telefone e Data
    if (telefone.length < 14) {
      Alert.alert("Atenção", "Preencha o número de telefone completo com DDD.");
      return;
    }
    if (dataNascimento.length < 10) {
      Alert.alert("Atenção", "Preencha a data de nascimento completa.");
      return;
    }

    if (papel === 'aluno' && !codigoConvite) {
      Alert.alert("Atenção", "Alunos precisam do código de convite do professor.");
      return;
    }

    try {
      // ⚠️ Use o IP que você configurou (10.0.0.210)
      const ipDaSuaMaquina = "10.0.0.210"; 
      
      // Define a rota e os dados baseados no papel selecionado
      const endpoint = papel === 'professor' ? '/api/professores/cadastro' : '/api/alunos/cadastro';
      
      const payload = papel === 'professor' 
        ? { nome, email: email.toLowerCase(), senha, telefone, dataNascimento, cursos: cursosSelecionados }
        : { nome, email: email.toLowerCase(), senha, telefone, dataNascimento, codigoConvite: codigoConvite.toUpperCase() };

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        if (papel === 'professor') {
          Alert.alert(
            "Bem-vindo, Professor!", 
            `Conta criada com sucesso!\nSeu código de convite para os alunos é:\n\n${dados.professor.codigoConvite}`
          );
        } else {
          Alert.alert(
            "Sucesso!", 
            "Sua conta de aluno foi criada e você já está vinculado ao seu professor!"
          );
        }
        setCadastroEnviado(true);
      } else {
        Alert.alert("Erro", dados.erro || "Falha ao criar conta.");
      }

    } catch (erro) {
      console.error("Erro na requisição:", erro);
      Alert.alert(
        "Erro de Conexão", 
        "Verifique se o servidor Node.js está rodando corretamente."
      );
    }
  };

  const getLabelBotaoCursos = () => {
    if (cursosSelecionados.length === 0) return "Selecione suas áreas de ensino...";
    if (cursosSelecionados.length === 1) return "1 área selecionada";
    return `${cursosSelecionados.length} áreas selecionadas`;
  };

  if (cadastroEnviado) {
    return (
      <View style={styles.successContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" backgroundColor="#000000" />
        <Text style={styles.successTitle}>Cadastro Concluído!</Text>
        <Text style={styles.successSubtitle}>
          Sua conta foi criada com sucesso. Faça login para acessar o KAV Class!
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
          <Text style={styles.buttonText}>Ir para o Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#000000" />

      <Text style={styles.title}>Criar Conta</Text>
      <Text style={styles.subtitle}>Preencha seus dados para se cadastrar</Text>

      <TextInput style={styles.input} placeholder="Nome Completo" placeholderTextColor="#888" value={nome} onChangeText={setNome} />
      
      {/* Input de Data de Nascimento com Máscara */}
      <TextInput 
        style={styles.input} 
        placeholder="Data de Nascimento (DD/MM/AAAA)" 
        placeholderTextColor="#888" 
        keyboardType="numeric" 
        maxLength={10}
        value={dataNascimento} 
        onChangeText={(texto) => setDataNascimento(aplicarMascaraData(texto))} 
      />
      
      {/* Input de Telefone com Máscara */}
      <TextInput 
        style={styles.input} 
        placeholder="Telefone ex: (11) 99999-9999" 
        placeholderTextColor="#888" 
        keyboardType="numeric" 
        maxLength={15}
        value={telefone} 
        onChangeText={(texto) => setTelefone(aplicarMascaraTelefone(texto))} 
      />

      <Text style={styles.label}>Você é:</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity 
          style={[styles.roleButton, papel === 'aluno' && styles.roleButtonActive]} 
          onPress={() => setPapel('aluno')}
        >
          <Text style={[styles.roleText, papel === 'aluno' && styles.roleTextActive]}>Aluno</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.roleButton, papel === 'professor' && styles.roleButtonActive]} 
          onPress={() => setPapel('professor')}
        >
          <Text style={[styles.roleText, papel === 'professor' && styles.roleTextActive]}>Professor</Text>
        </TouchableOpacity>
      </View>

      {papel === 'aluno' && (
        <View style={styles.codigoContainer}>
          <Text style={styles.label}>Código do seu Professor</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Ex: KAV-7X9P" 
            placeholderTextColor="#888" 
            autoCapitalize="characters" 
            value={codigoConvite} 
            onChangeText={setCodigoConvite} 
          />
        </View>
      )}

      {papel === 'professor' && (
        <View style={styles.dropdownContainer}>
          <Text style={styles.label}>O que você ensina?</Text>
          
          <TouchableOpacity 
            style={styles.dropdownButton} 
            onPress={() => setDropdownAberto(!dropdownAberto)}
            activeOpacity={0.8}
          >
            <Text style={[styles.dropdownButtonText, cursosSelecionados.length > 0 && styles.dropdownButtonTextSelected]}>
              {getLabelBotaoCursos()}
            </Text>
            <Ionicons name={dropdownAberto ? "chevron-up" : "chevron-down"} size={20} color="#000000" />
          </TouchableOpacity>

          {dropdownAberto && (
            <View style={styles.dropdownBody}>
              {CATEGORIAS_CURSOS.map((bloco, index) => (
                <View key={index} style={styles.categoriaContainer}>
                  <Text style={styles.categoriaTitulo}>{bloco.categoria}</Text>
                  
                  {bloco.cursos.map((curso) => {
                    const isSelected = cursosSelecionados.includes(curso.id);
                    return (
                      <TouchableOpacity
                        key={curso.id}
                        style={styles.itemCurso}
                        onPress={() => toggleCurso(curso.id)}
                      >
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
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

      <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor="#888" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#888" secureTextEntry value={senha} onChangeText={setSenha} />
      <TextInput style={styles.input} placeholder="Confirme sua senha" placeholderTextColor="#888" secureTextEntry value={confirmarSenha} onChangeText={setConfirmarSenha} />

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
  container: { flex: 1, backgroundColor: "#ffffff" },
  scrollContainer: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { color: "#000000", fontSize: 28, fontWeight: "bold", marginBottom: 5 },
  subtitle: { color: "#666666", fontSize: 14, marginBottom: 20 },
  input: {
    width: '100%', height: 50, backgroundColor: '#ebebeb',
    borderRadius: 8, paddingHorizontal: 15, color: '#000000', marginBottom: 15,
  },
  label: { color: "#000000", fontSize: 16, marginBottom: 10, fontWeight: 'bold' },
  
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  roleButton: {
    flex: 1, height: 50, backgroundColor: '#ebebeb',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5,
  },
  roleButtonActive: { backgroundColor: '#000000' },
  roleText: { color: '#888', fontWeight: 'bold' },
  roleTextActive: { color: '#ffffff' },
  codigoContainer: { marginBottom: 5 },
  
  dropdownContainer: { marginBottom: 15 },
  dropdownButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#ebebeb', height: 50, borderRadius: 8, paddingHorizontal: 15,
  },
  dropdownButtonText: { color: '#888', fontSize: 15 },
  dropdownButtonTextSelected: { color: '#000000', fontWeight: 'bold' },
  dropdownBody: {
    backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#ebebeb',
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    padding: 15, marginTop: -5, paddingTop: 15,
  },
  categoriaContainer: { marginBottom: 15 },
  categoriaTitulo: {
    fontSize: 14, fontWeight: 'bold', color: '#000000',
    backgroundColor: '#ebebeb', paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: 4, marginBottom: 10, alignSelf: 'flex-start',
  },
  itemCurso: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingLeft: 5,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#000000',
    marginRight: 10, alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#000000' },
  textoCurso: { fontSize: 15, color: '#333' },

  button: {
    width: '100%', height: 50, backgroundColor: '#000000',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  backButton: { marginTop: 20, alignItems: 'center' },
  backButtonText: { color: "#666666", fontSize: 16 },
  
  successContainer: {
    flex: 1, backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center", padding: 20,
  },
  successTitle: { color: "#000000", fontSize: 32, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  successSubtitle: { color: "#666666", fontSize: 16, textAlign: "center", marginBottom: 40 },
});