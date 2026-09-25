import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Kpi, Modal, PageHeader, SectionCard, SubAbasSimples, Tabela } from './_ui';

type Sub = 'cobranca' | 'renovacao' | 'folha' | 'caixa' | 'dre' | 'pagamentos';

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FinanceiroEscola() {
  const [sub, setSub] = useState<Sub>('cobranca');
  const [carregando, setCarregando] = useState(true);

  const [resumoCobranca, setResumoCobranca] = useState<any>(null);

  // Asaas (Pix/Boleto) — segundo gateway de cobrança, cada Escola traz a
  // própria conta (API Key própria, sem subconta via plataforma).
  const [asaasStatus, setAsaasStatus] = useState<{ conectado: boolean; nomeConta?: string; apiKeyUltimos4?: string; erro?: string } | null>(null);
  const [apiKeyAsaas, setApiKeyAsaas] = useState('');
  const [conectandoAsaas, setConectandoAsaas] = useState(false);
  const [desconectandoAsaas, setDesconectandoAsaas] = useState(false);
  const [instrucoesWebhookAsaas, setInstrucoesWebhookAsaas] = useState<{ webhookUrl: string; webhookToken: string } | null>(null);

  const [alunosVencendo, setAlunosVencendo] = useState<any[]>([]);
  const [selecaoRenovacao, setSelecaoRenovacao] = useState<Record<string, string>>({});
  const [renovando, setRenovando] = useState(false);

  // Caixa
  const [dataCaixa, setDataCaixa] = useState(hojeISO());
  const [lancamentosDia, setLancamentosDia] = useState<any[]>([]);
  const [contasPagar, setContasPagar] = useState<any[]>([]);
  const [ultimoFechamento, setUltimoFechamento] = useState<any | null>(null);
  const [modalLancamento, setModalLancamento] = useState(false);
  const [tipoLancamento, setTipoLancamento] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');
  const [descricaoLancamento, setDescricaoLancamento] = useState('');
  const [valorLancamento, setValorLancamento] = useState('');
  const [modalContaPagar, setModalContaPagar] = useState(false);
  const [descricaoConta, setDescricaoConta] = useState('');
  const [valorConta, setValorConta] = useState('');
  const [vencimentoConta, setVencimentoConta] = useState('');
  const [salvandoCaixa, setSalvandoCaixa] = useState(false);
  const [fechandoCaixa, setFechandoCaixa] = useState(false);

  // DRE
  const [dre, setDre] = useState<any | null>(null);

  // Faturamento atual + Folha de pagamento + Despesas fixas (INSTITUTION
  // Sprint 7, briefing 08/09/2026)
  const [faturamentoAtual, setFaturamentoAtual] = useState(0);
  const [folhaPagamento, setFolhaPagamento] = useState<any[]>([]);
  const [folhaEditando, setFolhaEditando] = useState<any | null>(null);
  const [valorAjuste, setValorAjuste] = useState('');
  const [urlComprovante, setUrlComprovante] = useState('');
  const [salvandoFolha, setSalvandoFolha] = useState(false);
  const [despesasFixas, setDespesasFixas] = useState<any[]>([]);
  const [modalDespesaFixa, setModalDespesaFixa] = useState(false);
  const [descricaoDespesaFixa, setDescricaoDespesaFixa] = useState('');
  const [valorDespesaFixa, setValorDespesaFixa] = useState('');
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);

  // Pagamentos — "a pulsação financeira da empresa" (INSTITUTION Sprint 8,
  // briefing 08/09/2026)
  const [pagamentosStatus, setPagamentosStatus] = useState<{ inadimplentes: any[]; pagos: any[]; emDia: any[] }>({ inadimplentes: [], pagos: [], emDia: [] });

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const agora = new Date();
      const [resAsaas, resResumo, resVencendo, resLanc, resContas, resFecha, resDre, resFaturamento, resFolha, resDespesasFixas, resPagamentosStatus] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/asaas/status`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cobranca-automatica/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
        fetchComRetry(`${BASE_URL}/api/caixa/lancamentos?data=${dataCaixa}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/contas-pagar`, { headers }),
        fetchComRetry(`${BASE_URL}/api/caixa/fechamentos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/dre?mes=${agora.getMonth() + 1}&ano=${agora.getFullYear()}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/faturamento-atual`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/folha-pagamento`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/despesas-fixas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/pagamentos-status`, { headers }),
      ]);
      if (resAsaas.ok) setAsaasStatus(await resAsaas.json());
      if (resResumo.ok) setResumoCobranca(await resResumo.json());
      if (resVencendo.ok) setAlunosVencendo(await resVencendo.json());
      if (resLanc.ok) setLancamentosDia(await resLanc.json());
      if (resContas.ok) setContasPagar(await resContas.json());
      if (resFecha.ok) setUltimoFechamento((await resFecha.json())[0] || null);
      if (resDre.ok) setDre(await resDre.json());
      if (resFaturamento.ok) setFaturamentoAtual((await resFaturamento.json()).total || 0);
      if (resFolha.ok) setFolhaPagamento(await resFolha.json());
      if (resDespesasFixas.ok) setDespesasFixas(await resDespesasFixas.json());
      if (resPagamentosStatus.ok) setPagamentosStatus(await resPagamentosStatus.json());
    } catch (err) {
      console.error('Erro ao carregar Financeiro:', err);
    } finally {
      setCarregando(false);
    }
  }, [dataCaixa]);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const conectarAsaas = async () => {
    if (!apiKeyAsaas.trim()) { Alert.alert('Atenção', 'Cole a API Key da sua conta Asaas.'); return; }
    setConectandoAsaas(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/asaas/conectar`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyAsaas.trim() }),
      });
      const dados = await res.json();
      if (!res.ok) { Alert.alert('Erro', dados.erro || 'Não foi possível conectar com o Asaas.'); return; }
      setApiKeyAsaas('');
      setInstrucoesWebhookAsaas({ webhookUrl: dados.webhookUrl, webhookToken: dados.webhookToken });
      await carregarDados();
      Alert.alert('Conectado!', 'Agora configure o webhook no painel do Asaas com a URL e o token mostrados na tela — sem isso os pagamentos não são confirmados automaticamente aqui.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConectandoAsaas(false);
    }
  };

  const desconectarAsaas = () => {
    Alert.alert('Desconectar Asaas?', 'Só é possível se nenhuma matrícula estiver com cobrança via Asaas ativa no momento.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar', style: 'destructive', onPress: async () => {
          setDesconectandoAsaas(true);
          try {
            const token = await SecureStore.getItemAsync('kav_token');
            const res = await fetchComRetry(`${BASE_URL}/api/escola/asaas/desconectar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            const dados = await res.json();
            if (!res.ok) { Alert.alert('Erro', dados.erro || 'Não foi possível desconectar.'); return; }
            setInstrucoesWebhookAsaas(null);
            await carregarDados();
          } catch {
            Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
          } finally {
            setDesconectandoAsaas(false);
          }
        },
      },
    ]);
  };

  // Chave de seleção é a Matricula (id), não o Aluno — desde a Sprint 5 um
  // Aluno pode ter mais de uma Matricula ativa (multi-professor), então uma
  // renovação em lote precisa distinguir qual matrícula, não só quem é o
  // aluno (auditoria INSTITUTION, 11/09/2026).
  const alternarSelecao = (matricula: any) => {
    setSelecaoRenovacao((atual) => {
      const novo = { ...atual };
      if (novo[matricula.id] !== undefined) delete novo[matricula.id];
      else novo[matricula.id] = String(matricula.valorMensalidade || '');
      return novo;
    });
  };

  const confirmarRenovacaoLote = () => {
    const ids = Object.keys(selecaoRenovacao);
    if (!ids.length) { Alert.alert('Atenção', 'Selecione ao menos uma matrícula.'); return; }
    Alert.alert('Renovar matrículas?', `${ids.length} matrícula(s) selecionada(s) — o contrato de cada uma reinicia a partir de hoje com o valor informado.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Renovar', onPress: renovarLote }]);
  };

  const renovarLote = async () => {
    const renovacoes = Object.entries(selecaoRenovacao).map(([matriculaId, valor]) => ({ matriculaId, novoValorMensalidade: parseFloat(valor.replace(',', '.')) }));
    if (renovacoes.some((r) => !r.novoValorMensalidade || r.novoValorMensalidade <= 0)) { Alert.alert('Atenção', 'Toda matrícula selecionada precisa de um valor válido.'); return; }
    setRenovando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/renovacoes/lote`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovacoes }),
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Feito!', dados.mensagem); setSelecaoRenovacao({}); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível renovar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setRenovando(false);
    }
  };

  const abrirModalLancamento = () => { setTipoLancamento('ENTRADA'); setDescricaoLancamento(''); setValorLancamento(''); setModalLancamento(true); };

  const criarLancamento = async () => {
    const valor = parseFloat(valorLancamento.replace(',', '.'));
    if (!descricaoLancamento.trim() || !valor || valor <= 0) { Alert.alert('Atenção', 'Preencha a descrição e um valor válido.'); return; }
    setSalvandoCaixa(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/caixa/lancamentos`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoLancamento, descricao: descricaoLancamento.trim(), valor, data: dataCaixa }),
      });
      if (res.ok) { setModalLancamento(false); carregarDados(); }
      else Alert.alert('Não foi possível lançar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoCaixa(false);
    }
  };

  const fecharCaixaDoDia = async () => {
    setFechandoCaixa(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/caixa/fechamento`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataCaixa }),
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Caixa fechado!', `Saldo final: R$ ${Number(dados.saldoFinal).toFixed(2).replace('.', ',')}`); carregarDados(); }
      else Alert.alert('Não foi possível fechar', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setFechandoCaixa(false);
    }
  };

  const criarContaPagar = async () => {
    const valor = parseFloat(valorConta.replace(',', '.'));
    if (!descricaoConta.trim() || !valor || valor <= 0 || !vencimentoConta.trim()) {
      Alert.alert('Atenção', 'Preencha descrição, valor e vencimento (AAAA-MM-DD).');
      return;
    }
    setSalvandoCaixa(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/contas-pagar`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: descricaoConta.trim(), valor, vencimento: vencimentoConta }),
      });
      if (res.ok) { setModalContaPagar(false); setDescricaoConta(''); setValorConta(''); setVencimentoConta(''); carregarDados(); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoCaixa(false);
    }
  };

  const pagarConta = async (contaId: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/contas-pagar/${contaId}/pagar`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) carregarDados();
      else Alert.alert('Não foi possível pagar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const abrirEdicaoFolha = (folha: any) => {
    setFolhaEditando(folha);
    setValorAjuste(folha.valorAjustado != null ? String(folha.valorAjustado) : '');
    setUrlComprovante('');
  };

  const salvarAjusteFolha = async () => {
    if (!folhaEditando) return;
    setSalvandoFolha(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/folha-pagamento/${folhaEditando.id}/ajustar`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorAjustado: valorAjuste ? parseFloat(valorAjuste.replace(',', '.')) : null }),
      });
      if (res.ok) { setFolhaEditando(null); carregarDados(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível ajustar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoFolha(false);
    }
  };

  const anexarComprovante = async () => {
    if (!folhaEditando || !urlComprovante.trim()) return;
    setSalvandoFolha(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/folha-pagamento/${folhaEditando.id}/comprovantes`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlComprovante.trim() }),
      });
      const dados = await res.json();
      if (res.ok) { setFolhaEditando(dados); setUrlComprovante(''); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível anexar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoFolha(false);
    }
  };

  const criarDespesaFixa = async () => {
    const valor = parseFloat(valorDespesaFixa.replace(',', '.'));
    if (!descricaoDespesaFixa.trim() || !valor || valor <= 0) { Alert.alert('Atenção', 'Preencha a descrição e um valor válido.'); return; }
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/despesas-fixas`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: descricaoDespesaFixa.trim(), valor }),
      });
      if (res.ok) { setModalDespesaFixa(false); setDescricaoDespesaFixa(''); setValorDespesaFixa(''); carregarDados(); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const exportarRelatorio = async (formato: 'pdf' | 'excel') => {
    if (!dre) return;
    setExportando(formato);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const url = `${BASE_URL}/api/escola/dre/${dre.periodo.mes}/${dre.periodo.ano}/${formato === 'pdf' ? 'pdf' : 'excel'}`;
      const res = await fetchComRetry(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { Alert.alert('Erro', 'Não foi possível gerar o relatório.'); return; }
      const blob = await res.blob();
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const extensao = formato === 'pdf' ? 'pdf' : 'xlsx';
      const fileUri = `${FileSystem.cacheDirectory}relatorio-financeiro-${dre.periodo.mes}-${dre.periodo.ano}.${extensao}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
      else Alert.alert('Relatório gerado', `Salvo em: ${fileUri}`);
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setExportando(null);
    }
  };

  const abrirWhatsApp = (telefone: string | null) => {
    if (!telefone) { Alert.alert('Sem telefone', 'Este aluno não tem telefone cadastrado.'); return; }
    const numero = telefone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${numero}`);
  };

  const alternarDespesaFixa = async (despesa: any) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/despesas-fixas/${despesa.id}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativa: !despesa.ativa }),
      });
      if (res.ok) carregarDados();
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  if (carregando) {
    return <ErpShell titulo="Financeiro"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Financeiro">
      <PageHeader titulo="Financeiro" subtitulo="Cobrança automática via Asaas (Pix/Boleto) e renovação de matrículas" />

      <View style={estilos.kpiGrade}>
        <Kpi label="Faturamento atual (mês)" valor={`R$ ${faturamentoAtual.toFixed(2).replace('.', ',')}`} tom="sucesso" icone="trending-up-outline" />
      </View>

      <SubAbasSimples
        opcoes={[
          { chave: 'cobranca', rotulo: `Cobrança${resumoCobranca?.precisamDeAcao?.length ? ` · ${resumoCobranca.precisamDeAcao.length}` : ''}` },
          { chave: 'renovacao', rotulo: `Renovação${alunosVencendo.length ? ` · ${alunosVencendo.length}` : ''}` },
          { chave: 'folha', rotulo: 'Pagamento professores' },
          { chave: 'caixa', rotulo: 'Caixa' },
          { chave: 'dre', rotulo: 'DRE' },
          { chave: 'pagamentos', rotulo: `Pagamentos${pagamentosStatus.inadimplentes.length ? ` · ${pagamentosStatus.inadimplentes.length}` : ''}` },
        ]}
        ativa={sub} onMudar={setSub}
      />

      {sub === 'cobranca' && (
        <>
          {(resumoCobranca?.totalAtivas ?? 0) > 0 && (
            <View style={{ gap: 16 }}>
              <View style={estilos.kpiGrade}>
                <Kpi label="Matrículas com cobrança ativa" valor={resumoCobranca?.totalAtivas ?? 0} />
                <Kpi label="Precisam de ação" valor={resumoCobranca?.precisamDeAcao?.length ?? 0} tom={(resumoCobranca?.precisamDeAcao?.length ?? 0) > 0 ? 'alerta' : 'default'} />
                <Kpi label="Em dia" valor={resumoCobranca?.emDia?.length ?? 0} tom="sucesso" />
              </View>

              {resumoCobranca?.precisamDeAcao?.length > 0 && (
                <SectionCard titulo="Precisam de ação">
                  <Tabela
                    vazioTexto=""
                    dados={resumoCobranca.precisamDeAcao.map((m: any) => ({ ...m, id: m.matriculaId }))}
                    colunas={[
                      { chave: 'alunoNome', titulo: 'Aluno', flex: 3 },
                      { chave: 'erro', titulo: 'Erro', flex: 4, render: (m: any) => <Text style={{ fontSize: 13, color: ERP.perigo }}>{m.erro}</Text> },
                    ]}
                  />
                </SectionCard>
              )}

              {resumoCobranca?.emDia?.length > 0 && (
                <SectionCard titulo="Em dia">
                  <Tabela
                    vazioTexto=""
                    dados={resumoCobranca.emDia.map((m: any) => ({ ...m, id: m.matriculaId }))}
                    colunas={[
                      { chave: 'alunoNome', titulo: 'Aluno', flex: 3 },
                      { chave: 'valor', titulo: 'Valor', flex: 2, render: (m: any) => <Text style={{ fontSize: 13 }}>R$ {m.valorMensalidade.toFixed(2).replace('.', ',')}</Text> },
                      { chave: 'vencimento', titulo: 'Vence', flex: 2, render: (m: any) => <Text style={{ fontSize: 13, color: ERP.textoSecundario }}>Dia {m.diaVencimento}</Text> },
                    ]}
                  />
                </SectionCard>
              )}
            </View>
          )}

          <SectionCard titulo="Asaas (Pix/Boleto)">
            {!asaasStatus?.conectado && (
              <>
                <Text style={{ color: ERP.texto, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
                  Cole a API Key da sua própria conta Asaas (crie uma de graça em asaas.com, se ainda não tiver) pra liberar a cobrança automática de mensalidade via Pix e Boleto — a taxa do Asaas é cobrada direto da sua conta, nunca da KAV Class.
                </Text>

                <View style={{ marginBottom: 16, padding: 14, borderRadius: 10, backgroundColor: '#f4f4f5', gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: ERP.texto }}>Passo a passo</Text>
                  {[
                    'Crie uma conta grátis em asaas.com (ou entre na sua, se já tiver).',
                    'No painel do Asaas, vá em Integrações → API → Gerar nova chave de API.',
                    'Copie a chave gerada (começa com "$aact_").',
                    'Cole a chave no campo abaixo e toque em "Conectar Asaas".',
                    'Depois de conectado, copie a URL e o token mostrados aqui e cadastre em Configurações → Webhooks, dentro do painel do Asaas — sem isso, os pagamentos não são confirmados automaticamente.',
                  ].map((texto, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario }}>{i + 1}.</Text>
                      <Text style={{ flex: 1, fontSize: 12.5, color: ERP.texto, lineHeight: 18 }}>{texto}</Text>
                    </View>
                  ))}
                </View>

                <Campo label="API Key do Asaas" value={apiKeyAsaas} onChangeText={setApiKeyAsaas} placeholder="$aact_..." autoCapitalize="none" secureTextEntry />
                <View style={{ marginTop: 12 }}>
                  <Botao texto="Conectar Asaas" onPress={conectarAsaas} carregando={conectandoAsaas} />
                </View>
              </>
            )}

            {asaasStatus?.conectado && (
              <>
                <Badge texto={asaasStatus.erro ? 'Chave inválida' : `Conectado${asaasStatus.apiKeyUltimos4 ? ` · •••• ${asaasStatus.apiKeyUltimos4}` : ''}`} tom={asaasStatus.erro ? 'aviso' : 'sucesso'} />
                {asaasStatus.nomeConta && <Text style={{ color: ERP.textoSecundario, fontSize: 13, marginTop: 8 }}>{asaasStatus.nomeConta}</Text>}
                {asaasStatus.erro && <Text style={{ color: ERP.perigo, fontSize: 13, marginTop: 8 }}>{asaasStatus.erro}</Text>}

                {instrucoesWebhookAsaas && (
                  <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#f4f4f5' }}>
                    <Text style={{ fontSize: 12.5, color: ERP.texto, lineHeight: 18 }}>
                      No painel do Asaas, vá em Configurações → Webhooks e cadastre:{'\n'}
                      URL: {instrucoesWebhookAsaas.webhookUrl}{'\n'}
                      Token de autenticação: {instrucoesWebhookAsaas.webhookToken}
                    </Text>
                  </View>
                )}

                <View style={{ marginTop: 12 }}>
                  <Botao texto="Desconectar" variante="secundario" onPress={desconectarAsaas} carregando={desconectandoAsaas} />
                </View>
              </>
            )}
          </SectionCard>
        </>
      )}

      {sub === 'renovacao' && (
        <SectionCard>
          <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginBottom: 16 }}>Contratos vencendo nos próximos 30 dias. Selecione, ajuste o valor e renove de uma vez.</Text>
          {alunosVencendo.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma matrícula vencendo nos próximos 30 dias." />
          ) : (
            <>
              {alunosVencendo.map((a) => {
                const selecionado = selecaoRenovacao[a.id] !== undefined;
                return (
                  <View key={a.id} style={estilos.linhaRenovacao}>
                    <TouchableOpacity onPress={() => alternarSelecao(a)}>
                      <Ionicons name={selecionado ? 'checkbox' : 'square-outline'} size={22} color={selecionado ? ERP.texto : '#999'} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{a.aluno?.nome} · com {a.professor?.nome}</Text>
                      <Text style={{ fontSize: 12, color: ERP.textoSecundario, marginTop: 2 }}>
                        {a.diasRestantes < 0 ? `Venceu há ${Math.abs(a.diasRestantes)} dia(s)` : `Vence em ${a.diasRestantes} dia(s)`}
                      </Text>
                    </View>
                    {selecionado && (
                      <TextInput
                        style={estilos.inputValor}
                        keyboardType="numeric"
                        value={selecaoRenovacao[a.id]}
                        onChangeText={(v) => setSelecaoRenovacao((atual) => ({ ...atual, [a.id]: v }))}
                      />
                    )}
                  </View>
                );
              })}
              <View style={{ marginTop: 16 }}>
                <Botao texto={`Renovar selecionados (${Object.keys(selecaoRenovacao).length})`} onPress={confirmarRenovacaoLote} carregando={renovando} />
              </View>
            </>
          )}
        </SectionCard>
      )}

      {sub === 'folha' && (
        <SectionCard titulo="Pagamento de professores" subtitulo="Calculado automaticamente pela presença confirmada no mês, ajustável quando necessário">
          <Tabela
            vazioTexto="Nenhum professor cadastrado ainda."
            vazioIcone="people-outline"
            dados={folhaPagamento}
            colunas={[
              { chave: 'professor', titulo: 'Professor', flex: 2, render: (f: any) => <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{f.professor?.nome}</Text> },
              { chave: 'calculado', titulo: 'Calculado', flex: 1.5, render: (f: any) => <Text style={estilos.linhaSub}>R$ {Number(f.valorCalculado).toFixed(2).replace('.', ',')}</Text> },
              { chave: 'final', titulo: 'A pagar', flex: 1.5, render: (f: any) => (
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: ERP.texto }}>
                  R$ {Number(f.valorAjustado ?? f.valorCalculado).toFixed(2).replace('.', ',')}
                </Text>
              )},
              { chave: 'status', titulo: 'Status', flex: 1, render: (f: any) => <Badge texto={f.status === 'FECHADA' ? 'Fechada' : 'Aberta'} tom={f.status === 'FECHADA' ? 'sucesso' : 'default'} /> },
              { chave: 'comprovantes', titulo: 'Comprovantes', flex: 1, render: (f: any) => <Text style={estilos.linhaSub}>{f.comprovantes?.length || 0}/3</Text> },
              { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (f: any) => (
                <Botao texto="Ver / ajustar" variante="secundario" onPress={() => abrirEdicaoFolha(f)} />
              )},
            ]}
          />
        </SectionCard>
      )}

      {sub === 'caixa' && (
        <>
          <SectionCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-outline" size={16} color={ERP.textoSecundario} />
                <TextInput
                  style={estilos.inputData}
                  value={dataCaixa}
                  onChangeText={setDataCaixa}
                  placeholder="AAAA-MM-DD"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao texto="Lançamento" variante="secundario" icone="add" onPress={abrirModalLancamento} />
                <Botao texto="Fechar caixa" icone="lock-closed-outline" onPress={fecharCaixaDoDia} carregando={fechandoCaixa} />
              </View>
            </View>

            {(() => {
              const entradas = lancamentosDia.filter((l: any) => l.tipo === 'ENTRADA').reduce((a: number, l: any) => a + l.valor, 0);
              const saidas = lancamentosDia.filter((l: any) => l.tipo === 'SAIDA').reduce((a: number, l: any) => a + l.valor, 0);
              return (
                <View style={estilos.kpiGrade}>
                  <Kpi label="Entradas do dia" valor={`R$ ${entradas.toFixed(2).replace('.', ',')}`} tom="sucesso" />
                  <Kpi label="Saídas do dia" valor={`R$ ${saidas.toFixed(2).replace('.', ',')}`} tom={saidas > 0 ? 'alerta' : 'default'} />
                  <Kpi label="Saldo do dia" valor={`R$ ${(entradas - saidas).toFixed(2).replace('.', ',')}`} />
                </View>
              );
            })()}

            {ultimoFechamento && (
              <Text style={{ fontSize: 12, color: ERP.textoMuted, marginTop: 12 }}>
                Último fechamento: {new Date(ultimoFechamento.data).toLocaleDateString('pt-BR')} — saldo final R$ {Number(ultimoFechamento.saldoFinal).toFixed(2).replace('.', ',')}
              </Text>
            )}
          </SectionCard>

          <SectionCard titulo="Lançamentos do dia">
            <Tabela
              vazioTexto="Nenhum lançamento neste dia."
              vazioIcone="cash-outline"
              dados={lancamentosDia}
              colunas={[
                { chave: 'descricao', titulo: 'Descrição', flex: 3 },
                { chave: 'tipo', titulo: 'Tipo', flex: 1, render: (l: any) => <Badge texto={l.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'} tom={l.tipo === 'ENTRADA' ? 'sucesso' : 'alerta'} /> },
                { chave: 'valor', titulo: 'Valor', flex: 1, alinhar: 'right', render: (l: any) => (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: l.tipo === 'ENTRADA' ? ERP.sucesso : ERP.perigo, textAlign: 'right' }}>
                    {l.tipo === 'ENTRADA' ? '+' : '−'} R$ {Number(l.valor).toFixed(2).replace('.', ',')}
                  </Text>
                )},
              ]}
            />
          </SectionCard>

          <SectionCard titulo="Despesas fixas" subtitulo="Recorrentes (aluguel, internet etc.) — editáveis pela própria instituição" acao={<Botao texto="Nova despesa" variante="secundario" icone="add" onPress={() => setModalDespesaFixa(true)} />}>
            <Tabela
              vazioTexto="Nenhuma despesa fixa cadastrada."
              vazioIcone="cash-outline"
              dados={despesasFixas}
              colunas={[
                { chave: 'descricao', titulo: 'Descrição', flex: 3 },
                { chave: 'valor', titulo: 'Valor', flex: 1, render: (d: any) => <Text style={estilos.linhaSub}>R$ {Number(d.valor).toFixed(2).replace('.', ',')}</Text> },
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (d: any) => (
                  <Botao texto={d.ativa ? 'Ativa' : 'Inativa'} variante="secundario" onPress={() => alternarDespesaFixa(d)} />
                )},
              ]}
            />
          </SectionCard>

          <SectionCard titulo="Contas a pagar" subtitulo="Despesas avulsas" acao={<Botao texto="Nova conta" variante="secundario" icone="add" onPress={() => setModalContaPagar(true)} />}>
            <Tabela
              vazioTexto="Nenhuma conta cadastrada."
              vazioIcone="document-text-outline"
              dados={contasPagar}
              colunas={[
                { chave: 'descricao', titulo: 'Descrição', flex: 2 },
                { chave: 'vencimento', titulo: 'Vencimento', flex: 1, render: (c: any) => <Text style={estilos.linhaSub}>{new Date(c.vencimento).toLocaleDateString('pt-BR')}</Text> },
                { chave: 'valor', titulo: 'Valor', flex: 1, render: (c: any) => <Text style={estilos.linhaSub}>R$ {Number(c.valor).toFixed(2).replace('.', ',')}</Text> },
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (c: any) => (
                  c.paga
                    ? <Badge texto="Paga" tom="sucesso" />
                    : <Botao texto="Marcar paga" variante="secundario" onPress={() => pagarConta(c.id)} />
                )},
              ]}
            />
          </SectionCard>
        </>
      )}

      {sub === 'dre' && (
        <SectionCard
          titulo={!dre ? undefined : new Date(dre.periodo.ano, dre.periodo.mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          acao={dre ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Botao texto="Exportar PDF" variante="secundario" icone="document-text-outline" onPress={() => exportarRelatorio('pdf')} carregando={exportando === 'pdf'} />
              <Botao texto="Exportar Excel" variante="secundario" icone="grid-outline" onPress={() => exportarRelatorio('excel')} carregando={exportando === 'excel'} />
            </View>
          ) : undefined}
        >
          {!dre ? (
            <EstadoVazio icone="stats-chart-outline" texto="Sem dados pro mês atual ainda." />
          ) : (
            <>
              <View style={estilos.kpiGrade}>
                <Kpi label="Receita mensalidades" valor={`R$ ${dre.receita.mensalidades.toFixed(2).replace('.', ',')}`} tom="sucesso" />
                <Kpi label="Receita avulsa" valor={`R$ ${dre.receita.avulsa.toFixed(2).replace('.', ',')}`} tom="sucesso" />
                <Kpi label="Despesas" valor={`R$ ${dre.despesas.total.toFixed(2).replace('.', ',')}`} tom={dre.despesas.total > 0 ? 'alerta' : 'default'} />
                <Kpi label="Resultado do mês" valor={`R$ ${dre.resultado.toFixed(2).replace('.', ',')}`} tom={dre.resultado >= 0 ? 'sucesso' : 'alerta'} />
              </View>

              {dre.contasPendentes?.length > 0 && (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 10 }}>
                    Contas a pagar pendentes ({dre.contasPendentes.length})
                  </Text>
                  {dre.contasPendentes.map((c: any) => (
                    <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: ERP.borda }}>
                      <Text style={estilos.linhaSub}>{c.descricao} — vence {new Date(c.vencimento).toLocaleDateString('pt-BR')}</Text>
                      <Text style={estilos.linhaSub}>R$ {Number(c.valor).toFixed(2).replace('.', ',')}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 10 }}>
                  Lançamentos avulsos do mês ({dre.lancamentos.length})
                </Text>
                {dre.lancamentos.length === 0 ? (
                  <Text style={{ fontSize: 12.5, color: ERP.textoMuted }}>Nenhum lançamento avulso este mês.</Text>
                ) : dre.lancamentos.map((l: any) => (
                  <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: ERP.borda }}>
                    <Text style={estilos.linhaSub}>{l.descricao}</Text>
                    <Text style={[estilos.linhaSub, { color: l.tipo === 'ENTRADA' ? ERP.sucesso : ERP.perigo, fontWeight: '700' }]}>
                      {l.tipo === 'ENTRADA' ? '+' : '−'} R$ {Number(l.valor).toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </SectionCard>
      )}

      {sub === 'pagamentos' && (
        <>
          <SectionCard titulo="Inadimplentes" subtitulo="Pelo menos uma mensalidade em atraso">
            {pagamentosStatus.inadimplentes.length === 0 ? (
              <EstadoVazio icone="checkmark-circle-outline" texto="Nenhum aluno inadimplente." />
            ) : (
              <Tabela
                vazioTexto=""
                dados={pagamentosStatus.inadimplentes}
                colunas={[
                  { chave: 'nome', titulo: 'Aluno', flex: 3 },
                  { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (a: any) => (
                    <Botao texto="WhatsApp" variante="secundario" icone="logo-whatsapp" onPress={() => abrirWhatsApp(a.telefone)} />
                  )},
                ]}
              />
            )}
          </SectionCard>

          <SectionCard titulo="Pagos este mês">
            {pagamentosStatus.pagos.length === 0 ? (
              <EstadoVazio icone="cash-outline" texto="Nenhum pagamento confirmado este mês ainda." />
            ) : (
              <Tabela
                vazioTexto=""
                dados={pagamentosStatus.pagos}
                colunas={[
                  { chave: 'nome', titulo: 'Aluno', flex: 3 },
                  { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (a: any) => (
                    <Botao texto="WhatsApp" variante="secundario" icone="logo-whatsapp" onPress={() => abrirWhatsApp(a.telefone)} />
                  )},
                ]}
              />
            )}
          </SectionCard>

          <SectionCard titulo="Em dia">
            {pagamentosStatus.emDia.length === 0 ? (
              <EstadoVazio icone="time-outline" texto="Nenhum aluno nesta lista." />
            ) : (
              <Tabela
                vazioTexto=""
                dados={pagamentosStatus.emDia}
                colunas={[
                  { chave: 'nome', titulo: 'Aluno', flex: 3 },
                  { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (a: any) => (
                    <Botao texto="WhatsApp" variante="secundario" icone="logo-whatsapp" onPress={() => abrirWhatsApp(a.telefone)} />
                  )},
                ]}
              />
            )}
          </SectionCard>
        </>
      )}

      <Modal visivel={modalLancamento} titulo="Novo lançamento" onFechar={() => setModalLancamento(false)}>
        <Text style={estilos.labelChip}>Tipo</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <TouchableOpacity style={[estilos.chip, tipoLancamento === 'ENTRADA' && estilos.chipAtivo]} onPress={() => setTipoLancamento('ENTRADA')}>
            <Text style={[estilos.chipTexto, tipoLancamento === 'ENTRADA' && { color: '#fff' }]}>Entrada</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[estilos.chip, tipoLancamento === 'SAIDA' && estilos.chipAtivo]} onPress={() => setTipoLancamento('SAIDA')}>
            <Text style={[estilos.chipTexto, tipoLancamento === 'SAIDA' && { color: '#fff' }]}>Saída</Text>
          </TouchableOpacity>
        </View>
        <Campo label="Descrição" value={descricaoLancamento} onChangeText={setDescricaoLancamento} placeholder="Ex: Venda de apostila" />
        <Campo label="Valor (R$)" value={valorLancamento} onChangeText={setValorLancamento} keyboardType="decimal-pad" placeholder="Ex: 50,00" />
        <Botao texto="Lançar" onPress={criarLancamento} carregando={salvandoCaixa} />
      </Modal>

      <Modal visivel={modalContaPagar} titulo="Nova conta a pagar" onFechar={() => setModalContaPagar(false)}>
        <Campo label="Descrição" value={descricaoConta} onChangeText={setDescricaoConta} placeholder="Ex: Aluguel, energia..." />
        <Campo label="Valor (R$)" value={valorConta} onChangeText={setValorConta} keyboardType="decimal-pad" placeholder="Ex: 800,00" />
        <Campo label="Vencimento (AAAA-MM-DD)" value={vencimentoConta} onChangeText={setVencimentoConta} placeholder="Ex: 2026-10-05" />
        <Botao texto="Criar conta" onPress={criarContaPagar} carregando={salvandoCaixa} />
      </Modal>

      <Modal visivel={modalDespesaFixa} titulo="Nova despesa fixa" onFechar={() => setModalDespesaFixa(false)}>
        <Campo label="Descrição" value={descricaoDespesaFixa} onChangeText={setDescricaoDespesaFixa} placeholder="Ex: Aluguel" />
        <Campo label="Valor (R$)" value={valorDespesaFixa} onChangeText={setValorDespesaFixa} keyboardType="decimal-pad" placeholder="Ex: 3000,00" />
        <Botao texto="Criar despesa" onPress={criarDespesaFixa} />
      </Modal>

      <Modal visivel={!!folhaEditando} titulo={`Folha · ${folhaEditando?.professor?.nome || ''}`} onFechar={() => setFolhaEditando(null)}>
        {folhaEditando && (
          <>
            <Text style={estilos.linhaSub}>Calculado automaticamente: R$ {Number(folhaEditando.valorCalculado).toFixed(2).replace('.', ',')}</Text>
            <View style={{ height: 12 }} />
            <Campo label="Valor ajustado (opcional)" value={valorAjuste} onChangeText={setValorAjuste} keyboardType="decimal-pad" placeholder="Deixe vazio pra usar o valor calculado" />
            <Botao texto="Salvar ajuste" onPress={salvarAjusteFolha} carregando={salvandoFolha} />

            <Text style={[estilos.labelChip, { marginTop: 20 }]}>Comprovantes ({folhaEditando.comprovantes?.length || 0}/3)</Text>
            {(folhaEditando.comprovantes || []).map((url: string, i: number) => (
              <Text key={i} style={estilos.linhaSub} numberOfLines={1}>{url}</Text>
            ))}
            {(folhaEditando.comprovantes?.length || 0) < 3 && (
              <>
                <Campo label="URL do comprovante" value={urlComprovante} onChangeText={setUrlComprovante} placeholder="https://..." autoCapitalize="none" />
                <Botao texto="Anexar comprovante" variante="secundario" onPress={anexarComprovante} carregando={salvandoFolha} />
              </>
            )}
          </>
        )}
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  linhaRenovacao: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F3F6' },
  inputValor: { width: 96, height: 38, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: 8, paddingHorizontal: 10, fontSize: 13.5, color: ERP.texto },
  inputData: { width: 130, height: 36, borderWidth: 1, borderColor: ERP.bordaForte, borderRadius: 8, paddingHorizontal: 10, fontSize: 13, color: ERP.texto },
  linhaSub: { fontSize: 12.5, color: ERP.textoSecundario },
  labelChip: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
