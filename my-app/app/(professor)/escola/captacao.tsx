import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { BASE_URL, fetchComRetry } from '../../api';
import { estilosConteudo as estilos } from './_estilos';

export default function CaptacaoEscola() {
  const [carregando, setCarregando] = useState(true);
  const [estagiosFunil, setEstagiosFunil] = useState<{ id: string; nome: string; ordem: number; totalLeads: number }[]>([]);
  const [totalTarefasPendentes, setTotalTarefasPendentes] = useState(0);
  const [relatorioConversao, setRelatorioConversao] = useState<{ totalExperimentais: number; convertidas: number; taxaConversao: number } | null>(null);
  const [linksCaptacao, setLinksCaptacao] = useState<any[]>([]);
  const [criandoLink, setCriandoLink] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);
      const paraYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10);

      const [resFunil, resConversao, resLinks] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/funil/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/relatorios/conversao-experimental?de=${paraYYYYMMDD(trintaDiasAtras)}&ate=${paraYYYYMMDD(hoje)}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/links-captacao`, { headers }),
      ]);

      if (resFunil.ok) {
        const funil = await resFunil.json();
        setEstagiosFunil(funil.estagios || []);
        setTotalTarefasPendentes(funil.tarefasPendentes || 0);
      }
      if (resConversao.ok) setRelatorioConversao(await resConversao.json());
      if (resLinks.ok) setLinksCaptacao(await resLinks.json());
    } catch (err) {
      console.error('Erro ao carregar Captação:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const criarLinkCaptacao = async (tipo: 'CADASTRO' | 'AGENDAMENTO_EXPERIMENTAL') => {
    setCriandoLink(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/links-captacao`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      });
      const dados = await res.json();
      if (res.ok) {
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível criar o link.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoLink(false);
    }
  };

  const alternarLinkCaptacao = async (id: string, ativo: boolean) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const rota = ativo ? 'desativar' : 'reativar';
      const res = await fetchComRetry(`${BASE_URL}/api/links-captacao/${id}/${rota}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível atualizar o link.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const copiarLinkCaptacao = async (linkToken: string) => {
    await Clipboard.setStringAsync(`${BASE_URL}/captacao/${linkToken}`);
    Alert.alert('Copiado!', 'Link de captação copiado.');
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
        <Text style={estilos.subTitulo}>Captação</Text>
        <Text style={estilos.subtitulo}>Funil de leads, conversão e links de divulgação</Text>
      </View>

      {estagiosFunil.length > 0 && (
        <View style={estilos.secaoLista}>
          <View style={estilos.linhaTituloFunil}>
            <Text style={estilos.secaoTitulo}>Funil de captação</Text>
            {totalTarefasPendentes > 0 && (
              <View style={estilos.badgeAlerta}>
                <Text style={estilos.badgeAlertaTexto}>{totalTarefasPendentes} tarefa{totalTarefasPendentes > 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
          <View style={estilos.funilRow}>
            {estagiosFunil.map((e) => (
              <View key={e.id} style={estilos.estagioCard}>
                <Text style={estilos.estagioTotal}>{e.totalLeads}</Text>
                <Text style={estilos.estagioNome} numberOfLines={2}>{e.nome}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {relatorioConversao && relatorioConversao.totalExperimentais > 0 && (
        <View style={estilos.secaoLista}>
          <Text style={estilos.secaoTitulo}>Conversão experimental → matrícula</Text>
          <Text style={estilos.textoAjuda}>Últimos 30 dias</Text>
          <View style={estilos.conversaoRow}>
            <View style={estilos.conversaoCard}>
              <Text style={estilos.estagioTotal}>{relatorioConversao.totalExperimentais}</Text>
              <Text style={estilos.estagioNome}>Experimentais</Text>
            </View>
            <View style={estilos.conversaoCard}>
              <Text style={estilos.estagioTotal}>{relatorioConversao.convertidas}</Text>
              <Text style={estilos.estagioNome}>Matricularam</Text>
            </View>
            <View style={[estilos.conversaoCard, estilos.conversaoCardDestaque]}>
              <Text style={[estilos.estagioTotal, { color: '#fff' }]}>{relatorioConversao.taxaConversao}%</Text>
              <Text style={[estilos.estagioNome, { color: '#eee' }]}>Conversão</Text>
            </View>
          </View>
        </View>
      )}

      <View style={estilos.secaoLista}>
        <Text style={estilos.secaoTitulo}>Links de captação</Text>
        <Text style={estilos.textoAjuda}>
          Compartilhe em redes sociais ou embuta no seu site — quem abrir preenche o contato sem precisar do app.
        </Text>

        <View style={estilos.papelRow}>
          <TouchableOpacity
            style={[estilos.chipPapel, criandoLink && { opacity: 0.6 }]}
            disabled={criandoLink}
            onPress={() => criarLinkCaptacao('CADASTRO')}
          >
            <Text style={estilos.textoChip}>+ Formulário de contato</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.chipPapel, criandoLink && { opacity: 0.6 }]}
            disabled={criandoLink}
            onPress={() => criarLinkCaptacao('AGENDAMENTO_EXPERIMENTAL')}
          >
            <Text style={estilos.textoChip}>+ Aula experimental</Text>
          </TouchableOpacity>
        </View>

        {linksCaptacao.length === 0 ? (
          <Text style={estilos.textoVazio}>Nenhum link criado ainda.</Text>
        ) : (
          linksCaptacao.map((l) => (
            <View key={l.id} style={estilos.cardLink}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomePessoa}>
                  {l.tipo === 'AGENDAMENTO_EXPERIMENTAL' ? 'Aula experimental' : 'Formulário de contato'}
                  {l.professor?.nome ? ` · ${l.professor.nome}` : ''}
                </Text>
                <Text style={[estilos.emailPessoa, !l.ativo && { color: '#B00020' }]}>
                  {l.ativo ? 'Ativo' : 'Desativado'}
                </Text>
              </View>
              <TouchableOpacity style={estilos.botaoIcone} onPress={() => copiarLinkCaptacao(l.token)}>
                <Ionicons name="copy-outline" size={18} color="#32BCAD" />
              </TouchableOpacity>
              <TouchableOpacity style={estilos.botaoIcone} onPress={() => alternarLinkCaptacao(l.id, l.ativo)}>
                <Ionicons name={l.ativo ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color="#555" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
