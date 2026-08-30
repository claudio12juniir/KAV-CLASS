import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

export default function EscolaScreen() {
  const navigation = useNavigation();
  const [carregando, setCarregando] = useState(true);
  const [pacote, setPacote] = useState<'PACOTE_PROFESSOR' | 'PACOTE_ESCOLA' | null>(null);
  const [professores, setProfessores] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [reposicoesParaFinalizar, setReposicoesParaFinalizar] = useState<any[]>([]);

  const [emailConvite, setEmailConvite] = useState('');
  const [papelConvite, setPapelConvite] = useState<'PROFESSOR' | 'GESTOR'>('PROFESSOR');
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null);

  const [estagiosFunil, setEstagiosFunil] = useState<{ id: string; nome: string; ordem: number; totalLeads: number }[]>([]);
  const [totalTarefasPendentes, setTotalTarefasPendentes] = useState(0);
  const [tarefasPendentes, setTarefasPendentes] = useState<any[]>([]);

  const [linksCaptacao, setLinksCaptacao] = useState<any[]>([]);
  const [criandoLink, setCriandoLink] = useState(false);

  const [relatorioConversao, setRelatorioConversao] = useState<{ totalExperimentais: number; convertidas: number; taxaConversao: number } | null>(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      const headers = { Authorization: `Bearer ${token}` };

      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);
      const paraYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10);

      const [resPerfil, resProfessores, resAlunos, resReposicoes, resFunil, resTarefas, resLinks, resConversao] = await Promise.all([
        fetchComRetry(`${API_URL}/api/professor/perfil?professorId=${professorId}`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/reposicoes`, { headers }),
        fetchComRetry(`${API_URL}/api/funil/resumo`, { headers }),
        fetchComRetry(`${API_URL}/api/tarefas-lead`, { headers }),
        fetchComRetry(`${API_URL}/api/links-captacao`, { headers }),
        fetchComRetry(`${API_URL}/api/relatorios/conversao-experimental?de=${paraYYYYMMDD(trintaDiasAtras)}&ate=${paraYYYYMMDD(hoje)}`, { headers }),
      ]);

      if (resPerfil.ok) {
        const perfil = await resPerfil.json();
        setPacote(perfil.escola?.pacote || 'PACOTE_PROFESSOR');
      }
      if (resProfessores.ok) setProfessores(await resProfessores.json());
      if (resAlunos.ok) setAlunos(await resAlunos.json());
      if (resReposicoes.ok) setReposicoesParaFinalizar(await resReposicoes.json());
      if (resFunil.ok) {
        const funil = await resFunil.json();
        setEstagiosFunil(funil.estagios || []);
        setTotalTarefasPendentes(funil.tarefasPendentes || 0);
      }
      if (resTarefas.ok) setTarefasPendentes(await resTarefas.json());
      if (resLinks.ok) setLinksCaptacao(await resLinks.json());
      if (resConversao.ok) setRelatorioConversao(await resConversao.json());
    } catch (err) {
      console.error('Erro ao carregar Minha Escola:', err);
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
      const resposta = await fetchComRetry(`${API_URL}/api/escola/convites`, {
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

  const finalizarReposicao = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/reposicoes/${id}/finalizar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Finalizada!', dados.mensagem);
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível finalizar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const concluirTarefa = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/tarefas-lead/${id}/concluir`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível concluir.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const criarLinkCaptacao = async (tipo: 'CADASTRO' | 'AGENDAMENTO_EXPERIMENTAL') => {
    setCriandoLink(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/links-captacao`, {
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
      const res = await fetchComRetry(`${API_URL}/api/links-captacao/${id}/${rota}`, {
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
    await Clipboard.setStringAsync(`${API_URL}/captacao/${linkToken}`);
    Alert.alert('Copiado!', 'Link de captação copiado.');
  };

  const copiarCodigo = async () => {
    if (!ultimoCodigo) return;
    await Clipboard.setStringAsync(ultimoCodigo);
    Alert.alert('Copiado!', 'Código do convite copiado.');
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.titulo}>MINHA ESCOLA</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subTitulo}>Equipe e alunos</Text>
        <Text style={styles.subtitulo}>Visão consolidada de todos os professores da sua escola</Text>
      </View>

      {pacote !== 'PACOTE_ESCOLA' && (
        <View style={styles.avisoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#8A6D00" />
          <Text style={styles.avisoTexto}>
            Sua conta ainda está no Pacote Professor. Convidar outros professores é um recurso do Pacote Escola.
          </Text>
        </View>
      )}

      {pacote === 'PACOTE_ESCOLA' && (
        <View style={styles.cardForm}>
          <Text style={styles.labelInput}>Convidar professor por e-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="email@exemplo.com"
            placeholderTextColor="#aaa"
            keyboardType="email-address"
            autoCapitalize="none"
            value={emailConvite}
            onChangeText={setEmailConvite}
          />

          <View style={styles.papelRow}>
            {(['PROFESSOR', 'GESTOR'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chipPapel, papelConvite === p && styles.chipPapelAtivo]}
                onPress={() => setPapelConvite(p)}
              >
                <Text style={[styles.textoChip, papelConvite === p && { color: '#fff' }]}>
                  {p === 'PROFESSOR' ? 'Professor' : 'Gestor'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.botaoConvidar, enviandoConvite && { opacity: 0.6 }]}
            onPress={enviarConvite}
            disabled={enviandoConvite}
          >
            {enviandoConvite ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoConvidarTexto}>Enviar Convite</Text>}
          </TouchableOpacity>

          {ultimoCodigo && (
            <TouchableOpacity style={styles.codigoBox} onPress={copiarCodigo}>
              <Text style={styles.codigoTexto}>{ultimoCodigo}</Text>
              <Ionicons name="copy-outline" size={18} color="#32BCAD" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {estagiosFunil.length > 0 && (
        <View style={styles.secaoLista}>
          <View style={styles.linhaTituloFunil}>
            <Text style={styles.secaoTitulo}>Funil de captação</Text>
            {totalTarefasPendentes > 0 && (
              <View style={styles.badgeAlerta}>
                <Text style={styles.badgeAlertaTexto}>{totalTarefasPendentes} tarefa{totalTarefasPendentes > 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
          <View style={styles.funilRow}>
            {estagiosFunil.map((e) => (
              <View key={e.id} style={styles.estagioCard}>
                <Text style={styles.estagioTotal}>{e.totalLeads}</Text>
                <Text style={styles.estagioNome} numberOfLines={2}>{e.nome}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {relatorioConversao && relatorioConversao.totalExperimentais > 0 && (
        <View style={styles.secaoLista}>
          <Text style={styles.secaoTitulo}>Conversão experimental → matrícula</Text>
          <Text style={styles.textoAjuda}>Últimos 30 dias</Text>
          <View style={styles.conversaoRow}>
            <View style={styles.conversaoCard}>
              <Text style={styles.estagioTotal}>{relatorioConversao.totalExperimentais}</Text>
              <Text style={styles.estagioNome}>Experimentais</Text>
            </View>
            <View style={styles.conversaoCard}>
              <Text style={styles.estagioTotal}>{relatorioConversao.convertidas}</Text>
              <Text style={styles.estagioNome}>Matricularam</Text>
            </View>
            <View style={[styles.conversaoCard, styles.conversaoCardDestaque]}>
              <Text style={[styles.estagioTotal, { color: '#fff' }]}>{relatorioConversao.taxaConversao}%</Text>
              <Text style={[styles.estagioNome, { color: '#eee' }]}>Conversão</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.secaoLista}>
        <Text style={styles.secaoTitulo}>Links de captação</Text>
        <Text style={styles.textoAjuda}>
          Compartilhe em redes sociais ou embuta no seu site — quem abrir preenche o contato sem precisar do app.
        </Text>

        <View style={styles.papelRow}>
          <TouchableOpacity
            style={[styles.chipPapel, criandoLink && { opacity: 0.6 }]}
            disabled={criandoLink}
            onPress={() => criarLinkCaptacao('CADASTRO')}
          >
            <Text style={styles.textoChip}>+ Formulário de contato</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipPapel, criandoLink && { opacity: 0.6 }]}
            disabled={criandoLink}
            onPress={() => criarLinkCaptacao('AGENDAMENTO_EXPERIMENTAL')}
          >
            <Text style={styles.textoChip}>+ Aula experimental</Text>
          </TouchableOpacity>
        </View>

        {linksCaptacao.length === 0 ? (
          <Text style={styles.textoVazio}>Nenhum link criado ainda.</Text>
        ) : (
          linksCaptacao.map((l) => (
            <View key={l.id} style={styles.cardLink}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>
                  {l.tipo === 'AGENDAMENTO_EXPERIMENTAL' ? 'Aula experimental' : 'Formulário de contato'}
                  {l.professor?.nome ? ` · ${l.professor.nome}` : ''}
                </Text>
                <Text style={[styles.emailPessoa, !l.ativo && { color: '#B00020' }]}>
                  {l.ativo ? 'Ativo' : 'Desativado'}
                </Text>
              </View>
              <TouchableOpacity style={styles.botaoIcone} onPress={() => copiarLinkCaptacao(l.token)}>
                <Ionicons name="copy-outline" size={18} color="#32BCAD" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.botaoIcone} onPress={() => alternarLinkCaptacao(l.id, l.ativo)}>
                <Ionicons name={l.ativo ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color="#555" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {tarefasPendentes.length > 0 && (
        <View style={styles.secaoLista}>
          <Text style={styles.secaoTitulo}>Follow-ups pendentes ({tarefasPendentes.length})</Text>
          {tarefasPendentes.map((t) => (
            <View key={t.id} style={styles.cardReposicao}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>{t.lead?.nome}</Text>
                <Text style={styles.emailPessoa}>{t.descricao} · {new Date(t.dataPrevista).toLocaleDateString('pt-BR')}</Text>
              </View>
              <TouchableOpacity style={styles.botaoFinalizar} onPress={() => concluirTarefa(t.id)}>
                <Text style={styles.botaoFinalizarTexto}>Concluir</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {reposicoesParaFinalizar.length > 0 && (
        <View style={styles.secaoLista}>
          <Text style={styles.secaoTitulo}>Reposições pra finalizar ({reposicoesParaFinalizar.length})</Text>
          {reposicoesParaFinalizar.map((r) => (
            <View key={r.id} style={styles.cardReposicao}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>{r.aluno?.nome} · com {r.professor?.nome}</Text>
                <Text style={styles.emailPessoa}>{r.dataProposta} — {r.motivo}</Text>
              </View>
              <TouchableOpacity style={styles.botaoFinalizar} onPress={() => finalizarReposicao(r.id)}>
                <Text style={styles.botaoFinalizarTexto}>Finalizar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.secaoLista}>
        <Text style={styles.secaoTitulo}>Professores ({professores.length})</Text>
        {professores.length === 0 ? (
          <Text style={styles.textoVazio}>Nenhum professor encontrado.</Text>
        ) : (
          professores.map((p) => (
            <View key={p.id} style={styles.linhaPessoa}>
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetra}>{p.nome?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>{p.nome}</Text>
                <Text style={styles.emailPessoa}>{p.email}</Text>
              </View>
              <View style={styles.badgePapel}>
                <Text style={styles.badgePapelTexto}>{p.papel}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.secaoLista}>
        <Text style={styles.secaoTitulo}>Alunos da Escola ({alunos.length})</Text>
        {alunos.length === 0 ? (
          <Text style={styles.textoVazio}>Nenhum aluno encontrado.</Text>
        ) : (
          alunos.map((a) => (
            <View key={a.id} style={styles.linhaPessoa}>
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetra}>{a.nome?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>{a.nome}</Text>
                <Text style={styles.emailPessoa}>com {a.professor?.nome || '—'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#D0D8DC',
    backgroundColor: '#ffffff',
  },
  hamburger: { padding: 4 },
  titulo:    { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  subHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  subTitulo: { color: '#000000', fontSize: 22, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2, marginBottom: 4 },

  avisoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    margin: 20, marginBottom: 0, padding: 14,
    backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1, borderColor: '#F0DFA0',
  },
  avisoTexto: { flex: 1, color: '#6B5900', fontSize: 13, lineHeight: 18 },

  cardForm: { margin: 20, padding: 20, backgroundColor: '#F0F4F8', borderRadius: 16, borderWidth: 1, borderColor: '#D0D8DC' },
  labelInput: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  input: {
    width: '100%', height: 48, backgroundColor: '#fff',
    borderRadius: 10, paddingHorizontal: 15, color: '#000',
    marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#D0D8DC',
  },
  papelRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chipPapel: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#D0D8DC' },
  chipPapelAtivo: { backgroundColor: '#000', borderColor: '#000' },
  textoChip: { fontSize: 13, fontWeight: '600', color: '#555' },

  botaoConvidar: { backgroundColor: '#000', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  botaoConvidarTexto: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  codigoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 14, padding: 12, backgroundColor: '#E8F8F6', borderRadius: 10,
    borderWidth: 1, borderColor: '#32BCAD',
  },
  codigoTexto: { color: '#000', fontSize: 18, fontWeight: 'bold', letterSpacing: 3 },

  secaoLista: { paddingHorizontal: 20, marginTop: 24 },
  secaoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#000', marginBottom: 12 },
  textoVazio: { color: '#999', fontSize: 13, fontStyle: 'italic' },
  textoAjuda: { color: '#888', fontSize: 12, marginTop: -6, marginBottom: 12, lineHeight: 16 },

  cardLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  botaoIcone: { padding: 6 },

  linhaTituloFunil: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  badgeAlerta: { backgroundColor: '#FFF3CD', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#F0DFA0' },
  badgeAlertaTexto: { fontSize: 11, fontWeight: '700', color: '#8A6D00' },
  funilRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  estagioCard: {
    minWidth: 90, flexGrow: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: '#F0F4F8', borderRadius: 12, borderWidth: 1, borderColor: '#D0D8DC',
  },
  estagioTotal: { fontSize: 22, fontWeight: 'bold', color: '#000' },
  estagioNome: { fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' },

  conversaoRow: { flexDirection: 'row', gap: 10 },
  conversaoCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: '#F0F4F8', borderRadius: 12, borderWidth: 1, borderColor: '#D0D8DC',
  },
  conversaoCardDestaque: { backgroundColor: '#000', borderColor: '#000' },

  linhaPessoa: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#32BCAD', alignItems: 'center', justifyContent: 'center',
  },
  avatarLetra: { color: '#fff', fontSize: 15, fontWeight: '700' },
  nomePessoa: { color: '#000', fontSize: 14, fontWeight: '600' },
  emailPessoa: { color: '#888', fontSize: 12, marginTop: 1 },
  badgePapel: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F0F4F8', borderRadius: 12 },
  badgePapelTexto: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 0.5 },

  cardReposicao: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  botaoFinalizar: { backgroundColor: '#0D47A1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  botaoFinalizarTexto: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});
