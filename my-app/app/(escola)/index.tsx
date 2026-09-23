import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Kpi, Modal, PageHeader, SectionCard, Tabela, useEhDesktop } from './_ui';

type AulaGrade = {
  id: string;
  dataHora: string;
  aluno: { id: string; nome: string };
  presenca: string | null;
  presencaProfessorEm: string | null;
  presencaAlunoEm: string | null;
  decisaoReposicao: boolean | null;
  // Repasse de aula (INSTITUTION Sprint 12, briefing 22/09/2026) — quando
  // preenchido, é quem efetivamente leciona esta aula (não o dono da
  // grade); a folha de pagamento paga este professor por ela, não o outro.
  professorSubstituto: { id: string; nome: string } | null;
  // Confirmação de presença do aluno 24h antes (Sprint 13) — null = ainda
  // não pediu/não respondeu; true/false = respondeu.
  confirmacaoAlunoResposta: boolean | null;
  // Experimentais aparecem na mesma grade (INSTITUTION Sprint 11, briefing
  // 08/09/2026) — ações de reposição/override manual não fazem sentido
  // pra elas (Lead ainda não é Aluno, não tem Matricula/senha), por isso
  // ficam escondidas quando esse flag vem true.
  experimental?: boolean;
};
type ProfessorGrade = { professorId: string; nome: string; aulas: AulaGrade[] };
type ProfessorResumo = { id: string; nome: string };

// Produto.estoqueMinimo (INSTITUTION Sprint 18, briefing 22/09/2026) agora
// é configurável por produto — este limiar só entra como fallback pra
// produto que nunca teve um mínimo definido (nullable de propósito).
const LIMIAR_ESTOQUE_BAIXO_PADRAO = 5;
const estaComEstoqueBaixo = (p: any) => p.quantidadeEstoque <= (p.estoqueMinimo ?? LIMIAR_ESTOQUE_BAIXO_PADRAO);

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Classificação em 3 cores (INSTITUTION Sprint 21, briefing 23/09/2026) —
// autônoma: a escola marca falta/presença direto por aqui, sem precisar do
// professor ter feito nada antes. Verde = aula concluída (presença
// confirmada, de qualquer jeito — checkin, override ou QR code). Amarelo =
// falta (aluno ou professor) que a escola decidiu que precisa repor — já
// cai sozinho em Reposições → "Para repor". Vermelho = falta injustificada,
// não precisa repor, só fica registrada no histórico do aluno. Cinza =
// ainda pendente, ninguém marcou nada.
type CorAula = 'verde' | 'amarelo' | 'vermelho' | 'cinza';
function corDaAula(aula: AulaGrade): CorAula {
  if (aula.presenca === 'PRESENTE') return 'verde';
  if (aula.presenca === 'AUSENCIA_ALUNO' || aula.presenca === 'AUSENCIA_PROFESSOR') {
    return aula.decisaoReposicao ? 'amarelo' : 'vermelho';
  }
  return 'cinza';
}
const ROTULO_COR: Record<CorAula, string> = {
  verde: 'Aula concluída', amarelo: 'Falta — para repor', vermelho: 'Falta injustificada', cinza: 'Pendente',
};
const TOM_COR: Record<CorAula, 'sucesso' | 'aviso' | 'alerta' | 'default'> = {
  verde: 'sucesso', amarelo: 'aviso', vermelho: 'alerta', cinza: 'default',
};

// Modal da grade em horas de um professor específico — a escola marca
// "é reposição ou não" por aula (Sprint 2: decisaoReposicao, à parte do
// fluxo de aprovação de Reposicao) e pode intervir manualmente na presença
// quando professor ou aluno não conseguiram usar o celular (exige a senha
// de quem está sendo marcado).
function ModalGradeProfessor({ professor, todosProfessores, onFechar, aoAtualizar }: {
  professor: ProfessorGrade | null; todosProfessores: ProfessorResumo[]; onFechar: () => void; aoAtualizar: () => void;
}) {
  const [overrideAulaId, setOverrideAulaId] = useState<string | null>(null);
  const [overrideAlvo, setOverrideAlvo] = useState<'PROFESSOR' | 'ALUNO'>('ALUNO');
  const [senha, setSenha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [substituindoAulaId, setSubstituindoAulaId] = useState<string | null>(null);
  const [marcandoFaltaId, setMarcandoFaltaId] = useState<string | null>(null);
  const [faltaAlvo, setFaltaAlvo] = useState<'ALUNO' | 'PROFESSOR'>('ALUNO');
  const [registrandoFalta, setRegistrandoFalta] = useState(false);

  const chamarApi = async (path: string, body: any) => {
    const token = await SecureStore.getItemAsync('kav_token');
    return fetchComRetry(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  // Marcar falta (Sprint 21): a escola decide sozinha, sem senha — registrar
  // uma AUSÊNCIA não tem o mesmo risco de fraude que reivindicar presença de
  // alguém (isso continua exigindo senha via override manual, abaixo). Já
  // sincroniza a tela de Reposições sozinho (server.js: registrar-falta).
  const registrarFalta = async (aula: AulaGrade, precisaReposicao: boolean) => {
    setRegistrandoFalta(true);
    try {
      const res = await chamarApi(`/api/aulas/${aula.id}/registrar-falta`, { alvo: faltaAlvo, precisaReposicao });
      if (res.ok) { setMarcandoFaltaId(null); aoAtualizar(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível registrar a falta.');
    } finally {
      setRegistrandoFalta(false);
    }
  };

  // Repasse de aula (Sprint 12): marcar/remover quem efetivamente leciona
  // esta aula específica, quando é outro professor da escola. professorId
  // continua sendo o dono da grade — só o valor na folha muda de mão.
  const marcarSubstituto = async (aula: AulaGrade, professorSubstitutoId: string | null) => {
    const res = await chamarApi(`/api/aulas/${aula.id}/substituto`, { professorSubstitutoId });
    if (res.ok) { setSubstituindoAulaId(null); aoAtualizar(); }
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível registrar a substituição.');
  };

  const abrirOverride = (aula: AulaGrade) => {
    setOverrideAulaId(aula.id);
    setOverrideAlvo(!aula.presencaAlunoEm ? 'ALUNO' : 'PROFESSOR');
    setSenha(''); setMotivo('');
  };

  const confirmarOverride = async () => {
    if (!overrideAulaId || !senha) { Alert.alert('Atenção', 'Informe a senha de quem está sendo marcado.'); return; }
    setEnviando(true);
    try {
      const res = await chamarApi(`/api/aulas/${overrideAulaId}/override-manual`, { alvo: overrideAlvo, senha, motivo });
      const dados = await res.json();
      if (res.ok) { setOverrideAulaId(null); aoAtualizar(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível marcar presença.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  if (!professor) return null;

  return (
    <Modal visivel={!!professor} titulo={`Grade de hoje · ${professor.nome}`} onFechar={onFechar} largura={560}>
      {professor.aulas.length === 0 ? (
        <EstadoVazio icone="calendar-outline" texto="Nenhuma aula hoje pra este professor." />
      ) : (
        professor.aulas.map((aula) => (
          <View key={aula.id} style={estilos.linhaAula}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.linhaTitulo}>{horaCurta(aula.dataHora)} · {aula.aluno.nome}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {!aula.experimental && <Badge texto={ROTULO_COR[corDaAula(aula)]} tom={TOM_COR[corDaAula(aula)]} />}
                <Badge texto={aula.presencaProfessorEm ? 'Professor ok' : 'Professor pendente'} tom={aula.presencaProfessorEm ? 'sucesso' : 'aviso'} />
                <Badge texto={aula.presencaAlunoEm ? 'Aluno ok' : 'Aluno pendente'} tom={aula.presencaAlunoEm ? 'sucesso' : 'aviso'} />
                {aula.experimental ? <Badge texto="Experimental" tom="aviso" /> : null}
                {aula.professorSubstituto ? <Badge texto={`Lecionada por ${aula.professorSubstituto.nome}`} tom="info" /> : null}
                {aula.confirmacaoAlunoResposta === false ? <Badge texto="Aluno não confirmou" tom="alerta" /> : null}
                {aula.confirmacaoAlunoResposta === true ? <Badge texto="Aluno confirmou" tom="sucesso" /> : null}
              </View>
              {!aula.experimental && marcandoFaltaId === aula.id && (
                <View style={estilos.overrideBox}>
                  <Text style={{ color: ERP.textoSecundario, fontSize: 12, marginBottom: 8 }}>Falta de quem?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <Botao texto="Aluno" variante={faltaAlvo === 'ALUNO' ? 'primario' : 'secundario'} onPress={() => setFaltaAlvo('ALUNO')} />
                    <Botao texto="Professor" variante={faltaAlvo === 'PROFESSOR' ? 'primario' : 'secundario'} onPress={() => setFaltaAlvo('PROFESSOR')} />
                  </View>
                  <Text style={{ color: ERP.textoSecundario, fontSize: 12, marginBottom: 8 }}>Precisa repor essa aula?</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Botao texto="Sim — vai pra Reposições" onPress={() => registrarFalta(aula, true)} carregando={registrandoFalta} />
                    <Botao texto="Não — falta injustificada" variante="perigo" onPress={() => registrarFalta(aula, false)} carregando={registrandoFalta} />
                    <Botao texto="Cancelar" variante="secundario" onPress={() => setMarcandoFaltaId(null)} />
                  </View>
                </View>
              )}
              {!aula.experimental && substituindoAulaId === aula.id && (
                <View style={estilos.overrideBox}>
                  <Text style={{ color: ERP.textoSecundario, fontSize: 12, marginBottom: 8 }}>
                    Qual professor efetivamente vai lecionar esta aula?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {todosProfessores.filter((p) => p.id !== professor.professorId).map((p) => (
                      <Botao key={p.id} texto={p.nome} variante={aula.professorSubstituto?.id === p.id ? 'primario' : 'secundario'} onPress={() => marcarSubstituto(aula, p.id)} />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {aula.professorSubstituto && (
                      <Botao texto="Remover substituição" variante="secundario" onPress={() => marcarSubstituto(aula, null)} />
                    )}
                    <Botao texto="Fechar" variante="secundario" onPress={() => setSubstituindoAulaId(null)} />
                  </View>
                </View>
              )}
              {!aula.experimental && overrideAulaId === aula.id && (
                <View style={estilos.overrideBox}>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <Botao texto="Aluno" variante={overrideAlvo === 'ALUNO' ? 'primario' : 'secundario'} onPress={() => setOverrideAlvo('ALUNO')} />
                    <Botao texto="Professor" variante={overrideAlvo === 'PROFESSOR' ? 'primario' : 'secundario'} onPress={() => setOverrideAlvo('PROFESSOR')} />
                  </View>
                  <Campo label={`Senha do ${overrideAlvo === 'ALUNO' ? 'aluno' : 'professor'}`} value={senha} onChangeText={setSenha} secureTextEntry />
                  <Campo label="Motivo (opcional)" value={motivo} onChangeText={setMotivo} placeholder="Ex.: esqueceu o celular" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Botao texto="Confirmar" onPress={confirmarOverride} carregando={enviando} />
                    <Botao texto="Cancelar" variante="secundario" onPress={() => setOverrideAulaId(null)} />
                  </View>
                </View>
              )}
            </View>
            {!aula.experimental && (
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                {marcandoFaltaId !== aula.id && (
                  <Botao texto="Marcar falta" variante="secundario" onPress={() => { setMarcandoFaltaId(aula.id); setFaltaAlvo('ALUNO'); }} />
                )}
                {(!aula.presencaProfessorEm || !aula.presencaAlunoEm) && overrideAulaId !== aula.id && (
                  <Botao texto="Marcar presença manual" variante="secundario" onPress={() => abrirOverride(aula)} />
                )}
                {substituindoAulaId !== aula.id && (
                  <Botao texto={aula.professorSubstituto ? 'Trocar substituição' : 'Outro professor lecionou'} variante="secundario" onPress={() => setSubstituindoAulaId(aula.id)} />
                )}
              </View>
            )}
          </View>
        ))
      )}
    </Modal>
  );
}

export default function PainelEscola() {
  const { nomeEscola, pacote } = useEscolaContexto();
  const ehDesktop = useEhDesktop();
  const [carregando, setCarregando] = useState(true);

  const [totalProfessores, setTotalProfessores] = useState(0);
  const [todosProfessores, setTodosProfessores] = useState<ProfessorResumo[]>([]);
  const [totalAlunos, setTotalAlunos] = useState(0);
  const [inadimplentes, setInadimplentes] = useState<any[]>([]);
  const [tarefasPendentes, setTarefasPendentes] = useState<any[]>([]);
  const [reposicoesParaFinalizar, setReposicoesParaFinalizar] = useState<any[]>([]);
  const [vencendo, setVencendo] = useState<any[]>([]);
  const [aulasParaReposicao, setAulasParaReposicao] = useState<any[]>([]);
  const [gradeHoje, setGradeHoje] = useState<ProfessorGrade[]>([]);
  // Guarda só o id, não o objeto (Sprint 21, briefing 23/09/2026) — com o
  // polling automático de carregarDados, gradeHoje muda de referência a
  // cada 20s; se guardássemos o objeto inteiro, a modal aberta ficaria
  // mostrando dados congelados do momento em que foi aberta, mesmo com o
  // professor marcando presença/falta pelo celular nesse meio-tempo.
  const [professorSelecionadoId, setProfessorSelecionadoId] = useState<string | null>(null);
  const professorSelecionado = gradeHoje.find((p) => p.professorId === professorSelecionadoId) || null;
  const [aniversariantes, setAniversariantes] = useState<any[]>([]);
  const [estoqueBaixo, setEstoqueBaixo] = useState<any[]>([]);

  const [aulaParaCancelar, setAulaParaCancelar] = useState<any | null>(null);
  const [dataPropostaCancelar, setDataPropostaCancelar] = useState('');
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [resProfessores, resAlunos, resTarefas, resReposicoes, resVencendo, resInadimplentes, resAulasReposicao, resGradeHoje, resProdutos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/tarefas-lead`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/reposicoes`, { headers }),
        fetchComRetry(`${BASE_URL}/api/renovacoes/vencendo?dias=30`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/inadimplentes`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/aulas-para-reposicao`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/grade-hoje`, { headers }),
        fetchComRetry(`${BASE_URL}/api/produtos`, { headers }),
      ]);

      if (resProfessores.ok) {
        const professores = await resProfessores.json();
        setTotalProfessores(professores.length);
        setTodosProfessores(professores.map((p: any) => ({ id: p.id, nome: p.nome })));
        const hoje = new Date();
        setAniversariantes(professores.filter((p: any) => {
          if (!p.dataNascimento) return false;
          const n = new Date(p.dataNascimento);
          const prox = new Date(hoje.getFullYear(), n.getMonth(), n.getDate());
          if (prox < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) prox.setFullYear(hoje.getFullYear() + 1);
          const dias = Math.round((prox.getTime() - hoje.getTime()) / 86400000);
          return dias >= 0 && dias <= 7;
        }));
      }
      if (resAlunos.ok) setTotalAlunos((await resAlunos.json()).length);
      if (resTarefas.ok) setTarefasPendentes(await resTarefas.json());
      if (resReposicoes.ok) setReposicoesParaFinalizar(await resReposicoes.json());
      if (resVencendo.ok) setVencendo(await resVencendo.json());
      if (resInadimplentes.ok) setInadimplentes(await resInadimplentes.json());
      if (resAulasReposicao.ok) setAulasParaReposicao(await resAulasReposicao.json());
      if (resGradeHoje.ok) setGradeHoje(await resGradeHoje.json());
      if (resProdutos.ok) {
        const produtos = await resProdutos.json();
        setEstoqueBaixo(produtos.filter((p: any) => p.ativo !== false && estaComEstoqueBaixo(p)));
      }
    } catch (err) {
      console.error('Erro ao carregar Painel:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Polling leve (INSTITUTION Sprint 21, briefing 23/09/2026) — pedido
  // explícito do usuário: quando o professor marca presença/falta pelo
  // celular, a escola precisa ver isso refletido "sempre em tempo real" na
  // Grade de hoje. O app não tem infra de WebSocket/push-refresh hoje (todo
  // o resto do painel atualiza só ao focar a tela) — refazer isso com
  // socket seria uma mudança de infraestrutura própria, fora do escopo
  // desta sprint. V1 pragmática: refetch automático a cada 20s enquanto o
  // Painel está aberto, sem precisar sair e voltar pra tela.
  useFocusEffect(useCallback(() => {
    carregarDados();
    const intervalo = setInterval(carregarDados, 20000);
    return () => clearInterval(intervalo);
  }, [carregarDados]));

  const concluirTarefa = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/tarefas-lead/${id}/concluir`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível concluir.');
  };

  const finalizarReposicao = async (id: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/reposicoes/${id}/finalizar`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    const dados = await res.json();
    if (res.ok) { Alert.alert('Finalizada!', dados.mensagem); carregarDados(); }
    else Alert.alert('Erro', dados.erro || 'Não foi possível finalizar.');
  };

  const abrirCancelarComReposicao = (aula: any) => {
    setAulaParaCancelar(aula);
    setDataPropostaCancelar('');
    setMotivoCancelar('');
  };

  const confirmarCancelarComReposicao = async () => {
    if (!aulaParaCancelar) return;
    if (!dataPropostaCancelar.trim() || !motivoCancelar.trim()) {
      Alert.alert('Atenção', 'Preencha a nova data e o motivo.');
      return;
    }
    setEnviandoCancelamento(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${aulaParaCancelar.id}/cancelar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comReposicao: true, dataProposta: dataPropostaCancelar.trim(), motivo: motivoCancelar.trim() }),
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Feito!', dados.mensagem || 'Aula cancelada e reposição proposta.'); setAulaParaCancelar(null); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível cancelar a aula.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoCancelamento(false);
    }
  };

  const notificarVencimento = async (id: string, nome: string) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/alunos/${id}/notificar-vencimento`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    const dados = await res.json();
    if (res.ok) Alert.alert('Enviado!', dados.mensagem);
    else Alert.alert('Erro', dados.erro || `Não foi possível notificar ${nome}.`);
  };

  if (carregando) {
    return (
      <ErpShell titulo="Painel">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      </ErpShell>
    );
  }

  return (
    <ErpShell titulo="Painel">
      <PageHeader titulo={nomeEscola || 'Sua escola'} subtitulo="Visão consolidada do dia a dia da instituição" />

      {pacote !== 'PACOTE_ESCOLA' && (
        <SectionCard style={{ backgroundColor: ERP.avisoSoft, borderColor: '#F5D9A8' }}>
          <Text style={{ color: '#8A5A00', fontSize: 13.5, lineHeight: 19 }}>
            Sua conta ainda está no Pacote Professor — algumas funções institucionais ficam liberadas só no Pacote Escola.
          </Text>
        </SectionCard>
      )}

      {aniversariantes.length > 0 && (
        <SectionCard style={{ backgroundColor: ERP.infoSoft, borderColor: '#BFDBFE' }}>
          <Text style={{ color: ERP.info, fontSize: 13.5, fontWeight: '700' }}>
            🎂 Aniversário próximo: {aniversariantes.map((p) => p.nome).join(', ')}
          </Text>
        </SectionCard>
      )}

      <View style={estilos.kpiGrade}>
        <Kpi label="Professores" valor={totalProfessores} icone="people-outline" onPress={() => router.push('/(escola)/equipe')} />
        <Kpi label="Alunos matriculados" valor={totalAlunos} icone="school-outline" onPress={() => router.push('/(escola)/alunos')} />
        <Kpi label="Inadimplentes" valor={inadimplentes.length} icone="alert-circle-outline" tom={inadimplentes.length > 0 ? 'alerta' : 'default'} onPress={() => router.push('/(escola)/financeiro')} />
        <Kpi label="Estoque baixo" valor={estoqueBaixo.length} icone="cube-outline" tom={estoqueBaixo.length > 0 ? 'alerta' : 'default'} onPress={() => router.push('/(escola)/recursos')} />
      </View>

      <SectionCard titulo="Grade de hoje" subtitulo="Toque num professor pra ver a grade em horas do dia">
        {gradeHoje.length === 0 ? (
          <EstadoVazio icone="calendar-outline" texto="Nenhuma aula agendada pra hoje." />
        ) : (
          gradeHoje.map((p) => {
            const naoExperimentais = p.aulas.filter((a) => !a.experimental);
            const pendentes = naoExperimentais.filter((a) => corDaAula(a) === 'cinza').length;
            const paraRepor = naoExperimentais.filter((a) => corDaAula(a) === 'amarelo').length;
            return (
              <Pressable key={p.professorId} style={({ hovered }: any) => [estilos.linhaProfessor, hovered && { backgroundColor: ERP.hover }]} onPress={() => setProfessorSelecionadoId(p.professorId)}>
                <Text style={estilos.linhaTitulo}>{p.nome}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  <Text style={estilos.linhaSub}>{p.aulas.length} {p.aulas.length === 1 ? 'aula hoje' : 'aulas hoje'}</Text>
                  {pendentes > 0 && <Badge texto={`${pendentes} pendente${pendentes > 1 ? 's' : ''}`} tom="default" />}
                  {paraRepor > 0 && <Badge texto={`${paraRepor} pra repor`} tom="aviso" />}
                </View>
              </Pressable>
            );
          })
        )}
      </SectionCard>

      <View style={estilos.duasColunas}>
        <SectionCard titulo="Matrículas vencendo" style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          {vencendo.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma matrícula vencendo nos próximos 30 dias." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={vencendo}
              colunas={[
                { chave: 'nome', titulo: 'Aluno', flex: 2, render: (a: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{a.nome}</Text>
                    <Text style={estilos.linhaSub}>{a.diasRestantes <= 0 ? 'Vencido' : `${a.diasRestantes} dias restantes`}</Text>
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (a: any) => (
                  <Botao texto="Notificar" variante="secundario" onPress={() => notificarVencimento(a.id, a.nome)} />
                )},
              ]}
            />
          )}
        </SectionCard>

        <SectionCard titulo="Aulas que devem ter reposição" style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          {aulasParaReposicao.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma aula pendente de reposição." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={aulasParaReposicao}
              colunas={[
                { chave: 'aluno', titulo: 'Aluno', flex: 2, render: (a: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{a.aluno?.nome} · com {a.professor?.nome}</Text>
                    <Text style={estilos.linhaSub}>{new Date(a.dataHora).toLocaleDateString('pt-BR')}</Text>
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (a: any) => (
                  <Botao texto="Cancelar + repor" variante="secundario" onPress={() => abrirCancelarComReposicao(a)} />
                )},
              ]}
            />
          )}
        </SectionCard>

        <SectionCard titulo="Estoque baixo" subtitulo="Abaixo do mínimo configurado (ou 5 un., quando não configurado)" style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          {estoqueBaixo.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhum item acabando." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={estoqueBaixo}
              colunas={[
                { chave: 'nome', titulo: 'Item', flex: 2, render: (p: any) => <Text style={estilos.linhaTitulo}>{p.nome}</Text> },
                { chave: 'quantidade', titulo: '', flex: 1, alinhar: 'right', render: (p: any) => (
                  <Badge texto={`${p.quantidadeEstoque} un.`} tom={p.quantidadeEstoque === 0 ? 'alerta' : 'aviso'} />
                )},
              ]}
            />
          )}
        </SectionCard>
      </View>

      <View style={estilos.duasColunas}>
        <SectionCard titulo="Follow-ups pendentes" style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          {tarefasPendentes.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhum follow-up pendente." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={tarefasPendentes}
              colunas={[
                { chave: 'lead', titulo: 'Lead', flex: 2, render: (t: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{t.lead?.nome}</Text>
                    <Text style={estilos.linhaSub}>{t.descricao} · {new Date(t.dataPrevista).toLocaleDateString('pt-BR')}</Text>
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (t: any) => (
                  <Botao texto="Concluir" variante="secundario" onPress={() => concluirTarefa(t.id)} />
                )},
              ]}
            />
          )}
        </SectionCard>

        <SectionCard titulo="Reposições pra finalizar" style={{ flex: 1, minWidth: ehDesktop ? 340 : undefined }}>
          {reposicoesParaFinalizar.length === 0 ? (
            <EstadoVazio icone="checkmark-circle-outline" texto="Nenhuma reposição pendente." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={reposicoesParaFinalizar}
              colunas={[
                { chave: 'aluno', titulo: 'Aluno', flex: 2, render: (r: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{r.aluno?.nome} · com {r.professor?.nome}</Text>
                    <Text style={estilos.linhaSub}>{r.dataProposta} — {r.motivo}</Text>
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (r: any) => (
                  <Botao texto="Finalizar" variante="secundario" onPress={() => finalizarReposicao(r.id)} />
                )},
              ]}
            />
          )}
        </SectionCard>
      </View>

      <ModalGradeProfessor
        professor={professorSelecionado}
        todosProfessores={todosProfessores}
        onFechar={() => setProfessorSelecionadoId(null)}
        aoAtualizar={carregarDados}
      />

      <Modal visivel={!!aulaParaCancelar} titulo="Cancelar aula e propor reposição" onFechar={() => setAulaParaCancelar(null)}>
        {aulaParaCancelar && (
          <>
            <Text style={{ color: ERP.texto, fontSize: 13.5, marginBottom: 14, lineHeight: 19 }}>
              {aulaParaCancelar.aluno?.nome} · com {aulaParaCancelar.professor?.nome} — aula de {new Date(aulaParaCancelar.dataHora).toLocaleDateString('pt-BR')} será marcada como cancelada e uma reposição fica proposta pro aluno confirmar.
            </Text>
            <Campo label="Nova data (AAAA-MM-DD)" value={dataPropostaCancelar} onChangeText={setDataPropostaCancelar} placeholder="Ex: 2026-10-05" />
            <Campo label="Motivo" value={motivoCancelar} onChangeText={setMotivoCancelar} placeholder="Ex: feriado, imprevisto do professor" />
            <Botao texto="Cancelar aula e propor reposição" onPress={confirmarCancelarComReposicao} carregando={enviandoCancelamento} />
          </>
        )}
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  duasColunas: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
  linhaProfessor: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  linhaAula: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  overrideBox: { marginTop: 10, padding: 12, backgroundColor: ERP.fundo, borderRadius: ERP.raio.sm, borderWidth: 1, borderColor: ERP.borda },
});
