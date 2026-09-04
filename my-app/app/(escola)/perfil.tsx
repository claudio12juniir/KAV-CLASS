import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Botao, Campo, ErpShell, SectionCard } from './_ui';

export default function PerfilEscola() {
  const { nomeAdmin, nomeEscola, papel, recarregarPerfil } = useEscolaContexto();
  const [nome, setNome] = useState(nomeAdmin);
  const [salvandoNome, setSalvandoNome] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const salvarNome = async () => {
    if (!nome.trim()) { Alert.alert('Atenção', 'Informe seu nome.'); return; }
    setSalvandoNome(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professor/perfil`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      if (res.ok) { await recarregarPerfil(); Alert.alert('Feito!', 'Nome atualizado.'); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoNome(false);
    }
  };

  const salvarSenha = async () => {
    if (!senhaAtual || novaSenha.length < 6) { Alert.alert('Atenção', 'Informe a senha atual e uma nova senha com pelo menos 6 caracteres.'); return; }
    setSalvandoSenha(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professor/perfil`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const dados = await res.json();
      if (res.ok) { setSenhaAtual(''); setNovaSenha(''); Alert.alert('Feito!', 'Senha atualizada.'); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível trocar a senha.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  return (
    <ErpShell titulo="Meu perfil">
      <Text style={estilos.titulo}>Meu perfil</Text>
      <Text style={estilos.subtitulo}>{nomeEscola} · {papel === 'DONO' ? 'Dono da escola' : 'Gestor'}</Text>

      <SectionCard style={{ maxWidth: 480, marginTop: 20 }}>
        <Text style={estilos.cardTitulo}>Dados pessoais</Text>
        <Campo label="Nome" value={nome} onChangeText={setNome} placeholder="Seu nome" />
        <Botao texto="Salvar nome" onPress={salvarNome} carregando={salvandoNome} />
      </SectionCard>

      <SectionCard style={{ maxWidth: 480, marginTop: 16 }}>
        <Text style={estilos.cardTitulo}>Trocar senha</Text>
        <Campo label="Senha atual" value={senhaAtual} onChangeText={setSenhaAtual} secureTextEntry />
        <Campo label="Nova senha" value={novaSenha} onChangeText={setNovaSenha} secureTextEntry placeholder="Mínimo 6 caracteres" />
        <Botao texto="Atualizar senha" onPress={salvarSenha} carregando={salvandoSenha} />
      </SectionCard>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13, color: ERP.textoSecundario, marginTop: 3 },
  cardTitulo: { fontSize: 14.5, fontWeight: '800', color: ERP.texto, marginBottom: 16 },
});
