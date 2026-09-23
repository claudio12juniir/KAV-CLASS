// Painel do aluno INSTITUTION — espelha o dashboard do aluno SELF
// ((aluno)/index.tsx), mas a responsabilidade é com a ESCOLA, não com um
// professor específico. Mesmo GET /api/aluno/dashboard (já pronto, sem
// branch de pacote). Funções de cálculo copiadas (não importadas) do SELF
// — mesma decisão de isolamento usada nas fases anteriores.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Botao, EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

interface ProximaAula {
  id: string; dataHora: string; tipo: string; professor: { nome: string };
  presencaProfessorEm: string | null; presencaAlunoEm: string | null;
  // Confirmação de presença 24h antes (INSTITUTION Sprint 13, briefing
  // 22/09/2026) — corrigido no Sprint 23 (briefing 23/09/2026): tinha sido
  // implementado só em (aluno)/index.tsx (app do SELF); aluno de Escola de
  // verdade (PACOTE_ESCOLA) é redirecionado pra cá antes de renderizar
  // aquela tela (ver RedirecionadorEscolaAluno em (aluno)/_layout.tsx), então
  // nunca via o card. Precisava estar nos dois lugares.
  confirmacaoAlunoSolicitadaEm?: string | null;
  confirmacaoAlunoResposta?: boolean | null;
}
interface DashboardData {
  pendente?: boolean;
  inativo?: boolean;
  proximaAula?: ProximaAula | null;
  frequencia?: { presencas: number; faltas: number; total: number };
  pagamento?: { status: string; vencimento?: string | null } | null;
  plano?: { tempoContrato: number | null; dataInicio: string | null };
  avaliacaoMensalPendente?: boolean;
}

function getEmojiFrequencia(presencas: number, total: number) {
  if (total === 0) return { emoji: '📚', nivel: 'Sem aulas registradas', cor: ERP.textoMuted };
  const taxa = presencas / total;
  if (taxa < 0.2) return { emoji: '😱', nivel: 'Péssimo', cor: ERP.perigo };
  if (taxa < 0.4) return { emoji: '😟', nivel: 'Ruim', cor: '#E07020' };
  if (taxa < 0.6) return { emoji: '😐', nivel: 'Regular', cor: ERP.aviso };
  if (taxa < 0.8) return { emoji: '😊', nivel: 'Bom', cor: ERP.acento };
  return { emoji: '🌟', nivel: 'Ótimo', cor: ERP.sucesso };
}

function getConfigPagamento(status: string | null) {
  switch ((status || '').toUpperCase()) {
    case 'ATRASADO': return { cor: ERP.perigo, fundo: ERP.perigoSoft, texto: 'Pagamento em atraso com a escola', icone: 'alert-circle' as const };
    case 'PAGO': return { cor: ERP.sucesso, fundo: ERP.sucessoSoft, texto: 'Mensalidade paga!', icone: 'checkmark-circle' as const };
    case 'EM_ANALISE': return { cor: ERP.info, fundo: ERP.infoSoft, texto: 'Comprovante em análise', icone: 'time' as const };
    default: return { cor: ERP.info, fundo: ERP.infoSoft, texto: 'Pagamento em dia', icone: 'checkmark-done-circle' as const };
  }
}

function calcProgresso(tempoContrato: number | null, dataInicio: string | null): number {
  if (!tempoContrato || !dataInicio) return 0;
  const inicio = new Date(dataInicio).getTime();
  const duracaoMs = tempoContrato * 30 * 24 * 60 * 60 * 1000;
  return Math.min(Math.max((Date.now() - inicio) / duracaoMs, 0), 1);
}

export default function PainelAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState<DashboardData>({});
  const [confirmando, setConfirmando] = useState(false);
  const [enviandoConfirmacaoPrevia, setEnviandoConfirmacaoPrevia] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDados(await res.json());
    } catch {
      // sem conexão — dá pra reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const confirmarPresenca = async () => {
    if (!dados.proximaAula) return;
    try {
      const temHardware = await LocalAuthentication.hasHardwareAsync();
      const inscrito = await LocalAuthentication.isEnrolledAsync();
      if (temHardware && inscrito) {
        const resultado = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirmar presença',
          fallbackLabel: 'Usar senha do dispositivo',
          cancelLabel: 'Cancelar',
        });
        if (!resultado.success) return;
      }

      setConfirmando(true);
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${dados.proximaAula.id}/checkin-aluno`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const resposta = await res.json();
      if (res.ok) {
        Alert.alert('Presença confirmada!', resposta.mensagem);
        carregar();
      } else {
        Alert.alert('Erro', resposta.erro || 'Não foi possível confirmar.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmando(false);
    }
  };

  // Confirmação de presença 24h antes (Sprint 13/23) — resposta simples de
  // "vou"/"não vou" ao pedido disparado pelo cron, distinta do check-in
  // biométrico do momento da aula (confirmarPresenca, acima).
  const responderConfirmacaoPrevia = async (confirma: boolean) => {
    if (!dados.proximaAula) return;
    setEnviandoConfirmacaoPrevia(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${dados.proximaAula.id}/confirmar-presenca-previa`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirma }),
      });
      if (res.ok) {
        setDados((d) => ({ ...d, proximaAula: d.proximaAula ? { ...d.proximaAula, confirmacaoAlunoResposta: confirma } : d.proximaAula }));
      } else {
        Alert.alert('Erro', 'Não foi possível registrar sua resposta.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoConfirmacaoPrevia(false);
    }
  };

  const { pendente, inativo, proximaAula, frequencia, pagamento, plano, avaliacaoMensalPendente } = dados;
  const progresso = calcProgresso(plano?.tempoContrato ?? null, plano?.dataInicio ?? null);
  const configPag = getConfigPagamento(pagamento?.status ?? null);
  const emojiFreq = getEmojiFrequencia(frequencia?.presencas ?? 0, frequencia?.total ?? 0);
  const pctFreq = (frequencia?.total ?? 0) > 0 ? Math.round(((frequencia?.presencas ?? 0) / frequencia!.total) * 100) : 0;

  return (
    <MobileErpShell
      titulo="Painel"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo={`Olá, ${nome.split(' ')[0] || 'aluno'}!`} subtitulo={`Sua matrícula em ${escolaNome || 'sua escola'}`} />

      {inativo ? (
        <SectionCard>
          <EstadoVazio icone="moon-outline" texto="Você está desligado temporariamente. Fale com a secretaria da escola para mais informações." />
        </SectionCard>
      ) : pendente ? (
        <SectionCard>
          <EstadoVazio icone="time-outline" texto="Cadastro recebido — assim que a escola ativar sua matrícula, suas aulas aparecem aqui." />
        </SectionCard>
      ) : (
        <>
          {avaliacaoMensalPendente && (
            <TouchableOpacity onPress={() => router.push('/(aluno-escola)/avaliacao-mensal' as any)}>
              <SectionCard style={{ backgroundColor: ERP.infoSoft, borderColor: '#BFDBFE' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="star-outline" size={20} color={ERP.info} />
                  <Text style={{ flex: 1, color: ERP.info, fontSize: 13.5, fontWeight: '700' }}>
                    Avalie sua experiência deste mês — toque aqui
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={ERP.info} />
                </View>
              </SectionCard>
            </TouchableOpacity>
          )}

          <SectionCard titulo="Próxima aula">
            {!proximaAula ? (
              <EstadoVazio icone="calendar-clear-outline" texto="Nenhuma aula agendada ainda." />
            ) : (
              <View style={estilos.linhaAula}>
                <View style={estilos.horarioBox}>
                  <Text style={estilos.horarioTexto}>
                    {new Date(proximaAula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={estilos.dataTexto}>
                    {new Date(proximaAula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nomeProfessor}>Prof. {proximaAula.professor?.nome || 'Professor'}</Text>
                  <Text style={estilos.tipoAula}>{proximaAula.tipo === 'REGULAR' ? 'Aula regular' : 'Reposição'}</Text>
                </View>
              </View>
            )}

            {proximaAula && proximaAula.confirmacaoAlunoSolicitadaEm && proximaAula.confirmacaoAlunoResposta == null && (
              <View style={{ marginTop: 14, padding: 14, backgroundColor: ERP.avisoSoft, borderRadius: ERP.raio.md, borderWidth: 1, borderColor: '#F5D9A8' }}>
                <Text style={{ color: ERP.texto, fontSize: 13.5, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
                  Você confirma presença na sua aula?
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Botao texto="Vou sim" onPress={() => responderConfirmacaoPrevia(true)} carregando={enviandoConfirmacaoPrevia} />
                  <Botao texto="Não vou" variante="perigo" onPress={() => responderConfirmacaoPrevia(false)} carregando={enviandoConfirmacaoPrevia} />
                </View>
              </View>
            )}
            {proximaAula && proximaAula.confirmacaoAlunoResposta != null && (
              <Text style={{ color: proximaAula.confirmacaoAlunoResposta ? ERP.sucesso : ERP.perigo, fontSize: 12.5, fontWeight: '700', marginTop: 10 }}>
                {proximaAula.confirmacaoAlunoResposta ? '✓ Você confirmou presença' : '✕ Você avisou que não vai'}
              </Text>
            )}

            {proximaAula && (
              <View style={{ marginTop: 14 }}>
                {proximaAula.presencaAlunoEm ? (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Badge texto="Você já confirmou presença" tom="sucesso" />
                    <Badge
                      texto={proximaAula.presencaProfessorEm ? 'Professor confirmou' : 'Aguardando professor'}
                      tom={proximaAula.presencaProfessorEm ? 'sucesso' : 'aviso'}
                    />
                  </View>
                ) : (
                  <Botao
                    texto="Confirmar presença"
                    icone="finger-print-outline"
                    onPress={confirmarPresenca}
                    carregando={confirmando}
                  />
                )}
              </View>
            )}
          </SectionCard>

          <SectionCard titulo="Frequência nas aulas">
            <View style={estilos.frequenciaRow}>
              <Text style={estilos.emoji}>{emojiFreq.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[estilos.nivelFrequencia, { color: emojiFreq.cor }]}>{emojiFreq.nivel}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Badge texto={`${frequencia?.presencas ?? 0} presenças`} tom="sucesso" />
                  <Badge texto={`${frequencia?.faltas ?? 0} faltas`} tom="alerta" />
                </View>
              </View>
            </View>
            <View style={estilos.barraContainer}>
              <View style={[estilos.barraPreenchimento, { width: `${pctFreq}%`, backgroundColor: emojiFreq.cor }]} />
            </View>
            <Text style={[estilos.pctTexto, { color: emojiFreq.cor }]}>{pctFreq}% de presença</Text>
          </SectionCard>

          <SectionCard titulo="Pagamento com a escola">
            <View style={[estilos.statusPill, { backgroundColor: configPag.cor }]}>
              <Ionicons name={configPag.icone} size={16} color="#fff" />
              <Text style={estilos.statusPillTexto}>{configPag.texto}</Text>
            </View>
            {pagamento?.vencimento && (
              <Text style={[estilos.vencimentoTexto, { color: configPag.cor }]}>
                Vencimento: {new Date(pagamento.vencimento).toLocaleDateString('pt-BR')}
              </Text>
            )}
            {!pagamento && <Text style={estilos.semDados}>Nenhuma cobrança gerada ainda.</Text>}
          </SectionCard>

          <SectionCard titulo="Evolução do plano">
            {!plano?.tempoContrato ? (
              <Text style={estilos.semDados}>Plano ainda não configurado pela escola.</Text>
            ) : (
              <>
                <View style={estilos.planoBarraContainer}>
                  <View style={[estilos.planoBarraPreenchimento, { width: `${Math.round(progresso * 100)}%` }]} />
                </View>
                <View style={estilos.planoInfo}>
                  <Text style={estilos.planoTexto}>{Math.round(progresso * (plano.tempoContrato ?? 0))} de {plano.tempoContrato} meses</Text>
                  <Text style={estilos.planoPercent}>{Math.round(progresso * 100)}%</Text>
                </View>
              </>
            )}
          </SectionCard>
        </>
      )}
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  linhaAula: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  horarioBox: {
    backgroundColor: ERP.fundo, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: ERP.raio.sm, borderWidth: 1, borderColor: ERP.borda, alignItems: 'center', minWidth: 62,
  },
  horarioTexto: { color: ERP.acentoForte, fontWeight: '700', fontSize: 14 },
  dataTexto: { color: ERP.textoMuted, fontSize: 10, textTransform: 'uppercase', marginTop: 2 },
  nomeProfessor: { color: ERP.texto, fontSize: 14.5, fontWeight: '700' },
  tipoAula: { color: ERP.textoSecundario, fontSize: 12, marginTop: 2 },
  frequenciaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  emoji: { fontSize: 36 },
  nivelFrequencia: { fontSize: 15, fontWeight: '700' },
  barraContainer: { height: 8, backgroundColor: ERP.borda, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barraPreenchimento: { height: '100%', borderRadius: 4 },
  pctTexto: { fontSize: 12, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: ERP.raio.sm, alignSelf: 'flex-start', marginBottom: 8,
  },
  statusPillTexto: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  vencimentoTexto: { fontSize: 12, fontWeight: '600' },
  semDados: { color: ERP.textoMuted, fontSize: 13 },
  planoBarraContainer: { height: 12, backgroundColor: ERP.borda, borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  planoBarraPreenchimento: { height: '100%', borderRadius: 6, backgroundColor: ERP.acento },
  planoInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  planoTexto: { color: ERP.texto, fontSize: 13, fontWeight: '600' },
  planoPercent: { fontSize: 16, fontWeight: '700', color: ERP.acentoForte },
});
