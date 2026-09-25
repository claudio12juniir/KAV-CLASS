// Financeiro do aluno INSTITUTION — pix/boleto(link)/cartão + comprovante,
// cobrança automática por matrícula. Praticamente idêntico a
// (aluno)/pagamento.tsx (mesmos endpoints, já funcionam igual pros dois
// casos), só com tema ERP e shell da INSTITUTION em vez do header manual
// com DrawerActions. Arquivo copiado como base, não importado, mesma
// decisão de isolamento das fases anteriores.
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { Badge, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

const API_URL = BASE_URL;

type MetodoPagamento = 'pix' | 'boleto' | 'cartao';

interface Parcela {
  id: string;
  mes: string;
  vencimento: string;
  valor: number;
  status: string;
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; fundo: string; icone: any }> = {
  PAGO: { label: 'Paga', cor: ERP.sucesso, fundo: ERP.sucessoSoft, icone: 'checkmark-circle' },
  EM_ANALISE: { label: 'Em Análise', cor: ERP.info, fundo: ERP.infoSoft, icone: 'time' },
  PENDENTE: { label: 'Pendente', cor: ERP.aviso, fundo: ERP.avisoSoft, icone: 'alert-circle' },
  ATRASADO: { label: 'Vencida', cor: ERP.perigo, fundo: ERP.perigoSoft, icone: 'close-circle' },
};
const getStatusCfg = (s: string) => STATUS_CONFIG[s] || STATUS_CONFIG['PENDENTE'];
const fmt = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

export default function FinanceiroAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();

  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [chavePix, setChavePix] = useState<string | null>(null);
  const [linkCartao, setLinkCartao] = useState<string | null>(null);

  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [matriculaSelecionadaId, setMatriculaSelecionadaId] = useState<string | null>(null);
  const [cobranca, setCobranca] = useState<{ ativa: boolean; gateway?: 'STRIPE' | 'ASAAS' | null; temCartao: boolean; ultimoErro: string | null; ultimaTentativa: string | null } | null>(null);
  const [ativandoCobrancaAsaas, setAtivandoCobrancaAsaas] = useState(false);

  const [parcelaSelecionada, setParcelaSelecionada] = useState<Parcela | null>(null);
  const [metodo, setMetodo] = useState<MetodoPagamento | null>(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [nomeComprovante, setNomeComprovante] = useState('');
  const [comprovanteAnexo, setComprovanteAnexo] = useState<{ uri: string; nome: string; mime: string } | null>(null);
  const [modalImagemAnexo, setModalImagemAnexo] = useState(false);

  const [recibo, setRecibo] = useState<any | null>(null);
  const [carregandoRecibo, setCarregandoRecibo] = useState(false);

  const verRecibo = async (id: string) => {
    setCarregandoRecibo(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/pagamentos/${id}/recibo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) setRecibo(dados);
      else Alert.alert('Não foi possível gerar o recibo', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Erro', 'Falha na conexão.');
    } finally {
      setCarregandoRecibo(false);
    }
  };

  const compartilharRecibo = async () => {
    if (!recibo) return;
    const texto = `Recibo #${recibo.numeroRecibo}\nAluno: ${recibo.aluno}\nProfessor: ${recibo.professor}\nValor: R$ ${Number(recibo.valor).toFixed(2).replace('.', ',')}\nPago em: ${recibo.dataPagamento ? new Date(recibo.dataPagamento).toLocaleDateString('pt-BR') : '—'}`;
    try {
      const fileUri = `${FileSystem.cacheDirectory}recibo_${recibo.numeroRecibo}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, texto);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { dialogTitle: 'Recibo' });
    } catch {
      Alert.alert('Erro', 'Não foi possível compartilhar o recibo.');
    }
  };

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
      const headers = { Authorization: `Bearer ${token}` };

      const [resMatriculas, resConfig] = await Promise.all([
        fetchComRetry(`${API_URL}/api/aluno/matriculas`, { headers }),
        fetchComRetry(`${API_URL}/api/aluno/professor-config`, { headers }),
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
        const resPag = await fetchComRetry(`${API_URL}/api/aluno/pagamentos`, { headers });
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

  useEffect(() => { carregarFinanceiro(); }, [carregarFinanceiro]);

  const selecionarMatricula = (matriculaId: string) => {
    setMatriculaSelecionadaId(matriculaId);
    setCarregando(true);
    carregarFaturasEcobranca(matriculaId).finally(() => setCarregando(false));
  };

  const ativarCobrancaAsaas = (billingType: 'PIX' | 'BOLETO' | 'UNDEFINED') => async () => {
    if (!matriculaSelecionadaId) return;
    setAtivandoCobrancaAsaas(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/matriculas/${matriculaSelecionadaId}/cobranca-automatica/asaas/iniciar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingType }),
      });
      const dados = await res.json();
      if (!res.ok) {
        Alert.alert('Não foi possível ativar', dados.erro || 'Tente novamente.');
        return;
      }
      if (dados.invoiceUrl) await WebBrowser.openAuthSessionAsync(dados.invoiceUrl, 'kavclass://cobranca-automatica-sucesso');
      Alert.alert('Cobrança recorrente ativada!', 'A cada mês, a escola gera uma nova fatura via Asaas (Pix/Boleto) automaticamente.');
      await carregarFaturasEcobranca(matriculaSelecionadaId);
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setAtivandoCobrancaAsaas(false);
    }
  };

  const escolherCobrancaAsaas = () => {
    Alert.alert('Ativar via Asaas', 'Escolha a forma de pagamento da mensalidade:', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pix', onPress: ativarCobrancaAsaas('PIX') },
      { text: 'Boleto', onPress: ativarCobrancaAsaas('BOLETO') },
    ]);
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
    if (!chavePix) { Alert.alert('Indisponível', 'A escola ainda não configurou a chave PIX.'); return; }
    Alert.alert('Chave PIX Copiada!', `Chave: ${chavePix}\n\nApós pagar, volte aqui e envie o comprovante.`);
  };

  const abrirLinkCartao = () => {
    if (linkCartao) { Linking.openURL(linkCartao); }
    else { Alert.alert('Indisponível', 'A escola ainda não configurou o link de pagamento por cartão.'); }
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
    Alert.alert('Comprovante Enviado!', 'Aguarde a confirmação da escola.');
  };

  const renderParcela = (item: Parcela) => {
    const cfg = getStatusCfg(item.status);
    const podeAbrir = item.status !== 'PAGO';
    return (
      <TouchableOpacity
        key={item.id}
        style={estilos.linhaParcela}
        onPress={() => (podeAbrir ? abrirModal(item) : verRecibo(item.id))}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={estilos.mesParcela}>{item.mes}</Text>
          <Text style={estilos.vencimentoParcela}>Vence: {item.vencimento}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text style={estilos.valorParcela}>{fmt(item.valor)}</Text>
          <Badge texto={cfg.label} tom={item.status === 'PAGO' ? 'sucesso' : item.status === 'EM_ANALISE' ? 'info' : item.status === 'ATRASADO' ? 'alerta' : 'aviso'} />
        </View>
        <Ionicons
          name={podeAbrir ? 'chevron-forward' : 'receipt-outline'}
          size={18}
          color={podeAbrir ? ERP.textoMuted : ERP.acentoForte}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>
    );
  };

  return (
    <MobileErpShell
      titulo="Financeiro"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Financeiro" subtitulo="Pagamentos com a escola" />

      {matriculas.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {matriculas.map((m: any) => (
              <TouchableOpacity
                key={m.id}
                style={[estilos.chipMatricula, matriculaSelecionadaId === m.id && estilos.chipMatriculaAtiva]}
                onPress={() => selecionarMatricula(m.id)}
              >
                <Text style={[estilos.chipMatriculaTexto, matriculaSelecionadaId === m.id && { color: '#fff' }]}>
                  {m.turma?.nome || m.professor?.nome || 'Matrícula'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {matriculas.length > 0 && (
        <SectionCard>
          <View style={estilos.cabecalhoCobranca}>
            <Text style={estilos.tituloCobranca}>Cobrança Automática</Text>
            {cobranca?.ativa && <Badge texto="Ativa" tom="sucesso" />}
          </View>

          {cobranca?.ativa ? (
            <>
              <Text style={estilos.descCobranca}>
                {cobranca.gateway === 'ASAAS'
                  ? 'A escola gera automaticamente uma nova fatura (Pix/Boleto) a cada mês, via Asaas.'
                  : 'Sua mensalidade é cobrada automaticamente no cartão cadastrado, sem precisar enviar comprovante.'}
              </Text>
              {cobranca.ultimoErro && (
                <Text style={[estilos.descCobranca, { color: ERP.perigo }]}>Última cobrança falhou: {cobranca.ultimoErro}</Text>
              )}
              <TouchableOpacity style={estilos.botaoDesativarCobranca} onPress={desativarCobranca}>
                <Text style={estilos.textoBotaoDesativarCobranca}>Desativar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={estilos.descCobranca}>
                Ative via Pix ou Boleto e a escola gera uma nova fatura automaticamente todo mês, sem precisar enviar comprovante.
              </Text>
              <TouchableOpacity
                style={[estilos.botaoAtivarCobranca, ativandoCobrancaAsaas && { opacity: 0.6 }]}
                onPress={escolherCobrancaAsaas}
                disabled={ativandoCobrancaAsaas}
              >
                {ativandoCobrancaAsaas ? <SyncLoader color="#fff" /> : <Text style={estilos.textoBotaoAtivarCobranca}>Ativar via Pix/Boleto</Text>}
              </TouchableOpacity>
            </>
          )}
        </SectionCard>
      )}

      {parcelaAtual && (
        <TouchableOpacity
          style={[estilos.cardDestaque, { borderColor: getStatusCfg(parcelaAtual.status).cor }]}
          onPress={() => abrirModal(parcelaAtual)}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={estilos.mesDestaque}>{parcelaAtual.mes}</Text>
            <Badge texto={getStatusCfg(parcelaAtual.status).label} tom={parcelaAtual.status === 'ATRASADO' ? 'alerta' : 'aviso'} />
          </View>
          <Text style={estilos.valorDestaque}>{fmt(parcelaAtual.valor)}</Text>
          <Text style={estilos.vencimentoDestaque}>Vence em: {parcelaAtual.vencimento}</Text>
          {parcelaAtual.status !== 'EM_ANALISE' ? (
            <View style={estilos.botaoPagar}>
              <Text style={estilos.textoBotaoPagar}>Ver opções de pagamento</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          ) : (
            <View style={estilos.avisoAnalise}>
              <Ionicons name="information-circle-outline" size={16} color={ERP.info} />
              <Text style={[estilos.textoAnalise, { color: ERP.info }]}>Comprovante enviado — aguardando aprovação</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <SectionCard titulo="Histórico de parcelas">
        {parcelas.length === 0 ? (
          <Text style={estilos.semDados}>Nenhuma cobrança gerada ainda.</Text>
        ) : (
          parcelas.map(renderParcela)
        )}
      </SectionCard>

      <Modal visible={modalVisivel} transparent animationType="slide">
        <KeyboardAvoidingView style={estilos.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={estilos.modal}>
            <View style={estilos.modalHeader}>
              <Text style={estilos.modalTitulo}>{parcelaSelecionada?.mes} — {fmt(parcelaSelecionada?.valor ?? 0)}</Text>
              <TouchableOpacity onPress={() => setModalVisivel(false)}>
                <Ionicons name="close" size={24} color={ERP.texto} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!metodo && (
                <>
                  <Text style={estilos.instrucao}>Escolha a forma de pagamento:</Text>

                  <TouchableOpacity style={estilos.cardMetodo} onPress={() => setMetodo('pix')}>
                    <View style={[estilos.iconeMetodo, { backgroundColor: ERP.sucessoSoft }]}>
                      <Ionicons name="qr-code" size={26} color={ERP.sucesso} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.tituloMetodo}>Pix</Text>
                      <Text style={estilos.descMetodo}>Copie a chave e envie o comprovante</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={ERP.textoMuted} />
                  </TouchableOpacity>

                  <TouchableOpacity style={estilos.cardMetodo} onPress={() => setMetodo('cartao')}>
                    <View style={[estilos.iconeMetodo, { backgroundColor: ERP.avisoSoft }]}>
                      <Ionicons name="card" size={26} color={ERP.aviso} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.tituloMetodo}>Cartão de Crédito</Text>
                      <Text style={estilos.descMetodo}>Pague via link seguro</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={ERP.textoMuted} />
                  </TouchableOpacity>
                </>
              )}

              {metodo === 'pix' && (
                <>
                  <TouchableOpacity style={estilos.voltarMetodo} onPress={() => setMetodo(null)}>
                    <Ionicons name="arrow-back" size={18} color={ERP.texto} />
                    <Text style={estilos.textoVoltar}>Voltar</Text>
                  </TouchableOpacity>

                  <Text style={estilos.fieldLabel}>Chave PIX para pagamento:</Text>
                  <View style={estilos.boxChavePix}>
                    <Text style={estilos.chavePix}>{chavePix || 'Não configurada'}</Text>
                    {chavePix && (
                      <TouchableOpacity style={estilos.botaoCopiar} onPress={copiarPix}>
                        <Ionicons name="copy-outline" size={16} color="#fff" />
                        <Text style={estilos.textoCopiar}>Copiar</Text>
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
                    <View key={i} style={estilos.passo}>
                      <View style={estilos.numeroPasso}><Text style={estilos.textoNumeroPasso}>{i + 1}</Text></View>
                      <Text style={estilos.textoPasso}>{passo}</Text>
                    </View>
                  ))}

                  <Text style={estilos.fieldLabel}>Comprovante:</Text>

                  {comprovanteAnexo ? (
                    <View style={estilos.anexoPreview}>
                      {comprovanteAnexo.mime === 'application/pdf' ? (
                        <View style={estilos.anexoChip}>
                          <Ionicons name="document-text" size={20} color={ERP.acento} />
                          <Text style={estilos.anexoNome} numberOfLines={1}>{comprovanteAnexo.nome}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => setModalImagemAnexo(true)}>
                          <Image source={{ uri: comprovanteAnexo.uri }} style={estilos.anexoThumb} resizeMode="cover" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={estilos.anexoRemover} onPress={() => setComprovanteAnexo(null)}>
                        <Ionicons name="close-circle" size={22} color={ERP.perigo} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={estilos.botaoAnexar} onPress={selecionarComprovante}>
                      <Ionicons name="attach" size={20} color={ERP.acento} />
                      <Text style={estilos.textoBotaoAnexar}>Anexar foto ou arquivo do comprovante</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[estilos.fieldLabel, { marginTop: 14 }]}>Observação (opcional):</Text>
                  <TextInput
                    style={estilos.inputComprovante}
                    placeholder="Ex: Pix enviado às 14h32"
                    placeholderTextColor={ERP.textoMuted}
                    multiline
                    value={nomeComprovante}
                    onChangeText={setNomeComprovante}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity style={estilos.botaoEnviar} onPress={enviarComprovante}>
                    <Text style={estilos.textoBotaoEnviar}>ENVIAR COMPROVANTE</Text>
                  </TouchableOpacity>
                </>
              )}

              {metodo === 'cartao' && (
                <>
                  <TouchableOpacity style={estilos.voltarMetodo} onPress={() => setMetodo(null)}>
                    <Ionicons name="arrow-back" size={18} color={ERP.texto} />
                    <Text style={estilos.textoVoltar}>Voltar</Text>
                  </TouchableOpacity>

                  {[
                    'Clique em "Ir para o pagamento"',
                    'Digite os dados do cartão na página segura',
                    'Confirme o pagamento',
                    'A escola receberá a confirmação automaticamente',
                  ].map((passo, i) => (
                    <View key={i} style={estilos.passo}>
                      <View style={estilos.numeroPasso}><Text style={estilos.textoNumeroPasso}>{i + 1}</Text></View>
                      <Text style={estilos.textoPasso}>{passo}</Text>
                    </View>
                  ))}

                  <TouchableOpacity style={estilos.botaoCartao} onPress={abrirLinkCartao}>
                    <Ionicons name="open-outline" size={20} color="#fff" />
                    <Text style={estilos.textoBotaoCartao}>IR PARA O PAGAMENTO</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalImagemAnexo} transparent animationType="fade" onRequestClose={() => setModalImagemAnexo(false)}>
        <Pressable style={estilos.overlayImagem} onPress={() => setModalImagemAnexo(false)}>
          {comprovanteAnexo && (
            <Image source={{ uri: comprovanteAnexo.uri }} style={estilos.imagemAnexoCompleta} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>

      <Modal visible={!!recibo || carregandoRecibo} transparent animationType="fade" onRequestClose={() => setRecibo(null)}>
        <View style={estilos.overlay}>
          <View style={estilos.modal}>
            {carregandoRecibo && !recibo ? (
              <SyncLoader size="large" color={ERP.acento} />
            ) : recibo ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: ERP.texto, fontSize: 15, fontWeight: 'bold' }}>RECIBO #{recibo.numeroRecibo}</Text>
                  <TouchableOpacity onPress={() => setRecibo(null)}>
                    <Ionicons name="close" size={22} color={ERP.textoSecundario} />
                  </TouchableOpacity>
                </View>
                {[
                  ['Professor', recibo.professor],
                  ['Valor', `R$ ${Number(recibo.valor).toFixed(2).replace('.', ',')}`],
                  ['Pago em', recibo.dataPagamento ? new Date(recibo.dataPagamento).toLocaleDateString('pt-BR') : '—'],
                ].map(([label, valor]) => (
                  <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave }}>
                    <Text style={{ color: ERP.textoSecundario, fontSize: 13 }}>{label}</Text>
                    <Text style={{ color: ERP.texto, fontSize: 13, fontWeight: '700' }}>{valor}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: ERP.acento, borderRadius: 10, paddingVertical: 14, marginTop: 18 }}
                  onPress={compartilharRecibo}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>COMPARTILHAR</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  chipMatricula: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: ERP.superficie, borderWidth: 1, borderColor: ERP.borda,
  },
  chipMatriculaAtiva: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipMatriculaTexto: { color: ERP.textoSecundario, fontSize: 13, fontWeight: '600' },

  cabecalhoCobranca: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tituloCobranca: { color: ERP.texto, fontSize: 14.5, fontWeight: '800' },
  descCobranca: { color: ERP.textoSecundario, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  botaoAtivarCobranca: { backgroundColor: ERP.acento, borderRadius: 10, padding: 13, alignItems: 'center' },
  textoBotaoAtivarCobranca: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  botaoDesativarCobranca: { borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: ERP.perigo },
  textoBotaoDesativarCobranca: { color: ERP.perigo, fontWeight: 'bold', fontSize: 14 },

  cardDestaque: { backgroundColor: ERP.superficie, borderRadius: 14, padding: 20, borderWidth: 2, marginBottom: 16 },
  mesDestaque: { color: ERP.texto, fontSize: 16, fontWeight: '600' },
  valorDestaque: { color: ERP.acentoForte, fontSize: 32, fontWeight: 'bold', marginBottom: 4 },
  vencimentoDestaque: { color: ERP.textoSecundario, fontSize: 13, marginBottom: 14 },
  botaoPagar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ERP.acento, borderRadius: 10, padding: 12 },
  textoBotaoPagar: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  avisoAnalise: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ERP.infoSoft, borderRadius: 10, padding: 12 },
  textoAnalise: { fontSize: 13, flex: 1, lineHeight: 18 },

  semDados: { color: ERP.textoMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  linhaParcela: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  mesParcela: { color: ERP.texto, fontSize: 14, fontWeight: 'bold' },
  vencimentoParcela: { color: ERP.textoSecundario, fontSize: 12, marginTop: 2 },
  valorParcela: { color: ERP.acentoForte, fontSize: 14, fontWeight: 'bold' },

  overlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.6)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: ERP.superficie, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: ERP.borda,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitulo: { color: ERP.texto, fontSize: 16, fontWeight: 'bold' },
  instrucao: { color: ERP.textoSecundario, fontSize: 14, marginBottom: 16 },

  cardMetodo: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: ERP.fundo,
    borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: ERP.borda,
  },
  iconeMetodo: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tituloMetodo: { color: ERP.texto, fontSize: 15, fontWeight: 'bold' },
  descMetodo: { color: ERP.textoSecundario, fontSize: 12, marginTop: 2 },

  voltarMetodo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  textoVoltar: { color: ERP.texto, fontWeight: '600', fontSize: 15 },

  fieldLabel: { color: ERP.textoSecundario, fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  boxChavePix: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: ERP.fundo,
    borderRadius: 10, padding: 14, marginBottom: 20, gap: 12, borderWidth: 1, borderColor: ERP.borda,
  },
  chavePix: { flex: 1, color: ERP.acentoForte, fontSize: 16, fontWeight: 'bold' },
  botaoCopiar: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ERP.acento, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  textoCopiar: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  numeroPasso: { width: 22, height: 22, borderRadius: 11, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center' },
  textoNumeroPasso: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  textoPasso: { color: ERP.textoSecundario, fontSize: 14, flex: 1, lineHeight: 20 },

  inputComprovante: {
    backgroundColor: ERP.fundo, borderRadius: 10, padding: 14, color: ERP.texto, fontSize: 14,
    minHeight: 80, borderWidth: 1, borderColor: ERP.borda, marginBottom: 16, marginTop: 4,
  },
  botaoAnexar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ERP.fundo,
    borderRadius: 10, padding: 14, marginTop: 4, borderWidth: 1, borderColor: ERP.acento, borderStyle: 'dashed',
  },
  textoBotaoAnexar: { color: ERP.acento, fontWeight: '600', fontSize: 13 },
  anexoPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  anexoThumb: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: ERP.borda },
  anexoChip: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, backgroundColor: ERP.fundo, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: ERP.borda },
  anexoNome: { color: ERP.texto, fontSize: 13, flex: 1 },
  anexoRemover: { padding: 2 },
  overlayImagem: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  imagemAnexoCompleta: { width: '100%', height: '80%' },
  botaoEnviar: { backgroundColor: ERP.acento, borderRadius: 10, padding: 15, alignItems: 'center' },
  textoBotaoEnviar: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },

  botaoCartao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ERP.aviso, borderRadius: 12, padding: 15, marginTop: 10 },
  textoBotaoCartao: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
});
