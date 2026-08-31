import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
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

  const [papel, setPapel] = useState<'DONO' | 'GESTOR' | 'PROFESSOR' | null>(null);
  const [diasNaoLetivos, setDiasNaoLetivos] = useState<any[]>([]);
  const [novaDataFeriado, setNovaDataFeriado] = useState('');
  const [novaDescricaoFeriado, setNovaDescricaoFeriado] = useState('');
  const [novoTipoFeriado, setNovoTipoFeriado] = useState<'FERIADO' | 'RECESSO'>('FERIADO');
  const [salvandoFeriado, setSalvandoFeriado] = useState(false);

  const [comunicados, setComunicados] = useState<any[]>([]);
  const [editandoComunicadoId, setEditandoComunicadoId] = useState<string | null>(null);
  const [tituloComunicado, setTituloComunicado] = useState('');
  const [corpoComunicado, setCorpoComunicado] = useState('');
  const [publicoComunicado, setPublicoComunicado] = useState<'ALUNOS' | 'PROFESSORES' | 'TODOS'>('ALUNOS');
  const [salvandoComunicado, setSalvandoComunicado] = useState(false);
  const [enviandoComunicadoId, setEnviandoComunicadoId] = useState<string | null>(null);

  const [salas, setSalas] = useState<any[]>([]);
  const [novoNomeSala, setNovoNomeSala] = useState('');
  const [criandoSala, setCriandoSala] = useState(false);

  const [produtos, setProdutos] = useState<any[]>([]);
  const [emprestimosAtivos, setEmprestimosAtivos] = useState<any[]>([]);
  const [novoNomeProduto, setNovoNomeProduto] = useState('');
  const [criandoProduto, setCriandoProduto] = useState(false);
  const [movProdutoId, setMovProdutoId] = useState<string | null>(null);
  const [movTipo, setMovTipo] = useState<'ENTRADA' | 'SAIDA' | 'EMPRESTIMO' | 'DEVOLUCAO'>('ENTRADA');
  const [movQuantidade, setMovQuantidade] = useState('1');
  const [movAlunoId, setMovAlunoId] = useState<string | null>(null);
  const [salvandoMovimentacao, setSalvandoMovimentacao] = useState(false);

  const [alunosVencendo, setAlunosVencendo] = useState<any[]>([]);
  const [selecaoRenovacao, setSelecaoRenovacao] = useState<Record<string, string>>({});
  const [renovando, setRenovando] = useState(false);

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

      const [resPerfil, resProfessores, resAlunos, resReposicoes, resFunil, resTarefas, resLinks, resConversao, resCalendario, resComunicados, resSalas, resProdutos, resEmprestimos, resVencendo] = await Promise.all([
        fetchComRetry(`${API_URL}/api/professor/perfil?professorId=${professorId}`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/reposicoes`, { headers }),
        fetchComRetry(`${API_URL}/api/funil/resumo`, { headers }),
        fetchComRetry(`${API_URL}/api/tarefas-lead`, { headers }),
        fetchComRetry(`${API_URL}/api/links-captacao`, { headers }),
        fetchComRetry(`${API_URL}/api/relatorios/conversao-experimental?de=${paraYYYYMMDD(trintaDiasAtras)}&ate=${paraYYYYMMDD(hoje)}`, { headers }),
        fetchComRetry(`${API_URL}/api/escola/calendario`, { headers }),
        fetchComRetry(`${API_URL}/api/comunicados`, { headers }),
        fetchComRetry(`${API_URL}/api/salas`, { headers }),
        fetchComRetry(`${API_URL}/api/produtos`, { headers }),
        fetchComRetry(`${API_URL}/api/estoque/emprestimos-ativos`, { headers }),
        fetchComRetry(`${API_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
      ]);

      if (resPerfil.ok) {
        const perfil = await resPerfil.json();
        setPacote(perfil.escola?.pacote || 'PACOTE_PROFESSOR');
        setPapel(perfil.papel || null);
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
      if (resCalendario.ok) setDiasNaoLetivos(await resCalendario.json());
      if (resComunicados.ok) setComunicados(await resComunicados.json());
      if (resSalas.ok) setSalas(await resSalas.json());
      if (resProdutos.ok) setProdutos(await resProdutos.json());
      if (resEmprestimos.ok) setEmprestimosAtivos(await resEmprestimos.json());
      if (resVencendo.ok) setAlunosVencendo(await resVencendo.json());
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

  const adicionarDiaNaoLetivo = async () => {
    const dataNorm = novaDataFeriado.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNorm) || !novaDescricaoFeriado.trim()) {
      Alert.alert('Atenção', 'Informe a data (AAAA-MM-DD) e uma descrição.');
      return;
    }
    setSalvandoFeriado(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/escola/calendario`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataNorm, descricao: novaDescricaoFeriado.trim(), tipo: novoTipoFeriado }),
      });
      const dados = await res.json();
      if (res.ok) {
        setNovaDataFeriado('');
        setNovaDescricaoFeriado('');
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível adicionar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoFeriado(false);
    }
  };

  const removerDiaNaoLetivo = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/escola/calendario/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível remover.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const limparFormComunicado = () => {
    setEditandoComunicadoId(null);
    setTituloComunicado('');
    setCorpoComunicado('');
    setPublicoComunicado('ALUNOS');
  };

  const editarComunicado = (c: any) => {
    setEditandoComunicadoId(c.id);
    setTituloComunicado(c.titulo);
    setCorpoComunicado(c.corpo);
    setPublicoComunicado(c.publico);
  };

  const salvarComunicado = async () => {
    if (!tituloComunicado.trim() || !corpoComunicado.trim()) {
      Alert.alert('Atenção', 'Preencha título e texto do comunicado.');
      return;
    }
    setSalvandoComunicado(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const url = editandoComunicadoId ? `${API_URL}/api/comunicados/${editandoComunicadoId}` : `${API_URL}/api/comunicados`;
      const res = await fetchComRetry(url, {
        method: editandoComunicadoId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: tituloComunicado.trim(), corpo: corpoComunicado.trim(), publico: publicoComunicado }),
      });
      const dados = await res.json();
      if (res.ok) {
        limparFormComunicado();
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível salvar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoComunicado(false);
    }
  };

  const apagarComunicado = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/comunicados/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (editandoComunicadoId === id) limparFormComunicado();
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível apagar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const duplicarComunicado = async (id: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/comunicados/${id}/duplicar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        carregarDados();
      } else {
        const dados = await res.json();
        Alert.alert('Erro', dados.erro || 'Não foi possível duplicar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const enviarComunicadoConfirmado = async (id: string) => {
    setEnviandoComunicadoId(id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/comunicados/${id}/enviar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Enviado!', dados.mensagem);
        carregarDados();
      } else {
        Alert.alert('Não foi possível enviar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoComunicadoId(null);
    }
  };

  const confirmarEnvioComunicado = (id: string, publico: string) => {
    Alert.alert(
      'Enviar comunicado?',
      `Isso envia o e-mail pra ${publico === 'TODOS' ? 'todos os alunos e professores' : publico === 'ALUNOS' ? 'todos os alunos' : 'todos os professores'} da escola. Depois de enviado, não dá pra desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', style: 'destructive', onPress: () => enviarComunicadoConfirmado(id) },
      ]
    );
  };

  const criarSala = async () => {
    if (!novoNomeSala.trim()) {
      Alert.alert('Atenção', 'Informe o nome da sala.');
      return;
    }
    setCriandoSala(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/salas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNomeSala.trim() }),
      });
      const dados = await res.json();
      if (res.ok) {
        setNovoNomeSala('');
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível criar a sala.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoSala(false);
    }
  };

  const abrirCartazSala = async (salaId: string) => {
    await WebBrowser.openBrowserAsync(`${API_URL}/api/salas/${salaId}/cartaz`);
  };

  const criarProduto = async () => {
    if (!novoNomeProduto.trim()) {
      Alert.alert('Atenção', 'Informe o nome do produto.');
      return;
    }
    setCriandoProduto(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/produtos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNomeProduto.trim() }),
      });
      const dados = await res.json();
      if (res.ok) {
        setNovoNomeProduto('');
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível criar o produto.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoProduto(false);
    }
  };

  const abrirMovimentacao = (produtoId: string) => {
    setMovProdutoId(produtoId);
    setMovTipo('ENTRADA');
    setMovQuantidade('1');
    setMovAlunoId(null);
  };

  const registrarMovimentacao = async () => {
    const quantidade = parseInt(movQuantidade, 10);
    if (!movProdutoId || !Number.isInteger(quantidade) || quantidade <= 0) {
      Alert.alert('Atenção', 'Informe uma quantidade válida.');
      return;
    }
    if ((movTipo === 'EMPRESTIMO' || movTipo === 'DEVOLUCAO') && !movAlunoId) {
      Alert.alert('Atenção', 'Selecione o aluno.');
      return;
    }
    setSalvandoMovimentacao(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/produtos/${movProdutoId}/movimentacoes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: movTipo, quantidade, alunoId: movAlunoId }),
      });
      const dados = await res.json();
      if (res.ok) {
        setMovProdutoId(null);
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível registrar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoMovimentacao(false);
    }
  };

  const alternarSelecaoRenovacao = (aluno: any) => {
    setSelecaoRenovacao((atual) => {
      const novo = { ...atual };
      if (novo[aluno.id] !== undefined) {
        delete novo[aluno.id];
      } else {
        novo[aluno.id] = String(aluno.valorMensalidade || '');
      }
      return novo;
    });
  };

  const confirmarRenovacaoLote = () => {
    const ids = Object.keys(selecaoRenovacao);
    if (!ids.length) {
      Alert.alert('Atenção', 'Selecione ao menos um aluno.');
      return;
    }
    Alert.alert(
      'Renovar matrículas?',
      `${ids.length} aluno(s) selecionado(s) — o contrato de cada um reinicia a partir de hoje com o valor informado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Renovar', onPress: renovarLote },
      ]
    );
  };

  const renovarLote = async () => {
    const renovacoes = Object.entries(selecaoRenovacao).map(([alunoId, valor]) => ({
      alunoId,
      novoValorMensalidade: parseFloat(valor.replace(',', '.')),
    }));
    if (renovacoes.some((r) => !r.novoValorMensalidade || r.novoValorMensalidade <= 0)) {
      Alert.alert('Atenção', 'Todo aluno selecionado precisa de um valor válido.');
      return;
    }
    setRenovando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/renovacoes/lote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovacoes }),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Feito!', dados.mensagem);
        setSelecaoRenovacao({});
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível renovar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setRenovando(false);
    }
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
        <Text style={styles.secaoTitulo}>Calendário da Escola</Text>
        <Text style={styles.textoAjuda}>
          Feriados e recessos bloqueiam automaticamente o agendamento de aula avulsa nesse dia.
        </Text>

        {(papel === 'DONO' || papel === 'GESTOR') && (
          <View style={styles.cardForm}>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#aaa"
              value={novaDataFeriado}
              onChangeText={setNovaDataFeriado}
            />
            <TextInput
              style={styles.input}
              placeholder="Descrição (ex: Feriado municipal)"
              placeholderTextColor="#aaa"
              value={novaDescricaoFeriado}
              onChangeText={setNovaDescricaoFeriado}
            />
            <View style={styles.papelRow}>
              {(['FERIADO', 'RECESSO'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chipPapel, novoTipoFeriado === t && styles.chipPapelAtivo]}
                  onPress={() => setNovoTipoFeriado(t)}
                >
                  <Text style={[styles.textoChip, novoTipoFeriado === t && { color: '#fff' }]}>
                    {t === 'FERIADO' ? 'Feriado' : 'Recesso'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.botaoConvidar, salvandoFeriado && { opacity: 0.6 }]}
              onPress={adicionarDiaNaoLetivo}
              disabled={salvandoFeriado}
            >
              {salvandoFeriado ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoConvidarTexto}>Adicionar ao calendário</Text>}
            </TouchableOpacity>
          </View>
        )}

        {diasNaoLetivos.length === 0 ? (
          <Text style={styles.textoVazio}>Nenhum feriado ou recesso cadastrado.</Text>
        ) : (
          diasNaoLetivos.map((d) => (
            <View key={d.id} style={styles.cardReposicao}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>
                  {new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} · {d.tipo === 'FERIADO' ? 'Feriado' : 'Recesso'}
                </Text>
                <Text style={styles.emailPessoa}>{d.descricao}</Text>
              </View>
              {(papel === 'DONO' || papel === 'GESTOR') && (
                <TouchableOpacity style={styles.botaoIcone} onPress={() => removerDiaNaoLetivo(d.id)}>
                  <Ionicons name="trash-outline" size={18} color="#B00020" />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {(papel === 'DONO' || papel === 'GESTOR') && (
        <View style={styles.secaoLista}>
          <Text style={styles.secaoTitulo}>Comunicados</Text>
          <Text style={styles.textoAjuda}>
            Broadcast por e-mail pra escola toda. Rascunho edita/apaga livre — depois de enviado, não dá pra desfazer.
          </Text>

          <View style={styles.cardForm}>
            <TextInput
              style={styles.input}
              placeholder="Título"
              placeholderTextColor="#aaa"
              value={tituloComunicado}
              onChangeText={setTituloComunicado}
            />
            <TextInput
              style={[styles.input, { height: 90, paddingTop: 12, textAlignVertical: 'top' }]}
              placeholder="Texto do comunicado"
              placeholderTextColor="#aaa"
              value={corpoComunicado}
              onChangeText={setCorpoComunicado}
              multiline
            />
            <View style={styles.papelRow}>
              {(['ALUNOS', 'PROFESSORES', 'TODOS'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chipPapel, publicoComunicado === p && styles.chipPapelAtivo]}
                  onPress={() => setPublicoComunicado(p)}
                >
                  <Text style={[styles.textoChip, publicoComunicado === p && { color: '#fff' }]}>
                    {p === 'ALUNOS' ? 'Alunos' : p === 'PROFESSORES' ? 'Professores' : 'Todos'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {editandoComunicadoId && (
                <TouchableOpacity style={[styles.botaoConvidar, { flex: 1, backgroundColor: '#888' }]} onPress={limparFormComunicado}>
                  <Text style={styles.botaoConvidarTexto}>Cancelar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.botaoConvidar, { flex: 1 }, salvandoComunicado && { opacity: 0.6 }]}
                onPress={salvarComunicado}
                disabled={salvandoComunicado}
              >
                {salvandoComunicado ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoConvidarTexto}>{editandoComunicadoId ? 'Salvar alterações' : 'Salvar rascunho'}</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {comunicados.length === 0 ? (
            <Text style={styles.textoVazio}>Nenhum comunicado ainda.</Text>
          ) : (
            comunicados.map((c) => (
              <View key={c.id} style={styles.cardComunicado}>
                <View style={styles.linhaTituloFunil}>
                  <Text style={styles.nomePessoa}>{c.titulo}</Text>
                  <View style={[styles.badgeStatus, c.status === 'ENVIADO' && styles.badgeStatusEnviado]}>
                    <Text style={styles.badgeStatusTexto}>{c.status === 'ENVIADO' ? 'Enviado' : 'Rascunho'}</Text>
                  </View>
                </View>
                <Text style={styles.emailPessoa} numberOfLines={2}>{c.corpo}</Text>
                <Text style={[styles.emailPessoa, { marginTop: 4 }]}>
                  {c.publico === 'ALUNOS' ? 'Alunos' : c.publico === 'PROFESSORES' ? 'Professores' : 'Todos'} · {c.autor?.nome}
                </Text>
                <View style={styles.acoesComunicado}>
                  {c.status === 'RASCUNHO' ? (
                    <>
                      <TouchableOpacity onPress={() => editarComunicado(c)}>
                        <Text style={styles.linkAcao}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => apagarComunicado(c.id)}>
                        <Text style={[styles.linkAcao, { color: '#B00020' }]}>Apagar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => confirmarEnvioComunicado(c.id, c.publico)}
                        disabled={enviandoComunicadoId === c.id}
                      >
                        {enviandoComunicadoId === c.id
                          ? <SyncLoader color="#000000" />
                          : <Text style={[styles.linkAcao, { color: '#0D47A1', fontWeight: 'bold' }]}>Enviar</Text>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => duplicarComunicado(c.id)}>
                      <Text style={styles.linkAcao}>Duplicar pra reenviar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
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

      <View style={styles.secaoLista}>
        <Text style={styles.secaoTitulo}>Salas</Text>
        <Text style={styles.textoAjuda}>
          Cada sala pode ter um cartaz com QR Code — professor e aluno escaneiam pra confirmar presença sem toque manual.
        </Text>

        <View style={[styles.papelRow, { alignItems: 'center' }]}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Nome da sala"
            placeholderTextColor="#aaa"
            value={novoNomeSala}
            onChangeText={setNovoNomeSala}
          />
          <TouchableOpacity
            style={[styles.botaoFinalizar, criandoSala && { opacity: 0.6 }]}
            onPress={criarSala}
            disabled={criandoSala}
          >
            {criandoSala ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoFinalizarTexto}>Criar</Text>}
          </TouchableOpacity>
        </View>

        {salas.length === 0 ? (
          <Text style={[styles.textoVazio, { marginTop: 12 }]}>Nenhuma sala cadastrada.</Text>
        ) : (
          salas.map((s) => (
            <View key={s.id} style={styles.linhaPessoa}>
              <View style={styles.avatarFallback}>
                <Ionicons name="business-outline" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomePessoa}>{s.nome}</Text>
                {!s.ativa && <Text style={styles.emailPessoa}>Inativa</Text>}
              </View>
              <TouchableOpacity style={styles.botaoIcone} onPress={() => abrirCartazSala(s.id)}>
                <Ionicons name="qr-code-outline" size={20} color="#32BCAD" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.secaoLista}>
        <Text style={styles.secaoTitulo}>Estoque</Text>

        <View style={[styles.papelRow, { alignItems: 'center' }]}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Nome do produto"
            placeholderTextColor="#aaa"
            value={novoNomeProduto}
            onChangeText={setNovoNomeProduto}
          />
          <TouchableOpacity
            style={[styles.botaoFinalizar, criandoProduto && { opacity: 0.6 }]}
            onPress={criarProduto}
            disabled={criandoProduto}
          >
            {criandoProduto ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoFinalizarTexto}>Criar</Text>}
          </TouchableOpacity>
        </View>

        {produtos.length === 0 ? (
          <Text style={[styles.textoVazio, { marginTop: 12 }]}>Nenhum produto cadastrado.</Text>
        ) : (
          produtos.map((p) => (
            <View key={p.id}>
              <TouchableOpacity style={styles.linhaPessoa} onPress={() => abrirMovimentacao(p.id)}>
                <View style={styles.avatarFallback}>
                  <Ionicons name="cube-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nomePessoa}>{p.nome}</Text>
                </View>
                <View style={styles.badgePapel}>
                  <Text style={styles.badgePapelTexto}>{p.quantidadeEstoque} em estoque</Text>
                </View>
              </TouchableOpacity>

              {movProdutoId === p.id && (
                <View style={styles.cardForm}>
                  <View style={styles.papelRow}>
                    {(['ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.chipPapel, movTipo === t && styles.chipPapelAtivo]}
                        onPress={() => setMovTipo(t)}
                      >
                        <Text style={[styles.textoChip, movTipo === t && { color: '#fff' }]}>
                          {t === 'ENTRADA' ? 'Entrada' : t === 'SAIDA' ? 'Saída' : t === 'EMPRESTIMO' ? 'Empréstimo' : 'Devolução'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Quantidade"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                    value={movQuantidade}
                    onChangeText={setMovQuantidade}
                  />
                  {(movTipo === 'EMPRESTIMO' || movTipo === 'DEVOLUCAO') && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      {alunos.map((a) => (
                        <TouchableOpacity
                          key={a.id}
                          style={[styles.chipPapel, { marginRight: 8 }, movAlunoId === a.id && styles.chipPapelAtivo]}
                          onPress={() => setMovAlunoId(a.id)}
                        >
                          <Text style={[styles.textoChip, movAlunoId === a.id && { color: '#fff' }]}>{a.nome}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[styles.botaoConvidar, { flex: 1, backgroundColor: '#888' }]} onPress={() => setMovProdutoId(null)}>
                      <Text style={styles.botaoConvidarTexto}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.botaoConvidar, { flex: 1 }, salvandoMovimentacao && { opacity: 0.6 }]}
                      onPress={registrarMovimentacao}
                      disabled={salvandoMovimentacao}
                    >
                      {salvandoMovimentacao ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoConvidarTexto}>Confirmar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))
        )}

        {emprestimosAtivos.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.textoAjuda}>Empréstimos ativos</Text>
            {emprestimosAtivos.map((e, i) => (
              <Text key={i} style={styles.emailPessoa}>{e.alunoNome} está com {e.saldo}x {e.produtoNome}</Text>
            ))}
          </View>
        )}
      </View>

      {(papel === 'DONO' || papel === 'GESTOR') && alunosVencendo.length > 0 && (
        <View style={styles.secaoLista}>
          <Text style={styles.secaoTitulo}>Renovação de matrícula ({alunosVencendo.length})</Text>
          <Text style={styles.textoAjuda}>Contratos vencendo nos próximos 30 dias. Selecione, ajuste o valor e renove de uma vez.</Text>

          {alunosVencendo.map((a) => {
            const selecionado = selecaoRenovacao[a.id] !== undefined;
            return (
              <View key={a.id} style={styles.cardReposicao}>
                <TouchableOpacity onPress={() => alternarSelecaoRenovacao(a)}>
                  <Ionicons name={selecionado ? 'checkbox' : 'square-outline'} size={22} color={selecionado ? '#000' : '#999'} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.nomePessoa}>{a.nome}</Text>
                  <Text style={styles.emailPessoa}>
                    {a.diasRestantes < 0 ? `Venceu há ${Math.abs(a.diasRestantes)} dia(s)` : `Vence em ${a.diasRestantes} dia(s)`}
                  </Text>
                </View>
                {selecionado && (
                  <TextInput
                    style={[styles.input, { width: 90, marginBottom: 0, height: 40 }]}
                    keyboardType="numeric"
                    value={selecaoRenovacao[a.id]}
                    onChangeText={(v) => setSelecaoRenovacao((atual) => ({ ...atual, [a.id]: v }))}
                  />
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.botaoConvidar, { marginTop: 12 }, renovando && { opacity: 0.6 }]}
            onPress={confirmarRenovacaoLote}
            disabled={renovando}
          >
            {renovando ? <SyncLoader color="#ffffff" /> : <Text style={styles.botaoConvidarTexto}>Renovar selecionados ({Object.keys(selecaoRenovacao).length})</Text>}
          </TouchableOpacity>
        </View>
      )}

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

  cardComunicado: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  badgeStatus: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F0F4F8', borderRadius: 12 },
  badgeStatusEnviado: { backgroundColor: '#E8F8F6' },
  badgeStatusTexto: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 0.5 },
  acoesComunicado: { flexDirection: 'row', gap: 20, marginTop: 10 },
  linkAcao: { fontSize: 13, fontWeight: '600', color: '#555' },
});
