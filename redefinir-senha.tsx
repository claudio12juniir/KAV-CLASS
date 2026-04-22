import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const API_URL = "https://kav-class-1.onrender.com";

export default function RedefinirSenhaScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email: string }>();

  const [email, setEmail] = useState(emailParam || '');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  const redefinirSenha = async () => {
    const emailNorm = email.trim().toLowerCase();

    if (!emailNorm || !codigo || !novaSenha || !confirmarSenha) {
      Alert.alert("Erro", "Preencha todos os campos.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      Alert.alert("Erro", "As senhas não coincidem.");
      return;
    }
    if (novaSenha.length < 6) {
      Alert.alert("Erro", "A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      const resposta = await fetch(`${API_URL}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNorm, codigo, novaSenha }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        Alert.alert(
          "Senha redefinida!",
          "Sua senha foi alterada com sucesso. Faça o login com a nova senha.",
          [{ text: "Ir para o Login", onPress: () => router.replace('/login') }]
        );
      } else {
        Alert.alert("Erro", dados.erro || "Não foi possível redefinir a senha.");
      }
    } catch {
      Alert.alert("Erro de Conexão", "Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <TouchableOpacity style={styles.voltar} onPress={() => router.back()}>
        <Text style={styles.textoVoltar}>← Voltar</Text>
      </TouchableOpacity>

      <View style={styles.conteudo}>
        <Text style={styles.titulo}>Redefinir Senha</Text>
        <Text style={styles.descricao}>
          Insira o código de 6 dígitos que você recebeu e escolha uma nova senha.
        </Text>

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="Seu e-mail"
          placeholderTextColor="#888"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Código recebido</Text>
        <TextInput
          style={[styles.input, styles.inputCodigo]}
          placeholder="_ _ _ _ _ _"
          placeholderTextColor="#aaa"
          keyboardType="number-pad"
          maxLength={6}
          value={codigo}
          onChangeText={setCodigo}
        />

        <Text style={styles.label}>Nova senha</Text>
        <TextInput
          style={styles.input}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="#888"
          secureTextEntry
          value={novaSenha}
          onChangeText={setNovaSenha}
        />

        <Text style={styles.label}>Confirmar nova senha</Text>
        <TextInput
          style={styles.input}
          placeholder="Repita a nova senha"
          placeholderTextColor="#888"
          secureTextEntry
          value={confirmarSenha}
          onChangeText={setConfirmarSenha}
        />

        <TouchableOpacity
          style={[styles.botao, salvando && styles.botaoDesabilitado]}
          onPress={redefinirSenha}
          disabled={salvando}
        >
          {salvando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.textoBotao}>Redefinir Senha</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
  },
  voltar: {
    marginTop: 60,
    marginBottom: 10,
  },
  textoVoltar: {
    fontSize: 16,
    color: '#333',
  },
  conteudo: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 60,
  },
  titulo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  descricao: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
    lineHeight: 22,
  },
  label: {
    color: '#555',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#e2e2e2',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#000',
    fontSize: 15,
  },
  inputCodigo: {
    fontSize: 22,
    letterSpacing: 10,
    textAlign: 'center',
  },
  botao: {
    width: '100%',
    height: 50,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  textoBotao: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
