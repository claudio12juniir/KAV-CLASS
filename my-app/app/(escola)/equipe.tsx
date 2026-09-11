import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard, SubAbasSimples, Tabela } from './_ui';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type Slot = { diaSemana: number; horaInicio: string; horaFim: string; tipo: 'DISPONIVEL' | 'PAUSA' };

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={onPress}>
      <Text style={[estilos.chipTexto, ativo && estilos.chipTextoAtivo]}>{label}</Text>
    </Pressable>
  );
}

// Grade semanal recorrente do professor — segunda etapa obrigatória do
// cadastro (briefing 08/09/2026). v1 é lista de faixas por dia (em vez de
// grid de 24 células clicáveis): mesmo modelo de dado (DisponibilidadeProfessor),
// interação mais simples de construir com confiabilidade nesta sprint.
function GradeDisponibilidade({ slots, onMudar }: { slots: Slot[]; onMudar: (s: Slot[]) => void }) {
  const [diaEditando, setDiaEditando] = useState(1);
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFim, setHoraFim] = useState('09:00');
  const [tipo, setTipo] = useState<'DISPONIVEL' | 'PAUSA'>('DISPONIVEL');

  const adicionar = () => {
    if (!horaInicio.trim() || !horaFim.trim()) { Alert.alert('Atenção', 'Informe início e fim do horário.'); return; }
    onMudar([...slots, { diaSemana: diaEditando, horaInicio: horaInicio.trim(), horaFim: horaFim.trim(), tipo }]);
  };
  const remover = (idx: number) => onMudar(slots.filter((_, i) => i !== idx));

  return (
    <View>
      <Text style={estilos.campoLabelSolto}>Dia da semana</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {DIAS_SEMANA.map((d, i) => (
          <Chip key={i} label={d} ativo={diaEditando === i} onPress={() => setDiaEditando(i)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Campo label="Início" value={horaInicio} onChangeText={setHoraInicio} placeholder="08:00" /></View>
        <View style={{ flex: 1 }}><Campo label="Fim" value={horaFim} onChangeText={setHoraFim} placeholder="09:00" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Chip label="Disponível" ativo={tipo === 'DISPONIVEL'} onPress={() => setTipo('DISPONIVEL')} />
        <Chip label="Pausa (café/almoço)" ativo={tipo === 'PAUSA'} onPress={() => setTipo('PAUSA')} />
      </View>
      <Botao texto="Adicionar horário" variante="secundario" icone="add" onPress={adicionar} />

      <View style={{ marginTop: 18, gap: 8 }}>
        {DIAS_SEMANA.map((d, dia) => {
          const doDia = slots.filter((s) => s.diaSemana === dia);
          if (doDia.length === 0) return null;
          return (
            <View key={dia}>
              <Text style={estilos.diaTitulo}>{d}</Text>
              {doDia.map((s, i) => {
                const idxGlobal = slots.indexOf(s);
                return (
                  <View key={i} style={estilos.slotLinha}>
                    <Badge texto={s.tipo === 'DISPONIVEL' ? 'Disponível' : 'Pausa'} tom={s.tipo === 'DISPONIVEL' ? 'sucesso' : 'aviso'} />
                    <Text style={estilos.slotHorario}>{s.horaInicio} – {s.horaFim}</Text>
                    <Pressable onPress={() => remover(idxGlobal)}><Text style={estilos.slotRemover}>remover</Text></Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}
        {slots.length === 0 && <Text style={{ color: ERP.textoMuted, fontSize: 12.5 }}>Nenhum horário definido ainda — sem isso, nenhum aluno pode ser marcado na grade deste professor.</Text>}
      </View>
    </View>
  );
}

export default function EquipeEscola() {
  const { pacote, professorId: professorLogadoId } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [professores, setProfessores] = useState<any[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [modo, setModo] = useState<'criar' | 'convite'>('criar');
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
  const [cursos, setCursos] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [papelNovo, setPapelNovo] = useState<'PROFESSOR' | 'GESTOR'>('PROFESSOR');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null);

  // Modais de ação por professor (INSTITUTION Sprint 4, briefing 08/09/2026)
  const [modalAlunos, setModalAlunos] = useState<any | null>(null);
  const [alunosDaTurma, setAlunosDaTurma] = useState<any[]>([]);
  const [carregandoAlunos, setCarregandoAlunos] = useState(false);

  const [modalGrade, setModalGrade] = useState<any | null>(null);
  const [slotsGrade, setSlotsGrade] = useState<Slot[]>([]);
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
    setDataNascimento(''); setDataPagamento(''); setContratoUrl(''); setCursos(''); setFotoUrl('');
    setPapelNovo('PROFESSOR'); setUltimoCodigo(null); setEtapa('dados'); setProfessorCriadoId(null); setSlots([]);
  };
  const abrirModal = () => { limparForm(); setModo('criar'); setModalAberto(true); };

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

  const enviarConvite = async () => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email.trim())) {
      Alert.alert('Atenção', 'Informe um e-mail válido.');
      return;
    }
    setSalvando(true);
    setUltimoCodigo(null);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/convites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), papel: papelNovo }),
      });
      const dados = await res.json();
      if (res.ok) { setUltimoCodigo(dados.codigo); carregarDados(); }
      else Alert.alert('Não foi possível convidar', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const copiarCodigo = async () => {
    if (!ultimoCodigo) return;
    await Clipboard.setStringAsync(ultimoCodigo);
    Alert.alert('Copiado!', 'Código do convite copiado.');
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
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/${professor.id}/disponibilidade`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSlotsGrade(await res.json());
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
                <Badge texto={p.papel === 'DONO' ? 'Dono' : p.papel === 'GESTOR' ? 'Gestor' : 'Professor'} tom={p.papel === 'DONO' ? 'info' : 'default'} />
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
            <GradeDisponibilidade slots={slotsGrade} onMudar={setSlotsGrade} />
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
            <SubAbasSimples
              opcoes={[{ chave: 'criar', rotulo: 'Criar login direto' }, { chave: 'convite', rotulo: 'Convidar por e-mail' }]}
              ativa={modo}
              onMudar={(m) => { setModo(m); setUltimoCodigo(null); }}
            />

            {modo === 'criar' && (
              <Campo label="Nome completo" value={nome} onChangeText={setNome} placeholder="Nome do professor" />
            )}
            <Campo label="E-mail" value={email} onChangeText={setEmail} placeholder="email@exemplo.com" autoCapitalize="none" keyboardType="email-address" />
            {modo === 'criar' && (
              <>
                <Campo label="Senha de acesso" value={senha} onChangeText={setSenha} placeholder="Mínimo 6 caracteres" secureTextEntry />
                <Campo label="Número de contato" value={telefone} onChangeText={setTelefone} placeholder="(11) 90000-0000" keyboardType="phone-pad" />
                <Campo label="Contato de emergência" value={contatoEmergencia} onChangeText={setContatoEmergencia} placeholder="Nome e telefone" />
                <Campo label="Data de nascimento" value={dataNascimento} onChangeText={setDataNascimento} placeholder="AAAA-MM-DD" />
                <Campo label="Dia do mês em que a escola paga" value={dataPagamento} onChangeText={setDataPagamento} placeholder="Ex.: 5" keyboardType="number-pad" />
                <Campo label="URL do contrato (anexo)" value={contratoUrl} onChangeText={setContratoUrl} placeholder="https://..." autoCapitalize="none" />
                <Campo label="Cursos que leciona" value={cursos} onChangeText={setCursos} placeholder="Separe por vírgula" />
                <Campo label="URL da foto" value={fotoUrl} onChangeText={setFotoUrl} placeholder="https://..." autoCapitalize="none" />
              </>
            )}

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

            {ultimoCodigo && (
              <SectionCard style={{ backgroundColor: ERP.acentoSoft, borderColor: ERP.acento, marginBottom: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: ERP.acentoForte, marginBottom: 4 }}>CÓDIGO DO CONVITE</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: ERP.texto, letterSpacing: 2 }} onPress={copiarCodigo}>{ultimoCodigo}</Text>
              </SectionCard>
            )}

            <Botao
              texto={modo === 'criar' ? 'Avançar para a grade de horários' : 'Enviar convite'}
              onPress={modo === 'criar' ? criarProfessor : enviarConvite}
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
