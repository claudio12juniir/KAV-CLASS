// Configurações do aluno INSTITUTION — foto, telefone, senha. Mesmo
// GET/PUT /api/aluno/perfil do SELF. Como é a mesma linha de Aluno lida
// por (escola)/alunos.tsx, qualquer alteração aqui já reflete
// automaticamente no painel institucional.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Botao, Campo, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

export default function ConfiguracoesAlunoEscola() {
  const { nome, fotoUrl, escolaNome, telefone, carregando, recarregarPerfil, sair } = useAlunoEscolaContexto();

  const [nomeCampo, setNomeCampo] = useState('');
  const [telefoneCampo, setTelefoneCampo] = useState('');
  const [fotoCampo, setFotoCampo] = useState<string | null>(null);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setNomeCampo(nome);
    setTelefoneCampo(telefone);
    setFotoCampo(fotoUrl);
  }, [nome, telefone, fotoUrl]);

  const salvarFoto = async (novaFotoUrl: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      await fetchComRetry(`${BASE_URL}/api/aluno/perfil`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotoUrl: novaFotoUrl }),
      });
      recarregarPerfil();
    } catch { /* silencioso */ }
  };

  const selecionarFoto = () => {
    Alert.alert('Foto de perfil', 'Escolha a origem', [
      {
        text: 'Câmera', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à câmera não autorizado.'); return; }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.1, base64: true, allowsEditing: true, aspect: [1, 1] });
          if (!res.canceled && res.assets[0].base64) {
            const url = `data:image/jpeg;base64,${res.assets[0].base64}`;
            setFotoCampo(url);
            salvarFoto(url);
          }
        },
      },
      {
        text: 'Galeria', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à galeria não autorizado.'); return; }
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.1, base64: true, allowsEditing: true, aspect: [1, 1] });
          if (!res.canceled && res.assets[0].base64) {
            const url = `data:image/jpeg;base64,${res.assets[0].base64}`;
            setFotoCampo(url);
            salvarFoto(url);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const salvar = async () => {
    if ((senhaAtual || novaSenha) && novaSenha.length < 6) {
      Alert.alert('Atenção', 'A nova senha precisa de ao menos 6 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const body: any = { nome: nomeCampo, telefone: telefoneCampo };
      if (senhaAtual && novaSenha) { body.senhaAtual = senhaAtual; body.novaSenha = novaSenha; }
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/perfil`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Sucesso', 'Perfil atualizado!');
        setSenhaAtual(''); setNovaSenha('');
        recarregarPerfil();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível salvar.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Verifique sua internet.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <MobileErpShell
      titulo="Configurações"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Configurações" subtitulo="Seus dados nesta escola" />

      <SectionCard>
        <TouchableOpacity onPress={selecionarFoto} style={estilos.avatarWrapper}>
          {fotoCampo ? (
            <Image source={{ uri: fotoCampo }} style={estilos.avatarFoto} />
          ) : (
            <View style={estilos.avatarFallback}>
              <Text style={estilos.avatarLetra}>{nomeCampo?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={estilos.avatarBadge}>
            <Ionicons name="camera" size={13} color="#fff" />
          </View>
        </TouchableOpacity>

        <Campo label="Nome" value={nomeCampo} onChangeText={setNomeCampo} />
        <Campo label="Telefone / WhatsApp" value={telefoneCampo} onChangeText={setTelefoneCampo} keyboardType="phone-pad" />

        <Text style={estilos.secaoLabel}>Alterar senha (opcional)</Text>
        <Campo label="Senha atual" value={senhaAtual} onChangeText={setSenhaAtual} secureTextEntry placeholder="••••••" />
        <Campo label="Nova senha" value={novaSenha} onChangeText={setNovaSenha} secureTextEntry placeholder="mín. 6 caracteres" />

        <Botao texto="Salvar alterações" onPress={salvar} carregando={salvando} icone="checkmark-outline" />
      </SectionCard>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  avatarWrapper: { alignSelf: 'center', marginBottom: 20, position: 'relative' },
  avatarFoto: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { width: 84, height: 84, borderRadius: 42, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { color: '#fff', fontSize: 32, fontWeight: '700' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14,
    backgroundColor: ERP.texto, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ERP.superficie,
  },
  secaoLabel: { fontSize: 12, fontWeight: '800', color: ERP.acentoForte, textTransform: 'uppercase', marginTop: 6, marginBottom: 12 },
});
