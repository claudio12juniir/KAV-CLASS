import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Botao, ErpShell, EstadoVazio, Kpi, SectionCard, Tabela } from './_ui';

export default function CaptacaoEscola() {
  const [carregando, setCarregando] = useState(true);
  const [estagiosFunil, setEstagiosFunil] = useState<{ id: string; nome: string; ordem: number; totalLeads: number }[]>([]);
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
      if (resFunil.ok) setEstagiosFunil((await resFunil.json()).estagios || []);
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
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      });
      if (res.ok) carregarDados();
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível criar o link.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoLink(false);
    }
  };

  const alternarLinkCaptacao = async (id: string, ativo: boolean) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/links-captacao/${id}/${ativo ? 'desativar' : 'reativar'}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível atualizar.');
  };

  const copiarLinkCaptacao = async (linkToken: string) => {
    await Clipboard.setStringAsync(`${BASE_URL}/captacao/${linkToken}`);
    Alert.alert('Copiado!', 'Link de captação copiado.');
  };

  if (carregando) {
    return <ErpShell titulo="Captação"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Captação">
      <Text style={estilos.titulo}>Funil e conversão</Text>
      <Text style={estilos.subtitulo}>Como os leads da escola estão avançando até a matrícula</Text>

      <View style={estilos.kpiGrade}>
        {estagiosFunil.map((e) => <Kpi key={e.id} label={e.nome} valor={e.totalLeads} />)}
        {relatorioConversao && relatorioConversao.totalExperimentais > 0 && (
          <Kpi label="Conversão experimental → matrícula (30d)" valor={`${relatorioConversao.taxaConversao}%`} tom="sucesso" />
        )}
      </View>

      <SectionCard style={{ marginTop: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={estilos.cardTitulo}>Links de captação</Text>
            <Text style={estilos.cardSubtitulo}>Compartilhe em redes sociais ou embuta no site — sem precisar do app</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Botao texto="Formulário" variante="secundario" icone="add" carregando={criandoLink} onPress={() => criarLinkCaptacao('CADASTRO')} />
            <Botao texto="Aula experimental" variante="secundario" icone="add" carregando={criandoLink} onPress={() => criarLinkCaptacao('AGENDAMENTO_EXPERIMENTAL')} />
          </View>
        </View>

        {linksCaptacao.length === 0 ? (
          <EstadoVazio icone="link-outline" texto="Nenhum link criado ainda." />
        ) : (
          <Tabela
            vazioTexto=""
            dados={linksCaptacao}
            colunas={[
              { chave: 'tipo', titulo: 'Tipo', flex: 3, render: (l: any) => (
                <View>
                  <Text style={estilos.linhaTitulo}>{l.tipo === 'AGENDAMENTO_EXPERIMENTAL' ? 'Aula experimental' : 'Formulário de contato'}</Text>
                  {l.professor?.nome && <Text style={estilos.linhaSub}>{l.professor.nome}</Text>}
                </View>
              )},
              { chave: 'status', titulo: 'Status', flex: 2, render: (l: any) => (
                <Text style={[estilos.linhaSub, { color: l.ativo ? ERP.sucesso : ERP.perigo, fontWeight: '700' }]}>{l.ativo ? 'Ativo' : 'Desativado'}</Text>
              )},
              { chave: 'acoes', titulo: '', flex: 2, alinhar: 'right', render: (l: any) => (
                <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'flex-end' }}>
                  <TouchableOpacity onPress={() => copiarLinkCaptacao(l.token)}><Ionicons name="copy-outline" size={18} color={ERP.acento} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => alternarLinkCaptacao(l.id, l.ativo)}>
                    <Ionicons name={l.ativo ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color={ERP.textoSecundario} />
                  </TouchableOpacity>
                </View>
              )},
            ]}
          />
        )}
      </SectionCard>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13, color: ERP.textoSecundario, marginTop: 3, marginBottom: 20 },
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cardTitulo: { fontSize: 14.5, fontWeight: '800', color: ERP.texto },
  cardSubtitulo: { fontSize: 12, color: ERP.textoSecundario, marginTop: 3 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
});
