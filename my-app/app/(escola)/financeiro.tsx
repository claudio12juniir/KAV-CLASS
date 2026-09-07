import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Kpi, Modal, PageHeader, SectionCard, SubAbasSimples, Tabela } from './_ui';

type Sub = 'cobranca' | 'renovacao' | 'caixa' | 'dre';

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FinanceiroEscola() {
  const [sub, setSub] = useState<Sub>('cobranca');
  const [carregando, setCarregando] = useState(true);

  const [stripeConnect, setStripeConnect] = useState<{ conectado: boolean; onboardingCompleto: boolean } | null>(null);
  const [conectandoStripe, setConectandoStripe] = useState(false);
  const [resumoCobranca, setResumoCobranca] = useState<any>(null);

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

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const agora = new Date();
      const [resStripe, resResumo, resVencendo, resLanc, resContas, resFecha, resDre] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/status`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cobranca-automatica/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
        fetchComRetry(`${BASE_URL}/api/caixa/lancamentos?data=${dataCaixa}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/contas-pagar`, { headers }),
        fetchComRetry(`${BASE_URL}/api/caixa/fechamentos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/dre?mes=${agora.getMonth() + 1}&ano=${agora.getFullYear()}`, { headers }),
      ]);
      if (resStripe.ok) setStripeConnect(await resStripe.json());
      if (resResumo.ok) setResumoCobranca(await resResumo.json());
      if (resVencendo.ok) setAlunosVencendo(await resVencendo.json());
      if (resLanc.ok) setLancamentosDia(await resLanc.json());
      if (resContas.ok) setContasPagar(await resContas.json());
      if (resFecha.ok) setUltimoFechamento((await resFecha.json())[0] || null);
      if (resDre.ok) setDre(await resDre.json());
    } catch (err) {
      console.error('Erro ao carregar Financeiro:', err);
    } finally {
      setCarregando(false);
    }
  }, [dataCaixa]);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const conectarStripe = async () => {
    setConectandoStripe(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/iniciar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const dados = await res.json();
      if (!res.ok || !dados.url) { Alert.alert('Erro', dados.erro || 'Não foi possível iniciar a conexão com o Stripe.'); return; }
      await WebBrowser.openAuthSessionAsync(dados.url, 'kavclass://stripe-connect-retorno');
      const resStatus = await fetchComRetry(`${BASE_URL}/api/escola/stripe-connect/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (resStatus.ok) {
        const status = await resStatus.json();
        setStripeConnect(status);
        Alert.alert(status.onboardingCompleto ? 'Conta conectada!' : 'Cadastro incompleto',
          status.onboardingCompleto ? 'A cobrança automática já pode ser ativada nas matrículas.' : 'Volte quando puder pra terminar de preencher os dados no Stripe.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConectandoStripe(false);
    }
  };

  const alternarSelecao = (aluno: any) => {
    setSelecaoRenovacao((atual) => {
      const novo = { ...atual };
      if (novo[aluno.id] !== undefined) delete novo[aluno.id];
      else novo[aluno.id] = String(aluno.valorMensalidade || '');
      return novo;
    });
  };

  const confirmarRenovacaoLote = () => {
    const ids = Object.keys(selecaoRenovacao);
    if (!ids.length) { Alert.alert('Atenção', 'Selecione ao menos um aluno.'); return; }
    Alert.alert('Renovar matrículas?', `${ids.length} aluno(s) selecionado(s) — o contrato de cada um reinicia a partir de hoje com o valor informado.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Renovar', onPress: renovarLote }]);
  };

  const renovarLote = async () => {
    const renovacoes = Object.entries(selecaoRenovacao).map(([alunoId, valor]) => ({ alunoId, novoValorMensalidade: parseFloat(valor.replace(',', '.')) }));
    if (renovacoes.some((r) => !r.novoValorMensalidade || r.novoValorMensalidade <= 0)) { Alert.alert('Atenção', 'Todo aluno selecionado precisa de um valor válido.'); return; }
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

  if (carregando) {
    return <ErpShell titulo="Financeiro"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Financeiro">
      <PageHeader titulo="Financeiro" subtitulo="Cobrança automática via Stripe Connect e renovação de matrículas" />

      <SubAbasSimples
        opcoes={[
          { chave: 'cobranca', rotulo: `Cobrança${resumoCobranca?.precisamDeAcao?.length ? ` · ${resumoCobranca.precisamDeAcao.length}` : ''}` },
          { chave: 'renovacao', rotulo: `Renovação${alunosVencendo.length ? ` · ${alunosVencendo.length}` : ''}` },
          { chave: 'caixa', rotulo: 'Caixa' },
          { chave: 'dre', rotulo: 'DRE' },
        ]}
        ativa={sub} onMudar={setSub}
      />

      {sub === 'cobranca' && (
        <>
          {!stripeConnect?.conectado && (
            <SectionCard>
              <Text style={{ color: ERP.texto, fontSize: 14, marginBottom: 16, lineHeight: 20 }}>
                Nenhuma conta Stripe conectada ainda. Conecte pra liberar a ativação de cobrança automática nas matrículas.
              </Text>
              <Botao texto="Conectar conta Stripe" onPress={conectarStripe} carregando={conectandoStripe} />
            </SectionCard>
          )}

          {stripeConnect?.conectado && !stripeConnect.onboardingCompleto && (
            <SectionCard>
              <Badge texto="Cadastro incompleto" tom="aviso" />
              <Text style={{ color: ERP.texto, fontSize: 14, marginTop: 12, marginBottom: 16, lineHeight: 20 }}>
                A conta Stripe existe, mas ainda falta terminar o preenchimento de dados pra receber pagamentos.
              </Text>
              <Botao texto="Continuar cadastro" onPress={conectarStripe} carregando={conectandoStripe} />
            </SectionCard>
          )}

          {stripeConnect?.conectado && stripeConnect.onboardingCompleto && (
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
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{a.nome}</Text>
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

          <SectionCard titulo="Contas a pagar" acao={<Botao texto="Nova conta" variante="secundario" icone="add" onPress={() => setModalContaPagar(true)} />}>
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
        <SectionCard titulo={!dre ? undefined : new Date(dre.periodo.ano, dre.periodo.mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}>
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
