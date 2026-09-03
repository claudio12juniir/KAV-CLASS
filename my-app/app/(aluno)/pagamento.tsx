import { BASE_URL, fetchComRetry } from '../api';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { CORES } from '../../constants/theme';

const API_URL = BASE_URL;

type MetodoPagamento = 'pix' | 'boleto' | 'cartao';

interface Parcela {
  id: string;
  mes: string;
  vencimento: string;
  valor: number;
  status: string;
  comprovante?: string;
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; fundo: string; icone: any }> = {
  PAGO:       { label: 'Paga',       cor: CORES.sucesso, fundo: '#E8F8EE', icone: 'checkmark-circle' },
  EM_ANALISE: { label: 'Em Análise', cor: CORES.info,    fundo: '#E8F0FF', icone: 'time'             },
  PENDENTE:   { label: 'Pendente',   cor: CORES.aviso,   fundo: '#FFF4E5', icone: 'alert-circle'     },
  ATRASADO:   { label: 'Vencida',    cor: CORES.erro,    fundo: '#FFEBEB', icone: 'close-circle'     },
};
const getStatus = (s: string) => STATUS_CONFIG[s] || STATUS_CONFIG['PENDENTE'];
const fmt = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

export default function PagamentoAlunoScreen() {
  const navigation = useNavigation();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [chavePix, setChavePix] = useState<string | null>(null);
  const [linkCartao, setLinkCartao] = useState<string | null>(null);

  // Matrícula formal (S1.1/S2.2) — quando o aluno tem, as faturas vêm por
  // matrícula (com cobrança automática, S3.1). Sem matrícula (fluxo antigo,
  // ainda a maioria da base hoje), cai no comportamento de sempre:
  // /api/aluno/pagamentos direto por alunoId, sem cobrança automática.
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [matriculaSelecionadaId, setMatriculaSelecionadaId] = useState<string | null>(null);
  const [cobranca, setCobranca] = useState<{ ativa: boolean; temCartao: boolean; ultimoErro: string | null; ultimaTentativa: string | null } | null>(null);
  const [ativandoCobranca, setAtivandoCobranca] = useState(false);

  const [parcelaSelecionada, setParcelaSelecionada] = useState<Parcela | null>(null);
  const [metodo, setMetodo] = useState<MetodoPagamento | null>(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [nomeComprovante, setNomeComprovante] = useState('');
  const [comprovanteAnexo, setComprovanteAnexo] = useState<{ uri: string; nome: string; mime: string } | null>(null);
  const [modalImagemAnexo, setModalImagemAnexo] = useState(false);

  const parcelaAtual = parcelas.find(p => p.status === 'PENDENTE' || p.status === 'ATRASADO' || p.status === 'EM_ANALISE');

  const mapearParcelas = (lista: any[]): Parcela[] => lista.map((d: any) => ({
    id: d.id,
    mes: d.mesReferencia || new Date(d.vencimento).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    vencimento: new Date(d.vencimento).toLocaleDateString('pt-BR'),
    valor: Number(d.valor),
    status: d.status.toUpperCase(),
  }));

  const carregarFaturasEcobranca = useCallback(async (matriculaId: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const headers = { Authorization: `Bearer ${token}` };
    const [resFaturas, resCobranca] = await Promise.all([
      fetchComRetry(`${API_URL}/api/matriculas/${matriculaId}/faturas`, { headers }),
      fetchComRetry(`${API_URL}/api/matriculas/${matriculaId}/cobranca-automatica`, { headers }),
    ]);
    if (resFaturas.ok) {
      const dados = await resFaturas.json();
      setParcelas(mapearParcelas([...dados.abertas, ...dados.atrasadas, ...dados.pagas, ...dados.outras]));
    }
    setCobranca(resCobranca.ok ? await resCobranca.json() : null);
  }, []);

  const carregarFinanceiro = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const alunoId = await SecureStore.getItemAsync('kav_aluno_id') || '';
      const headers = { Authorization: `Bearer ${token}` };

      const [resMatriculas, resConfig] = await Promise.all([
        fetchComRetry(`${API_URL}/api/aluno/matriculas`, { headers }),
        fetchComRetry(`${API_URL}/api/aluno/professor-config?alunoId=${alunoId}`, { headers }),
      ]);

      if (resConfig.ok) {
        const cfg = await resConfig.json();
        setChavePix(cfg.chavePix || null);
        setLinkCartao(cfg.linkPagamentoCartao || null);
      }

      const listaMatriculas = resMatriculas.ok ? await resMatriculas.json() : [];
      setMatriculas(listaMatriculas);

      if (listaMatriculas.length > 0) {
        const idAtual = matriculaSelecionadaId && listaMatriculas.some((m: any) => m.id === matriculaSelecionadaId)
          ? matriculaSelecionadaId
          : listaMatriculas[0].id;
        setMatriculaSelecionadaId(idAtual);
        await carregarFaturasEcobranca(idAtual);
      } else {
        setMatriculaSelecionadaId(null);
        setCobranca(null);
        const resPag = await fetchComRetry(`${API_URL}/api/aluno/pagamentos?alunoId=${alunoId}`, { headers });
        if (resPag.ok) {
          setParcelas(mapearParcelas(await resPag.json()));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarFaturasEcobranca]);

  useFocusEffect(useCallback(() => { carregarFinanceiro(); }, [carregarFinanceiro]));

  const selecionarMatricula = (matriculaId: string) => {
    setMatriculaSelecionadaId(matriculaId);
    setCarregando(true);
    carregarFaturasEcobranca(matriculaId).finally(() => setCarregando(false));
  };

  const ativarCobranca = async () => {
    if (!matriculaSelecionadaId) return;
    setAtivandoCobranca(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetchComRetry(`${API_URL}/api/matriculas/${matriculaSelecionadaId}/cobranca-automatica/iniciar`, {
        method: 'POST',
        headers,
      });
      const dados = await res.json();
      if (!res.ok || !dados.url) {
        Alert.alert('Não foi possível ativar', dados.erro || 'Tente novamente.');
        return;
      }

      await WebBrowser.openAuthSessionAsync(dados.url, 'kavclass://cobranca-automatica-sucesso');

      const resVerify = await fetchComRetry(
        `${API_URL}/api/matriculas/${matriculaSelecionadaId}/cobranca-automatica/verificar/${dados.sessionId}`,
        { headers }
      );
      if (resVerify.ok) {
        const verif = await resVerify.json();
        Alert.alert(
          verif.ativo ? 'Cobrança automática ativada!' : 'Cadastro não concluído',
          verif.ativo
            ? 'Sua mensalidade será cobrada automaticamente no cartão cadastrado.'
            : 'Se você preencheu os dados do cartão, aguarde alguns segundos e tente de novo.'
        );
      }
      await carregarFaturasEcobranca(matriculaSelecionadaId);
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setAtivandoCobranca(false);
    }
  };

  const desativarCobranca = () => {
    if (!matriculaSelecionadaId) return;
    Alert.alert('Desativar cobrança automática?', 'Você vai precisar pagar manualmente até ativar de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desativar',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await SecureStore.getItemAsync('kav_token');
            await fetchComRetry(`${API_URL}/api/matriculas/${matriculaSelecionadaId}/cobranca-automatica/desativar`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            await carregarFaturasEcobranca(matriculaSelecionadaId);
          } catch {
            Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
          }
        },
      },
    ]);
  };

  const abrirModal = (parcela: Parcela) => {
    if (parcela.status === 'PAGO') return;
    setParcelaSelecionada(parcela);
    setMetodo(null);
    setNomeComprovante('');
    setComprovanteAnexo(null);
    setModalVisivel(true);
  };

  const selecionarComprovante = () => {
    Alert.alert('Anexar Comprovante', 'Escolha a origem', [
      {
        text: 'Câmera', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à câmera não autorizado.'); return; }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
          if (!res.canceled && res.assets[0].base64) {
            setComprovanteAnexo({
              uri: `data:image/jpeg;base64,${res.assets[0].base64}`,
              nome: res.assets[0].fileName || 'comprovante.jpg',
              mime: 'image/jpeg',
            });
          }
        },
      },
      {
        text: 'Galeria', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permissão negada', 'Acesso à galeria não autorizado.'); return; }
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
          if (!res.canceled && res.assets[0].base64) {
            setComprovanteAnexo({
              uri: `data:image/jpeg;base64,${res.assets[0].base64}`,
              nome: res.assets[0].fileName || 'comprovante.jpg',
              mime: 'image/jpeg',
            });
          }
        },
      },
      {
        text: 'Arquivo (PDF)', onPress: async () => {
          const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
          if (res.canceled || !res.assets?.length) return;
          const arquivo = res.assets[0];
          try {
            const b64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: 'base64' });
            setComprovanteAnexo({
              uri: `data:application/pdf;base64,${b64}`,
              nome: arquivo.name,
              mime: 'application/pdf',
            });
          } catch {
            Alert.alert('Erro', `Não foi possível ler: ${arquivo.name}`);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const copiarPix = () => {
    if (!chavePix) { Alert.alert('Indisponível', 'O professor ainda não configurou a chave PIX.'); return; }
    Alert.alert('Chave PIX Copiada!', `Chave: ${chavePix}\n\nApós pagar, volte aqui e envie o comprovante.`);
  };

  const abrirLinkCartao = () => {
    if (linkCartao) { Linking.openURL(linkCartao); }
    else { Alert.alert('Indisponível', 'O professor ainda não configurou o link de pagamento por cartão.'); }
  };

  const enviarComprovante = async () => {
    if (!comprovanteAnexo && !nomeComprovante.trim()) {
      Alert.alert('Atenção', 'Anexe uma foto/arquivo ou descreva o comprovante antes de enviar.');
      return;
    }
    if (!parcelaSelecionada) return;
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/aluno/pagamentos/${parcelaSelecionada.id}/comprovante`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comprovanteUrl: comprovanteAnexo?.uri ?? nomeComprovante }),
      });
      if (!res.ok) {
        Alert.alert('Erro', 'Não foi possível enviar o comprovante. Tente novamente.');
        return;
      }
    } catch {
      Alert.alert('Erro de Conexão', 'Verifique sua conexão e tente novamente.');
      return;
    }

    setParcelas(prev => prev.map(p =>
      p.id === parcelaSelecionada.id ? { ...p, status: 'EM_ANALISE' } : p
    ));
    setModalVisivel(false);
    Alert.alert('Comprovante Enviado!', 'Aguarde a confirmação do professor.');
  };

  const renderParcela = ({ item }: { item: Parcela }) => {
    const cfg = getStatus(item.status);
    const podeAbrir = item.status !== 'PAGO';
    return (
      <TouchableOpacity
        style={[styles.cardParcela, !podeAbrir && { opacity: 0.5 }]}
        onPress={() => abrirModal(item)}
        activeOpacity={podeAbrir ? 0.75 : 1}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.mesParcela}>{item.mes}</Text>
          <Text style={styles.vencimentoParcela}>Vence: {item.vencimento}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text style={styles.valorParcela}>{fmt(item.valor)}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.fundo }]}>
            <Ionicons name={cfg.icone} size={12} color={cfg.cor} />
            <Text style={[styles.textoBadge, { color: cfg.cor }]}>{cfg.label}</Text>
          </View>
        </View>
        {podeAbrir && <Ionicons name="chevron-forward" size={18} color={CORES.secundaria} style={{ marginLeft: 6 }} />}
      </TouchableOpacity>
    );
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
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.titulo}>FINANCEIRO</Text>
        <View style={{ width: 40 }} />
      </View>

      {matriculas.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsMatriculaRow}
        >
          {matriculas.map((m: any) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chipMatricula, matriculaSelecionadaId === m.id && styles.chipMatriculaAtiva]}
              onPress={() => selecionarMatricula(m.id)}
            >
              <Text style={[styles.textoChipMatricula, matriculaSelecionadaId === m.id && styles.textoChipMatriculaAtivo]}>
                {m.turma?.nome || m.professor?.nome || 'Matrícula'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {matriculas.length > 0 && (
        <View style={styles.cardCobranca}>
          <View style={styles.cabecalhoCobranca}>
            <Text style={styles.tituloCobranca}>Cobrança Automática</Text>
            {cobranca?.ativa && (
              <View style={[styles.badge, { backgroundColor: '#E8F8EE' }]}>
                <Ionicons name="checkmark-circle" size={12} color={CORES.sucesso} />
                <Text style={[styles.textoBadge, { color: CORES.sucesso }]}>Ativa</Text>
              </View>
            )}
          </View>

          {cobranca?.ativa ? (
            <>
              <Text style={styles.descCobranca}>
                Sua mensalidade é cobrada automaticamente no cartão cadastrado, sem precisar enviar comprovante.
              </Text>
              {cobranca.ultimoErro && (
                <Text style={[styles.descCobranca, { color: CORES.erro }]}>
                  Última cobrança falhou: {cobranca.ultimoErro}
                </Text>
              )}
              <TouchableOpacity style={styles.botaoDesativarCobranca} onPress={desativarCobranca}>
                <Text style={styles.textoBotaoDesativarCobranca}>Desativar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.descCobranca}>
                Cadastre um cartão uma vez e nunca mais precise enviar comprovante todo mês.
              </Text>
              <TouchableOpacity
                style={[styles.botaoAtivarCobranca, ativandoCobranca && { opacity: 0.6 }]}
                onPress={ativarCobranca}
                disabled={ativandoCobranca}
              >
                {ativandoCobranca
                  ? <SyncLoader color={CORES.fundo} />
                  : <Text style={styles.textoBotaoAtivarCobranca}>Ativar cobrança automática</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {parcelaAtual && (
        <TouchableOpacity
          style={[styles.cardDestaque, { borderColor: getStatus(parcelaAtual.status).cor }]}
          onPress={() => abrirModal(parcelaAtual)}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.mesDestaque}>{parcelaAtual.mes}</Text>
            <View style={[styles.badge, { backgroundColor: getStatus(parcelaAtual.status).cor }]}>
              <Text style={[styles.textoBadge, { color: CORES.fundo }]}>{getStatus(parcelaAtual.status).label}</Text>
            </View>
          </View>
          <Text style={styles.valorDestaque}>{fmt(parcelaAtual.valor)}</Text>
          <Text style={styles.vencimentoDestaque}>Vence em: {parcelaAtual.vencimento}</Text>
          {parcelaAtual.status !== 'EM_ANALISE' && (
            <View style={styles.botaoPagar}>
              <Text style={styles.textoBotaoPagar}>Ver opções de pagamento</Text>
              <Ionicons name="arrow-forward" size={16} color={CORES.fundo} />
            </View>
          )}
          {parcelaAtual.status === 'EM_ANALISE' && (
            <View style={styles.avisoAnalise}>
              <Ionicons name="information-circle-outline" size={16} color={CORES.info} />
              <Text style={[styles.textoAnalise, { color: CORES.info }]}>Comprovante enviado — aguardando aprovação</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <Text style={styles.tituloHistorico}>HISTÓRICO DE PARCELAS</Text>

      {parcelas.length === 0 ? (
        <Text style={{ color: CORES.secundaria, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 }}>
          Nenhuma cobrança gerada ainda.
        </Text>
      ) : (
        <FlatList
          data={parcelas}
          keyExtractor={item => item.id}
          renderItem={renderParcela}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={modalVisivel} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>
                {parcelaSelecionada?.mes} — {fmt(parcelaSelecionada?.valor ?? 0)}
              </Text>
              <TouchableOpacity onPress={() => setModalVisivel(false)}>
                <Ionicons name="close" size={24} color={CORES.primaria} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!metodo && (
                <>
                  <Text style={styles.instrucao}>Escolha a forma de pagamento:</Text>

                  <TouchableOpacity style={styles.cardMetodo} onPress={() => setMetodo('pix')}>
                    <View style={[styles.iconeMetodo, { backgroundColor: '#E0F2EE' }]}>
                      <Ionicons name="qr-code" size={26} color={CORES.sucesso} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tituloMetodo}>Pix</Text>
                      <Text style={styles.descMetodo}>Copie a chave e envie o comprovante</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={CORES.secundaria} />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cardMetodo} onPress={() => setMetodo('cartao')}>
                    <View style={[styles.iconeMetodo, { backgroundColor: '#FFF3CD' }]}>
                      <Ionicons name="card" size={26} color={CORES.aviso} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tituloMetodo}>Cartão de Crédito</Text>
                      <Text style={styles.descMetodo}>Pague via link seguro</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={CORES.secundaria} />
                  </TouchableOpacity>
                </>
              )}

              {metodo === 'pix' && (
                <>
                  <TouchableOpacity style={styles.voltarMetodo} onPress={() => setMetodo(null)}>
                    <Ionicons name="arrow-back" size={18} color={CORES.primaria} />
                    <Text style={styles.textoVoltar}>Voltar</Text>
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>Chave PIX do Professor:</Text>
                  <View style={styles.boxChavePix}>
                    <Text style={styles.chavePix}>{chavePix || 'Não configurada'}</Text>
                    {chavePix && (
                      <TouchableOpacity style={styles.botaoCopiar} onPress={copiarPix}>
                        <Ionicons name="copy-outline" size={16} color={CORES.fundo} />
                        <Text style={styles.textoCopiar}>Copiar</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {[
                    'Abra o app do seu banco',
                    'Vá em Pix → Pagar → Chave Pix',
                    `Digite o valor: ${fmt(parcelaSelecionada?.valor ?? 0)}`,
                    'Pague e salve o comprovante',
                    'Volte aqui e envie o comprovante abaixo',
                  ].map((passo, i) => (
                    <View key={i} style={styles.passo}>
                      <View style={styles.numeroPasso}><Text style={styles.textoNumeroPasso}>{i + 1}</Text></View>
                      <Text style={styles.textoPasso}>{passo}</Text>
                    </View>
                  ))}

                  <Text style={styles.fieldLabel}>Comprovante:</Text>

                  {comprovanteAnexo ? (
                    <View style={styles.anexoPreview}>
                      {comprovanteAnexo.mime === 'application/pdf' ? (
                        <View style={styles.anexoChip}>
                          <Ionicons name="document-text" size={20} color={CORES.acento} />
                          <Text style={styles.anexoNome} numberOfLines={1}>{comprovanteAnexo.nome}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => setModalImagemAnexo(true)}>
                          <Image source={{ uri: comprovanteAnexo.uri }} style={styles.anexoThumb} resizeMode="cover" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.anexoRemover} onPress={() => setComprovanteAnexo(null)}>
                        <Ionicons name="close-circle" size={22} color={CORES.erro} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.botaoAnexar} onPress={selecionarComprovante}>
                      <Ionicons name="attach" size={20} color={CORES.acento} />
                      <Text style={styles.textoBotaoAnexar}>Anexar foto ou arquivo do comprovante</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Observação (opcional):</Text>
                  <TextInput
                    style={styles.inputComprovante}
                    placeholder="Ex: Pix enviado às 14h32"
                    placeholderTextColor={CORES.secundaria}
                    multiline
                    autoCorrect
                    spellCheck
                    value={nomeComprovante}
                    onChangeText={setNomeComprovante}
                    textAlignVertical="top"
                    selectionColor={CORES.acento}
                  />
                  <TouchableOpacity style={styles.botaoEnviar} onPress={enviarComprovante}>
                    <Text style={styles.textoBotaoEnviar}>ENVIAR COMPROVANTE</Text>
                  </TouchableOpacity>
                </>
              )}

              {metodo === 'cartao' && (
                <>
                  <TouchableOpacity style={styles.voltarMetodo} onPress={() => setMetodo(null)}>
                    <Ionicons name="arrow-back" size={18} color={CORES.primaria} />
                    <Text style={styles.textoVoltar}>Voltar</Text>
                  </TouchableOpacity>

                  {[
                    'Clique em "Ir para o pagamento"',
                    'Digite os dados do cartão na página segura',
                    'Confirme o pagamento',
                    'O professor receberá a confirmação automaticamente',
                  ].map((passo, i) => (
                    <View key={i} style={styles.passo}>
                      <View style={styles.numeroPasso}><Text style={styles.textoNumeroPasso}>{i + 1}</Text></View>
                      <Text style={styles.textoPasso}>{passo}</Text>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.botaoCartao} onPress={abrirLinkCartao}>
                    <Ionicons name="open-outline" size={20} color={CORES.fundo} />
                    <Text style={styles.textoBotaoCartao}>IR PARA O PAGAMENTO</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalImagemAnexo} transparent animationType="fade" onRequestClose={() => setModalImagemAnexo(false)}>
        <Pressable style={styles.overlayImagem} onPress={() => setModalImagemAnexo(false)}>
          {comprovanteAnexo && (
            <Image source={{ uri: comprovanteAnexo.uri }} style={styles.imagemAnexoCompleta} resizeMode="contain" />
          )}
        </Pressable>
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

  chipsMatriculaRow: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  chipMatricula: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: CORES.superficie, borderWidth: 1, borderColor: CORES.borda,
  },
  chipMatriculaAtiva: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  textoChipMatricula: { color: CORES.secundaria, fontSize: 13, fontWeight: '600' },
  textoChipMatriculaAtivo: { color: CORES.fundo },

  cardCobranca: {
    marginHorizontal: 20, marginTop: 16, backgroundColor: CORES.superficie,
    borderRadius: 14, padding: 18, borderWidth: 1, borderColor: CORES.borda,
  },
  cabecalhoCobranca: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tituloCobranca: { color: CORES.primaria, fontSize: 15, fontWeight: 'bold' },
  descCobranca: { color: CORES.secundaria, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  botaoAtivarCobranca: {
    backgroundColor: CORES.acento, borderRadius: 10, padding: 13, alignItems: 'center',
  },
  textoBotaoAtivarCobranca: { color: CORES.fundo, fontWeight: 'bold', fontSize: 14 },
  botaoDesativarCobranca: {
    borderRadius: 10, padding: 13, alignItems: 'center',
    borderWidth: 1, borderColor: CORES.erro,
  },
  textoBotaoDesativarCobranca: { color: CORES.erro, fontWeight: 'bold', fontSize: 14 },

  cardDestaque: {
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
    backgroundColor: CORES.superficie, borderRadius: 14, padding: 20, borderWidth: 2,
  },
  mesDestaque: { color: CORES.primaria, fontSize: 16, fontWeight: '600' },
  valorDestaque: { color: CORES.acento, fontSize: 32, fontWeight: 'bold', fontFamily: 'monospace', marginBottom: 4 },
  vencimentoDestaque: { color: CORES.secundaria, fontSize: 13, marginBottom: 14 },
  botaoPagar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CORES.acento, borderRadius: 10, padding: 12,
  },
  textoBotaoPagar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 14 },
  avisoAnalise: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F0FF', borderRadius: 10, padding: 12 },
  textoAnalise: { fontSize: 13, flex: 1, lineHeight: 18 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  textoBadge: { fontSize: 11, fontWeight: 'bold' },

  tituloHistorico: {
    paddingHorizontal: 20, color: CORES.secundaria, fontSize: 11,
    fontWeight: 'bold', letterSpacing: 2, marginVertical: 14,
  },
  cardParcela: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.superficie,
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: CORES.borda,
  },
  mesParcela: { color: CORES.primaria, fontSize: 14, fontWeight: 'bold' },
  vencimentoParcela: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },
  valorParcela: { color: CORES.acento, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: CORES.superficie, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: CORES.borda,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitulo: { color: CORES.primaria, fontSize: 16, fontWeight: 'bold' },
  instrucao: { color: CORES.secundaria, fontSize: 14, marginBottom: 16 },

  cardMetodo: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CORES.fundo, borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: CORES.borda,
  },
  iconeMetodo: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tituloMetodo: { color: CORES.primaria, fontSize: 15, fontWeight: 'bold' },
  descMetodo: { color: CORES.secundaria, fontSize: 12, marginTop: 2 },

  voltarMetodo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  textoVoltar: { color: CORES.primaria, fontWeight: '600', fontSize: 15 },

  fieldLabel: { color: CORES.secundaria, fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  boxChavePix: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.fundo,
    borderRadius: 10, padding: 14, marginBottom: 20, gap: 12,
    borderWidth: 1, borderColor: CORES.borda,
  },
  chavePix: { flex: 1, color: CORES.acento, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
  botaoCopiar: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: CORES.acento, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  textoCopiar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 13 },

  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  numeroPasso: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center',
  },
  textoNumeroPasso: { color: CORES.fundo, fontSize: 11, fontWeight: 'bold' },
  textoPasso: { color: CORES.secundaria, fontSize: 14, flex: 1, lineHeight: 20 },

  inputComprovante: {
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 14,
    color: CORES.primaria, fontSize: 14, minHeight: 80,
    borderWidth: 1, borderColor: CORES.borda, marginBottom: 16, marginTop: 4,
  },
  botaoAnexar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: CORES.acento, borderStyle: 'dashed',
  },
  textoBotaoAnexar: { color: CORES.acento, fontWeight: '600', fontSize: 13 },
  anexoPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4,
  },
  anexoThumb: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: CORES.borda },
  anexoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
    backgroundColor: CORES.fundo, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: CORES.borda,
  },
  anexoNome: { color: CORES.primaria, fontSize: 13, flex: 1 },
  anexoRemover: { padding: 2 },
  overlayImagem: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  imagemAnexoCompleta: { width: '100%', height: '80%' },
  botaoEnviar: {
    backgroundColor: CORES.acento, borderRadius: 10, padding: 15, alignItems: 'center',
  },
  textoBotaoEnviar: { color: CORES.fundo, fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },

  botaoCartao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: CORES.aviso, borderRadius: 12, padding: 15, marginTop: 10,
  },
  textoBotaoCartao: { color: CORES.fundo, fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
});
