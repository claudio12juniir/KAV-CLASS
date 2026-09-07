import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, Modal, SectionCard, Tabela } from './_ui';

const STATUS_CONTRATO: Record<string, { texto: string; tom: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }> = {
  ENVIADO: { texto: 'Enviado', tom: 'info' },
  PREENCHIDO: { texto: 'Assinado (responsável)', tom: 'aviso' },
  ASSINADO: { texto: 'Assinado', tom: 'sucesso' },
  CANCELADO: { texto: 'Cancelado', tom: 'default' },
};

export default function MatriculasEscola() {
  const [carregando, setCarregando] = useState(true);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);

  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [alunoId, setAlunoId] = useState<string | null>(null);
  const [valorMensalidade, setValorMensalidade] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('10');
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const [planoPagamentoId, setPlanoPagamentoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [matriculaAberta, setMatriculaAberta] = useState<any | null>(null);
  const [testemunhas, setTestemunhas] = useState('');
  const [enviandoContrato, setEnviandoContrato] = useState(false);
  const [cancelandoContrato, setCancelandoContrato] = useState(false);

  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [rM, rA, rT, rP] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/matriculas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/turmas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/planos-pagamento`, { headers }),
      ]);
      if (rM.ok) setMatriculas(await rM.json());
      if (rA.ok) setAlunos(await rA.json());
      if (rT.ok) setTurmas(await rT.json());
      if (rP.ok) setPlanos(await rP.json());
    } catch (err) {
      console.error('Erro ao carregar Matrículas:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarTudo(); }, [carregarTudo]));

  const abrirModalNova = () => {
    setAlunoId(alunos[0]?.id ?? null);
    setValorMensalidade('');
    setDiaVencimento('10');
    setTurmaId(null);
    setPlanoPagamentoId(null);
    setModalNovaAberto(true);
  };

  const criarMatricula = async () => {
    if (!alunoId) { Alert.alert('Atenção', 'Escolha o aluno.'); return; }
    const valor = parseFloat(valorMensalidade.replace(',', '.'));
    if (!valor || valor <= 0) { Alert.alert('Atenção', 'Informe um valor de mensalidade válido.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/matriculas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alunoId, valorMensalidade: valor,
          diaVencimento: parseInt(diaVencimento, 10) || 10,
          turmaId: turmaId || undefined,
          planoPagamentoId: planoPagamentoId || undefined,
        }),
      });
      if (res.ok) { setModalNovaAberto(false); carregarTudo(); }
      else Alert.alert('Não foi possível matricular', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirDetalhe = (m: any) => { setMatriculaAberta(m); setTestemunhas(''); };

  const enviarContrato = async () => {
    if (!matriculaAberta) return;
    setEnviandoContrato(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/matriculas/${matriculaAberta.id}/contrato`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ testemunhas: testemunhas.split(',').map(t => t.trim()).filter(Boolean) }),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert(dados.emailEnviado ? 'Contrato enviado!' : 'Contrato criado', dados.mensagem);
        setMatriculaAberta(null);
        carregarTudo();
      } else {
        Alert.alert('Não foi possível enviar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoContrato(false);
    }
  };

  const cancelarContrato = async () => {
    const contrato = matriculaAberta?.contratos?.[0];
    if (!contrato) return;
    setCancelandoContrato(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/contratos/${contrato.id}/cancelar`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setMatriculaAberta(null); carregarTudo(); }
      else Alert.alert('Não foi possível cancelar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCancelandoContrato(false);
    }
  };

  const contratoDaMatriculaAberta = matriculaAberta?.contratos?.[0] || null;

  return (
    <ErpShell titulo="Matrículas" acao={<Botao texto="Nova matrícula" icone="add" onPress={abrirModalNova} disabled={alunos.length === 0} />}>
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: ERP.texto }}>Matrículas da escola</Text>
        <Text style={{ fontSize: 13, color: ERP.textoSecundario, marginTop: 3 }}>
          {matriculas.length} {matriculas.length === 1 ? 'matrícula' : 'matrículas'} — contrato digital e status de assinatura de cada uma.
        </Text>
      </View>

      <SectionCard>
        {carregando ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
        ) : (
          <Tabela
            vazioTexto="Nenhuma matrícula cadastrada ainda."
            vazioIcone="document-text-outline"
            dados={matriculas}
            onLinhaPress={abrirDetalhe}
            colunas={[
              { chave: 'aluno', titulo: 'Aluno', flex: 2, render: (m: any) => (
                <View>
                  <Text style={estilos.linhaTitulo}>{m.aluno?.nome}</Text>
                  <Text style={estilos.linhaSub}>{m.turma?.nome || 'Sem turma'} · {m.professor?.nome}</Text>
                </View>
              )},
              { chave: 'valor', titulo: 'Valor', flex: 1, render: (m: any) => <Text style={estilos.linhaSub}>R$ {Number(m.valorMensalidade).toFixed(2).replace('.', ',')}</Text> },
              { chave: 'status', titulo: 'Matrícula', flex: 1, render: (m: any) => (
                <Badge texto={m.status === 'ATIVO' ? 'Ativa' : m.status === 'PENDENTE' ? 'Pendente' : 'Inativa'} tom={m.status === 'ATIVO' ? 'sucesso' : m.status === 'PENDENTE' ? 'aviso' : 'default'} />
              )},
              { chave: 'contrato', titulo: 'Contrato', flex: 1.5, render: (m: any) => {
                const c = m.contratos?.[0];
                if (!c) return <Badge texto="Não enviado" tom="default" />;
                const cfg = STATUS_CONTRATO[c.status] || STATUS_CONTRATO.ENVIADO;
                return <Badge texto={cfg.texto} tom={cfg.tom} />;
              }},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={modalNovaAberto} titulo="Nova matrícula" onFechar={() => setModalNovaAberto(false)}>
        <Text style={estilos.label}>Aluno</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {alunos.map((a: any) => <Chip key={a.id} label={a.nome} ativo={alunoId === a.id} onPress={() => setAlunoId(a.id)} />)}
          </View>
        </ScrollView>

        <Campo label="Valor da mensalidade (R$)" value={valorMensalidade} onChangeText={setValorMensalidade} keyboardType="decimal-pad" placeholder="Ex: 250,00" />
        <Campo label="Dia de vencimento" value={diaVencimento} onChangeText={setDiaVencimento} keyboardType="number-pad" placeholder="10" />

        {turmas.length > 0 && (
          <>
            <Text style={estilos.label}>Turma (opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Nenhuma" ativo={!turmaId} onPress={() => setTurmaId(null)} />
                {turmas.map((t: any) => <Chip key={t.id} label={t.nome} ativo={turmaId === t.id} onPress={() => setTurmaId(t.id)} />)}
              </View>
            </ScrollView>
          </>
        )}

        {planos.length > 0 && (
          <>
            <Text style={estilos.label}>Plano de pagamento (opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Nenhum" ativo={!planoPagamentoId} onPress={() => setPlanoPagamentoId(null)} />
                {planos.map((p: any) => <Chip key={p.id} label={p.nome} ativo={planoPagamentoId === p.id} onPress={() => setPlanoPagamentoId(p.id)} />)}
              </View>
            </ScrollView>
          </>
        )}

        <Botao texto="Criar matrícula" onPress={criarMatricula} carregando={salvando} />
      </Modal>

      <Modal visivel={!!matriculaAberta} titulo={matriculaAberta?.aluno?.nome || ''} onFechar={() => setMatriculaAberta(null)}>
        {matriculaAberta && (
          <>
            <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Professor</Text><Text style={estilos.linhaTitulo}>{matriculaAberta.professor?.nome}</Text></View>
            <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Turma</Text><Text style={estilos.linhaTitulo}>{matriculaAberta.turma?.nome || '—'}</Text></View>
            <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Mensalidade</Text><Text style={estilos.linhaTitulo}>R$ {Number(matriculaAberta.valorMensalidade).toFixed(2).replace('.', ',')}</Text></View>
            <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Início</Text><Text style={estilos.linhaTitulo}>{new Date(matriculaAberta.dataInicio).toLocaleDateString('pt-BR')}</Text></View>

            <View style={{ height: 1, backgroundColor: ERP.borda, marginVertical: 16 }} />

            <Text style={[estilos.label, { marginTop: 0 }]}>Contrato digital</Text>
            {!contratoDaMatriculaAberta ? (
              <>
                <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginBottom: 12 }}>
                  Nenhum contrato enviado ainda pra esta matrícula.
                </Text>
                <Campo label="Testemunhas (opcional, separadas por vírgula)" value={testemunhas} onChangeText={setTestemunhas} placeholder="Ex: Fulano, Ciclana" />
                <Botao texto="Enviar contrato por e-mail" icone="mail-outline" onPress={enviarContrato} carregando={enviandoContrato} />
              </>
            ) : (
              <>
                <View style={{ marginBottom: 14 }}>
                  <Badge texto={(STATUS_CONTRATO[contratoDaMatriculaAberta.status] || STATUS_CONTRATO.ENVIADO).texto} tom={(STATUS_CONTRATO[contratoDaMatriculaAberta.status] || STATUS_CONTRATO.ENVIADO).tom} />
                </View>
                <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Código</Text><Text style={estilos.linhaTitulo}>{contratoDaMatriculaAberta.token}</Text></View>
                {contratoDaMatriculaAberta.nomeAssinanteResponsavel && (
                  <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Assinado pelo responsável</Text><Text style={estilos.linhaTitulo}>{contratoDaMatriculaAberta.nomeAssinanteResponsavel}</Text></View>
                )}
                {contratoDaMatriculaAberta.nomeRepresentanteEscola && (
                  <View style={estilos.linhaInfo}><Text style={estilos.linhaSub}>Assinado pela escola</Text><Text style={estilos.linhaTitulo}>{contratoDaMatriculaAberta.nomeRepresentanteEscola}</Text></View>
                )}
                {contratoDaMatriculaAberta.status !== 'ASSINADO' && contratoDaMatriculaAberta.status !== 'CANCELADO' && (
                  <View style={{ marginTop: 12 }}>
                    <Botao texto="Cancelar contrato" variante="perigo" icone="close-circle-outline" onPress={cancelarContrato} carregando={cancelandoContrato} />
                  </View>
                )}
              </>
            )}
          </>
        )}
      </Modal>
    </ErpShell>
  );
}

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={onPress}>
      <Text style={[estilos.chipTexto, ativo && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaSub: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8, marginTop: 4 },
  linhaInfo: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: ERP.borda },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
