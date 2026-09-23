import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard, Tabela } from './_ui';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Grade visível 06h–23h (INSTITUTION Sprint 14, briefing 22/09/2026) — 17
// blocos de 1h cada (06-07 … 22-23), cobrindo o pedido do usuário.
const HORAS_GRADE = Array.from({ length: 17 }, (_, i) => i + 6);

type Slot = { diaSemana: number; horaInicio: string; horaFim: string; tipo: 'DISPONIVEL' | 'PAUSA' };
type Ocupacao = { diaSemana: number; hora: number; alunoNome: string };

const horaStr = (h: number) => `${String(h).padStart(2, '0')}:00`;
// Um slot é "de grade" quando alinha exatamente num bloco de 1h (HH:00–(HH+1):00)
// dentro de 06–23h — é o que a grade clicável consegue representar. Slots
// fora desse padrão (herdados da v1 de texto livre, ex. "08:30–09:15") NÃO
// são descartados: ficam de fora do grid, mas voltam intactos no onMudar,
// nunca perdidos por causa de a escola só ter usado a grade nova.
const ehSlotDeGrade = (s: Slot) => {
  const m = /^(\d{2}):00$/.exec(s.horaInicio);
  if (!m) return false;
  const h = Number(m[1]);
  return h >= 6 && h <= 22 && s.horaFim === horaStr(h + 1);
};

// Grade semanal recorrente do professor — segunda etapa obrigatória do
// cadastro (briefing 08/09/2026). Sprint 14 (22/09/2026): virou grid
// clicável 7 dias × 17h (06h–23h) em vez do formulário de texto livre da v1
// — cada toque cicla vazio → Disponível → Pausa → vazio. `ocupacao`
// (opcional) sobrepõe células com aula já marcada pra aquele dia/hora —
// somente leitura ali, pra escola não apagar sem querer um horário em uso.
function GradeDisponibilidade({ slots, onMudar, ocupacao = [] }: { slots: Slot[]; onMudar: (s: Slot[]) => void; ocupacao?: Ocupacao[] }) {
  const slotsForaDoPadrao = useMemo(() => slots.filter((s) => !ehSlotDeGrade(s)), [slots]);
  const slotsGrade = useMemo(() => slots.filter(ehSlotDeGrade), [slots]);

  const ocupacaoDe = (dia: number, hora: number) => ocupacao.find((o) => o.diaSemana === dia && o.hora === hora);

  const alternarCelula = (dia: number, hora: number) => {
    if (ocupacaoDe(dia, hora)) return; // célula em aula: só leitura aqui, sem editar disponibilidade por cima
    const horaInicio = horaStr(hora);
    const existente = slotsGrade.find((s) => s.diaSemana === dia && s.horaInicio === horaInicio);
    let novaGrade: Slot[];
    if (!existente) {
      novaGrade = [...slotsGrade, { diaSemana: dia, horaInicio, horaFim: horaStr(hora + 1), tipo: 'DISPONIVEL' }];
    } else if (existente.tipo === 'DISPONIVEL') {
      novaGrade = slotsGrade.map((s) => (s === existente ? { ...s, tipo: 'PAUSA' } : s));
    } else {
      novaGrade = slotsGrade.filter((s) => s !== existente);
    }
    onMudar([...slotsForaDoPadrao, ...novaGrade]);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <View style={estilos.legendaItem}><View style={[estilos.legendaCor, { backgroundColor: ERP.sucessoSoft, borderColor: ERP.sucesso }]} /><Text style={estilos.legendaTexto}>Disponível</Text></View>
        <View style={estilos.legendaItem}><View style={[estilos.legendaCor, { backgroundColor: ERP.avisoSoft, borderColor: ERP.aviso }]} /><Text style={estilos.legendaTexto}>Pausa</Text></View>
        <View style={estilos.legendaItem}><View style={[estilos.legendaCor, { backgroundColor: ERP.acentoSoft, borderColor: ERP.acento }]} /><Text style={estilos.legendaTexto}>Em aula</Text></View>
        <View style={estilos.legendaItem}><View style={[estilos.legendaCor, { backgroundColor: ERP.superficie, borderColor: ERP.bordaForte }]} /><Text style={estilos.legendaTexto}>Livre</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row' }}>
            <View style={estilos.celulaHoraLabel} />
            {DIAS_SEMANA.map((d, dia) => (
              <View key={dia} style={estilos.celulaDiaLabel}><Text style={estilos.diaLabelTexto}>{d}</Text></View>
            ))}
          </View>
          {HORAS_GRADE.map((hora) => (
            <View key={hora} style={{ flexDirection: 'row' }}>
              <View style={estilos.celulaHoraLabel}><Text style={estilos.horaLabelTexto}>{horaStr(hora)}</Text></View>
              {DIAS_SEMANA.map((_, dia) => {
                const ocupada = ocupacaoDe(dia, hora);
                const slot = slotsGrade.find((s) => s.diaSemana === dia && s.horaInicio === horaStr(hora));
                const cor = ocupada ? { backgroundColor: ERP.acentoSoft, borderColor: ERP.acento }
                  : slot?.tipo === 'DISPONIVEL' ? { backgroundColor: ERP.sucessoSoft, borderColor: ERP.sucesso }
                  : slot?.tipo === 'PAUSA' ? { backgroundColor: ERP.avisoSoft, borderColor: ERP.aviso }
                  : { backgroundColor: ERP.superficie, borderColor: ERP.bordaSuave };
                return (
                  <Pressable key={dia} onPress={() => alternarCelula(dia, hora)} style={[estilos.celulaGrade, cor]}>
                    {ocupada ? <Text style={estilos.celulaTextoOcupada} numberOfLines={2}>{ocupada.alunoNome}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {slotsForaDoPadrao.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={estilos.campoLabelSolto}>Horários fora do padrão de 1h (mantidos, não editáveis na grade acima)</Text>
          {slotsForaDoPadrao.map((s, i) => (
            <View key={i} style={estilos.slotLinha}>
              <Badge texto={s.tipo === 'DISPONIVEL' ? 'Disponível' : 'Pausa'} tom={s.tipo === 'DISPONIVEL' ? 'sucesso' : 'aviso'} />
              <Text style={estilos.slotHorario}>{DIAS_SEMANA[s.diaSemana]} · {s.horaInicio} – {s.horaFim}</Text>
              <Pressable onPress={() => onMudar([...slotsForaDoPadrao.filter((_, j) => j !== i), ...slotsGrade])}><Text style={estilos.slotRemover}>remover</Text></Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function EquipeEscola() {
  const { pacote, professorId: professorLogadoId } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [professores, setProfessores] = useState<any[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [etapa, setEtapa] = useState<'dados' | 'grade'>('dados');
  const [professorCriadoId, setProfessorCriadoId] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [contatoEmergencia, setContatoEmergencia] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [contratoUrl, setContratoUrl] = useState('');
  const [cpf, setCpf] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cursos, setCursos] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [papelNovo, setPapelNovo] = useState<'PROFESSOR' | 'GESTOR'>('PROFESSOR');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Modais de ação por professor (INSTITUTION Sprint 4, briefing 08/09/2026)
  const [modalAlunos, setModalAlunos] = useState<any | null>(null);
  const [alunosDaTurma, setAlunosDaTurma] = useState<any[]>([]);
  const [carregandoAlunos, setCarregandoAlunos] = useState(false);

  const [modalGrade, setModalGrade] = useState<any | null>(null);
  const [slotsGrade, setSlotsGrade] = useState<Slot[]>([]);
  const [ocupacaoGrade, setOcupacaoGrade] = useState<Ocupacao[]>([]);
  const [carregandoGrade, setCarregandoGrade] = useState(false);
  const [salvandoGrade, setSalvandoGrade] = useState(false);

  const [modalChat, setModalChat] = useState<any | null>(null);
  const [mensagensChat, setMensagensChat] = useState<any[]>([]);
  const [carregandoChat, setCarregandoChat] = useState(false);

  const [modalPapel, setModalPapel] = useState<any | null>(null);
  const [papelEditando, setPapelEditando] = useState<'PROFESSOR' | 'GESTOR'>('PROFESSOR');
  const [salvandoPapel, setSalvandoPapel] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setProfessores(await res.json());
    } catch (err) {
      console.error('Erro ao carregar Equipe:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const limparForm = () => {
    setNome(''); setEmail(''); setSenha(''); setTelefone(''); setContatoEmergencia('');
    setDataNascimento(''); setDataPagamento(''); setContratoUrl(''); setCpf(''); setEndereco(''); setCursos(''); setFotoUrl('');
    setPapelNovo('PROFESSOR'); setEtapa('dados'); setProfessorCriadoId(null); setSlots([]);
  };
  const abrirModal = () => { limparForm(); setModalAberto(true); };

  const criarProfessor = async () => {
    if (!nome.trim() || !email.trim() || senha.length < 6) {
      Alert.alert('Atenção', 'Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/criar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(), email: email.trim(), senha, papel: papelNovo,
          telefone: telefone.trim() || undefined,
          contatoEmergencia: contatoEmergencia.trim() || undefined,
          dataNascimento: dataNascimento.trim() || undefined,
          dataPagamento: dataPagamento ? Number(dataPagamento) : undefined,
          contratoUrl: contratoUrl.trim() || undefined,
          cpf: cpf.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cursos: cursos.trim() ? cursos.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
          fotoUrl: fotoUrl.trim() || undefined,
        }),
      });
      const dados = await res.json();
      if (res.ok) {
        carregarDados();
        setProfessorCriadoId(dados.professor.id);
        setEtapa('grade'); // segunda etapa obrigatória: grade de disponibilidade
      } else {
        Alert.alert('Não foi possível criar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarGrade = async () => {
    if (!professorCriadoId) return;
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/${professorCriadoId}/disponibilidade`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      if (res.ok) {
        setModalAberto(false);
        Alert.alert('Professor cadastrado!', `${nome} já pode entrar com o e-mail e a senha cadastrados.`);
      } else {
        Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar a grade.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirModalAlunos = async (professor: any) => {
    setModalAlunos(professor);
    setCarregandoAlunos(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const todos = await res.json();
        setAlunosDaTurma(todos.filter((a: any) => a.professor?.id === professor.id));
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregandoAlunos(false);
    }
  };

  const abrirModalGrade = async (professor: any) => {
    setModalGrade(professor);
    setCarregandoGrade(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resSlots, resOcupacao] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/professores/${professor.id}/disponibilidade`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/professores/${professor.id}/ocupacao-semanal`, { headers }),
      ]);
      if (resSlots.ok) setSlotsGrade(await resSlots.json());
      if (resOcupacao.ok) setOcupacaoGrade(await resOcupacao.json());
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregandoGrade(false);
    }
  };

  const salvarGradeExistente = async () => {
    if (!modalGrade) return;
    setSalvandoGrade(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/${modalGrade.id}/disponibilidade`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: slotsGrade }),
      });
      if (res.ok) { Alert.alert('Feito!', 'Grade atualizada.'); setModalGrade(null); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoGrade(false);
    }
  };

  const abrirModalChat = async (professor: any) => {
    setModalChat(professor);
    setCarregandoChat(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resChat, resAlunos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/professores/${professor.id}/chat-turma`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
      ]);
      if (resChat.ok) setMensagensChat(await resChat.json());
      else Alert.alert('Erro', (await resChat.json()).erro || 'Não foi possível abrir o chat.');
      if (resAlunos.ok) {
        const todos = await resAlunos.json();
        setAlunosDaTurma(todos.filter((a: any) => a.professor?.id === professor.id));
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregandoChat(false);
    }
  };

  const abrirModalPapel = (professor: any) => {
    setModalPapel(professor);
    setPapelEditando(professor.papel === 'GESTOR' ? 'GESTOR' : 'PROFESSOR');
  };

  const salvarPapel = async () => {
    if (!modalPapel) return;
    setSalvandoPapel(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/${modalPapel.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ papel: papelEditando }),
      });
      const dados = await res.json();
      if (res.ok) { setModalPapel(null); carregarDados(); }
      else Alert.alert('Não foi possível salvar', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoPapel(false);
    }
  };

  const removerProfessor = (professor: any) => {
    Alert.alert(
      'Remover da equipe?',
      `${professor.nome} some da lista, mas o histórico (aulas, matrículas, avaliações) continua intacto. Dá pra reverter depois falando com o suporte.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive', onPress: async () => {
            setRemovendoId(professor.id);
            try {
              const token = await SecureStore.getItemAsync('kav_token');
              const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/${professor.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              const dados = await res.json();
              if (res.ok) carregarDados();
              else Alert.alert('Não foi possível remover', dados.erro || 'Tente novamente.');
            } catch {
              Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
            } finally {
              setRemovendoId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <ErpShell
      titulo="Equipe"
      acao={pacote === 'PACOTE_ESCOLA' ? <Botao texto="Novo professor" icone="add" onPress={abrirModal} /> : undefined}
    >
      <PageHeader
        titulo="Professores"
        subtitulo={`${professores.length} ${professores.length === 1 ? 'professor cadastrado' : 'professores cadastrados'} nesta escola`}
      />

      {pacote !== 'PACOTE_ESCOLA' && (
        <SectionCard style={{ backgroundColor: ERP.avisoSoft, borderColor: '#F5D9A8' }}>
          <Text style={{ color: '#8A5A00', fontSize: 13.5 }}>Adicionar professores é um recurso do Pacote Escola.</Text>
        </SectionCard>
      )}

      <SectionCard>
        {carregando ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
        ) : (
          <Tabela
            vazioTexto="Nenhum professor cadastrado ainda."
            vazioIcone="people-outline"
            dados={professores}
            colunas={[
              { chave: 'nome', titulo: 'Nome', flex: 3, render: (p: any) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{p.nome?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{p.nome}</Text>
                </View>
              )},
              { chave: 'email', titulo: 'E-mail', flex: 3 },
              { chave: 'papel', titulo: 'Papel', flex: 2, render: (p: any) => (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Badge texto={p.papel === 'DONO' ? 'Dono' : p.papel === 'GESTOR' ? 'Gestor' : 'Professor'} tom={p.papel === 'DONO' ? 'info' : 'default'} />
                  {/* Alerta vermelho (INSTITUTION Sprint 18, briefing 22/09/2026) — sem contrato anexado é risco jurídico/administrativo pra escola */}
                  {!p.contratoUrl && <Badge texto="Sem contrato" tom="alerta" />}
                </View>
              )},
              { chave: 'createdAt', titulo: 'Desde', flex: 2, render: (p: any) => (
                <Text style={{ fontSize: 12.5, color: ERP.textoSecundario }}>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</Text>
              )},
              { chave: 'acoes', titulo: '', flex: 3, alinhar: 'right', render: (p: any) => (
                <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Botao texto="Alunos" variante="secundario" icone="people-outline" onPress={() => abrirModalAlunos(p)} />
                  <Botao texto="Grade" variante="secundario" icone="calendar-outline" onPress={() => abrirModalGrade(p)} />
                  <Botao texto="Chat" variante="secundario" icone="chatbubbles-outline" onPress={() => abrirModalChat(p)} />
                  {p.papel !== 'DONO' && p.id !== professorLogadoId && (
                    <>
                      <Botao texto="Papel" variante="secundario" icone="swap-vertical-outline" onPress={() => abrirModalPapel(p)} />
                      <Botao texto="Remover" variante="perigo" icone="person-remove-outline" onPress={() => removerProfessor(p)} carregando={removendoId === p.id} />
                    </>
                  )}
                </View>
              )},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={!!modalAlunos} titulo={`Alunos de ${modalAlunos?.nome || ''}`} onFechar={() => setModalAlunos(null)}>
        {carregandoAlunos ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><SyncLoader color={ERP.texto} /></View>
        ) : alunosDaTurma.length === 0 ? (
          <EstadoVazio icone="school-outline" texto="Nenhum aluno na base deste professor." />
        ) : (
          alunosDaTurma.map((a) => (
            <Pressable
              key={a.id}
              style={({ hovered }: any) => [estilos.linhaAluno, hovered && { backgroundColor: ERP.hover }]}
              onPress={() => { setModalAlunos(null); router.push('/(escola)/alunos' as any); }}
            >
              <Text style={estilos.nomeAlunoLinha}>{a.nome}</Text>
              <Badge texto={a.status === 'ATIVO' ? 'Ativo' : a.status === 'PENDENTE' ? 'Pendente' : 'Inativo'} tom={a.status === 'ATIVO' ? 'sucesso' : 'default'} />
            </Pressable>
          ))
        )}
      </Modal>

      <Modal visivel={!!modalGrade} titulo={`Grade de ${modalGrade?.nome || ''}`} onFechar={() => setModalGrade(null)} largura={520}>
        {carregandoGrade ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><SyncLoader color={ERP.texto} /></View>
        ) : (
          <>
            <GradeDisponibilidade slots={slotsGrade} onMudar={setSlotsGrade} ocupacao={ocupacaoGrade} />
            <View style={{ height: 16 }} />
            <Botao texto="Salvar grade" onPress={salvarGradeExistente} carregando={salvandoGrade} />
          </>
        )}
      </Modal>

      <Modal visivel={!!modalChat} titulo={`Chat da turma · ${modalChat?.nome || ''}`} onFechar={() => setModalChat(null)} largura={520}>
        <Text style={{ color: ERP.textoMuted, fontSize: 12, marginBottom: 14 }}>
          Você está acompanhando esta conversa — quem participa é o professor e os alunos ativos dele sem mensalidade atrasada.
        </Text>
        {carregandoChat ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><SyncLoader color={ERP.texto} /></View>
        ) : mensagensChat.length === 0 ? (
          <EstadoVazio icone="chatbubbles-outline" texto="Nenhuma mensagem ainda nesta turma." />
        ) : (
          mensagensChat.map((m) => (
            <View key={m.id} style={estilos.linhaChat}>
              <Text style={estilos.autorChat}>{m.autorTipo === 'PROFESSOR' ? modalChat?.nome : (alunosDaTurma.find((a) => a.id === m.autorId)?.nome || 'Aluno')}</Text>
              <Text style={estilos.textoChat}>{m.texto}</Text>
              <Text style={estilos.dataChat}>{new Date(m.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
            </View>
          ))
        )}
      </Modal>

      <Modal visivel={!!modalPapel} titulo={`Editar papel · ${modalPapel?.nome || ''}`} onFechar={() => setModalPapel(null)}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {(['PROFESSOR', 'GESTOR'] as const).map((p) => (
            <Botao
              key={p}
              texto={p === 'PROFESSOR' ? 'Professor' : 'Gestor'}
              variante={papelEditando === p ? 'primario' : 'secundario'}
              onPress={() => setPapelEditando(p)}
            />
          ))}
        </View>
        <Botao texto="Salvar" onPress={salvarPapel} carregando={salvandoPapel} />
      </Modal>

      <Modal
        visivel={modalAberto}
        titulo={etapa === 'grade' ? 'Grade de disponibilidade' : 'Adicionar professor'}
        onFechar={() => setModalAberto(false)}
      >
        {etapa === 'dados' ? (
          <>
            <Campo label="Nome completo" value={nome} onChangeText={setNome} placeholder="Nome do professor" />
            <Campo label="E-mail" value={email} onChangeText={setEmail} placeholder="email@exemplo.com" autoCapitalize="none" keyboardType="email-address" />
            <Campo label="Senha de acesso" value={senha} onChangeText={setSenha} placeholder="Mínimo 6 caracteres" secureTextEntry />
            <Campo label="Número de contato" value={telefone} onChangeText={setTelefone} placeholder="(11) 90000-0000" keyboardType="phone-pad" />
            <Campo label="Contato de emergência" value={contatoEmergencia} onChangeText={setContatoEmergencia} placeholder="Nome e telefone" />
            <Campo label="Data de nascimento" value={dataNascimento} onChangeText={setDataNascimento} placeholder="AAAA-MM-DD" />
            <Campo label="Dia do mês em que a escola paga" value={dataPagamento} onChangeText={setDataPagamento} placeholder="Ex.: 5" keyboardType="number-pad" />
            <Campo label="CPF" value={cpf} onChangeText={setCpf} placeholder="000.000.000-00" />
            <Campo label="Endereço" value={endereco} onChangeText={setEndereco} placeholder="Rua, número, bairro, cidade" />
            <Campo label="URL do contrato (anexo)" value={contratoUrl} onChangeText={setContratoUrl} placeholder="https://..." autoCapitalize="none" />
            <Campo label="Cursos que leciona" value={cursos} onChangeText={setCursos} placeholder="Separe por vírgula" />
            <Campo label="URL da foto" value={fotoUrl} onChangeText={setFotoUrl} placeholder="https://..." autoCapitalize="none" />

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              {(['PROFESSOR', 'GESTOR'] as const).map((p) => (
                <Botao
                  key={p}
                  texto={p === 'PROFESSOR' ? 'Professor' : 'Gestor'}
                  variante={papelNovo === p ? 'primario' : 'secundario'}
                  onPress={() => setPapelNovo(p)}
                />
              ))}
            </View>

            <Botao
              texto="Avançar para a grade de horários"
              onPress={criarProfessor}
              carregando={salvando}
            />
          </>
        ) : (
          <>
            <Text style={{ color: ERP.textoSecundario, fontSize: 12.5, marginBottom: 16 }}>
              Marque em quais dias e horários {nome} está disponível pra dar aula — só esses horários ficarão liberados pra marcar aula com alunos.
            </Text>
            <GradeDisponibilidade slots={slots} onMudar={setSlots} />
            <View style={{ height: 16 }} />
            <Botao texto="Concluir cadastro" onPress={salvarGrade} carregando={salvando} />
          </>
        )}
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: ERP.raio.sm, borderWidth: 1, borderColor: ERP.bordaForte, backgroundColor: ERP.superficie },
  chipAtivo: { backgroundColor: ERP.acentoSoft, borderColor: ERP.acento },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
  chipTextoAtivo: { color: ERP.acentoForte, fontWeight: '700' },
  campoLabelSolto: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendaCor: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendaTexto: { fontSize: 11.5, color: ERP.textoSecundario },
  celulaHoraLabel: { width: 52, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 6 },
  horaLabelTexto: { fontSize: 10.5, color: ERP.textoMuted },
  celulaDiaLabel: { width: 60, alignItems: 'center', paddingBottom: 6 },
  diaLabelTexto: { fontSize: 11, fontWeight: '700', color: ERP.textoSecundario },
  celulaGrade: { width: 58, height: 30, marginLeft: 2, marginBottom: 2, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  celulaTextoOcupada: { fontSize: 8.5, color: ERP.acentoForte, fontWeight: '700', textAlign: 'center' },
  diaTitulo: { fontSize: 11, fontWeight: '700', color: ERP.textoMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, marginTop: 6 },
  slotLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  slotHorario: { fontSize: 13, color: ERP.texto, flex: 1 },
  slotRemover: { fontSize: 12, color: ERP.perigo, fontWeight: '600' },
  linhaAluno: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  nomeAlunoLinha: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaChat: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  autorChat: { fontSize: 12, fontWeight: '700', color: ERP.textoSecundario },
  textoChat: { fontSize: 13.5, color: ERP.texto, marginTop: 2 },
  dataChat: { fontSize: 10.5, color: ERP.textoMuted, marginTop: 3 },
});
