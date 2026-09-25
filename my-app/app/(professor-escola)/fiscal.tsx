// Fiscal do professor INSTITUTION (Sprint 28, briefing 24/09/2026, revisado
// 26/09/2026) — só existe aqui, não em (professor)/SELF: só faz sentido
// quando a Escola exige nota fiscal do professor pra liberar o pagamento
// (Escola.exigeNotaProfessor), e isso só existe no Pacote Escola.
//
// Modelo revisado 26/09/2026: o professor NÃO cria conta na Notaas — ele só
// informa os PRÓPRIOS dados fiscais (CNPJ MEI/PJ) e sobe o PRÓPRIO
// certificado digital A1 (.pfx); o backend cadastra um projeto sob a
// organização Notaas da KAV CLASS. Ao fechar a folha, a emissão acontece
// sozinha (server.js: emitirNotaFolhaPagamento) — esta tela é só cadastro +
// acompanhamento, não tem botão de "emitir agora".
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Badge, Botao, Campo, EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type Dados = {
  razaoSocial: string | null;
  cnpj: string | null;
  inscricaoMunicipal: string | null;
  inscricaoEstadual: string | null;
  regimeTributario: string | null;
  codigoMunicipio: string | null;
  notaasConectado: boolean;
  fiscalDisponivel: boolean;
  notaasCertificadoNomeArquivo: string | null;
  notaasCertificadoValidoAte: string | null;
  notaasCodigoServicoPadrao: string | null;
  notaasAliquotaIssPadrao: number | null;
  exigidoPelaEscola: boolean;
  escolaNome: string;
  notas: { id: string; status: string; valor: number; erro: string | null; pdfUrl: string | null; folhaPagamento: { mes: number; ano: number } | null }[];
};

const STATUS_LABEL: Record<string, { texto: string; tom: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }> = {
  PENDENTE: { texto: 'Processando', tom: 'aviso' },
  EMITIDA: { texto: 'Emitida', tom: 'sucesso' },
  ERRO: { texto: 'Erro', tom: 'alerta' },
  CANCELADA: { texto: 'Cancelada', tom: 'default' },
};

export default function FiscalProfessorEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useProfessorEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState<Dados | null>(null);

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
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professor/fiscal`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d: Dados = await res.json();
        setDados(d);
        setRazaoSocial(d.razaoSocial || '');
        setCnpj(d.cnpj || '');
        setInscricaoMunicipal(d.inscricaoMunicipal || '');
        setInscricaoEstadual(d.inscricaoEstadual || '');
        setRegimeTributario(d.regimeTributario || '');
        setCodigoMunicipio(d.codigoMunicipio || '');
        setCodigoServico(d.notaasCodigoServicoPadrao || '');
        setAliquotaIss(d.notaasAliquotaIssPadrao != null ? String(d.notaasAliquotaIssPadrao) : '');
      }
    } catch {
      // tela mostra vazio se falhar
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => { carregar(); }, [carregar]);

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
      Alert.alert('Atenção', 'Selecione seu certificado digital A1 (.pfx) e informe a senha dele.');
      return;
    }
    setCadastrando(true);
    try {
      const certificadoBase64 = await FileSystem.readAsStringAsync(certificado.uri, { encoding: FileSystem.EncodingType.Base64 });
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professor/fiscal/notaas/cadastrar-empresa`, {
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
      if (res.ok) { setSenhaCertificado(''); setCertificado(null); carregar(); Alert.alert('Cadastrado!', d.mensagem); }
      else Alert.alert('Não foi possível cadastrar', d.erro || 'Verifique os dados e tente de novo.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCadastrando(false);
    }
  };

  const desconectarNotaas = () => {
    Alert.alert('Desconectar a Notaas?', 'Novas notas fiscais pra escola não serão emitidas automaticamente até você cadastrar de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar', style: 'destructive', onPress: async () => {
          const token = await SecureStore.getItemAsync('kav_token');
          await fetchComRetry(`${BASE_URL}/api/professor/fiscal/notaas/desconectar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          carregar();
        },
      },
    ]);
  };

  const salvarConfiguracao = async () => {
    setSalvandoConfig(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professor/fiscal/configuracao`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notaasCodigoServicoPadrao: codigoServico.trim() || null,
          notaasAliquotaIssPadrao: aliquotaIss.trim() ? Number(aliquotaIss.replace(',', '.')) : null,
        }),
      });
      if (res.ok) { carregar(); Alert.alert('Salvo!', 'Configuração fiscal atualizada.'); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const abrirPdf = async (url: string) => {
    try { await WebBrowser.openBrowserAsync(url); } catch { Linking.openURL(url); }
  };

  const diasParaExpirar = dados?.notaasCertificadoValidoAte
    ? Math.ceil((new Date(dados.notaasCertificadoValidoAte).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <MobileErpShell
      titulo="Fiscal"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Fiscal" subtitulo="Seu cadastro fiscal — a emissão pra escola acontece sozinha ao fechar sua folha." />

      {dados?.fiscalDisponivel === false ? (
        <SectionCard titulo="Em breve">
          <Text style={{ fontSize: 13.5, color: ERP.texto, lineHeight: 20 }}>
            A emissão de nota fiscal (NFS-e) está em preparação e entrará em vigor em breve
            {dados?.exigidoPelaEscola ? `. Assim que estiver disponível, ${escolaNome} vai te avisar pra cadastrar seus dados fiscais.` : '.'}
          </Text>
        </SectionCard>
      ) : (
      <>
      {dados?.exigidoPelaEscola && (
        <SectionCard style={{ backgroundColor: ERP.avisoSoft, borderColor: '#F5D9A8' }}>
          <Text style={{ color: '#8A5A00', fontSize: 13.5, lineHeight: 19 }}>
            {escolaNome} exige nota fiscal sua pra liberar o pagamento. Cadastre seus dados fiscais e o certificado abaixo.
          </Text>
        </SectionCard>
      )}

      {dados?.notaasConectado ? (
        <SectionCard titulo="Cadastro fiscal" subtitulo="Ativo">
          <Text style={{ fontSize: 13.5, color: ERP.texto, fontWeight: '600' }}>{dados.razaoSocial}</Text>
          <Text style={{ fontSize: 12, color: ERP.textoSecundario, marginBottom: 8 }}>CNPJ {dados.cnpj}</Text>
          {dados.notaasCertificadoNomeArquivo && (
            <Text style={{ fontSize: 12, color: diasParaExpirar != null && diasParaExpirar < 30 ? ERP.perigo : ERP.textoSecundario, marginBottom: 8 }}>
              Certificado {dados.notaasCertificadoNomeArquivo}
              {dados.notaasCertificadoValidoAte ? ` · válido até ${new Date(dados.notaasCertificadoValidoAte).toLocaleDateString('pt-BR')}` : ''}
              {diasParaExpirar != null && diasParaExpirar < 30 ? ' — expira em breve, renove com sua certificadora' : ''}
            </Text>
          )}
          <Botao texto="Desconectar" variante="perigo" onPress={desconectarNotaas} />
        </SectionCard>
      ) : (
        <SectionCard titulo="Cadastro fiscal" subtitulo="Seus dados como MEI/PJ pra emissão de NFS-e — sem precisar abrir conta em outra plataforma">
          <Campo label="Razão social" value={razaoSocial} onChangeText={setRazaoSocial} placeholder="Seu nome jurídico (MEI/PJ)" />
          <Campo label="CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="00.000.000/0001-00" keyboardType="number-pad" />
          <Campo label="Inscrição municipal" value={inscricaoMunicipal} onChangeText={setInscricaoMunicipal} placeholder="Ex.: 123456" />
          <Campo label="Inscrição estadual" value={inscricaoEstadual} onChangeText={setInscricaoEstadual} placeholder="Se aplicável" />
          <Campo label="Regime tributário" value={regimeTributario} onChangeText={setRegimeTributario} placeholder="Ex.: MEI" />
          <Campo label="Código do município (IBGE)" value={codigoMunicipio} onChangeText={setCodigoMunicipio} placeholder="Ex.: 3550308" keyboardType="number-pad" />

          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginBottom: 6 }}>
              Certificado digital A1 (.pfx) — obrigatório, emitido pra o seu CNPJ por uma certificadora (Serasa, Certisign etc.). É ele que assina a nota perante a prefeitura.
            </Text>
            <Botao texto={certificado ? certificado.nome : 'Selecionar certificado (.pfx)'} variante="secundario" onPress={escolherCertificado} />
          </View>
          <Campo label="Senha do certificado" value={senhaCertificado} onChangeText={setSenhaCertificado} secureTextEntry />

          <Botao texto="Cadastrar empresa fiscal" onPress={cadastrarEmpresa} carregando={cadastrando} />
        </SectionCard>
      )}

      <SectionCard titulo="Padrões de emissão">
        <Campo label="Código de serviço municipal padrão" value={codigoServico} onChangeText={setCodigoServico} placeholder="Ex.: 010700" />
        <Campo label="Alíquota ISS padrão (%)" value={aliquotaIss} onChangeText={setAliquotaIss} placeholder="Ex.: 2" keyboardType="decimal-pad" />
        <Botao texto="Salvar configuração" variante="secundario" onPress={salvarConfiguracao} carregando={salvandoConfig} />
      </SectionCard>
      </>
      )}

      <SectionCard titulo="Notas emitidas">
        {!dados || dados.notas.length === 0 ? (
          <EstadoVazio icone="document-text-outline" texto="Nenhuma nota fiscal ainda." />
        ) : (
          dados.notas.map((n) => {
            const cfg = STATUS_LABEL[n.status] || STATUS_LABEL.PENDENTE;
            return (
              <View key={n.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 4 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: ERP.texto }}>
                  {n.folhaPagamento ? `${NOMES_MES[n.folhaPagamento.mes - 1]}/${n.folhaPagamento.ano}` : 'Folha'} · R$ {n.valor.toFixed(2).replace('.', ',')}
                </Text>
                <Badge texto={cfg.texto} tom={cfg.tom} />
                {n.erro && <Text style={{ fontSize: 12, color: ERP.perigo }}>{n.erro}</Text>}
                {n.pdfUrl && <Botao texto="Ver PDF" variante="secundario" onPress={() => abrirPdf(n.pdfUrl!)} />}
              </View>
            );
          })
        )}
      </SectionCard>
    </MobileErpShell>
  );
}
