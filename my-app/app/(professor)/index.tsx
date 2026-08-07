import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import ProfileFooter from '../../components/ProfileFooter';
import { CORES } from '../../constants/theme';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HORARIOS = [
  '07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00',
];
const OPCOES_CONTRATO = [3, 6, 12, 24];
type Recorrencia = 'SEMANAL' | 'QUINZENAL' | 'MENSAL';
type TipoConteudo = 'TEXTO' | 'LINK' | 'VIDEO' | 'IMAGEM' | 'ARQUIVO' | 'AUDIO';

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  dadosExtra: string | null;
  createdAt: string;
}

function corPresenca(p: string | null) {
  switch (p) {
    case 'PRESENTE':            return { bg: '#E8F5E9', text: '#2E7D32' };
    case 'AUSENCIA_PROFESSOR':  return { bg: '#FFF3E0', text: '#E65100' };
    case 'AUSENCIA_ALUNO':      return { bg: '#FBE9E7', text: '#BF360C' };
    case 'PENDENTE_REPOSICAO':  return { bg: '#EDE7F6', text: '#4527A0' };
    default:                    return { bg: CORES.superficie, text: CORES.secundaria };
  }
}

function labelPresenca(p: string | null) {
  switch (p) {
    case 'PRESENTE':           return 'Presente';
    case 'AUSENCIA_PROFESSOR': return 'Aus. Professor';
    case 'AUSENCIA_ALUNO':     return 'Aus. Aluno';
    case 'PENDENTE_REPOSICAO': return 'Pend. Reposição';
    default:                   return '';
  }
}

export default function ProfessorDashboard() {
  const router = useRouter();
  const navigation = useNavigation();
  const [aulasHoje, setAulasHoje]             = useState<any[]>([]);
  const [codigoConvite, setCodigoConvite]     = useState('...');
  const [carregando, setCarregando]           = useState(true);
  const [erroCarga, setErroCarga]             = useState(false);
  const [alunosPendentes, setAlunosPendentes] = useState<any[]>([]);
  const [professorId, setProfessorId]         = useState('');

  // — Modal de configuração —
  const [modalConfigVisible, setModalConfigVisible] = useState(false);
  const [alunoSelecionado, setAlunoSelecionado]     = useState<any | null>(null);
  const [valorMensalidade, setValorMensalidade]     = useState('');
  const [diaCobranca, setDiaCobranca]               = useState('');
  const [horarioAula, setHorarioAula]               = useState('08:00');
  const [diaSemana, setDiaSemana]                   = useState(1);
  const [recorrencia, setRecorrencia]               = useState<Recorrencia>('SEMANAL');
  const [tempoContrato, setTempoContrato]           = useState(6);
  const [salvando, setSalvando]                     = useState(false);

  // — Modal de presença —
  const [modalPresencaVisible, setModalPresencaVisible] = useState(false);
  const [aulaParaRegistro, setAulaParaRegistro]         = useState<any | null>(null);
  const [salvandoPresenca, setSalvandoPresenca]         = useState(false);

  // — Inline forms para materiais —
  const [textoTitulo, setTextoTitulo]       = useState('');
  const [textoConteudo, setTextoConteudo]   = useState('');
  const [linkTitulo, setLinkTitulo]         = useState('');
  const [linkUrl, setLinkUrl]               = useState('');
  const [showTextoForm, setShowTextoForm]   = useState(false);
  const [showLinkForm, setShowLinkForm]     = useState(false);

  // — Notificações —
  const [notificacoes, setNotificacoes]       = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas]               = useState(0);
  const [modalNotifVisible, setModalNotifVisible] = useState(false);

  // — Perfil (foto + nome para o footer) —
  const [nomeProf, setNomeProf]   = useState('');
  const [fotoProf, setFotoProf]   = useState<string | null>(null);

  // — Upload em lote —
  const [loteItens, setLoteItens] = useState<{ titulo: string; tipo: TipoConteudo; conteudo: string; nome: string }[]>([]);
  const [enviandoLote, setEnviandoLote] = useState(false);

  const carregarProfessorId = async () => {
    const id = (await SecureStore.getItemAsync('kav_professor_id') || '').trim();
    setProfessorId(id);
    return id;
  };

  const carregarDashboard = useCallback(async () => {
    setErroCarga(false);
    setCarregando(true);
    try {
      const token  = await SecureStore.getItemAsync('kav_token');
      const id     = await carregarProfessorId();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      // Carrega do cache para o footer aparecer mesmo com backend lento
      const nomeCache = await SecureStore.getItemAsync('kav_cache_prof_nome');
      const fotoCache = await SecureStore.getItemAsync('kav_cache_prof_foto');
      if (nomeCache) setNomeProf(nomeCache);
      if (fotoCache) setFotoProf(fotoCache);

      const [respostaDash, respostaPendentes, respostaNotif, respostaPerfil] = await Promise.all([
        fetchComRetry(`${API_URL}/api/dashboard?professorId=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }),
        fetchComRetry(`${API_URL}/api/alunos-pendentes?professorId=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }),
        fetchComRetry(`${API_URL}/api/professor/notificacoes?professorId=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }),
        fetchComRetry(`${API_URL}/api/professor/perfil?professorId=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }),
      ]);

      clearTimeout(timeout);

      if (respostaDash.ok) {
        const dados = await respostaDash.json();
        setAulasHoje((dados.aulasHoje || []).filter((a: any) => a.aluno?.status !== 'INATIVO'));
        setCodigoConvite(dados.codigoConvite || 'SEM CÓDIGO');
      } else if (respostaDash.status === 401) {
        await SecureStore.deleteItemAsync('kav_token');
        await SecureStore.deleteItemAsync('kav_professor_id');
        await SecureStore.deleteItemAsync('kav_papel');
        router.replace('/login');
        return;
      } else {
        setCodigoConvite('');
        setErroCarga(true);
      }
      if (respostaPendentes.ok) {
        const pendentes = await respostaPendentes.json();
        setAlunosPendentes(Array.isArray(pendentes) ? pendentes : []);
      }
      if (respostaNotif.ok) {
        const { notificacoes: lista, naoLidas: count } = await respostaNotif.json();
        setNotificacoes(lista || []);
        setNaoLidas(count || 0);
      }
      if (respostaPerfil.ok) {
        const p = await respostaPerfil.json();
        setNomeProf(p.nome || nomeCache || '');
        setFotoProf(p.fotoUrl || null);
        if (p.nome) SecureStore.setItemAsync('kav_cache_prof_nome', p.nome);
        if (p.fotoUrl) SecureStore.setItemAsync('kav_cache_prof_foto', p.fotoUrl);
      }
    } catch (err: any) {
      console.error("Erro no dashboard:", err);
      setCodigoConvite('');
      setErroCarga(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDashboard(); }, [carregarDashboard]));

  // — Abrir modal presença —
  const abrirModalPresenca = (aula: any) => {
    setAulaParaRegistro(aula);
    setLoteItens([]);
    setTextoTitulo('');
    setTextoConteudo('');
    setLinkTitulo('');
    setLinkUrl('');
    setShowTextoForm(false);
    setShowLinkForm(false);
    setModalPresencaVisible(true);
  };

  // — Registrar presença —
  const registrarPresenca = async (presenca: string) => {
    if (!aulaParaRegistro) return;
    setSalvandoPresenca(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/aulas/${aulaParaRegistro.id}/registrar-presenca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ presenca, professorId }),
      });
      if (res.ok) {
        setAulasHoje(prev =>
          prev.map(a => a.id === aulaParaRegistro.id ? { ...a, presenca } : a)
        );
        setModalPresencaVisible(false);
        const labels: Record<string, string> = {
          PRESENTE: 'Presença registrada!',
          AUSENCIA_PROFESSOR: 'Ausência do professor registrada.',
          AUSENCIA_ALUNO: 'Ausência do aluno registrada.',
          PENDENTE_REPOSICAO: 'Aula marcada como pendente de reposição.',
        };
        Alert.alert('Registrado!', labels[presenca] || 'Registro salvo.');
      } else {
        Alert.alert('Erro', 'Não foi possível registrar.');
      }
    } catch {
      Alert.alert('Erro de Conexão', 'Verifique sua conexão.');
    } finally {
      setSalvandoPresenca(false);
    }
  };


  // — Modal de configuração —
  const abrirModalConfig = (aluno: any) => {
    setAlunoSelecionado(aluno);
    setValorMensalidade('');
    setDiaCobranca('');
    setHorarioAula('08:00');
    setDiaSemana(1);
    setRecorrencia('SEMANAL');
    setTempoContrato(6);
    setModalConfigVisible(true);
  };

  const recusarSolicitacao = (aluno: any) => {
    Alert.alert(
      'Recusar solicitação',
      `Deseja recusar o cadastro de ${aluno.nome}? Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync('kav_token');
              const res = await fetchComRetry(`${API_URL}/api/alunos/${aluno.id}/cancelar`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                setAlunosPendentes(prev => prev.filter(a => a.id !== aluno.id));
              } else {
                Alert.alert('Erro', 'Não foi possível recusar a solicitação.');
              }
            } catch {
              Alert.alert('Erro de Conexão', 'Verifique sua conexão.');
            }
          },
        },
      ]
    );
  };

  const salvarConfiguracao = async (alunoIdOverride?: string) => {
    if (!valorMensalidade || !diaCobranca) {
      Alert.alert("Atenção", "Preencha o valor da mensalidade e o dia de cobrança.");
      return;
    }
    const valor = parseFloat(valorMensalidade.replace(',', '.'));
    const dia   = parseInt(diaCobranca);
    if (isNaN(valor) || valor <= 0) { Alert.alert("Atenção", "Informe um valor válido."); return; }
    if (isNaN(dia) || dia < 1 || dia > 31) { Alert.alert("Atenção", "Dia de cobrança entre 1 e 31."); return; }

    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/configurar-aluno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          alunoId: alunoIdOverride ?? alunoSelecionado?.id,
          professorId,
          valorMensalidade: valor,
          diaCobranca: dia,
          horarioAula,
          diaSemana,
          recorrencia,
          tempoContrato,
        }),
      });

      const dados = await resposta.json();
      if (resposta.ok) {
        Alert.alert(
          "Configurado!",
          `Aulas geradas: ${dados.aulasGeradas ?? 0} | Cobranças: ${dados.cobrancasGeradas ?? 0}`
        );
        setModalConfigVisible(false);
        setAlunosPendentes(prev => prev.filter(a => a.id !== (alunoIdOverride ?? alunoSelecionado?.id)));
        carregarDashboard();
      } else {
        Alert.alert("Erro", dados.erro || "Não foi possível salvar.");
      }
    } catch {
      Alert.alert("Erro de Conexão", "Verifique sua conexão.");
    } finally {
      setSalvando(false);
    }
  };

  // — Renovar contrato a partir de notificação —
  const abrirRenovacao = (notif: Notificacao) => {
    try {
      const extra = notif.dadosExtra ? JSON.parse(notif.dadosExtra) : {};
      const alunoMock = { id: extra.alunoId, nome: extra.alunoNome || 'Aluno' };
      setAlunoSelecionado(alunoMock);
      setValorMensalidade('');
      setDiaCobranca('');
      setHorarioAula('08:00');
      setDiaSemana(1);
      setRecorrencia('SEMANAL');
      setTempoContrato(6);
      setModalNotifVisible(false);
      setModalConfigVisible(true);
      marcarLida(notif.id);
    } catch {
      Alert.alert("Erro", "Não foi possível abrir renovação.");
    }
  };

  const marcarLida = async (notifId: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      await fetchComRetry(`${API_URL}/api/professor/notificacoes/${notifId}/lida`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotificacoes(prev => prev.map(n => n.id === notifId ? { ...n, lida: true } : n));
      setNaoLidas(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const marcarTodasLidas = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      await fetchComRetry(`${API_URL}/api/professor/notificacoes/todas-lidas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ professorId }),
      });
      setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
      setNaoLidas(0);
    } catch {}
  };

  const excluirNotificacao = (notif: Notificacao) => {
    Alert.alert(
      'Excluir notificação',
      'Deseja remover esta notificação do histórico?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync('kav_token');
              await fetchComRetry(`${API_URL}/api/professor/notificacoes/${notif.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              setNotificacoes(prev => prev.filter(n => n.id !== notif.id));
              if (!notif.lida) setNaoLidas(prev => Math.max(0, prev - 1));
            } catch {
              Alert.alert('Erro de Conexão', 'Não foi possível excluir a notificação.');
            }
          },
        },
      ]
    );
  };

  const apagarTodasNotificacoes = () => {
    if (notificacoes.length === 0) return;
    Alert.alert(
      'Apagar histórico',
      'Deseja apagar todas as notificações do histórico? Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync('kav_token');
              await fetchComRetry(`${API_URL}/api/professor/notificacoes?professorId=${professorId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              setNotificacoes([]);
              setNaoLidas(0);
            } catch {
              Alert.alert('Erro de Conexão', 'Não foi possível apagar o histórico.');
            }
          },
        },
      ]
    );
  };

  const fazerLogout = async () => {
    await SecureStore.deleteItemAsync('kav_token');
    await SecureStore.deleteItemAsync('kav_professor_id');
    await SecureStore.deleteItemAsync('kav_papel');
    router.replace('/login');
  };

  // — Upload em lote: imagens —
  const selecionarImagensLote = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à galeria não autorizado.'); return; }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.6,
      base64: true,
    });
    if (resultado.canceled || !resultado.assets.length) return;
    const novos = resultado.assets
      .filter(a => a.base64)
      .map((a, i) => ({
        titulo: a.fileName?.replace(/\.[^.]+$/, '') || `Imagem ${i + 1}`,
        tipo: 'IMAGEM' as TipoConteudo,
        conteudo: `data:image/jpeg;base64,${a.base64}`,
        nome: a.fileName || `imagem_${i + 1}.jpg`,
      }));
    setLoteItens(prev => [...prev, ...novos]);
  };

  // — Upload em lote: documentos (PDF, doc, etc.) —
  const selecionarDocumentosLote = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (resultado.canceled || !resultado.assets?.length) return;
    const novos: typeof loteItens = [];
    for (const arquivo of resultado.assets) {
      try {
        const mime = arquivo.mimeType ?? 'application/octet-stream';
        const b64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: 'base64' });
        novos.push({
          titulo: arquivo.name.replace(/\.[^.]+$/, '') || arquivo.name,
          tipo: 'ARQUIVO',
          conteudo: `data:${mime};base64,${b64}`,
          nome: arquivo.name,
        });
      } catch {
        Alert.alert('Erro', `Não foi possível ler: ${arquivo.name}`);
      }
    }
    if (novos.length) setLoteItens(prev => [...prev, ...novos]);
  };

  // — Upload em lote: áudios —
  const selecionarAudiosLote = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: true });
    if (resultado.canceled || !resultado.assets?.length) return;
    const novos: typeof loteItens = [];
    for (const arquivo of resultado.assets) {
      try {
        const mime = arquivo.mimeType ?? 'audio/mpeg';
        const b64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: 'base64' });
        novos.push({
          titulo: arquivo.name.replace(/\.[^.]+$/, '') || arquivo.name,
          tipo: 'AUDIO',
          conteudo: `data:${mime};base64,${b64}`,
          nome: arquivo.name,
        });
      } catch {
        Alert.alert('Erro', `Não foi possível ler: ${arquivo.name}`);
      }
    }
    if (novos.length) setLoteItens(prev => [...prev, ...novos]);
  };

  // — Adicionar texto ao lote —
  const adicionarTextoLote = () => {
    if (!textoTitulo.trim() || !textoConteudo.trim()) {
      Alert.alert('Atenção', 'Preencha o título e o conteúdo do texto.');
      return;
    }
    setLoteItens(prev => [...prev, { titulo: textoTitulo.trim(), tipo: 'TEXTO', conteudo: textoConteudo.trim(), nome: textoTitulo.trim() }]);
    setTextoTitulo('');
    setTextoConteudo('');
    setShowTextoForm(false);
  };

  // — Adicionar link ao lote —
  const adicionarLinkLote = () => {
    if (!linkTitulo.trim() || !linkUrl.trim()) {
      Alert.alert('Atenção', 'Preencha o título e a URL do link.');
      return;
    }
    setLoteItens(prev => [...prev, { titulo: linkTitulo.trim(), tipo: 'LINK', conteudo: linkUrl.trim(), nome: linkTitulo.trim() }]);
    setLinkTitulo('');
    setLinkUrl('');
    setShowLinkForm(false);
  };

  // — Remover item do lote —
  const removerItemLote = (idx: number) => setLoteItens(prev => prev.filter((_, i) => i !== idx));

  // — Ícone por tipo de material —
  const iconeItemLote = (tipo: TipoConteudo): any => {
    switch (tipo) {
      case 'IMAGEM':  return 'image-outline';
      case 'AUDIO':   return 'musical-notes-outline';
      case 'ARQUIVO': return 'document-outline';
      case 'LINK':    return 'link-outline';
      case 'VIDEO':   return 'videocam-outline';
      default:        return 'document-text-outline';
    }
  };

  const enviarLote = async () => {
    if (!loteItens.length || !aulaParaRegistro) return;
    setEnviandoLote(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const materiais = loteItens.map(item => ({
        titulo: item.titulo,
        tipo: item.tipo,
        conteudo: (item.tipo === 'LINK' || item.tipo === 'VIDEO') ? null : item.conteudo,
        url:      (item.tipo === 'LINK' || item.tipo === 'VIDEO') ? item.conteudo : null,
      }));
      const res = await fetchComRetry(`${API_URL}/api/aulas/${aulaParaRegistro.id}/materiais-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ materiais, professorId }),
      });
      const dados = await res.json();
      if (res.ok) {
        setLoteItens([]);
        setModalPresencaVisible(false);
        Alert.alert('Enviado!', `${dados.criados} material(is) enviado(s) ao aluno.`);
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível enviar os materiais.');
      }
    } catch {
      Alert.alert('Erro de Conexão', 'Verifique sua conexão.');
    } finally {
      setEnviandoLote(false);
    }
  };

  const codigoValido = (c: string) => !!c && c !== '...' && !c.includes(' ');

  const copiarCodigo = async () => {
    if (!codigoValido(codigoConvite)) {
      Alert.alert("Indisponível", "O código de convite ainda não está disponível. Aguarde o carregamento ou reabra o app.");
      return;
    }
    await Clipboard.setStringAsync(codigoConvite);
    Alert.alert("Copiado!", "Código copiado para a área de transferência.");
  };

  const compartilharCodigo = async () => {
    if (!codigoValido(codigoConvite)) {
      Alert.alert("Indisponível", "O código de convite ainda não está disponível.");
      return;
    }
    await Share.share({ message: `Olá! Use meu código no KAV-CLASS: ${codigoConvite}` });
  };

  const corNotif = (tipo: string) => {
    if (tipo === 'CONTRATO_EXPIRADO') return '#FFEBEE';
    if (tipo === 'CONTRATO_EXPIRANDO') return '#FFF8E1';
    return CORES.superficie;
  };
  const bordaNotif = (tipo: string) => {
    if (tipo === 'CONTRATO_EXPIRADO') return CORES.erro;
    if (tipo === 'CONTRATO_EXPIRANDO') return CORES.aviso;
    return CORES.borda;
  };
  const iconeNotif = (tipo: string) => {
    if (tipo === 'CONTRATO_EXPIRADO') return 'alert-circle';
    if (tipo === 'CONTRATO_EXPIRANDO') return 'warning';
    return 'notifications';
  };
  const corIconeNotif = (tipo: string) => {
    if (tipo === 'CONTRATO_EXPIRADO') return CORES.erro;
    if (tipo === 'CONTRATO_EXPIRANDO') return CORES.aviso;
    return CORES.secundaria;
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color={CORES.acento} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <StatusBar style="dark" backgroundColor={CORES.fundo} />

        {/* — Cabeçalho — */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
            <Ionicons name="menu" size={24} color={CORES.primaria} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.saudacao}>Olá, Professor!</Text>
            <Text style={styles.dataHoje}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <View style={styles.cardCodigo}>
              <View style={{ flex: 1 }}>
                <Text style={styles.textoCodigoLabel}>CÓDIGO DE CONVITE</Text>
                {codigoConvite === '...' ? (
                  <SyncLoader size="small" color={CORES.acento} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                ) : (
                  <Text style={[
                    styles.textoCodigo,
                    !codigoValido(codigoConvite) && { color: CORES.secundaria, fontSize: 13, fontWeight: '400' },
                  ]}>
                    {codigoValido(codigoConvite) ? codigoConvite : 'Não disponível'}
                  </Text>
                )}
              </View>
              <View style={styles.botoesCodigoBox}>
                <TouchableOpacity style={styles.botaoAcaoIcone} onPress={copiarCodigo}>
                  <Ionicons name="copy-outline" size={20} color={codigoValido(codigoConvite) ? '#000' : CORES.secundaria} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.botaoAcaoIcone} onPress={compartilharCodigo}>
                  <Ionicons name="share-social-outline" size={20} color={codigoValido(codigoConvite) ? '#000' : CORES.secundaria} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.headerAcoes}>
            <TouchableOpacity style={styles.botaoSino} onPress={() => setModalNotifVisible(true)}>
              <Ionicons name="notifications-outline" size={24} color={CORES.primaria} />
              {naoLidas > 0 && (
                <View style={styles.badgeSino}>
                  <Text style={styles.textoBadgeSino}>{naoLidas > 9 ? '9+' : naoLidas}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.botaoSair} onPress={fazerLogout}>
              <Ionicons name="log-out-outline" size={24} color={CORES.erro} />
            </TouchableOpacity>
          </View>
        </View>

        {/* — Banner de erro de conexão com retry — */}
        {erroCarga && (
          <View style={styles.bannerErro}>
            <Ionicons name="cloud-offline-outline" size={20} color={CORES.aviso} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.bannerErroTitulo}>Servidor demorando para responder</Text>
              <Text style={styles.bannerErroSub}>
                O servidor pode estar acordando. Seus dados estão seguros — tente novamente.
              </Text>
            </View>
            <TouchableOpacity style={styles.botaoRetry} onPress={carregarDashboard}>
              <Ionicons name="refresh" size={18} color={CORES.fundo} />
            </TouchableOpacity>
          </View>
        )}

        {/* — Alunos pendentes — */}
        {alunosPendentes.length > 0 && (
          <View style={styles.secao}>
            <View style={styles.tituloSecaoRow}>
              <Ionicons name="notifications" size={18} color={CORES.aviso} />
              <Text style={[styles.tituloSecao, { color: CORES.aviso, marginBottom: 0, marginLeft: 6 }]}>
                Novos Alunos
              </Text>
              <View style={styles.badgeCount}>
                <Text style={styles.textoBadgeCount}>{alunosPendentes.length}</Text>
              </View>
            </View>
            {alunosPendentes.map((aluno) => (
              <View key={aluno.id} style={styles.cardNotificacao}>
                <View style={styles.notifIcone}>
                  <Ionicons name="person-add" size={22} color="#E65100" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifNome}>{aluno.nome}</Text>
                  <Text style={styles.notifSub}>Configure mensalidade e agenda</Text>
                </View>
                <TouchableOpacity style={styles.botaoConfigurar} onPress={() => abrirModalConfig(aluno)}>
                  <Text style={styles.textoBotaoConfigurar}>Configurar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.botaoRecusarNovoAluno}
                  onPress={() => recusarSolicitacao(aluno)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={CORES.erro} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* — Aulas de Hoje — */}
        <View style={styles.secao}>
          <View style={styles.tituloSecaoRow}>
            <Ionicons name="today-outline" size={16} color={CORES.acento} />
            <Text style={[styles.tituloSecao, { marginBottom: 0, marginLeft: 6 }]}>AULAS DE HOJE</Text>
            {aulasHoje.length > 0 && (
              <View style={[styles.badgeCount, { backgroundColor: CORES.acento, marginLeft: 8 }]}>
                <Text style={styles.textoBadgeCount}>{aulasHoje.length}</Text>
              </View>
            )}
          </View>

          {aulasHoje.length === 0 ? (
            <View style={styles.cardVazio}>
              <Ionicons name="calendar-outline" size={36} color={CORES.borda} />
              <Text style={[styles.textoVazio, { marginTop: 10 }]}>Nenhuma aula agendada para hoje.</Text>
            </View>
          ) : (
            aulasHoje.map((aula) => {
              const cor = corPresenca(aula.presenca);
              return (
                <TouchableOpacity
                  key={aula.id}
                  style={styles.cardAula}
                  onPress={() => abrirModalPresenca(aula)}
                  activeOpacity={0.75}
                >
                  <View style={styles.boxHorario}>
                    <Text style={styles.textoHora}>
                      {aula.aluno?.horarioAula || new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.textoData}>
                      {new Date(aula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nomeAluno}>{aula.aluno?.nome}</Text>
                    <Text style={styles.tipoAula}>{aula.tipo === 'REPOSICAO' ? 'Reposição' : 'Aula Regular'}</Text>
                    {aula.presenca ? (
                      <View style={[styles.badgePresencaCard, { backgroundColor: cor.bg }]}>
                        <Text style={[styles.textoBadgePresencaCard, { color: cor.text }]}>
                          {labelPresenca(aula.presenca)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.hintToque}>Toque para registrar</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={CORES.secundaria} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* — Acesso Rápido — */}
        <View style={styles.secao}>
          <Text style={styles.tituloSecao}>Acesso Rápido</Text>
          <View style={styles.gridAcessoRapido}>
            <TouchableOpacity style={styles.botaoAcesso} onPress={() => router.push('/(professor)/alunos')}>
              <Ionicons name="people" size={24} color="#000" />
              <Text style={styles.textoAcesso}>Alunos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botaoAcesso} onPress={() => router.push('/(professor)/pagamento')}>
              <Ionicons name="cash" size={24} color="#000" />
              <Text style={styles.textoAcesso}>Financeiro</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {nomeProf ? (
        <ProfileFooter
          nome={nomeProf}
          fotoUrl={fotoProf}
          onPress={() => router.push('/(professor)/perfil')}
        />
      ) : null}

      {/* ══ MODAL: NOTIFICAÇÕES ══════════════════════════════════════════════════ */}
      <Modal
        visible={modalNotifVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalNotifVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Notificações</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {naoLidas > 0 && (
                  <TouchableOpacity onPress={marcarTodasLidas}>
                    <Text style={styles.linkLidas}>Marcar todas lidas</Text>
                  </TouchableOpacity>
                )}
                {notificacoes.length > 0 && (
                  <TouchableOpacity onPress={apagarTodasNotificacoes} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={20} color={CORES.erro} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setModalNotifVisible(false)}>
                  <Ionicons name="close" size={24} color={CORES.primaria} />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={notificacoes}
              keyExtractor={(notif) => notif.id}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.cardVazio}>
                  <Ionicons name="notifications-off-outline" size={40} color="#ccc" />
                  <Text style={[styles.textoVazio, { marginTop: 10 }]}>Nenhuma notificação.</Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: 20 }} />}
              renderItem={({ item: notif }) => (
                <TouchableOpacity
                  style={[
                    styles.cardNotif,
                    { backgroundColor: corNotif(notif.tipo), borderColor: bordaNotif(notif.tipo) },
                    notif.lida && styles.cardNotifLida,
                  ]}
                  onPress={() => !notif.lida && marcarLida(notif.id)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name={iconeNotif(notif.tipo) as any} size={22} color={corIconeNotif(notif.tipo)} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tituloNotif, notif.lida && { color: '#999' }]}>{notif.titulo}</Text>
                      <Text style={[styles.msgNotif, notif.lida && { color: '#bbb' }]}>{notif.mensagem}</Text>
                      <Text style={styles.dataNotif}>
                        {new Date(notif.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {!notif.lida && <View style={styles.pontinhoNaoLido} />}
                    <TouchableOpacity
                      style={styles.botaoExcluirNotif}
                      onPress={() => excluirNotificacao(notif)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={CORES.secundaria} />
                    </TouchableOpacity>
                  </View>
                  {(notif.tipo === 'CONTRATO_EXPIRADO' || notif.tipo === 'CONTRATO_EXPIRANDO') && (
                    <TouchableOpacity style={styles.botaoRenovar} onPress={() => abrirRenovacao(notif)}>
                      <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
                      <Text style={styles.textoBotaoRenovar}>Renovar Contrato</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ══ MODAL: PRESENÇA / CONTEÚDO ═══════════════════════════════════════════ */}
      <Modal
        visible={modalPresencaVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalPresencaVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>Registrar Aula</Text>
                <Text style={styles.modalSub}>
                  {aulaParaRegistro?.aluno?.nome}
                  {aulaParaRegistro?.aluno?.horarioAula
                    ? ` · ${aulaParaRegistro.aluno.horarioAula}`
                    : aulaParaRegistro?.dataHora
                      ? ` · ${new Date(aulaParaRegistro.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalPresencaVisible(false)}>
                <Ionicons name="close" size={24} color={CORES.primaria} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* — Opções de presença — */}
              {[
                { presenca: 'PRESENTE',           icone: 'checkmark-circle' as const, cor: '#4CAF50', titulo: 'Presença',              desc: 'Aluno presente na aula' },
                { presenca: 'AUSENCIA_PROFESSOR',  icone: 'person-remove'    as const, cor: '#E65100', titulo: 'Ausência do Professor',  desc: 'Aula cancelada por ausência do professor' },
                { presenca: 'AUSENCIA_ALUNO',      icone: 'close-circle'     as const, cor: '#FF9800', titulo: 'Ausência do Aluno',      desc: 'Aluno não compareceu à aula' },
                { presenca: 'PENDENTE_REPOSICAO',  icone: 'refresh-circle'   as const, cor: '#7B1FA2', titulo: 'Remarcar',               desc: 'Aula pendente — reposição a agendar' },
              ].map((op) => (
                <TouchableOpacity
                  key={op.presenca}
                  style={[styles.botaoOpcaoPresenca, { borderColor: op.cor }]}
                  onPress={() => registrarPresenca(op.presenca)}
                  disabled={salvandoPresenca}
                >
                  {salvandoPresenca ? (
                    <SyncLoader size="small" color={op.cor} />
                  ) : (
                    <Ionicons name={op.icone} size={26} color={op.cor} />
                  )}
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={[styles.textoOpcaoPresenca, { color: op.cor }]}>{op.titulo}</Text>
                    <Text style={styles.descOpcaoPresenca}>{op.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={op.cor} />
                </TouchableOpacity>
              ))}

              {/* — Setor unificado de materiais — */}
              <Text style={styles.labelMateriais}>MATERIAIS DA AULA</Text>

              <View style={styles.rowTiposMaterial}>
                <TouchableOpacity style={styles.btnTipoMaterial} onPress={selecionarImagensLote}>
                  <Ionicons name="images" size={20} color={CORES.acento} />
                  <Text style={styles.txtTipoMaterial}>Imagens</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnTipoMaterial} onPress={selecionarDocumentosLote}>
                  <Ionicons name="document-text" size={20} color="#E65100" />
                  <Text style={styles.txtTipoMaterial}>Docs</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnTipoMaterial} onPress={selecionarAudiosLote}>
                  <Ionicons name="musical-notes" size={20} color="#7B1FA2" />
                  <Text style={styles.txtTipoMaterial}>Áudios</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnTipoMaterial}
                  onPress={() => { setShowTextoForm(v => !v); setShowLinkForm(false); }}
                >
                  <Ionicons name="document-text-outline" size={20} color={CORES.info} />
                  <Text style={styles.txtTipoMaterial}>Texto</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnTipoMaterial}
                  onPress={() => { setShowLinkForm(v => !v); setShowTextoForm(false); }}
                >
                  <Ionicons name="link-outline" size={20} color={CORES.sucesso} />
                  <Text style={styles.txtTipoMaterial}>Link</Text>
                </TouchableOpacity>
              </View>

              {showTextoForm && (
                <View style={styles.formInlineMaterial}>
                  <TextInput
                    style={styles.input}
                    placeholder="Título"
                    placeholderTextColor={CORES.secundaria}
                    value={textoTitulo}
                    onChangeText={setTextoTitulo}
                  />
                  <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 12, marginTop: 8 }]}
                    placeholder="Conteúdo do texto..."
                    placeholderTextColor={CORES.secundaria}
                    multiline
                    value={textoConteudo}
                    onChangeText={setTextoConteudo}
                  />
                  <TouchableOpacity style={styles.btnAdicionarInline} onPress={adicionarTextoLote}>
                    <Ionicons name="add-circle" size={16} color={CORES.info} />
                    <Text style={[styles.txBtnAdicionarInline, { color: CORES.info }]}>Adicionar Texto</Text>
                  </TouchableOpacity>
                </View>
              )}

              {showLinkForm && (
                <View style={styles.formInlineMaterial}>
                  <TextInput
                    style={styles.input}
                    placeholder="Título do link"
                    placeholderTextColor={CORES.secundaria}
                    value={linkTitulo}
                    onChangeText={setLinkTitulo}
                  />
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    placeholder="https://..."
                    placeholderTextColor={CORES.secundaria}
                    autoCapitalize="none"
                    keyboardType="url"
                    value={linkUrl}
                    onChangeText={setLinkUrl}
                  />
                  <TouchableOpacity style={styles.btnAdicionarInline} onPress={adicionarLinkLote}>
                    <Ionicons name="add-circle" size={16} color={CORES.sucesso} />
                    <Text style={[styles.txBtnAdicionarInline, { color: CORES.sucesso }]}>Adicionar Link</Text>
                  </TouchableOpacity>
                </View>
              )}

              {loteItens.map((item, idx) => (
                <View key={idx} style={styles.itemLoteRow}>
                  <Ionicons name={iconeItemLote(item.tipo)} size={16} color={CORES.secundaria} />
                  <Text style={styles.nomeItemLote} numberOfLines={1}>{item.titulo}</Text>
                  <TouchableOpacity onPress={() => removerItemLote(idx)}>
                    <Ionicons name="close-circle" size={18} color={CORES.erro} />
                  </TouchableOpacity>
                </View>
              ))}

              {loteItens.length > 0 && (
                <TouchableOpacity
                  style={[styles.botaoSalvar, enviandoLote && { opacity: 0.6 }, { marginTop: 12 }]}
                  onPress={enviarLote}
                  disabled={enviandoLote}
                >
                  {enviandoLote ? (
                    <SyncLoader color={CORES.fundo} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={20} color={CORES.fundo} />
                      <Text style={styles.textoBotaoSalvar}>Enviar {loteItens.length} Material(is)</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ MODAL: CONFIGURAR / RENOVAR ALUNO ═══════════════════════════════════ */}
      <Modal
        visible={modalConfigVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalConfigVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitulo}>Configurar Aluno</Text>
                <Text style={styles.modalSub}>{alunoSelecionado?.nome}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalConfigVisible(false)}>
                <Ionicons name="close" size={24} color={CORES.primaria} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.labelCampo}>Valor da Mensalidade (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 150,00"
                placeholderTextColor={CORES.secundaria}
                keyboardType="decimal-pad"
                value={valorMensalidade}
                onChangeText={setValorMensalidade}
              />

              <Text style={styles.labelCampo}>Dia de Cobrança (1 – 31)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 10"
                placeholderTextColor={CORES.secundaria}
                keyboardType="number-pad"
                maxLength={2}
                value={diaCobranca}
                onChangeText={setDiaCobranca}
              />

              <Text style={styles.labelCampo}>Dia da Aula</Text>
              <View style={styles.chipRow}>
                {DIAS_SEMANA.map((dia, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.chip, diaSemana === idx && styles.chipAtivo]}
                    onPress={() => setDiaSemana(idx)}
                  >
                    <Text style={[styles.textoChip, diaSemana === idx && styles.textoChipAtivo]}>{dia}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.labelCampo}>Horário da Aula</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {HORARIOS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.chip, horarioAula === h && styles.chipAtivo]}
                    onPress={() => setHorarioAula(h)}
                  >
                    <Text style={[styles.textoChip, horarioAula === h && styles.textoChipAtivo]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.labelCampo}>Recorrência</Text>
              <View style={styles.chipRowRecorrencia}>
                {(['SEMANAL', 'QUINZENAL', 'MENSAL'] as Recorrencia[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chipRecorrencia, recorrencia === r && styles.chipAtivo]}
                    onPress={() => setRecorrencia(r)}
                  >
                    <Text style={[styles.textoChip, recorrencia === r && styles.textoChipAtivo]}>
                      {r === 'SEMANAL' ? 'Toda semana' : r === 'QUINZENAL' ? 'A cada 15 dias' : 'Mensal'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.labelCampo}>Duração do Contrato</Text>
              <View style={styles.chipRow}>
                {OPCOES_CONTRATO.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, tempoContrato === m && styles.chipAtivo]}
                    onPress={() => setTempoContrato(m)}
                  >
                    <Text style={[styles.textoChip, tempoContrato === m && styles.textoChipAtivo]}>
                      {m === 12 ? '1 ano' : m === 24 ? '2 anos' : `${m} meses`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {valorMensalidade && diaCobranca ? (
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoTitulo}>Resumo do Contrato</Text>
                  <Text style={styles.resumoLinha}>📅  {DIAS_SEMANA[diaSemana]} às {horarioAula}</Text>
                  <Text style={styles.resumoLinha}>💰  R$ {valorMensalidade} · vence dia {diaCobranca}</Text>
                  <Text style={styles.resumoLinha}>
                    🔁  {recorrencia === 'SEMANAL' ? 'Toda semana' : recorrencia === 'QUINZENAL' ? 'A cada 15 dias' : 'Mensal'}
                  </Text>
                  <Text style={styles.resumoLinha}>
                    📋  {tempoContrato === 12 ? '1 ano' : tempoContrato === 24 ? '2 anos' : `${tempoContrato} meses`}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.botaoSalvar, salvando && { opacity: 0.6 }]}
                onPress={() => salvarConfiguracao()}
                disabled={salvando}
              >
                {salvando ? (
                  <SyncLoader color={CORES.fundo} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={CORES.fundo} />
                    <Text style={styles.textoBotaoSalvar}>Salvar e Gerar Calendário</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  hamburger: { padding: 4, marginTop: 2 },
  saudacao: { color: CORES.primaria, fontSize: 22, fontWeight: 'bold' },
  dataHoje: { color: CORES.secundaria, fontSize: 13, marginTop: 2 },
  cardCodigo: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: CORES.superficie, padding: 14, borderRadius: 10, marginTop: 14,
    borderWidth: 1, borderColor: CORES.borda,
  },
  textoCodigoLabel: { fontSize: 10, color: CORES.secundaria, fontWeight: 'bold', letterSpacing: 1.5 },
  textoCodigo: { fontSize: 18, fontWeight: 'bold', color: CORES.acento, fontFamily: 'monospace', letterSpacing: 2 },
  botoesCodigoBox: { flexDirection: 'row', gap: 8 },
  botaoAcaoIcone: { backgroundColor: CORES.borda, padding: 8, borderRadius: 6 },
  headerAcoes: { flexDirection: 'column', alignItems: 'center', gap: 8, marginLeft: 12 },
  botaoSino: { padding: 8, backgroundColor: CORES.superficie, borderRadius: 8, position: 'relative', borderWidth: 1, borderColor: CORES.borda },
  badgeSino: { position: 'absolute', top: 2, right: 2, backgroundColor: CORES.erro, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  textoBadgeSino: { color: CORES.primaria, fontSize: 10, fontWeight: 'bold' },
  botaoSair: { padding: 8, backgroundColor: '#FFEBEE', borderRadius: 8 },
  bannerErro: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E1', borderRadius: 12, padding: 14,
    marginHorizontal: 20, marginTop: 14, marginBottom: 4,
    borderWidth: 1, borderColor: '#FFE082', gap: 4,
  },
  bannerErroTitulo: { color: '#5D4037', fontWeight: 'bold', fontSize: 13 },
  bannerErroSub: { color: '#795548', fontSize: 11, marginTop: 2, lineHeight: 15 },
  botaoRetry: {
    backgroundColor: CORES.aviso, borderRadius: 8,
    padding: 8, marginLeft: 8,
  },
  secao: { paddingHorizontal: 20, marginBottom: 25, marginTop: 20 },
  tituloSecaoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tituloSecao: { fontSize: 11, fontWeight: 'bold', marginBottom: 10, color: CORES.secundaria, letterSpacing: 2 },
  badgeCount: { backgroundColor: CORES.aviso, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  textoBadgeCount: { color: CORES.fundo, fontSize: 11, fontWeight: 'bold' },
  cardNotificacao: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF4E5',
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FFD0A0', gap: 10,
  },
  notifIcone: { backgroundColor: '#FFE0B2', borderRadius: 20, padding: 8 },
  notifNome: { fontSize: 15, fontWeight: 'bold', color: CORES.primaria },
  notifSub: { fontSize: 12, color: CORES.secundaria, marginTop: 2 },
  botaoConfigurar: { backgroundColor: CORES.acento, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  textoBotaoConfigurar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 13 },
  botaoRecusarNovoAluno: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: CORES.superficie,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: CORES.borda, marginLeft: 8,
  },
  cardAula: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.superficie,
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: CORES.borda, gap: 14,
  },
  boxHorario: { backgroundColor: CORES.fundo, borderRadius: 8, padding: 10, alignItems: 'center', minWidth: 56, borderWidth: 1, borderColor: CORES.borda },
  textoHora: { color: CORES.acento, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },
  textoData: { color: CORES.secundaria, fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  nomeAluno: { fontWeight: 'bold', fontSize: 15, color: CORES.primaria },
  tipoAula: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },
  badgePresencaCard: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  textoBadgePresencaCard: { fontSize: 11, fontWeight: 'bold' },
  hintToque: { fontSize: 11, color: CORES.acento, marginTop: 5, fontStyle: 'italic' },
  cardVazio: { padding: 30, alignItems: 'center' },
  textoVazio: { color: CORES.secundaria, textAlign: 'center' },
  gridAcessoRapido: { flexDirection: 'row', gap: 10 },
  botaoAcesso: {
    flex: 1, backgroundColor: CORES.superficie, padding: 20, borderRadius: 12,
    alignItems: 'center', borderWidth: 1, borderColor: CORES.borda,
  },
  textoAcesso: { fontWeight: 'bold', marginTop: 5, color: CORES.primaria, fontSize: 13 },
  // Modal base
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: CORES.superficie, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '92%', borderTopWidth: 1, borderTopColor: CORES.borda,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 16, fontWeight: 'bold', color: CORES.primaria, letterSpacing: 1 },
  modalSub: { fontSize: 14, color: CORES.secundaria, marginTop: 2 },
  linkLidas: { color: CORES.info, fontSize: 13, fontWeight: '600', paddingTop: 2 },
  // Notificações no modal
  cardNotif: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardNotifLida: { opacity: 0.5 },
  tituloNotif: { fontWeight: 'bold', fontSize: 14, color: CORES.primaria, marginBottom: 4 },
  msgNotif: { fontSize: 13, color: CORES.secundaria, lineHeight: 18, marginBottom: 6 },
  dataNotif: { fontSize: 11, color: CORES.secundaria },
  pontinhoNaoLido: { width: 8, height: 8, borderRadius: 4, backgroundColor: CORES.erro, marginTop: 4 },
  botaoExcluirNotif: { marginLeft: 6 },
  botaoRenovar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CORES.info,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10, alignSelf: 'flex-start',
  },
  textoBotaoRenovar: { color: CORES.primaria, fontWeight: 'bold', fontSize: 13 },
  // Modal presença
  botaoOpcaoPresenca: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1.5, backgroundColor: CORES.fundo,
  },
  textoOpcaoPresenca: { fontSize: 15, fontWeight: 'bold' },
  descOpcaoPresenca: { fontSize: 12, color: CORES.secundaria, marginTop: 2 },
  // Modal configurar
  labelCampo: { fontSize: 12, fontWeight: '600', color: CORES.secundaria, marginBottom: 8, marginTop: 18, letterSpacing: 1 },
  input: {
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: CORES.borda, color: CORES.primaria,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda },
  chipAtivo: { backgroundColor: CORES.acento, borderColor: CORES.acento },
  textoChip: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },
  textoChipAtivo: { color: CORES.fundo },
  chipRowRecorrencia: { flexDirection: 'row', gap: 8 },
  chipRecorrencia: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda },
  resumoBox: {
    backgroundColor: CORES.fundo, borderRadius: 14, padding: 16,
    marginTop: 20, borderWidth: 1, borderColor: CORES.borda, gap: 6,
  },
  resumoTitulo: { color: CORES.acento, fontWeight: 'bold', fontSize: 13, marginBottom: 4, letterSpacing: 1 },
  resumoLinha: { color: CORES.secundaria, fontSize: 14, lineHeight: 22 },
  botaoSalvar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CORES.acento, borderRadius: 12, padding: 16, marginTop: 28, gap: 8,
  },
  textoBotaoSalvar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 16 },
  rowMidia: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  botaoMidia: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: CORES.borda, marginBottom: 12,
  },
  textoMidia: { fontSize: 14, fontWeight: '600', color: CORES.acento },
  previewImagem: { width: '100%', height: 180, borderRadius: 10, marginBottom: 10 },
  textoNomeArquivo: { fontSize: 12, color: CORES.secundaria, marginBottom: 8, fontStyle: 'italic' },
  confirmacaoArquivo: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  // Setor unificado de materiais
  labelMateriais: {
    color: CORES.secundaria, fontSize: 11, fontWeight: 'bold',
    letterSpacing: 2, marginTop: 20, marginBottom: 12,
  },
  rowTiposMaterial: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  btnTipoMaterial: {
    flex: 1, minWidth: 56, alignItems: 'center', gap: 4,
    paddingVertical: 10, paddingHorizontal: 6,
    backgroundColor: CORES.fundo, borderRadius: 10,
    borderWidth: 1, borderColor: CORES.borda,
  },
  txtTipoMaterial: { fontSize: 11, fontWeight: '600', color: CORES.primaria, textAlign: 'center' },
  formInlineMaterial: {
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: CORES.borda,
  },
  btnAdicionarInline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, alignSelf: 'flex-end',
  },
  txBtnAdicionarInline: { fontWeight: 'bold', fontSize: 14 },
  itemLoteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CORES.fundo, borderRadius: 8, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: CORES.borda,
  },
  nomeItemLote: { flex: 1, color: CORES.primaria, fontSize: 13 },
});
