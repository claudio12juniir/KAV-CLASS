import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { CORES } from '../../constants/theme';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

const API_URL = "https://kav-class-1.onrender.com";

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
  const [carregando, setCarregando]           = useState(true);
  const [busca, setBusca]                     = useState('');

  // ── Modal perfil (aluno ativo) ──────────────────────────────────────────────
  const [modalPerfilVisivel, setModalPerfilVisivel] = useState(false);
  const [alunoSelecionado, setAlunoSelecionado]     = useState<any | null>(null);
  const [abaAtiva, setAbaAtiva]                     = useState<'historico' | 'ajustes'>('historico');
  const [diaSemana, setDiaSemana]                   = useState(1);
  const [horario, setHorario]                       = useState('08:00');
  const [salvandoHorario, setSalvandoHorario]       = useState(false);

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

  useEffect(() => {
    carregarTudo();
  }, []);

  const carregarTudo = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      const [resAtivos, resPendentes] = await Promise.all([
        fetch(`${API_URL}/api/meus-alunos?professorId=${professorId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/alunos-pendentes?professorId=${professorId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (resAtivos.ok) {
        const dados = await resAtivos.json();
        setAlunos(Array.isArray(dados) ? dados : []);
      }
      if (resPendentes.ok) {
        const dados = await resPendentes.json();
        setAlunosPendentes(Array.isArray(dados) ? dados : []);
      }
    } catch {
      Alert.alert("Erro", "Não foi possível carregar a lista de alunos.");
    } finally {
      setCarregando(false);
    }
  };

  // ── Abrir perfil (ativo) ────────────────────────────────────────────────────
  const abrirPerfil = (aluno: any) => {
    setAlunoSelecionado(aluno);
    setAbaAtiva('historico');
    setDiaSemana(aluno.diaSemanaNumero ?? 1);
    setHorario(aluno.horarioAula ?? '08:00');
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

      const resposta = await fetch(`${API_URL}/api/configurar-aluno`, {
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

  // ── Cancelar cadastro ───────────────────────────────────────────────────────
  const cancelarCadastro = () => {
    if (!alunoSelecionado) return;
    Alert.alert(
      "Cancelar Cadastro",
      `Tem certeza que deseja cancelar o cadastro de ${alunoSelecionado.nome}?`,
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim, cancelar",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync('kav_token');
              const res = await fetch(`${API_URL}/api/alunos/${alunoSelecionado.id}/cancelar`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (res.ok) {
                setAlunos(prev => prev.filter(a => a.id !== alunoSelecionado.id));
                setModalPerfilVisivel(false);
                Alert.alert("Concluído", "Cadastro cancelado com sucesso.");
              } else {
                Alert.alert("Erro", "Não foi possível cancelar o cadastro.");
              }
            } catch {
              Alert.alert("Erro de Conexão", "Verifique sua conexão.");
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

      const resposta = await fetch(`${API_URL}/api/configurar-aluno`, {
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
        // Move o aluno de pendentes para ativos localmente
        setAlunosPendentes(prev => prev.filter(a => a.id !== alunoPendente.id));
        setAlunos(prev => [...prev, alunoPendente]);
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

  const totalGeral = alunos.length + alunosPendentes.length;

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={CORES.acento} />
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
          alunosPendentes.length > 0 && busca.length === 0 ? (
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
                  <View style={styles.avatarPendente}>
                    <Text style={styles.letraAvatar}>{aluno.nome?.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nomePendente}>{aluno.nome}</Text>
                    <Text style={styles.subtextoPendente}>Toque para configurar mensalidade e agenda</Text>
                  </View>
                  <View style={styles.badgePendente}>
                    <Text style={styles.textoBadgePendente}>Pendente</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {alunos.length > 0 && (
                <Text style={styles.tituloSecaoAtivo}>Alunos Ativos</Text>
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
            <View style={styles.avatar}>
              <Text style={styles.letraAvatar}>{item.nome?.charAt(0).toUpperCase()}</Text>
            </View>
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
                  <ActivityIndicator color={CORES.fundo} />
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
                <View style={[styles.avatar, { width: 70, height: 70, borderRadius: 35 }]}>
                  <Text style={[styles.letraAvatar, { fontSize: 28 }]}>{alunoSelecionado.nome?.charAt(0).toUpperCase()}</Text>
                </View>
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
                    alunoSelecionado.aulas.map((aula: any) => {
                      const cor = corBadgePresenca(aula.presenca || aula.status);
                      const label = labelBadgePresenca(aula.presenca, aula.status);
                      const materiais: any[] = aula.materiais || [];
                      return (
                        <View key={aula.id} style={styles.cardHistorico}>
                          <View style={styles.topoHistorico}>
                            <Text style={styles.dataHistorico}>
                              {new Date(aula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {' · '}
                              {new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                      {salvandoHorario ? <ActivityIndicator color={CORES.fundo} /> : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color={CORES.fundo} />
                          <Text style={styles.textoBotaoSalvar}>Salvar Horário</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <View style={styles.linhaSeparadora} />

                    <TouchableOpacity style={styles.botaoCancelar} onPress={cancelarCadastro}>
                      <Ionicons name="trash-outline" size={18} color={CORES.erro} />
                      <Text style={styles.textoBotaoCancelar}>Cancelar Cadastro</Text>
                    </TouchableOpacity>
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
  botaoCancelar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFEBEE', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: CORES.erro,
  },
  textoBotaoCancelar: { color: CORES.erro, fontWeight: 'bold', fontSize: 15 },

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
