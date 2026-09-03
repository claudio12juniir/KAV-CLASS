import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { CORES } from '../../constants/theme';
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
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

interface PerfilAluno {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  curso: string | null;
  status: string;
  valorMensalidade: number | null;
  diaVencimento: number | null;
  recorrenciaAula: string | null;
  diaSemanaAula: string | null;
  horarioAula: string | null;
  tempoContrato: number | null;
  createdAt: string;
  fotoUrl: string | null;
  professor: { nome: string; telefone: string | null } | null;
}

export default function PerfilScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const [perfil, setPerfil] = useState<PerfilAluno | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Campos editáveis
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // Campos de troca de senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenhas, setMostrarSenhas] = useState(false);

  const carregarPerfil = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';

      const resposta = await fetchComRetry(`${API_URL}/api/aluno/perfil?alunoId=${alunoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados: PerfilAluno = await resposta.json();
        setPerfil(dados);
        setNome(dados.nome);
        setTelefone(dados.telefone || '');
        setFotoUrl(dados.fotoUrl || null);
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarPerfil(); }, [carregarPerfil]));

  const salvarDadosPessoais = async () => {
    if (!nome.trim()) {
      Alert.alert("Erro", "O nome não pode estar vazio.");
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';

      const resposta = await fetchComRetry(`${API_URL}/api/aluno/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ alunoId, nome, telefone, fotoUrl })
      });

      const dados = await resposta.json();
      if (resposta.ok) {
        Alert.alert("Sucesso!", "Dados atualizados com sucesso.");
        carregarPerfil();
      } else {
        Alert.alert("Erro", dados.erro || "Falha ao atualizar.");
      }
    } catch {
      Alert.alert("Erro", "Falha na conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const trocarSenha = async () => {
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      Alert.alert("Erro", "Preencha todos os campos de senha.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      Alert.alert("Erro", "As senhas não coincidem.");
      return;
    }
    if (novaSenha.length < 6) {
      Alert.alert("Erro", "A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';

      const resposta = await fetchComRetry(`${API_URL}/api/aluno/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ alunoId, senhaAtual, novaSenha })
      });

      const dados = await resposta.json();
      if (resposta.ok) {
        Alert.alert("Sucesso!", "Senha alterada com sucesso.");
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        setMostrarSenhas(false);
      } else {
        Alert.alert("Erro", dados.erro || "Falha ao alterar senha.");
      }
    } catch {
      Alert.alert("Erro", "Falha na conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarFotoAutomatico = async (novaFotoUrl: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';
      await fetchComRetry(`${API_URL}/api/aluno/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ alunoId, fotoUrl: novaFotoUrl }),
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

  const fazerLogout = async () => {
    Alert.alert("Sair", "Deseja encerrar a sessão?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await SecureStore.deleteItemAsync('kav_token');
          await SecureStore.deleteItemAsync('kav_papel');
          await SecureStore.deleteItemAsync('kav_aluno_id');
          router.replace('/login');
        }
      }
    ]);
  };

  if (carregando) {
    return (
      <View style={styles.loadingContainer}>
        <SyncLoader size="large" color={CORES.acento} />
      </View>
    );
  }

  const statusLabel: Record<string, { label: string; cor: string }> = {
    ATIVO:    { label: 'Ativo',    cor: CORES.sucesso },
    PENDENTE: { label: 'Pendente', cor: CORES.aviso   },
    INATIVO:  { label: 'Inativo',  cor: CORES.erro    },
  };

  const statusInfo = statusLabel[perfil?.status || 'PENDENTE'] || statusLabel.PENDENTE;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      {/* Barra topo com hamburger */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={{ padding: 4 }}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.topBarTitulo}>MEU PERFIL</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={selecionarFoto} activeOpacity={0.8} style={styles.avatarWrapper}>
          {fotoUrl ? (
            <Image source={{ uri: fotoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetra}>{perfil?.nome?.charAt(0).toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={13} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.nomeHeader}>{perfil?.nome}</Text>
        <View style={[styles.badgeStatus, { backgroundColor: statusInfo.cor + '22' }]}>
          <View style={[styles.pontinho, { backgroundColor: statusInfo.cor }]} />
          <Text style={[styles.textoStatus, { color: statusInfo.cor }]}>{statusInfo.label}</Text>
        </View>
      </View>

      {/* Informações do contrato */}
      {perfil?.professor && (
        <View style={styles.secao}>
          <Text style={styles.tituloSecao}>Meu Contrato</Text>
          <View style={styles.card}>
            <LinhaPerfil icone="person-outline" label="Professor" valor={perfil.professor.nome} />
            {perfil.curso && <LinhaPerfil icone="musical-notes-outline" label="Curso" valor={perfil.curso} />}
            {perfil.diaSemanaAula && perfil.horarioAula && (
              <LinhaPerfil icone="calendar-outline" label="Aula" valor={`${perfil.diaSemanaAula} às ${perfil.horarioAula}`} />
            )}
            {perfil.recorrenciaAula && (
              <LinhaPerfil icone="repeat-outline" label="Recorrência" valor={perfil.recorrenciaAula} />
            )}
            {perfil.valorMensalidade != null && (
              <LinhaPerfil icone="wallet-outline" label="Mensalidade" valor={`R$ ${perfil.valorMensalidade.toFixed(2)}`} />
            )}
            {perfil.diaVencimento != null && (
              <LinhaPerfil icone="receipt-outline" label="Vencimento" valor={`Dia ${perfil.diaVencimento}`} ultimo />
            )}
          </View>
        </View>
      )}

      {/* Dados pessoais editáveis */}
      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Dados Pessoais</Text>
        <View style={styles.card}>
          <Text style={styles.labelInput}>E-mail</Text>
          <TextInput
            style={[styles.input, styles.inputDesabilitado]}
            value={perfil?.email}
            editable={false}
          />
          <Text style={styles.labelInput}>Nome completo</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Seu nome"
            placeholderTextColor={CORES.secundaria}
            autoCorrect
            spellCheck
          />
          <Text style={styles.labelInput}>Telefone</Text>
          <TextInput
            style={styles.input}
            value={telefone}
            onChangeText={setTelefone}
            placeholder="(11) 99999-9999"
            placeholderTextColor={CORES.secundaria}
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            style={[styles.botaoSalvar, salvando && styles.botaoDesabilitado]}
            onPress={salvarDadosPessoais}
            disabled={salvando}
          >
            {salvando ? (
              <SyncLoader color={CORES.fundo} size="small" />
            ) : (
              <Text style={styles.textoBotaoSalvar}>Salvar Alterações</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Seção de troca de senha */}
      <View style={styles.secao}>
        <TouchableOpacity
          style={styles.cabecalhoAcordeon}
          onPress={() => setMostrarSenhas(!mostrarSenhas)}
        >
          <Text style={styles.tituloSecao}>Alterar Senha</Text>
          <Ionicons name={mostrarSenhas ? "chevron-up" : "chevron-down"} size={20} color={CORES.acento} />
        </TouchableOpacity>

        {mostrarSenhas && (
          <View style={styles.card}>
            <Text style={styles.labelInput}>Senha atual</Text>
            <TextInput
              style={styles.input}
              value={senhaAtual}
              onChangeText={setSenhaAtual}
              placeholder="Digite sua senha atual"
              placeholderTextColor={CORES.secundaria}
              secureTextEntry
            />
            <Text style={styles.labelInput}>Nova senha</Text>
            <TextInput
              style={styles.input}
              value={novaSenha}
              onChangeText={setNovaSenha}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={CORES.secundaria}
              secureTextEntry
            />
            <Text style={styles.labelInput}>Confirmar nova senha</Text>
            <TextInput
              style={styles.input}
              value={confirmarSenha}
              onChangeText={setConfirmarSenha}
              placeholder="Repita a nova senha"
              placeholderTextColor={CORES.secundaria}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.botaoSalvar, salvando && styles.botaoDesabilitado]}
              onPress={trocarSenha}
              disabled={salvando}
            >
              {salvando ? (
                <SyncLoader color={CORES.fundo} size="small" />
              ) : (
                <Text style={styles.textoBotaoSalvar}>Alterar Senha</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Logout */}
      <View style={styles.secao}>
        <TouchableOpacity style={styles.botaoSair} onPress={fazerLogout}>
          <Ionicons name="log-out-outline" size={24} color={CORES.erro} />
          <Text style={styles.textoSair}>Encerrar Sessão</Text>
        </TouchableOpacity>
      </View>

      {/* Excluir perfil */}
      <View style={styles.secao}>
        <TouchableOpacity onPress={() => Linking.openURL('https://kavsite.netlify.app')}>
          <Text style={styles.textoExcluirPerfil}>excluir perfil</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function LinhaPerfil({ icone, label, valor, ultimo }: { icone: any; label: string; valor: string; ultimo?: boolean }) {
  return (
    <View style={[styles.linhaInfo, !ultimo && styles.linhaInfoBorda]}>
      <Ionicons name={icone} size={18} color={CORES.secundaria} style={{ marginRight: 10 }} />
      <Text style={styles.labelInfo}>{label}</Text>
      <Text style={styles.valorInfo}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CORES.fundo },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  topBarTitulo: { color: CORES.primaria, fontSize: 13, fontWeight: 'bold', letterSpacing: 3 },
  header: { paddingTop: 28, paddingBottom: 24, alignItems: 'center', backgroundColor: CORES.fundo },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatarCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: CORES.acento,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  avatarLetra: { color: CORES.fundo, fontSize: 32, fontWeight: 'bold' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: CORES.primaria, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: CORES.fundo,
  },
  nomeHeader: { fontSize: 20, fontWeight: 'bold', color: CORES.primaria, marginBottom: 8 },
  badgeStatus: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, gap: 6 },
  pontinho: { width: 8, height: 8, borderRadius: 4 },
  textoStatus: { fontSize: 12, fontWeight: '600' },
  secao: { paddingHorizontal: 20, marginBottom: 20 },
  tituloSecao: { color: CORES.acento, fontSize: 11, fontWeight: 'bold', letterSpacing: 2, marginBottom: 10 },
  cabecalhoAcordeon: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  card: { backgroundColor: CORES.superficie, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: CORES.borda },
  linhaInfo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  linhaInfoBorda: { borderBottomWidth: 1, borderBottomColor: CORES.borda },
  labelInfo: { flex: 1, color: CORES.secundaria, fontSize: 13 },
  valorInfo: { color: CORES.primaria, fontSize: 13, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  labelInput: { color: CORES.secundaria, fontSize: 12, marginBottom: 6, marginTop: 10, letterSpacing: 0.5 },
  input: {
    backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: CORES.primaria,
  },
  inputDesabilitado: { backgroundColor: CORES.fundo, color: CORES.secundaria },
  botaoSalvar: { backgroundColor: CORES.acento, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  botaoDesabilitado: { opacity: 0.6 },
  textoBotaoSalvar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  botaoSair: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0',
    padding: 16, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: CORES.erro,
  },
  textoSair: { color: CORES.erro, fontSize: 15, fontWeight: 'bold' },
  textoExcluirPerfil: {
    color: CORES.secundaria, fontSize: 12, textAlign: 'center',
    textDecorationLine: 'underline', opacity: 0.6,
  },
});
