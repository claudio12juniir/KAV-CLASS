import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LoadingGlobal from '../../components/LoadingGlobal';
import { CORES } from '../../constants/theme';

const API_URL = BASE_URL;

interface Perfil {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cursos: string[];
  codigoConvite: string | null;
  chavePix: string | null;
  linkPagamentoCartao: string | null;
  fotoUrl: string | null;
}

export default function PerfilProfessorScreen() {
  const navigation = useNavigation();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [linkCartao, setLinkCartao] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [accordionSenha, setAccordionSenha] = useState(false);

  useEffect(() => { carregarPerfil(); }, []);

  const carregarPerfil = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      const res = await fetchComRetry(`${API_URL}/api/professor/perfil?professorId=${professorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const dados: Perfil = await res.json();
        setPerfil(dados);
        setNome(dados.nome);
        setTelefone(dados.telefone || '');
        setChavePix(dados.chavePix || '');
        setLinkCartao(dados.linkPagamentoCartao || '');
        setFotoUrl(dados.fotoUrl || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  };

  const salvarPerfil = async () => {
    if (accordionSenha) {
      if (!senhaAtual) { Alert.alert('Atenção', 'Digite a senha atual.'); return; }
      if (novaSenha.length < 6) { Alert.alert('Atenção', 'A nova senha precisa de ao menos 6 caracteres.'); return; }
      if (novaSenha !== confirmarSenha) { Alert.alert('Atenção', 'As senhas não coincidem.'); return; }
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      const body: any = { professorId, nome, telefone, chavePix, linkPagamentoCartao: linkCartao, fotoUrl };
      if (accordionSenha && senhaAtual && novaSenha) {
        body.senhaAtual = senhaAtual;
        body.novaSenha = novaSenha;
      }
      const res = await fetchComRetry(`${API_URL}/api/professor/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Sucesso', 'Perfil atualizado!');
        setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('');
        setAccordionSenha(false);
        carregarPerfil();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível salvar.');
      }
    } catch (err) {
      Alert.alert('Erro', 'Verifique a conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarFotoAutomatico = async (novaFotoUrl: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      await fetchComRetry(`${API_URL}/api/professor/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ professorId, fotoUrl: novaFotoUrl }),
      });
    } catch { /* silencioso */ }
  };

  const selecionarFoto = () => {
    Alert.alert('Foto de Perfil', 'Escolha a origem', [
      {
        text: 'Câmera', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à câmera não autorizado.'); return; }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.1, base64: true, allowsEditing: true, aspect: [1, 1] });
          if (!res.canceled && res.assets[0].base64) {
            const novaFotoUrl = `data:image/jpeg;base64,${res.assets[0].base64}`;
            setFotoUrl(novaFotoUrl);
            salvarFotoAutomatico(novaFotoUrl);
          }
        },
      },
      {
        text: 'Galeria', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à galeria não autorizado.'); return; }
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.1, base64: true, allowsEditing: true, aspect: [1, 1] });
          if (!res.canceled && res.assets[0].base64) {
            const novaFotoUrl = `data:image/jpeg;base64,${res.assets[0].base64}`;
            setFotoUrl(novaFotoUrl);
            salvarFotoAutomatico(novaFotoUrl);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const logout = () => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('kav_token');
          await SecureStore.deleteItemAsync('kav_professor_id');
          await SecureStore.deleteItemAsync('kav_papel');
          router.replace('/login');
        },
      },
    ]);
  };

  if (carregando) return <LoadingGlobal />;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>MEU PERFIL</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar editável */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={selecionarFoto} activeOpacity={0.8} style={styles.avatarWrapper}>
            {fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarLetra}>{perfil?.nome?.[0]?.toUpperCase() || 'P'}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={13} color={CORES.fundo} />
            </View>
          </TouchableOpacity>
          {perfil?.codigoConvite && (
            <View style={styles.codigoBadge}>
              <Text style={styles.codigoLabel}>CÓDIGO DE CONVITE</Text>
              <Text style={styles.codigoValor}>{perfil.codigoConvite}</Text>
            </View>
          )}
        </View>

        {/* Dados básicos */}
        <Text style={styles.secaoLabel}>DADOS PESSOAIS</Text>

        <Text style={styles.fieldLabel}>Nome</Text>
        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
        />

        <Text style={styles.fieldLabel}>E-mail</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={perfil?.email || ''}
          editable={false}
        />

        <Text style={styles.fieldLabel}>Telefone / WhatsApp</Text>
        <TextInput
          style={styles.input}
          value={telefone}
          onChangeText={setTelefone}
          keyboardType="phone-pad"
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
        />

        {perfil?.cursos?.length ? (
          <>
            <Text style={styles.fieldLabel}>Cursos / Disciplinas</Text>
            <View style={styles.cursosContainer}>
              {perfil.cursos.map((c, i) => (
                <View key={i} style={styles.cursoBadge}><Text style={styles.cursoTexto}>{c}</Text></View>
              ))}
            </View>
          </>
        ) : null}

        {/* Dados de pagamento */}
        <Text style={styles.secaoLabel}>DADOS DE PAGAMENTO</Text>

        <Text style={styles.fieldLabel}>Chave PIX</Text>
        <TextInput
          style={styles.input}
          value={chavePix}
          onChangeText={setChavePix}
          placeholder="CPF, e-mail, telefone ou chave aleatória"
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
        />

        <Text style={styles.fieldLabel}>Link de Pagamento (Cartão)</Text>
        <TextInput
          style={styles.input}
          value={linkCartao}
          onChangeText={setLinkCartao}
          placeholder="https://mpago.la/..."
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
          autoCapitalize="none"
          keyboardType="url"
        />

        {/* Alterar senha */}
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setAccordionSenha(!accordionSenha)}
          activeOpacity={0.8}
        >
          <Text style={styles.accordionLabel}>ALTERAR SENHA</Text>
          <Ionicons name={accordionSenha ? 'chevron-up' : 'chevron-down'} size={18} color={CORES.acento} />
        </TouchableOpacity>

        {accordionSenha && (
          <View style={styles.accordionBody}>
            <Text style={styles.fieldLabel}>Senha Atual</Text>
            <View style={styles.senhaRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={senhaAtual}
                onChangeText={setSenhaAtual}
                secureTextEntry={!senhaVisivel}
                placeholder="••••••"
                placeholderTextColor={CORES.secundaria}
                selectionColor={CORES.acento}
              />
              <TouchableOpacity onPress={() => setSenhaVisivel(!senhaVisivel)} style={styles.eyeBtn}>
                <Ionicons name={senhaVisivel ? 'eye-off' : 'eye'} size={20} color={CORES.secundaria} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Nova Senha</Text>
            <TextInput
              style={styles.input}
              value={novaSenha}
              onChangeText={setNovaSenha}
              secureTextEntry={!senhaVisivel}
              placeholder="mín. 6 caracteres"
              placeholderTextColor={CORES.secundaria}
              selectionColor={CORES.acento}
            />

            <Text style={styles.fieldLabel}>Confirmar Senha</Text>
            <TextInput
              style={styles.input}
              value={confirmarSenha}
              onChangeText={setConfirmarSenha}
              secureTextEntry={!senhaVisivel}
              placeholder="repita a nova senha"
              placeholderTextColor={CORES.secundaria}
              selectionColor={CORES.acento}
            />
          </View>
        )}

        {/* Salvar */}
        <TouchableOpacity
          style={[styles.btnSalvar, salvando && { opacity: 0.6 }]}
          onPress={salvarPerfil}
          disabled={salvando}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSalvarTexto}>{salvando ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.btnLogout} onPress={logout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={CORES.erro} />
          <Text style={styles.btnLogoutTexto}>SAIR DO APP</Text>
        </TouchableOpacity>

        {/* Excluir perfil */}
        <TouchableOpacity
          style={{ alignItems: 'center', marginTop: 20 }}
          onPress={() => Linking.openURL('https://kavsite.netlify.app')}
          activeOpacity={0.7}
        >
          <Text style={styles.textoExcluirPerfil}>excluir perfil</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  hamburger: { padding: 4 },
  titulo: {
    color: CORES.primaria, fontSize: 14, fontWeight: 'bold',
    letterSpacing: 3,
  },
  scroll: { padding: 20 },

  avatarContainer: { alignItems: 'center', marginBottom: 28 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  avatarLetra: { color: CORES.fundo, fontSize: 32, fontWeight: 'bold' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: CORES.primaria, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: CORES.fundo,
  },
  codigoBadge: { alignItems: 'center' },
  codigoLabel: { color: CORES.secundaria, fontSize: 10, letterSpacing: 2, marginBottom: 2 },
  codigoValor: { color: CORES.acento, fontSize: 18, fontWeight: 'bold', letterSpacing: 3, fontFamily: 'monospace' },

  secaoLabel: {
    color: CORES.acento, fontSize: 11, fontWeight: 'bold',
    letterSpacing: 2, marginBottom: 12, marginTop: 8,
  },
  fieldLabel: { color: CORES.secundaria, fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: CORES.superficie, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    color: CORES.primaria, fontSize: 15, marginBottom: 14,
    borderWidth: 1, borderColor: CORES.borda,
  },
  inputDisabled: { color: CORES.secundaria, opacity: 0.6 },

  cursosContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  cursoBadge: {
    backgroundColor: CORES.superficie, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: CORES.borda,
  },
  cursoTexto: { color: CORES.primaria, fontSize: 13 },

  accordionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: CORES.borda,
    borderBottomWidth: 1, borderBottomColor: CORES.borda, marginVertical: 4,
  },
  accordionLabel: { color: CORES.acento, fontSize: 11, fontWeight: 'bold', letterSpacing: 2 },
  accordionBody: { paddingTop: 12 },
  senhaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  eyeBtn: { padding: 8 },

  btnSalvar: {
    backgroundColor: CORES.acento, borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  btnSalvarTexto: { color: CORES.fundo, fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },

  btnLogout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 10, padding: 14, borderWidth: 1, borderColor: CORES.erro, marginTop: 14,
  },
  btnLogoutTexto: { color: CORES.erro, fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  textoExcluirPerfil: {
    color: CORES.secundaria, fontSize: 12,
    textDecorationLine: 'underline', opacity: 0.6,
  },
});
