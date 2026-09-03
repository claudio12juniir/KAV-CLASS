import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { BASE_URL, fetchComRetry } from '../../api';
import { useEscolaContexto } from './_contexto';
import { estilosConteudo as estilos } from './_estilos';

export default function EquipeEscola() {
  const { pacote, podeGerenciar } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [professores, setProfessores] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);

  const [emailConvite, setEmailConvite] = useState('');
  const [papelConvite, setPapelConvite] = useState<'PROFESSOR' | 'GESTOR'>('PROFESSOR');
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resProfessores, resAlunos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
      ]);
      if (resProfessores.ok) setProfessores(await resProfessores.json());
      if (resAlunos.ok) setAlunos(await resAlunos.json());
    } catch (err) {
      console.error('Erro ao carregar Equipe da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const enviarConvite = async () => {
    const emailNorm = emailConvite.trim().toLowerCase();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(emailNorm)) {
      Alert.alert('Atenção', 'Informe um e-mail válido.');
      return;
    }
    setEnviandoConvite(true);
    setUltimoCodigo(null);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${BASE_URL}/api/escola/convites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNorm, papel: papelConvite }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        Alert.alert('Não foi possível convidar', dados.erro || 'Tente novamente.');
        return;
      }
      setUltimoCodigo(dados.codigo);
      setEmailConvite('');
      Alert.alert('Convite criado', dados.mensagem);
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoConvite(false);
    }
  };

  const copiarCodigo = async () => {
    if (!ultimoCodigo) return;
    await Clipboard.setStringAsync(ultimoCodigo);
    Alert.alert('Copiado!', 'Código do convite copiado.');
  };

  if (carregando) {
    return (
      <View style={estilos.telaCentralizada}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={estilos.container} showsVerticalScrollIndicator={false}>
      <View style={estilos.subHeader}>
        <Text style={estilos.subTitulo}>Equipe e alunos</Text>
        <Text style={estilos.subtitulo}>Visão consolidada de todos os professores da sua escola</Text>
      </View>

      {pacote !== 'PACOTE_ESCOLA' && (
        <View style={estilos.avisoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#8A6D00" />
          <Text style={estilos.avisoTexto}>
            Sua conta ainda está no Pacote Professor. Convidar outros professores é um recurso do Pacote Escola.
          </Text>
        </View>
      )}

      {pacote === 'PACOTE_ESCOLA' && podeGerenciar && (
        <View style={estilos.cardForm}>
          <Text style={estilos.labelInput}>Convidar professor por e-mail</Text>
          <TextInput
            style={estilos.input}
            placeholder="email@exemplo.com"
            placeholderTextColor="#aaa"
            keyboardType="email-address"
            autoCapitalize="none"
            value={emailConvite}
            onChangeText={setEmailConvite}
          />

          <View style={estilos.papelRow}>
            {(['PROFESSOR', 'GESTOR'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[estilos.chipPapel, papelConvite === p && estilos.chipPapelAtivo]}
                onPress={() => setPapelConvite(p)}
              >
                <Text style={[estilos.textoChip, papelConvite === p && { color: '#fff' }]}>
                  {p === 'PROFESSOR' ? 'Professor' : 'Gestor'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[estilos.botaoPrimario, enviandoConvite && { opacity: 0.6 }]}
            onPress={enviarConvite}
            disabled={enviandoConvite}
          >
            {enviandoConvite ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>Enviar Convite</Text>}
          </TouchableOpacity>

          {ultimoCodigo && (
            <TouchableOpacity style={estilos.codigoBox} onPress={copiarCodigo}>
              <Text style={estilos.codigoTexto}>{ultimoCodigo}</Text>
              <Ionicons name="copy-outline" size={18} color="#32BCAD" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={estilos.secaoLista}>
        <Text style={estilos.secaoTitulo}>Professores ({professores.length})</Text>
        {professores.length === 0 ? (
          <Text style={estilos.textoVazio}>Nenhum professor encontrado.</Text>
        ) : (
          professores.map((p) => (
            <View key={p.id} style={estilos.linhaPessoa}>
              <View style={estilos.avatarFallback}>
                <Text style={estilos.avatarLetra}>{p.nome?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomePessoa}>{p.nome}</Text>
                <Text style={estilos.emailPessoa}>{p.email}</Text>
              </View>
              <View style={estilos.badgePapel}>
                <Text style={estilos.badgePapelTexto}>{p.papel}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={estilos.secaoLista}>
        <Text style={estilos.secaoTitulo}>Alunos da Escola ({alunos.length})</Text>
        {alunos.length === 0 ? (
          <Text style={estilos.textoVazio}>Nenhum aluno encontrado.</Text>
        ) : (
          alunos.map((a) => (
            <View key={a.id} style={estilos.linhaPessoa}>
              <View style={estilos.avatarFallback}>
                <Text style={estilos.avatarLetra}>{a.nome?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomePessoa}>{a.nome}</Text>
                <Text style={estilos.emailPessoa}>com {a.professor?.nome || '—'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
