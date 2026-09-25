// Categoria Fiscal (INSTITUTION Sprint 27, briefing 24/09/2026, revisado
// 26/09/2026) — pedido explícito do usuário: "nova categoria com sub itens/
// abas que façam sentido e completem por fim a necessidade da escola de
// ponta a ponta". 3 abas: Configurações (cadastro fiscal + certificado A1 +
// exigir nota do professor), Pendentes (pagamentos pagos sem nota ainda) e
// Notas Emitidas (histórico, dos dois sentidos: aluno→escola e
// professor→escola).
//
// Modelo revisado 26/09/2026: a escola NÃO cria conta na Notaas — ela só
// informa os próprios dados fiscais (CNPJ etc.) e sobe o próprio certificado
// digital A1 (.pfx); o backend cadastra um projeto sob a organização Notaas
// da KAV CLASS e a nota sai numerada e autorizada pelo SEFAZ/prefeitura do
// CNPJ da escola. O certificado é exigência legal de assinatura da nota —
// não elimina isso, só elimina a burocracia de abrir conta em outra
// plataforma.
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Switch, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, PageHeader, SectionCard, SubAbasSimples } from './_ui';

type Sub = 'configuracoes' | 'pendentes' | 'notas';

const STATUS_LABEL: Record<string, { texto: string; tom: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }> = {
  PENDENTE: { texto: 'Processando', tom: 'aviso' },
  EMITIDA: { texto: 'Emitida', tom: 'sucesso' },
  ERRO: { texto: 'Erro', tom: 'alerta' },
  CANCELADA: { texto: 'Cancelada', tom: 'default' },
};

export default function FiscalEscola() {
  const [sub, setSub] = useState<Sub>('configuracoes');
  const [carregando, setCarregando] = useState(true);

  const [config, setConfig] = useState<any>(null);
  const [cadastrando, setCadastrando] = useState(false);

  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('');
  const [inscricaoEstadual, setInscricaoEstadual] = useState('');
  const [regimeTributario, setRegimeTributario] = useState('');
  const [codigoMunicipio, setCodigoMunicipio] = useState('');
  const [certificado, setCertificado] = useState<{ nome: string; uri: string } | null>(null);
  const [senhaCertificado, setSenhaCertificado] = useState('');

  const [codigoServico, setCodigoServico] = useState('');
  const [aliquotaIss, setAliquotaIss] = useState('');
  const [exigeNotaProfessor, setExigeNotaProfessor] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [pendentes, setPendentes] = useState<any[]>([]);
  const [emitindoId, setEmitindoId] = useState<string | null>(null);
  const [notas, setNotas] = useState<any[]>([]);

  const carregarConfig = useCallback(async () => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/fiscal/configuracao`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const d = await res.json();
      setConfig(d);
      setRazaoSocial(d.razaoSocial || '');
      setCnpj(d.cnpj || '');
      setInscricaoMunicipal(d.inscricaoMunicipal || '');
      setInscricaoEstadual(d.inscricaoEstadual || '');
      setRegimeTributario(d.regimeTributario || '');
      setCodigoMunicipio(d.codigoMunicipio || '');
      setCodigoServico(d.notaasCodigoServicoPadrao || '');
      setAliquotaIss(d.notaasAliquotaIssPadrao != null ? String(d.notaasAliquotaIssPadrao) : '');
      setExigeNotaProfessor(!!d.exigeNotaProfessor);
    }
  }, []);

  const carregarPendentes = useCallback(async () => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/fiscal/pendentes`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPendentes(await res.json());
  }, []);

  const carregarNotas = useCallback(async () => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/fiscal/notas`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setNotas(await res.json());
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      await Promise.all([carregarConfig(), carregarPendentes(), carregarNotas()]);
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, [carregarConfig, carregarPendentes, carregarNotas]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const escolherCertificado = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({ type: ['application/x-pkcs12', '*/*'], copyToCacheDirectory: true });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const arquivo = resultado.assets[0];
    setCertificado({ nome: arquivo.name, uri: arquivo.uri });
  };

  const cadastrarEmpresa = async () => {
    if (!razaoSocial.trim() || !cnpj.trim() || !codigoMunicipio.trim()) {
      Alert.alert('Atenção', 'Preencha ao menos Razão Social, CNPJ e Código do Município.');
      return;
    }
    if (!certificado || !senhaCertificado) {
      Alert.alert('Atenção', 'Selecione o certificado digital A1 (.pfx) e informe a senha dele.');
      return;
    }
    setCadastrando(true);
    try {
      const certificadoBase64 = await FileSystem.readAsStringAsync(certificado.uri, { encoding: FileSystem.EncodingType.Base64 });
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/fiscal/notaas/cadastrar-empresa`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razaoSocial: razaoSocial.trim(), cnpj: cnpj.trim(),
          inscricaoMunicipal: inscricaoMunicipal.trim() || undefined,
          inscricaoEstadual: inscricaoEstadual.trim() || undefined,
          regimeTributario: regimeTributario.trim() || undefined,
          codigoMunicipio: codigoMunicipio.trim(),
          certificadoBase64, certificadoNomeArquivo: certificado.nome, senhaCertificado,
        }),
      }, 1, 0, 45000);
      const d = await res.json();
      if (res.ok) { setSenhaCertificado(''); setCertificado(null); carregarConfig(); Alert.alert('Cadastrado!', d.mensagem); }
      else Alert.alert('Não foi possível cadastrar', d.erro || 'Verifique os dados e tente de novo.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCadastrando(false);
    }
  };

  const desconectarNotaas = () => {
    Alert.alert('Desconectar a Notaas?', 'Emissão manual e automática de notas ficam indisponíveis até cadastrar de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar', style: 'destructive', onPress: async () => {
          const token = await SecureStore.getItemAsync('kav_token');
          await fetchComRetry(`${BASE_URL}/api/escola/fiscal/notaas/desconectar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          carregarConfig();
        },
      },
    ]);
  };

  const salvarConfiguracao = async () => {
    setSalvandoConfig(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/fiscal/configuracao`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notaasCodigoServicoPadrao: codigoServico.trim() || null,
          notaasAliquotaIssPadrao: aliquotaIss.trim() ? Number(aliquotaIss.replace(',', '.')) : null,
          exigeNotaProfessor,
        }),
      });
      if (res.ok) Alert.alert('Salvo!', 'Configuração fiscal atualizada.');
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const emitirNota = async (pagamentoId: string) => {
    setEmitindoId(pagamentoId);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/pagamentos/${pagamentoId}/emitir-nota`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const d = await res.json();
      if (res.ok) { Alert.alert('Enviado!', d.mensagem); carregarPendentes(); carregarNotas(); }
      else Alert.alert('Não foi possível emitir', d.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEmitindoId(null);
    }
  };

  const abrirPdf = async (url: string) => {
    try { await WebBrowser.openBrowserAsync(url); } catch { Linking.openURL(url); }
  };

  if (carregando) {
    return (
      <ErpShell titulo="Fiscal">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      </ErpShell>
    );
  }

  const diasParaExpirar = config?.notaasCertificadoValidoAte
    ? Math.ceil((new Date(config.notaasCertificadoValidoAte).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <ErpShell titulo="Fiscal">
      <PageHeader titulo="Fiscal" subtitulo="Emissão de nota fiscal (NFS-e) — pro aluno e, se exigido, pelo professor." />

      <SectionCard>
        <SubAbasSimples
          opcoes={[
            { chave: 'configuracoes', rotulo: 'Configurações' },
            { chave: 'pendentes', rotulo: `Pendentes (${pendentes.length})` },
            { chave: 'notas', rotulo: 'Notas emitidas' },
          ]}
          ativa={sub}
          onMudar={setSub}
        />
      </SectionCard>

      {sub === 'configuracoes' && (
        <>
          {config?.notaasConectado ? (
            <SectionCard titulo="Cadastro fiscal" subtitulo="Ativo">
              <Text style={{ fontSize: 13.5, color: ERP.texto, fontWeight: '600' }}>{config.razaoSocial}</Text>
              <Text style={{ fontSize: 12, color: ERP.textoSecundario, marginBottom: 8 }}>CNPJ {config.cnpj}</Text>
              {config.notaasCertificadoNomeArquivo && (
                <Text style={{ fontSize: 12, color: diasParaExpirar != null && diasParaExpirar < 30 ? ERP.perigo : ERP.textoSecundario, marginBottom: 8 }}>
                  Certificado {config.notaasCertificadoNomeArquivo}
                  {config.notaasCertificadoValidoAte ? ` · válido até ${new Date(config.notaasCertificadoValidoAte).toLocaleDateString('pt-BR')}` : ''}
                  {diasParaExpirar != null && diasParaExpirar < 30 ? ' — expira em breve, renove com sua certificadora' : ''}
                </Text>
              )}
              <Botao texto="Desconectar" variante="perigo" onPress={desconectarNotaas} />
            </SectionCard>
          ) : (
            <SectionCard titulo="Cadastro fiscal" subtitulo="Dados da escola pra emissão de NFS-e — sem precisar abrir conta em outra plataforma">
              <Campo label="Razão social" value={razaoSocial} onChangeText={setRazaoSocial} placeholder="Nome jurídico da escola" />
              <Campo label="CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="00.000.000/0001-00" keyboardType="number-pad" />
              <Campo label="Inscrição municipal" value={inscricaoMunicipal} onChangeText={setInscricaoMunicipal} placeholder="Ex.: 123456" />
              <Campo label="Inscrição estadual" value={inscricaoEstadual} onChangeText={setInscricaoEstadual} placeholder="Se aplicável" />
              <Campo label="Regime tributário" value={regimeTributario} onChangeText={setRegimeTributario} placeholder="Ex.: Simples Nacional" />
              <Campo label="Código do município (IBGE)" value={codigoMunicipio} onChangeText={setCodigoMunicipio} placeholder="Ex.: 3550308" keyboardType="number-pad" />

              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginBottom: 6 }}>
                  Certificado digital A1 (.pfx) — obrigatório, emitido pra o CNPJ da escola por uma certificadora (Serasa, Certisign etc.). É ele que assina a nota perante a prefeitura.
                </Text>
                <Botao texto={certificado ? certificado.nome : 'Selecionar certificado (.pfx)'} variante="secundario" onPress={escolherCertificado} />
              </View>
              <Campo label="Senha do certificado" value={senhaCertificado} onChangeText={setSenhaCertificado} secureTextEntry />

              <Botao texto="Cadastrar empresa fiscal" onPress={cadastrarEmpresa} carregando={cadastrando} />
            </SectionCard>
          )}

          <SectionCard titulo="Padrões de emissão" subtitulo="Usados quando a escola não informar um código específico ao emitir">
            <Campo label="Código de serviço municipal padrão" value={codigoServico} onChangeText={setCodigoServico} placeholder="Ex.: 010700" />
            <Campo label="Alíquota ISS padrão (%)" value={aliquotaIss} onChangeText={setAliquotaIss} placeholder="Ex.: 2" keyboardType="decimal-pad" />
          </SectionCard>

          <SectionCard titulo="Nota fiscal do professor" subtitulo="Quando ativo, o professor precisa emitir nota fiscal (própria, MEI/PJ) pra Escola pra o pagamento ser liberado — a emissão acontece sozinha quando a folha do mês é fechada.">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13.5, color: ERP.texto, fontWeight: '600' }}>Exigir nota fiscal do professor</Text>
              <Switch value={exigeNotaProfessor} onValueChange={setExigeNotaProfessor} trackColor={{ true: ERP.acento }} />
            </View>
          </SectionCard>

          <Botao texto="Salvar configuração" onPress={salvarConfiguracao} carregando={salvandoConfig} />
        </>
      )}

      {sub === 'pendentes' && (
        <SectionCard subtitulo="Pagamentos de alunos já recebidos, ainda sem nota fiscal emitida">
          {!config?.notaasConectado ? (
            <EstadoVazio icone="alert-circle-outline" texto="Cadastre a empresa fiscal em Configurações antes de emitir notas." />
          ) : pendentes.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhum pagamento pendente de nota." />
          ) : (
            pendentes.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: ERP.texto }}>{p.aluno?.nome}</Text>
                  <Text style={{ fontSize: 12, color: ERP.textoSecundario }}>R$ {Number(p.valor).toFixed(2).replace('.', ',')} · pago em {p.dataPagamento ? new Date(p.dataPagamento).toLocaleDateString('pt-BR') : '—'}</Text>
                </View>
                <Botao texto="Emitir nota" variante="secundario" onPress={() => emitirNota(p.id)} carregando={emitindoId === p.id} />
              </View>
            ))
          )}
        </SectionCard>
      )}

      {sub === 'notas' && (
        <SectionCard subtitulo="Notas do aluno pra escola e, quando exigido, do professor pra escola">
          {notas.length === 0 ? (
            <EstadoVazio icone="document-text-outline" texto="Nenhuma nota fiscal emitida ainda." />
          ) : (
            notas.map((n) => {
              const cfg = STATUS_LABEL[n.status] || STATUS_LABEL.PENDENTE;
              const titulo = n.tipo === 'ALUNO_PARA_ESCOLA' ? n.pagamento?.aluno?.nome : `Professor: ${n.folhaPagamento?.professor?.nome || ''}`;
              return (
                <View key={n.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 4 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: ERP.texto }}>{titulo} · R$ {Number(n.valor).toFixed(2).replace('.', ',')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge texto={n.tipo === 'ALUNO_PARA_ESCOLA' ? 'Aluno → Escola' : 'Professor → Escola'} tom="info" />
                    <Badge texto={cfg.texto} tom={cfg.tom} />
                  </View>
                  {n.erro && <Text style={{ fontSize: 12, color: ERP.perigo }}>{n.erro}</Text>}
                  {n.pdfUrl && <Botao texto="Ver PDF" variante="secundario" onPress={() => abrirPdf(n.pdfUrl)} />}
                </View>
              );
            })
          )}
        </SectionCard>
      )}
    </ErpShell>
  );
}
