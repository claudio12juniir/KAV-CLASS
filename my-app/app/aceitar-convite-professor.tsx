import { BASE_URL, fetchComRetry } from './api';
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from 'expo-secure-store';
import React, { useState } from "react";
import {
  Alert, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import SyncLoader from '../components/SyncLoader';

function nomeEhCompleto(nome: string): boolean {
  return nome.trim().split(/\s+/).filter(Boolean).length >= 2;
}

export default function AceitarConviteProfessorScreen() {
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const aceitarConvite = async () => {
    if (!nome.trim() || !nomeEhCompleto(nome)) {
      Alert.alert('Atenção', 'Informe seu nome e sobrenome.');
      return;
    }
    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!reEmail.test(email)) {
      Alert.alert('Atenção', 'Informe um e-mail válido.');
      return;
    }
    if (senha.length < 6) {
      Alert.alert('Atenção', 'A senha precisa de ao menos 6 caracteres.');
      return;
    }
    if (confirmarSenha !== senha) {
      Alert.alert('Atenção', 'As senhas não coincidem.');
      return;
    }
    if (!codigo.trim()) {
      Alert.alert('Atenção', 'Informe o código de convite que a escola te enviou.');
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetchComRetry(`${BASE_URL}/api/escola/convites/aceitar`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.toLowerCase().trim(),
          senha,
          codigo: codigo.toUpperCase().trim(),
        }),
      });
      let dados: any;
      try { dados = JSON.parse(await resposta.text()); }
      catch { Alert.alert('Erro no Servidor', 'Resposta inesperada. Tente novamente.'); return; }
      if (!resposta.ok) { Alert.alert('Atenção', dados.erro || 'Não foi possível aceitar o convite.'); return; }

      await SecureStore.setItemAsync('kav_token', dados.token);
      await SecureStore.setItemAsync('kav_papel', 'professor');
      await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
      router.replace('/(professor)');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.\nVerifique sua internet e tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

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

      <Text style={styles.title}>Entrar numa Escola</Text>
      <Text style={styles.subtitle}>
        Use o código que a escola te enviou por e-mail (ou compartilhou diretamente) pra criar sua conta de professor já vinculada a ela.
      </Text>

      <Text style={styles.label}>Seu nome completo</Text>
      <TextInput
        style={styles.input}
        placeholder="Nome e sobrenome"
        placeholderTextColor="#aaa"
        autoCapitalize="words"
        value={nome}
        onChangeText={setNome}
      />

      <Text style={styles.label}>E-mail</Text>
      <TextInput
        style={styles.input}
        placeholder="O mesmo e-mail que a escola convidou"
        placeholderTextColor="#aaa"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <Text style={styles.label}>Senha</Text>
      <View style={styles.senhaWrap}>
        <TextInput
          style={styles.senhaInput}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="#aaa"
          secureTextEntry={!senhaVisivel}
          value={senha}
          onChangeText={setSenha}
        />
        <TouchableOpacity onPress={() => setSenhaVisivel(v => !v)} style={styles.olho}>
          <Ionicons name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Confirmar Senha</Text>
      <TextInput
        style={styles.input}
        placeholder="Repita sua senha"
        placeholderTextColor="#aaa"
        secureTextEntry
        value={confirmarSenha}
        onChangeText={setConfirmarSenha}
      />

      <Text style={styles.label}>Código do Convite</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: KAV-7X9P"
        placeholderTextColor="#aaa"
        autoCapitalize="characters"
        value={codigo}
        onChangeText={setCodigo}
      />

      <TouchableOpacity
        style={[styles.button, enviando && { opacity: 0.6 }]}
        onPress={aceitarConvite}
        disabled={enviando}
      >
        {enviando ? <SyncLoader color="#ffffff" /> : <Text style={styles.buttonText}>Entrar na Escola</Text>}
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
  subtitle: { color: '#888', fontSize: 14, marginBottom: 24, lineHeight: 20 },

  label: {
    color: '#000000', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginTop: 6,
  },
  input: {
    width: '100%', height: 50, backgroundColor: '#f4f4f4',
    borderRadius: 10, paddingHorizontal: 15, color: '#000000',
    marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0',
  },

  senhaWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f4f4f4', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
    marginBottom: 12, paddingRight: 10, height: 50,
  },
  senhaInput: {
    flex: 1, height: 50, color: '#000000',
    paddingHorizontal: 15, fontSize: 15,
  },
  olho: { padding: 4 },

  button: {
    width: '100%', height: 52, backgroundColor: '#000000',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
  backButton: { marginTop: 20, alignItems: 'center' },
  backButtonText: { color: '#888', fontSize: 15 },
});
