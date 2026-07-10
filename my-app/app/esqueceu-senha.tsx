import { BASE_URL, fetchComRetry } from './api';
import { Stack, useRouter } from "expo-router";
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

const API_URL = BASE_URL;

export default function EsqueceuSenhaScreen() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  const enviarCodigo = async () => {
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      Alert.alert("Erro", "Informe o seu e-mail.");
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetchComRetry(`${API_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNorm }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        Alert.alert(
          "Código enviado!",
          "Se este e-mail estiver cadastrado, você receberá um código de 6 dígitos. Verifique sua caixa de entrada.",
          [{ text: "OK", onPress: () => router.push({ pathname: '/redefinir-senha', params: { email: emailNorm } }) }]
        );
      } else {
        Alert.alert("Erro", dados.erro || "Falha ao enviar o código.");
      }
    } catch {
      Alert.alert("Erro de Conexão", "Não foi possível falar com o servidor.");
    } finally {
      setEnviando(false);
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
        <Text style={styles.titulo}>Esqueceu a senha?</Text>
        <Text style={styles.descricao}>
          Informe o e-mail cadastrado. Vamos enviar um código de 6 dígitos para você redefinir sua senha.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Seu e-mail"
          placeholderTextColor="#888"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TouchableOpacity
          style={[styles.botao, enviando && styles.botaoDesabilitado]}
          onPress={enviarCodigo}
          disabled={enviando}
        >
          {enviando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.textoBotao}>Enviar Código</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/redefinir-senha', params: { email } })}>
          <Text style={styles.linkJaTenho}>Já tenho um código</Text>
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
    paddingBottom: 80,
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
    marginBottom: 30,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#e2e2e2',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#000',
    marginBottom: 20,
    fontSize: 15,
  },
  botao: {
    width: '100%',
    height: 50,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  textoBotao: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  linkJaTenho: {
    textAlign: 'center',
    marginTop: 20,
    color: '#555',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
