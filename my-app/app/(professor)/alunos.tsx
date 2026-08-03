import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { CORES } from '../../constants/theme';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';

function corBadgePresenca(p: string | null) {
  switch (p) {
    case 'PRESENTE':           return { bg: '#E8F5E9', text: '#2E7D32', borda: '#A5D6A7' };
    case 'AUSENCIA_PROFESSOR': return { bg: '#FFF3E0', text: '#E65100', borda: '#FFCC80' };
    case 'AUSENCIA_ALUNO':     return { bg: '#FBE9E7', text: '#BF360C', borda: '#FFAB91' };
    case 'PENDENTE_REPOSICAO': return { bg: '#EDE7F6', text: '#4527A0', borda: '#CE93D8' };
    case 'CONCLUIDA':          return { bg: '#E8F5E9', text: '#2E7D32', borda: '#A5D6A7' };
    case 'CANCELADA':          return { bg: '#FFEBEE', text: '#B71C1C', borda: '#EF9A9A' };
    default:                   return { bg: CORES.superficie, text: CORES.secundaria, borda: CORES.borda };
  }
}

function labelBadgePresenca(presenca: string | null, status: string) {
  switch (presenca) {
    case 'PRESENTE':           return 'Presente';
    case 'AUSENCIA_PROFESSOR': return 'Aus. Professor';
    case 'AUSENCIA_ALUNO':     return 'Aus. Aluno';
    case 'PENDENTE_REPOSICAO': return 'Pend. Reposição';
    default:
      if (status === 'CONCLUIDA') return 'Concluída';
      if (status === 'CANCELADA') return 'Cancelada';
      return status === 'AGENDADA' ? 'Agendada' : status;
  }
}

function iconeMatTipo(tipo: string) {
  switch ((tipo || '').toLowerCase()) {
    case 'texto':  return 'document-text-outline';
    case 'link':   return 'link-outline';
    case 'video':  return 'play-circle-outline';
    case 'imagem': return 'image-outline';
    default:       return 'document-outline';
  }
}

const API_URL = BASE_URL;

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HORARIOS = [
  '07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00',
];
const OPCOES_CONTRATO = [3, 6, 12, 24];
type Recorrencia = 'SEMANAL' | 'QUINZENAL' | 'MENSAL';

export default function AlunosProfessorScreen() {
  const navigation = useNavigation();
  const [alunos, setAlunos]                   = useState<any[]>([]);
  const [alunosPendentes, setAlunosPendentes] = useState<any[]>([]);
  const [alunosInativos, setAlunosInativos]   = useState<any[]>([]);
  const [carregando, setCarregando]           = useState(true);
  const [erroCarga, setErroCarga]             = useState(false);
  const [busca, setBusca]                     = useState('');
  const [secaoInativosAberta, setSecaoInativosAberta] = useState(false);

  // ── Modal perfil (aluno ativo) ──────────────────────────────────────────────
  const [modalPerfilVisivel, setModalPerfilVisivel] = useState(false);
  const [alunoSelecionado, setAlunoSelecionado]     = useState<any | null>(null);
  const [abaAtiva, setAbaAtiva]                     = useState<'historico' | 'ajustes'>('historico');
  const [diaSemana, setDiaSemana]                   = useState(1);
  const [horario, setHorario]                       = useState('08:00');
  const [salvandoHorario, setSalvandoHorario]       = useState(false);
  const [statusAluno, setStatusAluno]               = useState<'ATIVO' | 'INATIVO'>('ATIVO');
  const [alternandoStatus, setAlternandoStatus]     = useState(false);
  const [novoValorMensalidade, setNovoValorMensalidade] = useState('');
  const [salvandoMensalidade, setSalvandoMensalidade]   = useState(false);

  // ── Modal configurar (aluno pendente) ─────────────────────────────────────
  const [modalConfigVisivel, setModalConfigVisivel] = useState(false);
  const [alunoPendente, setAlunoPendente]           = useState<any | null>(null);
  const [valorMensalidade, setValorMensalidade]     = useState('');
  const [diaCobranca, setDiaCobranca]               = useState('');
  const [horarioConfig, setHorarioConfig]           = useState('08:00');
  const [diaSemanaConfig, setDiaSemanaConfig]       = useState(1);
  const [recorrencia, setRecorrencia]               = useState<Recorrencia>('SEMANAL');
  const [tempoContrato, setTempoContrato]           = useState(6);
  const [salvandoConfig, setSalvandoConfig]         = useState(false);

  const carregarTudo = useCallback(async () => {
    setErroCarga(false);
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const [resAtivos, resPendentes, resInativos] = await Promise.all([
        fetchComRetry(`${API_URL}/api/meus-alunos?professorId=${professorId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        }),
        fetchComRetry(`${API_URL}/api/alunos-pendentes?professorId=${professorId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        }),
        fetchComRetry(`${API_URL}/api/alunos-inativos?professorId=${professorId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        }),
      ]);

      clearTimeout(timeout);

      if (resAtivos.ok) {
        const dados = await resAtivos.json();
        setAlunos(Array.isArray(dados) ? dados : []);
      }
      if (resPendentes.ok) {
        const dados = await resPendentes.json();
        setAlunosPendentes(Array.isArray(dados) ? dados : []);
      }
      if (resInativos.ok) {
        const dados = await resInativos.json();
        setAlunosInativos(Array.isArray(dados) ? dados : []);
      }
    } catch {
      setErroCarga(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarTudo(); }, [carregarTudo]));

  // ── Abrir perfil (ativo) ────────────────────────────────────────────────────
  const abrirPerfil = (aluno: any) => {
    setAlunoSelecionado(aluno);
    setAbaAtiva('historico');
    setDiaSemana(aluno.diaSemanaNumero ?? 1);
    setHorario(aluno.horarioAula ?? '08:00');
    // Trata PENDENTE e qualquer outro valor como ATIVO para a UI do toggle
    setStatusAluno(aluno.status === 'INATIVO' ? 'INATIVO' : 'ATIVO');
    setNovoValorMensalidade(aluno.valorMensalidade != null ? String(aluno.valorMensalidade) : '');
    setModalPerfilVisivel(true);
  };

  // ── Abrir configuração (pendente) ───────────────────────────────────────────
  const abrirConfig = (aluno: any) => {
    setAlunoPendente(aluno);
    setValorMensalidade('');
    setDiaCobranca('');
    setHorarioConfig('08:00');
    setDiaSemanaConfig(1);
    setRecorrencia('SEMANAL');
    setTempoContrato(6);
    setModalConfigVisivel(true);
  };

  // ── Salvar horário (perfil ativo) ───────────────────────────────────────────
  const salvarHorario = async () => {
    if (!alunoSelecionado) return;
    setSalvandoHorario(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetchComRetry(`${API_URL}/api/configurar-aluno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          alunoId: alunoSelecionado.id,
          professorId,
          horarioAula: horario,
          diaSemana,
          valorMensalidade: alunoSelecionado.valorMensalidade ?? 0,
          diaCobranca: alunoSelecionado.diaVencimento ?? 10,
          recorrencia: alunoSelecionado.recorrenciaAula ?? 'SEMANAL',
          tempoContrato: alunoSelecionado.tempoContrato ?? 6,
        }),
      });

      if (resposta.ok) {
        // Atualiza o array local para que na próxima abertura o horário correto apareça
        setAlunos(prev => prev.map(a =>
          a.id === alunoSelecionado.id
            ? { ...a, diaSemanaNumero: diaSemana, horarioAula: horario }
            : a
        ));
        setAlunosInativos(prev => prev.map(a =>
          a.id === alunoSelecionado.id
            ? { ...a, diaSemanaNumero: diaSemana, horarioAula: horario }
            : a
        ));
        setAlunoSelecionado((prev: any) => ({ ...prev, diaSemanaNumero: diaSemana, horarioAula: horario }));
        Alert.alert("Salvo!", `Horário de ${alunoSelecionado.nome} atualizado.`);
        setModalPerfilVisivel(false);
      } else {
        Alert.alert("Erro", "Não foi possível salvar o horário.");
      }
    } catch {
      Alert.alert("Erro de Conexão", "Verifique sua conexão.");
    } finally {
      setSalvandoHorario(false);
    }
  };

  // ── Salvar valor da mensalidade ─────────────────────────────────────────────
  const salvarMensalidade = async () => {
    if (!alunoSelecionado) return;
    const valor = parseFloat(novoValorMensalidade.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      Alert.alert('Atenção', 'Informe um valor de mensalidade válido.');
      return;
    }
    setSalvandoMensalidade(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const resposta = await fetchComRetry(`${API_URL}/api/alunos/${alunoSelecionado.id}/mensalidade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ valorMensalidade: valor }),
      });
      if (resposta.ok) {
        setAlunos(prev => prev.map(a =>
          a.id === alunoSelecionado.id ? { ...a, valorMensalidade: valor } : a
        ));
        setAlunosInativos(prev => prev.map(a =>
          a.id === alunoSelecionado.id ? { ...a, valorMensalidade: valor } : a
        ));
        setAlunoSelecionado((prev: any) => ({ ...prev, valorMensalidade: valor }));
        Alert.alert('Salvo!', `Mensalidade de ${alunoSelecionado.nome} atualizada para R$ ${valor.toFixed(2).replace('.', ',')}.`);
      } else {
        Alert.alert('Erro', 'Não foi possível salvar a mensalidade.');
      }
    } catch {
      Alert.alert('Erro de Conexão', 'Verifique sua conexão.');
    } finally {
      setSalvandoMensalidade(false);
    }
  };

  // ── Alternar status ativo/inativo (apenas professor) ────────────────────────
  const alternarStatus = async () => {
    if (!alunoSelecionado) return;
    const novoStatus = statusAluno === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const acao = novoStatus === 'INATIVO' ? 'desativar' : 'reativar';
    Alert.alert(
      `${novoStatus === 'INATIVO' ? 'Desativar' : 'Reativar'} Aluno`,
      `Deseja ${acao} ${alunoSelecionado.nome}?\n\n${novoStatus === 'INATIVO' ? 'O aluno ficará oculto de toda a plataforma até ser reativado.' : 'O aluno voltará a aparecer normalmente na plataforma.'}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setAlternandoStatus(true);
            try {
              const token = await SecureStore.getItemAsync('kav_token');
              const res = await fetchComRetry(`${API_URL}/api/alunos/${alunoSelecionado.id}/status`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (res.ok) {
                const dados = await res.json();
                setStatusAluno(dados.status);
                setAlunoSelecionado((prev: any) => ({ ...prev, status: dados.status }));
                if (dados.status === 'INATIVO') {
                  // Move da lista de ativos para inativos
                  const alunoMovido = alunos.find(a => a.id === alunoSelecionado.id);
                  setAlunos(prev => prev.filter(a => a.id !== alunoSelecionado.id));
                  if (alunoMovido) setAlunosInativos(prev => [...prev, { ...alunoMovido, status: 'INATIVO' }]);
                } else {
                  // Move da lista de inativos para ativos
                  const alunoMovido = alunosInativos.find(a => a.id === alunoSelecionado.id);
                  setAlunosInativos(prev => prev.filter(a => a.id !== alunoSelecionado.id));
                  if (alunoMovido) setAlunos(prev => [...prev, { ...alunoMovido, status: 'ATIVO' }]);
                }
                setModalPerfilVisivel(false);
                Alert.alert('Pronto!', `${alunoSelecionado.nome} foi ${dados.status === 'ATIVO' ? 'reativado' : 'desativado'}.`);
              } else {
                Alert.alert('Erro', 'Não foi possível alterar o status.');
              }
            } catch {
              Alert.alert('Erro de Conexão', 'Verifique sua conexão.');
            } finally {
              setAlternandoStatus(false);
            }
          },
        },
      ]
    );
  };

  // ── Confirmar configuração do aluno pendente ────────────────────────────────
  const confirmarConfiguracao = async () => {
    const valor = parseFloat(valorMensalidade.replace(',', '.'));
    const dia   = parseInt(diaCobranca);

    if (!valorMensalidade || !diaCobranca) {
      Alert.alert("Atenção", "Preencha o valor da mensalidade e o dia de cobrança.");
      return;
    }
    if (isNaN(valor) || valor <= 0) {
      Alert.alert("Atenção", "Informe um valor de mensalidade válido.");
      return;
    }
    if (isNaN(dia) || dia < 1 || dia > 31) {
      Alert.alert("Atenção", "O dia de cobrança deve ser entre 1 e 31.");
      return;
    }

    setSalvandoConfig(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const resposta = await fetchComRetry(`${API_URL}/api/configurar-aluno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          alunoId: alunoPendente.id,
          professorId,
          valorMensalidade: valor,
          diaCobranca: dia,
          horarioAula: horarioConfig,
          diaSemana: diaSemanaConfig,
          recorrencia,
          tempoContrato,
        }),
      });

      if (resposta.ok) {
        Alert.alert(
          "Configurado! ✅",
          `${alunoPendente.nome} foi adicionado à sua turma e as aulas foram registradas no calendário.`
        );
        setModalConfigVisivel(false);
        // Move o aluno de pendentes para ativos localmente já com status ATIVO
        setAlunosPendentes(prev => prev.filter(a => a.id !== alunoPendente.id));
        setAlunos(prev => [...prev, { ...alunoPendente, status: 'ATIVO' }]);
      } else {
        const err = await resposta.json().catch(() => ({}));
        Alert.alert("Erro", err.message || "Não foi possível salvar as configurações.");
      }
    } catch {
      Alert.alert("Erro de Conexão", "Verifique sua conexão e tente novamente.");
    } finally {
      setSalvandoConfig(false);
    }
  };

  const alunosFiltrados = alunos.filter(a =>
    a.nome?.toLowerCase().includes(busca.toLowerCase())
  );

  const totalGeral = alunos.length + alunosPendentes.length + alunosInativos.length;

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <SyncLoader size="large" color={CORES.acento} />
        <Text style={{ color: CORES.secundaria, marginTop: 12, fontSize: 13 }}>
          Carregando alunos...
        </Text>
      </View>
    );
  }

  if (erroCarga) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 30 }]}>
        <StatusBar style="dark" backgroundColor={CORES.fundo} />
        <Ionicons name="cloud-offline-outline" size={56} color={CORES.aviso} />
        <Text style={{ color: CORES.primaria, fontWeight: 'bold', fontSize: 17, marginTop: 16, textAlign: 'center' }}>
          Servidor demorando para responder
        </Text>
        <Text style={{ color: CORES.secundaria, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
          O servidor pode estar acordando (modo economia). Seus dados estão seguros no banco de dados — tente novamente em alguns segundos.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: CORES.acento, borderRadius: 12, padding: 16, marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          onPress={carregarTudo}
        >
          <Ionicons name="refresh" size={20} color={CORES.fundo} />
          <Text style={{ color: CORES.fundo, fontWeight: 'bold', fontSize: 15 }}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.titulo}>MEUS ALUNOS</Text>
          <Text style={styles.subtitulo}>{totalGeral} alunos no total</Text>
        </View>
      </View>

      {/* Barra de Busca */}
      <View style={styles.buscaContainer}>
        <Ionicons name="search-outline" size={18} color={CORES.secundaria} style={styles.iconeBusca} />
        <TextInput
          style={styles.inputBusca}
          placeholder="Buscar por nome..."
          placeholderTextColor={CORES.secundaria}
          selectionColor={CORES.acento}
          value={busca}
          onChangeText={setBusca}
        />
        {busca.length > 0 && (
          <TouchableOpacity onPress={() => setBusca('')}>
            <Ionicons name="close-circle" size={18} color={CORES.secundaria} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          busca.length === 0 ? (
            <View>
              {alunosPendentes.length > 0 && (
                <View style={styles.secaoPendentes}>
                  <View style={styles.tituloSecaoRow}>
                    <Ionicons name="notifications" size={16} color={CORES.aviso} />
                    <Text style={styles.tituloSecaoPendente}>Aguardando Configuração</Text>
                    <View style={styles.badgeCount}>
                      <Text style={styles.badgeCountTxt}>{alunosPendentes.length}</Text>
                    </View>
                  </View>
                  {alunosPendentes.map((aluno) => (
                    <TouchableOpacity
                      key={aluno.id}
                      style={styles.cardPendente}
                      onPress={() => abrirConfig(aluno)}
                    >
                      {aluno.fotoUrl ? (
                        <Image source={{ uri: aluno.fotoUrl }} style={styles.avatarImg} />
                      ) : (
                        <View style={styles.avatarPendente}>
                          <Text style={styles.letraAvatar}>{aluno.nome?.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nomePendente}>{aluno.nome}</Text>
                        <Text style={styles.subtextoPendente}>Toque para configurar mensalidade e agenda</Text>
                      </View>
                      <View style={styles.badgePendente}>
                        <Text style={styles.textoBadgePendente}>Pendente</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {alunos.length > 0 && (
                <Text style={styles.tituloSecaoAtivo}>Alunos Ativos</Text>
              )}
              {alunosInativos.length > 0 && (
                <View style={styles.secaoInativos}>
                  <TouchableOpacity
                    style={styles.tituloSecaoRow}
                    onPress={() => setSecaoInativosAberta(v => !v)}
                  >
                    <Ionicons name="pause-circle-outline" size={16} color={CORES.secundaria} />
                    <Text style={styles.tituloSecaoInativo}>Inativos</Text>
                    <View style={[styles.badgeCount, { backgroundColor: CORES.secundaria }]}>
                      <Text style={styles.badgeCountTxt}>{alunosInativos.length}</Text>
                    </View>
                    <Ionicons
                      name={secaoInativosAberta ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={CORES.secundaria}
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  {secaoInativosAberta && alunosInativos.map((aluno) => (
                    <TouchableOpacity
                      key={aluno.id}
                      style={styles.cardInativo}
                      onPress={() => abrirPerfil(aluno)}
                    >
                      {aluno.fotoUrl ? (
                        <Image source={{ uri: aluno.fotoUrl }} style={[styles.avatarImg, { opacity: 0.55 }]} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: CORES.secundaria }]}>
                          <Text style={styles.letraAvatar}>{aluno.nome?.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nomeAluno}>{aluno.nome}</Text>
                        <Text style={[styles.cursoAluno, { color: CORES.erro }]}>Desativado — toque para reativar</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={CORES.secundaria} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : null
        }
        data={alunosFiltrados}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View style={styles.vazioContainer}>
            <Ionicons name="people-outline" size={48} color={CORES.borda} />
            <Text style={styles.textoVazio}>
              {busca.length > 0 ? 'Nenhum aluno encontrado.' : 'Nenhum aluno ativo ainda.'}
            </Text>
            {busca.length === 0 && alunosPendentes.length === 0 && (
              <Text style={styles.subtextoVazio}>Compartilhe o código de convite para que os alunos se cadastrem.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.cardAluno} onPress={() => abrirPerfil(item)}>
            {item.fotoUrl ? (
              <Image source={{ uri: item.fotoUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.letraAvatar}>{item.nome?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.nomeAluno}>{item.nome}</Text>
              <Text style={styles.cursoAluno}>{item.email || 'Ver histórico e evolução'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={CORES.secundaria} />
          </TouchableOpacity>
        )}
      />

      {/* ══ MODAL: CONFIGURAR ALUNO PENDENTE ══════════════════════════════════ */}
      <Modal
        visible={modalConfigVisivel}
        animationType="slide"
        transparent
        onRequestClose={() => setModalConfigVisivel(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitulo}>Configurar Aluno</Text>
                <Text style={styles.modalSub}>{alunoPendente?.nome}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalConfigVisivel(false)}>
                <Ionicons name="close" size={24} color={CORES.primaria} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.labelCampo}>Valor da Mensalidade (R$)</Text>
              <TextInput
                style={styles.inputCampo}
                placeholder="Ex: 150,00"
                placeholderTextColor={CORES.secundaria}
                keyboardType="decimal-pad"
                value={valorMensalidade}
                onChangeText={setValorMensalidade}
              />

              <Text style={styles.labelCampo}>Dia de Cobrança (1 – 31)</Text>
              <TextInput
                style={styles.inputCampo}
                placeholder="Ex: 10"
                placeholderTextColor={CORES.secundaria}
                keyboardType="number-pad"
                maxLength={2}
                value={diaCobranca}
                onChangeText={setDiaCobranca}
              />

              <Text style={styles.labelCampo}>Dia da Aula</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {DIAS_SEMANA.map((dia, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.chip, diaSemanaConfig === idx && styles.chipAtivo]}
                    onPress={() => setDiaSemanaConfig(idx)}
                  >
                    <Text style={[styles.textoChip, diaSemanaConfig === idx && styles.textoChipAtivo]}>{dia}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.labelCampo}>Horário da Aula</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginBottom: 4 }}>
                {HORARIOS.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.chip, horarioConfig === h && styles.chipAtivo]}
                    onPress={() => setHorarioConfig(h)}
                  >
                    <Text style={[styles.textoChip, horarioConfig === h && styles.textoChipAtivo]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.labelCampo}>Recorrência</Text>
              <View style={styles.recorrenciaRow}>
                {(['SEMANAL', 'QUINZENAL', 'MENSAL'] as Recorrencia[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chipRecorrencia, recorrencia === r && styles.chipAtivo]}
                    onPress={() => setRecorrencia(r)}
                  >
                    <Text style={[styles.textoChip, recorrencia === r && styles.textoChipAtivo]}>
                      {r === 'SEMANAL' ? 'Semanal' : r === 'QUINZENAL' ? 'Quinzenal' : 'Mensal'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.labelCampo}>Duração do Contrato</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {OPCOES_CONTRATO.map(m => (
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

              {/* Resumo */}
              {valorMensalidade && diaCobranca ? (
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoTitulo}>Resumo</Text>
                  <Text style={styles.resumoLinha}>📅 {DIAS_SEMANA[diaSemanaConfig]} às {horarioConfig}</Text>
                  <Text style={styles.resumoLinha}>💰 R$ {valorMensalidade} · vence dia {diaCobranca}</Text>
                  <Text style={styles.resumoLinha}>🔁 {recorrencia === 'SEMANAL' ? 'Toda semana' : recorrencia === 'QUINZENAL' ? 'A cada 15 dias' : 'Mensal'}</Text>
                  <Text style={styles.resumoLinha}>📋 {tempoContrato === 12 ? '1 ano' : tempoContrato === 24 ? '2 anos' : `${tempoContrato} meses`}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.botaoConfirmar, salvandoConfig && { opacity: 0.6 }]}
                onPress={confirmarConfiguracao}
                disabled={salvandoConfig}
              >
                {salvandoConfig ? (
                  <SyncLoader color={CORES.fundo} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={CORES.fundo} />
                    <Text style={styles.textoBotaoConfirmar}>Confirmar e Adicionar ao Calendário</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ MODAL: PERFIL DO ALUNO ATIVO ══════════════════════════════════════ */}
      <Modal
        visible={modalPerfilVisivel}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalPerfilVisivel(false)}
      >
        <View style={styles.container}>
          <View style={styles.modalHeaderFull}>
            <TouchableOpacity onPress={() => setModalPerfilVisivel(false)} style={styles.botaoFechar}>
              <Ionicons name="close" size={24} color={CORES.primaria} />
            </TouchableOpacity>
            <Text style={styles.modalTitulo}>Perfil do Aluno</Text>
            <View style={{ width: 40 }} />
          </View>

          {alunoSelecionado && (
            <>
              <View style={styles.perfilInfo}>
                {alunoSelecionado.fotoUrl ? (
                  <Image source={{ uri: alunoSelecionado.fotoUrl }} style={{ width: 70, height: 70, borderRadius: 35 }} />
                ) : (
                  <View style={[styles.avatar, { width: 70, height: 70, borderRadius: 35 }]}>
                    <Text style={[styles.letraAvatar, { fontSize: 28 }]}>{alunoSelecionado.nome?.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.perfilNome}>{alunoSelecionado.nome}</Text>
                <Text style={styles.perfilEmail}>{alunoSelecionado.email}</Text>
              </View>

              <View style={styles.abasContainer}>
                <TouchableOpacity
                  style={[styles.aba, abaAtiva === 'historico' && styles.abaAtiva]}
                  onPress={() => setAbaAtiva('historico')}
                >
                  <Text style={[styles.textoAba, abaAtiva === 'historico' && styles.textoAbaAtivo]}>Histórico</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.aba, abaAtiva === 'ajustes' && styles.abaAtiva]}
                  onPress={() => setAbaAtiva('ajustes')}
                >
                  <Text style={[styles.textoAba, abaAtiva === 'ajustes' && styles.textoAbaAtivo]}>Ajustes</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                {abaAtiva === 'historico' ? (
                  (!alunoSelecionado.aulas || alunoSelecionado.aulas.length === 0) ? (
                    <Text style={styles.textoVazioHistorico}>Nenhuma aula registrada.</Text>
                  ) : (
                    alunoSelecionado.aulas
                      .filter((aula: any, idx: number, arr: any[]) => arr.findIndex(a => a.id === aula.id) === idx)
                      .map((aula: any) => {
                      const cor = corBadgePresenca(aula.presenca || aula.status);
                      const label = labelBadgePresenca(aula.presenca, aula.status);
                      const materiais: any[] = aula.materiais || [];
                      return (
                        <View key={aula.id} style={styles.cardHistorico}>
                          <View style={styles.topoHistorico}>
                            <Text style={styles.dataHistorico}>
                              {new Date(aula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {' · '}
                              {alunoSelecionado.horarioAula || new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            <View style={[styles.badgeAula, { backgroundColor: cor.bg, borderColor: cor.borda }]}>
                              <Text style={[styles.textoBadgeAula, { color: cor.text }]}>{label}</Text>
                            </View>
                          </View>
                          <Text style={styles.conteudoHistorico}>
                            {aula.tema || (aula.tipo === 'REPOSICAO' ? 'Aula de Reposição' : 'Aula Regular')}
                          </Text>
                          {materiais.length > 0 && (
                            <View style={styles.materiaisBox}>
                              {materiais.map((m: any) => (
                                <View key={m.id} style={styles.itemMaterial}>
                                  <Ionicons name={iconeMatTipo(m.tipo) as any} size={13} color={CORES.secundaria} />
                                  <Text style={styles.textoItemMaterial} numberOfLines={1}>{m.titulo}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )
                ) : (
                  <>
                    <Text style={styles.labelCampo}>Valor da Mensalidade (R$)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <TextInput
                        style={[styles.inputCampo, { flex: 1 }]}
                        placeholder={alunoSelecionado?.valorMensalidade != null
                          ? `Atual: R$ ${Number(alunoSelecionado.valorMensalidade).toFixed(2).replace('.', ',')}`
                          : 'Ex: 150,00'}
                        placeholderTextColor={CORES.secundaria}
                        keyboardType="decimal-pad"
                        value={novoValorMensalidade}
                        onChangeText={setNovoValorMensalidade}
                      />
                      <TouchableOpacity
                        style={[styles.botaoSalvarMensalidade, salvandoMensalidade && { opacity: 0.6 }]}
                        onPress={salvarMensalidade}
                        disabled={salvandoMensalidade}
                      >
                        {salvandoMensalidade
                          ? <SyncLoader color={CORES.fundo} size="small" />
                          : <Ionicons name="checkmark-circle" size={22} color={CORES.fundo} />}
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.labelCampo}>Dia da Aula</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
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
                    </ScrollView>

                    <Text style={styles.labelCampo}>Horário</Text>
                    <View style={styles.horariosGrid}>
                      {HORARIOS.map(h => (
                        <TouchableOpacity
                          key={h}
                          style={[styles.chip, horario === h && styles.chipAtivo]}
                          onPress={() => setHorario(h)}
                        >
                          <Text style={[styles.textoChip, horario === h && styles.textoChipAtivo]}>{h}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[styles.botaoSalvarHorario, salvandoHorario && { opacity: 0.6 }]}
                      onPress={salvarHorario}
                      disabled={salvandoHorario}
                    >
                      {salvandoHorario ? <SyncLoader color={CORES.fundo} /> : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color={CORES.fundo} />
                          <Text style={styles.textoBotaoSalvar}>Salvar Horário</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <View style={styles.linhaSeparadora} />

                    <Text style={styles.labelCampo}>Status do Aluno</Text>
                    <TouchableOpacity
                      style={[styles.toggleStatusContainer, alternandoStatus && { opacity: 0.6 }]}
                      onPress={alternarStatus}
                      disabled={alternandoStatus}
                      activeOpacity={0.85}
                    >
                      <View style={[
                        styles.togglePilula,
                        statusAluno === 'ATIVO'
                          ? { backgroundColor: '#2E7D32' }
                          : { backgroundColor: CORES.fundo }
                      ]}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={statusAluno === 'ATIVO' ? '#fff' : CORES.borda}
                        />
                        <Text style={[
                          styles.toggleTexto,
                          { color: statusAluno === 'ATIVO' ? '#fff' : CORES.secundaria }
                        ]}>ATIVO</Text>
                      </View>
                      <View style={[
                        styles.togglePilula,
                        statusAluno === 'INATIVO'
                          ? { backgroundColor: CORES.erro }
                          : { backgroundColor: CORES.fundo }
                      ]}>
                        <Ionicons
                          name="pause-circle"
                          size={16}
                          color={statusAluno === 'INATIVO' ? '#fff' : CORES.borda}
                        />
                        <Text style={[
                          styles.toggleTexto,
                          { color: statusAluno === 'INATIVO' ? '#fff' : CORES.secundaria }
                        ]}>INATIVO</Text>
                      </View>
                    </TouchableOpacity>
                    {alternandoStatus && (
                      <SyncLoader size="small" color={CORES.acento} style={{ marginTop: 8 }} />
                    )}

                    <View style={{ height: 10 }} />
                  </>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  hamburger: { padding: 4 },
  titulo: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  subtitulo: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },

  buscaContainer: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12,
    backgroundColor: CORES.superficie, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: CORES.borda,
  },
  iconeBusca: { marginRight: 8 },
  inputBusca: { flex: 1, fontSize: 15, color: CORES.primaria },

  lista: { paddingHorizontal: 20, paddingBottom: 40 },

  secaoPendentes: { marginBottom: 4 },
  tituloSecaoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  tituloSecaoPendente: { color: CORES.aviso, fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  badgeCount: { backgroundColor: CORES.aviso, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeCountTxt: { color: CORES.fundo, fontSize: 11, fontWeight: 'bold' },
  tituloSecaoAtivo: { color: CORES.secundaria, fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, marginTop: 16, marginBottom: 10 },

  cardPendente: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF4E5',
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FFD0A0',
  },
  avatarPendente: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E65100', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  nomePendente: { color: CORES.primaria, fontSize: 15, fontWeight: 'bold' },
  subtextoPendente: { color: CORES.aviso, fontSize: 12, marginTop: 2 },
  badgePendente: { backgroundColor: '#FFECDB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FFD0A0' },
  textoBadgePendente: { color: CORES.aviso, fontSize: 12, fontWeight: 'bold' },

  cardAluno: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.superficie,
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: CORES.borda,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarImg: { width: 46, height: 46, borderRadius: 23, marginRight: 14 },
  letraAvatar: { color: CORES.fundo, fontSize: 18, fontWeight: 'bold' },
  nomeAluno: { color: CORES.primaria, fontSize: 15, fontWeight: 'bold' },
  cursoAluno: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },

  vazioContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 30 },
  textoVazio: { color: CORES.primaria, fontSize: 16, fontWeight: 'bold', marginTop: 15, textAlign: 'center' },
  subtextoVazio: { color: CORES.secundaria, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: CORES.superficie, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '92%', borderTopWidth: 1, borderTopColor: CORES.borda,
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalTitulo: { fontSize: 16, fontWeight: 'bold', color: CORES.primaria, letterSpacing: 1 },
  modalSub: { fontSize: 13, color: CORES.secundaria, marginTop: 2 },

  labelCampo: { fontSize: 12, fontWeight: '600', color: CORES.secundaria, marginBottom: 8, marginTop: 16, letterSpacing: 1 },
  inputCampo: {
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: CORES.borda, color: CORES.primaria,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda },
  chipAtivo: { backgroundColor: CORES.acento, borderColor: CORES.acento },
  textoChip: { fontSize: 13, fontWeight: '600', color: CORES.secundaria },
  textoChipAtivo: { color: CORES.fundo },
  recorrenciaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chipRecorrencia: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda },

  resumoBox: {
    backgroundColor: CORES.fundo, borderRadius: 14, padding: 16,
    marginTop: 20, marginBottom: 4, borderWidth: 1, borderColor: CORES.borda, gap: 6,
  },
  resumoTitulo: { color: CORES.acento, fontWeight: 'bold', fontSize: 13, marginBottom: 4, letterSpacing: 1 },
  resumoLinha: { color: CORES.secundaria, fontSize: 14, lineHeight: 22 },

  botaoConfirmar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: CORES.acento, borderRadius: 14, padding: 18, marginTop: 20,
  },
  textoBotaoConfirmar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 15 },

  modalHeaderFull: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  botaoFechar: { width: 40, height: 40, borderRadius: 20, backgroundColor: CORES.fundo, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: 20, paddingBottom: 60 },

  perfilInfo: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  perfilNome: { fontSize: 20, fontWeight: 'bold', color: CORES.primaria, marginTop: 10 },
  perfilEmail: { fontSize: 13, color: CORES.secundaria, marginTop: 4 },

  abasContainer: {
    flexDirection: 'row', marginHorizontal: 20, marginTop: 16, marginBottom: 4,
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 4,
    borderWidth: 1, borderColor: CORES.borda,
  },
  aba: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  abaAtiva: { backgroundColor: CORES.acento },
  textoAba: { fontSize: 14, fontWeight: '600', color: CORES.secundaria },
  textoAbaAtivo: { color: CORES.fundo },

  horariosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  linhaSeparadora: { height: 1, backgroundColor: CORES.borda, marginVertical: 24 },

  botaoSalvarHorario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CORES.acento, borderRadius: 12, padding: 16, marginBottom: 8,
  },
  textoBotaoSalvar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 15 },
  botaoSalvarMensalidade: {
    backgroundColor: CORES.acento, borderRadius: 10, padding: 14, alignItems: 'center', justifyContent: 'center',
  },
  toggleStatusContainer: {
    flexDirection: 'row', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: CORES.borda, marginBottom: 8,
  },
  togglePilula: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
  },
  toggleTexto: { fontWeight: 'bold', fontSize: 14 },
  secaoInativos: { marginTop: 16, marginBottom: 4 },
  tituloSecaoInativo: { color: CORES.secundaria, fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, flex: 1 },
  cardInativo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.superficie,
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: CORES.borda, opacity: 0.7,
  },
  textoVazioHistorico: { color: CORES.secundaria, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  cardHistorico: {
    backgroundColor: CORES.fundo, borderRadius: 12, padding: 15,
    marginBottom: 12, borderWidth: 1, borderColor: CORES.borda,
  },
  topoHistorico: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  dataHistorico: { color: CORES.primaria, fontWeight: 'bold', fontSize: 13, flex: 1 },
  badgeAula: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  textoBadgeAula: { fontSize: 11, fontWeight: 'bold' },
  conteudoHistorico: { color: CORES.secundaria, fontSize: 14, lineHeight: 20 },
  materiaisBox: { marginTop: 10, gap: 4 },
  itemMaterial: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textoItemMaterial: { color: CORES.secundaria, fontSize: 12, flex: 1 },
});
