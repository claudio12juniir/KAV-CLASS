import { Link, Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as SecureStore from 'expo-secure-store';

const API_URL = "https://kav-class-1.onrender.com";

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const fazerLogin = async () => {
    const emailDigitado = email.trim().toLowerCase();

    if (!emailDigitado || !password) {
      Alert.alert("Erro", "Por favor, preencha todos os campos.");
      return;
    }

    try {
      const resposta = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDigitado, senha: password }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        await SecureStore.setItemAsync('kav_token', dados.token);
        await SecureStore.setItemAsync('kav_papel', dados.usuario.papel);

        if (dados.usuario.papel === 'professor') {
          await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
          router.replace('/(professor)');
        } else {
          await SecureStore.setItemAsync('kav_aluno_id', String(dados.usuario.id));
          router.replace('/(aluno)');
        }
      } else {
        Alert.alert("Erro de Login", dados.erro || "Falha ao entrar.");
      }
    } catch (erro) {
      console.error("Erro na requisição:", erro);
      Alert.alert("Erro de Conexão", "Não foi possível falar com o servidor KAV.");
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <Text style={styles.title}>KAV Class</Text>
      <Text style={styles.subtitle}>Inicie sessão para ingressar nos seus estudos!</Text>

      <TextInput
        style={styles.input}
        placeholder="E-mail"
        placeholderTextColor="#888"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Senha"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity onPress={() => router.push('/esqueceu-senha')} style={styles.linkEsqueceu}>
        <Text style={styles.textoEsqueceu}>Esqueceu a senha?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={fazerLogin}>
        <Text style={styles.buttonText}>Entrar</Text>
      </TouchableOpacity>

      <Link href="/register" asChild>
        <TouchableOpacity style={styles.linkContainer}>
          <Text style={styles.linkText}>
            Não tem uma conta? <Text style={styles.linkHighlight}>Cadastre-se</Text>
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    color: "#000000",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    color: "#000000",
    fontSize: 14,
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#e2e2e2',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#000000',
    marginBottom: 15,
  },
  linkEsqueceu: {
    alignSelf: 'flex-end',
    marginBottom: 10,
    marginTop: -8,
  },
  textoEsqueceu: {
    color: '#555',
    fontSize: 13,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: 'bold',
  },
  linkContainer: {
    marginTop: 20,
    padding: 10,
  },
  linkText: {
    color: 'gray',
    fontSize: 14,
  },
  linkHighlight: {
    color: "#000000",
    fontWeight: 'bold',
  }
});
