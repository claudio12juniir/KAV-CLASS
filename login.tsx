import { Link, Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as SecureStore from 'expo-secure-store';

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
      // ⚠️ Lembre-se de colocar o IP real do seu Mac aqui!
      const ipDaSuaMaquina = "10.0.0.210"; 

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: emailDigitado,
          senha: password,
        }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        console.log("Login realizado:", dados);

        // 🔐 SALVANDO O TOKEN NO COFRE DO CELULAR
        await SecureStore.setItemAsync('kav_token', dados.token);
        await SecureStore.setItemAsync('kav_papel', dados.usuario.papel);

        // Redireciona para a área correta
        if (dados.usuario.papel === 'professor') {
          router.replace('/(professor)');
        } else {
          router.replace('/(aluno)');
        }
      } else {
        // Erro vindo do backend (senha errada, e-mail não existe, etc)
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
    backgroundColor: "#ffffffff",
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
    backgroundColor: '#e2e2e2ff',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#000000ff',
    marginBottom: 15,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#000000ff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: "#ffffffff",
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