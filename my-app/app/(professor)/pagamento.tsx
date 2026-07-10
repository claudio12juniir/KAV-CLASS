import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES } from '../../constants/theme';

const API_URL = BASE_URL;

const NOMES_MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function calcularStatusDisplay(item: any): string {
  if (item.status === 'PAGO') return 'PAGO';
  if (item.status === 'EM_ANALISE') return 'EM_ANALISE';
  if (item.status === 'ATRASADO') return 'ATRASADO';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(item.vencimento);
  venc.setHours(0, 0, 0, 0);
  const diffDias = Math.floor((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return 'ATRASADO';
  if (diffDias <= 1) return 'A_VENCER';
  return 'EM_DIA';
}

const STATUS_MAP: Record<string, { label: string; cor: string; fundo: string }> = {
  PAGO:       { label: 'Pago',                cor: '#154a22', fundo: '#E8F8EE' },
  EM_DIA:     { label: 'Em Dia',              cor: '#0275D8', fundo: '#E3F2FD' },
  A_VENCER:   { label: 'A Vencer',            cor: '#E68A00', fundo: '#FFF4E5' },
  EM_ANALISE: { label: 'Comprovante Enviado', cor: '#7B1FA2', fundo: '#F3E5F5' },
  ATRASADO:   { label: 'Atrasado',            cor: '#D9534F', fundo: '#FFEBEE' },
};

export default function FinanceiroProfessorScreen() {
  const navigation = useNavigation();
  const [mensalidades, setMensalidades] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalConfig, setModalConfig] = useState(false);
  const [chavePix, setChavePix] = useState('');
  const [linkCartao, setLinkCartao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [notificando, setNotificando] = useState<string | null>(null);

  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const carregarDados = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';

      const [resPag, resPerfil] = await Promise.all([
        fetchComRetry(`${API_URL}/api/pagamentos?professorId=${professorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchComRetry(`${API_URL}/api/professor/perfil?professorId=${professorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resPag.ok) setMensalidades(await resPag.json());
      if (resPerfil.ok) {
        const p = await resPerfil.json();
        setChavePix(p.chavePix || '');
        setLinkCartao(p.linkPagamentoCartao || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  };

  useFocusEffect(useCallback(() => { carregarDados(); }, []));

  // Prioridade de status: PAGO é o mais relevante, EM_DIA o menos
  const PRIORIDADE_STATUS: Record<string, number> = {
    PAGO: 0, EM_ANALISE: 1, ATRASADO: 2, A_VENCER: 3, EM_DIA: 4,
  };

  const mensalidadesMes = (() => {
    const doMes = mensalidades.filter(m => {
      const d = new Date(m.vencimento);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });
    // Por aluno, manter apenas o registro de maior prioridade (menor índice)
    const porAluno = new Map<string, any>();
    for (const m of doMes) {
      const alunoId = m.aluno?.id ?? m.alunoId ?? m.id;
      const prioAtual = PRIORIDADE_STATUS[calcularStatusDisplay(m)] ?? 5;
      const existente = porAluno.get(alunoId);
      const prioExistente = existente ? (PRIORIDADE_STATUS[calcularStatusDisplay(existente)] ?? 5) : 99;
      if (!existente || prioAtual < prioExistente) {
        porAluno.set(alunoId, m);
      }
    }
    return Array.from(porAluno.values());
  })();

  const salvarConfig = async () => {
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      const res = await fetchComRetry(`${API_URL}/api/professor/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ professorId, chavePix, linkPagamentoCartao: linkCartao }),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert('Salvo!', 'Dados de pagamento atualizados.');
        setModalConfig(false);
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível salvar.');
      }
    } catch {
      Alert.alert('Erro', 'Verifique a conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarPagamento = async (id: string, nomeAluno: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/pagamentos/${id}/aprovar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMensalidades(prev => prev.map(m => m.id === id ? { ...m, status: 'PAGO' } : m));
        Alert.alert('Confirmado!', `Pagamento de ${nomeAluno} confirmado.`);
      } else {
        Alert.alert('Erro', 'Não foi possível confirmar.');
      }
    } catch {
      Alert.alert('Erro de Conexão', 'Verifique o servidor.');
    }
  };

  const notificarAluno = async (id: string, nomeAluno: string) => {
    setNotificando(id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/pagamentos/${id}/notificar-vencimento`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        Alert.alert('Notificação Enviada!', `${nomeAluno} foi avisado sobre o vencimento.`);
      } else {
        const dados = await res.json();
        Alert.alert('Atenção', dados.erro || 'Não foi possível notificar o aluno.');
      }
    } catch {
      Alert.alert('Erro', 'Falha ao enviar notificação.');
    } finally {
      setNotificando(null);
    }
  };

  const totalArrecadado = mensalidadesMes
    .filter(m => m.status === 'PAGO')
    .reduce((acc, cur) => acc + Number(cur.valor), 0);
  const totalPrevisto = mensalidadesMes.reduce((acc, cur) => acc + Number(cur.valor), 0);
  const percentual = totalPrevisto > 0 ? (totalArrecadado / totalPrevisto) * 100 : 0;

  const renderItem = ({ item }: { item: any }) => {
    const displayStatus = calcularStatusDisplay(item);
    const cfg = STATUS_MAP[displayStatus] || STATUS_MAP['EM_DIA'];
    const temAcao = displayStatus === 'A_VENCER' || displayStatus === 'EM_ANALISE';

    return (
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nomeAluno}>{item.aluno?.nome || 'Aluno'}</Text>
            <Text style={styles.vencimento}>
              Venc: {new Date(item.vencimento).toLocaleDateString('pt-BR')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={styles.valor}>
              R$ {Number(item.valor).toFixed(2).replace('.', ',')}
            </Text>
            <View style={[styles.badge, { backgroundColor: cfg.fundo }]}>
              <Text style={[styles.textoBadge, { color: cfg.cor }]}>{cfg.label}</Text>
            </View>
          </View>
        </View>

        {displayStatus === 'EM_ANALISE' && item.comprovanteUrl && (
          <View style={styles.comprovanteBox}>
            <Ionicons name="document-attach-outline" size={16} color="#7B1FA2" />
            <Text style={styles.comprovanteTexto} numberOfLines={3}>
              {item.comprovanteUrl}
            </Text>
          </View>
        )}

        {temAcao && (
          <View style={[styles.acoesRow, { borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 10 }]}>
            {displayStatus === 'A_VENCER' && (
              <TouchableOpacity
                style={styles.botaoNotificar}
                onPress={() => notificarAluno(item.id, item.aluno?.nome)}
                disabled={notificando === item.id}
              >
                {notificando === item.id
                  ? <ActivityIndicator size="small" color={CORES.fundo} />
                  : <Ionicons name="notifications-outline" size={16} color={CORES.fundo} />
                }
                <Text style={styles.textoBotaoNotificar}>Notificar Aluno</Text>
              </TouchableOpacity>
            )}
            {displayStatus === 'EM_ANALISE' && (
              <TouchableOpacity
                style={styles.botaoConfirmar}
                onPress={() => confirmarPagamento(item.id, item.aluno?.nome)}
              >
                <Ionicons name="checkmark-circle" size={16} color={CORES.fundo} />
                <Text style={styles.textoBotaoConfirmar}>Confirmar Pagamento</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

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
        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          style={styles.hamburger}
        >
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>FINANCEIRO</Text>
        <TouchableOpacity onPress={() => setModalConfig(true)} style={styles.configBtn}>
          <Ionicons name="settings-outline" size={22} color={CORES.acento} />
        </TouchableOpacity>
      </View>

      <View style={styles.resumoContainer}>
        <View style={styles.cardTotal}>
          <Text style={styles.labelMes}>
            {NOMES_MESES[mesAtual].toUpperCase()} {anoAtual}
          </Text>
          <Text style={styles.labelTotal}>TOTAL RECEBIDO</Text>
          <Text style={styles.valorTotal}>
            R$ {totalArrecadado.toFixed(2).replace('.', ',')}
          </Text>
          <View style={styles.barraFundo}>
            <View style={[styles.barraProgresso, { width: `${Math.min(percentual, 100)}%` as any }]} />
          </View>
          <Text style={styles.textoProgresso}>
            Previsto: R$ {totalPrevisto.toFixed(2).replace('.', ',')} — {percentual.toFixed(0)}%
          </Text>
        </View>
      </View>

      <Text style={styles.tituloSecao}>MENSALIDADES DO MÊS</Text>

      <FlatList
        data={mensalidadesMes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="wallet-outline" size={40} color={CORES.borda} />
            <Text style={{ color: CORES.secundaria, fontSize: 15, marginTop: 12 }}>
              Nenhuma cobrança neste mês.
            </Text>
          </View>
        }
        renderItem={renderItem}
      />

      <Modal visible={modalConfig} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>DADOS DE PAGAMENTO</Text>
              <TouchableOpacity onPress={() => setModalConfig(false)}>
                <Ionicons name="close" size={24} color={CORES.primaria} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDesc}>
                Esses dados serão exibidos para seus alunos na tela Financeiro.
              </Text>
              <Text style={styles.fieldLabel}>Chave PIX</Text>
              <TextInput
                style={styles.input}
                value={chavePix}
                onChangeText={setChavePix}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                placeholderTextColor={CORES.secundaria}
                selectionColor={CORES.acento}
              />
              <Text style={styles.fieldLabel}>Link de Pagamento (Cartão)</Text>
              <TextInput
                style={styles.input}
                value={linkCartao}
                onChangeText={setLinkCartao}
                placeholder="https://mpago.la/..."
                placeholderTextColor={CORES.secundaria}
                selectionColor={CORES.acento}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={[styles.btnSalvar, salvando && { opacity: 0.6 }]}
                onPress={salvarConfig}
                disabled={salvando}
              >
                <Text style={styles.btnSalvarTexto}>{salvando ? 'SALVANDO...' : 'SALVAR'}</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CORES.borda,
  },
  hamburger: { padding: 4 },
  titulo: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  configBtn: { padding: 4 },

  resumoContainer: { padding: 20 },
  cardTotal: {
    backgroundColor: CORES.superficie, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: CORES.borda,
  },
  labelMes: { color: CORES.acento, fontSize: 11, letterSpacing: 2, fontWeight: 'bold', marginBottom: 4 },
  labelTotal: { color: CORES.secundaria, fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  valorTotal: { color: CORES.acento, fontSize: 32, fontWeight: 'bold', marginVertical: 8, fontFamily: 'monospace' },
  barraFundo: { height: 6, backgroundColor: CORES.borda, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  barraProgresso: { height: '100%', backgroundColor: CORES.sucesso, borderRadius: 3 },
  textoProgresso: { color: CORES.secundaria, fontSize: 12 },

  tituloSecao: {
    paddingHorizontal: 20, paddingBottom: 12,
    color: CORES.secundaria, fontSize: 11, fontWeight: 'bold', letterSpacing: 2,
  },
  lista: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    backgroundColor: CORES.superficie, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: CORES.borda,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  nomeAluno: { color: CORES.primaria, fontSize: 16, fontWeight: 'bold' },
  vencimento: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },
  valor: { color: CORES.acento, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  textoBadge: { fontSize: 11, fontWeight: 'bold' },

  comprovanteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EDE7F6', borderRadius: 8, padding: 10, marginBottom: 10,
  },
  comprovanteTexto: { color: '#4A148C', fontSize: 13, flex: 1, lineHeight: 18 },

  acoesRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  botaoNotificar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CORES.aviso, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  textoBotaoNotificar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 13 },
  botaoConfirmar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CORES.sucesso, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  textoBotaoConfirmar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 13 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: CORES.superficie, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '75%', borderTopWidth: 1, borderColor: CORES.borda,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },
  modalDesc: { color: CORES.secundaria, fontSize: 13, lineHeight: 20, marginBottom: 20 },
  fieldLabel: { color: CORES.secundaria, fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: CORES.fundo, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    color: CORES.primaria, fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: CORES.borda,
  },
  btnSalvar: {
    backgroundColor: CORES.acento, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 4,
  },
  btnSalvarTexto: { color: CORES.fundo, fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },
});
