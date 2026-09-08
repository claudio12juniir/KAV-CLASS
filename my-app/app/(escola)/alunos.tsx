import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard, Tabela } from './_ui';

const STATUS_CONTRATO: Record<string, { texto: string; tom: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }> = {
  ENVIADO: { texto: 'Contrato enviado', tom: 'info' },
  PREENCHIDO: { texto: 'Assinado (responsável)', tom: 'aviso' },
  ASSINADO: { texto: 'Contrato assinado', tom: 'sucesso' },
  CANCELADO: { texto: 'Contrato cancelado', tom: 'default' },
};

const OPCOES_TEMPO_CONTRATO = [
  { chave: 'TODOS', rotulo: 'Todos', meses: null },
  { chave: '2', rotulo: '2 meses', meses: 2 },
  { chave: '6', rotulo: '6 meses', meses: 6 },
  { chave: '12', rotulo: '1 ano', meses: 12 },
  { chave: '24', rotulo: '2 anos', meses: 24 },
];

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={onPress}>
      <Text style={[estilos.chipTexto, ativo && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function dataFimContrato(a: any): Date | null {
  if (!a.dataInicioContrato || !a.tempoContrato) return null;
  const fim = new Date(a.dataInicioContrato);
  fim.setMonth(fim.getMonth() + a.tempoContrato);
  return fim;
}

function calcularIdade(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  if (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

export default function AlunosEscola() {
  const [carregando, setCarregando] = useState(true);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [professores, setProfessores] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);
  const [codigoEscola, setCodigoEscola] = useState<string | null>(null);

  // Filtros (INSTITUTION Sprint 5, briefing 08/09/2026)
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroTempo, setFiltroTempo] = useState('TODOS');
  const [filtroInicioDe, setFiltroInicioDe] = useState('');
  const [filtroInicioAte, setFiltroInicioAte] = useState('');
  const [filtroFimDe, setFiltroFimDe] = useState('');
  const [filtroFimAte, setFiltroFimAte] = useState('');

  // Ficha 100% editável — mesmo modal serve pra "+ novo aluno" e pra editar.
  const [ficha, setFicha] = useState<any | null>(null); // null = fechado; {} = novo; objeto = editando
  const [salvandoFicha, setSalvandoFicha] = useState(false);

  const [modalAtribuirAberto, setModalAtribuirAberto] = useState(false);
  const [alunoParaAtribuir, setAlunoParaAtribuir] = useState<any | null>(null);
  const [professorEscolhido, setProfessorEscolhido] = useState<string | null>(null);
  const [atribuindo, setAtribuindo] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resAlunos, resProfessores, resPerfil, resTurmas, resPlanos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/perfil`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/turmas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/planos-pagamento`, { headers }),
      ]);
      if (resAlunos.ok) setAlunos(await resAlunos.json());
      if (resProfessores.ok) setProfessores(await resProfessores.json());
      if (resPerfil.ok) setCodigoEscola((await resPerfil.json()).codigoConvite);
      if (resTurmas.ok) setTurmas(await resTurmas.json());
      if (resPlanos.ok) setPlanos(await resPlanos.json());
    } catch (err) {
      console.error('Erro ao carregar Alunos:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const alunosFiltrados = useMemo(() => {
    return alunos.filter((a) => {
      if (filtroNome.trim() && !a.nome.toLowerCase().includes(filtroNome.trim().toLowerCase())) return false;
      if (filtroTempo !== 'TODOS' && String(a.tempoContrato || '') !== filtroTempo) return false;
      if (filtroInicioDe && (!a.dataInicioContrato || new Date(a.dataInicioContrato) < new Date(filtroInicioDe))) return false;
      if (filtroInicioAte && (!a.dataInicioContrato || new Date(a.dataInicioContrato) > new Date(filtroInicioAte))) return false;
      const fim = dataFimContrato(a);
      if (filtroFimDe && (!fim || fim < new Date(filtroFimDe))) return false;
      if (filtroFimAte && (!fim || fim > new Date(filtroFimAte))) return false;
      return true;
    });
  }, [alunos, filtroNome, filtroTempo, filtroInicioDe, filtroInicioAte, filtroFimDe, filtroFimAte]);

  const abrirModalAtribuir = (aluno: any) => {
    setAlunoParaAtribuir(aluno);
    setProfessorEscolhido(professores[0]?.id || null);
    setModalAtribuirAberto(true);
  };

  const confirmarAtribuicao = async () => {
    if (!alunoParaAtribuir || !professorEscolhido) return;
    setAtribuindo(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/alunos/${alunoParaAtribuir.id}/atribuir-professor`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ professorId: professorEscolhido }),
      });
      const dados = await res.json();
      if (res.ok) { setModalAtribuirAberto(false); carregarDados(); Alert.alert('Professor atribuído', dados.mensagem); }
      else Alert.alert('Não foi possível atribuir', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setAtribuindo(false);
    }
  };

  const copiarCodigoEscola = async () => {
    if (!codigoEscola) return;
    await Clipboard.setStringAsync(codigoEscola);
    Alert.alert('Copiado!', 'Código da escola copiado — envie pro aluno se cadastrar sozinho.');
  };

  const alunosSemProfessor = alunos.filter((a) => !a.professor);

  return (
    <ErpShell titulo="Alunos" acao={<Botao texto="Novo aluno" icone="add" onPress={() => setFicha({})} disabled={professores.length === 0} />}>
      <PageHeader
        titulo="Alunos da escola"
        subtitulo={`${alunos.length} ${alunos.length === 1 ? 'aluno matriculado' : 'alunos matriculados'}, de todos os professores`}
      />

      <SectionCard titulo="Código de autoingresso da escola" subtitulo="Aluno que digitar este código no cadastro entra sem escolher professor — você atribui aqui embaixo.">
        <TouchableOpacity
          onPress={copiarCodigoEscola}
          disabled={!codigoEscola}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '800', color: ERP.texto, letterSpacing: 1 }}>{codigoEscola || '...'}</Text>
        </TouchableOpacity>
      </SectionCard>

      {alunosSemProfessor.length > 0 && (
        <SectionCard titulo={`${alunosSemProfessor.length} ${alunosSemProfessor.length === 1 ? 'aluno aguardando' : 'alunos aguardando'} atribuição de professor`}>
          {alunosSemProfessor.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: ERP.borda }}>
              <Text style={{ fontSize: 13, color: ERP.texto, fontWeight: '600' }}>{a.nome}</Text>
              <TouchableOpacity onPress={() => abrirModalAtribuir(a)} disabled={professores.length === 0}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: ERP.acento }}>Atribuir professor</Text>
              </TouchableOpacity>
            </View>
          ))}
        </SectionCard>
      )}

      <SectionCard titulo="Filtros">
        <Campo label="Nome" value={filtroNome} onChangeText={setFiltroNome} placeholder="Buscar por nome" />
        <Text style={estilos.label}>Tempo de contrato</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {OPCOES_TEMPO_CONTRATO.map((o) => (
              <Chip key={o.chave} label={o.rotulo} ativo={filtroTempo === o.chave} onPress={() => setFiltroTempo(o.chave)} />
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Campo label="Início de" value={filtroInicioDe} onChangeText={setFiltroInicioDe} placeholder="AAAA-MM-DD" /></View>
          <View style={{ flex: 1 }}><Campo label="Início até" value={filtroInicioAte} onChangeText={setFiltroInicioAte} placeholder="AAAA-MM-DD" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Campo label="Término de" value={filtroFimDe} onChangeText={setFiltroFimDe} placeholder="AAAA-MM-DD" /></View>
          <View style={{ flex: 1 }}><Campo label="Término até" value={filtroFimAte} onChangeText={setFiltroFimAte} placeholder="AAAA-MM-DD" /></View>
        </View>
      </SectionCard>

      <SectionCard>
        {carregando ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
        ) : (
          <Tabela
            vazioTexto="Nenhum aluno encontrado com esses filtros."
            vazioIcone="school-outline"
            dados={alunosFiltrados}
            onLinhaPress={(a) => setFicha(a)}
            colunas={[
              { chave: 'nome', titulo: 'Nome', flex: 3, render: (a: any) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ERP.acento, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{a.nome?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: ERP.texto }}>{a.nome}</Text>
                </View>
              )},
              { chave: 'email', titulo: 'E-mail', flex: 3 },
              { chave: 'professor', titulo: 'Professor', flex: 2, render: (a: any) => (
                a.professor
                  ? <Text style={{ fontSize: 12.5, color: ERP.textoSecundario }}>{a.professor.nome}</Text>
                  : <Badge texto="Sem professor" tom="aviso" />
              )},
              { chave: 'status', titulo: 'Status', flex: 2, render: (a: any) => (
                <Badge
                  texto={a.status === 'ATIVO' ? 'Ativo' : a.status === 'PENDENTE' ? 'Pendente' : 'Inativo'}
                  tom={a.status === 'ATIVO' ? 'sucesso' : a.status === 'PENDENTE' ? 'aviso' : 'default'}
                />
              )},
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={modalAtribuirAberto} titulo={`Atribuir professor a ${alunoParaAtribuir?.nome || ''}`} onFechar={() => setModalAtribuirAberto(false)}>
        <Text style={estilos.label}>Professor responsável</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {professores.map((p) => (
              <Chip key={p.id} label={p.nome} ativo={professorEscolhido === p.id} onPress={() => setProfessorEscolhido(p.id)} />
            ))}
          </View>
        </ScrollView>
        <Botao texto="Confirmar atribuição" onPress={confirmarAtribuicao} carregando={atribuindo} disabled={professores.length === 0} />
      </Modal>

      <FichaAluno
        aluno={ficha}
        professores={professores}
        turmas={turmas}
        planos={planos}
        onFechar={() => setFicha(null)}
        aoSalvar={() => { setFicha(null); carregarDados(); }}
        salvando={salvandoFicha}
        setSalvando={setSalvandoFicha}
      />
    </ErpShell>
  );
}

// Ficha 100% editável — usada tanto pra "+ novo aluno" quanto pra editar um
// aluno existente (mesmo componente, sem duplicar tela — nota do próprio
// briefing). `aluno` null-ish (undefined) = fechada; {} = criação; objeto
// completo = edição.
function FichaAluno({ aluno, professores, turmas, planos, onFechar, aoSalvar, salvando, setSalvando }: {
  aluno: any | null; professores: any[]; turmas: any[]; planos: any[];
  onFechar: () => void; aoSalvar: () => void; salvando: boolean; setSalvando: (v: boolean) => void;
}) {
  const ehNovo = !!aluno && !aluno.id;
  const visivel = !!aluno;

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [curso, setCurso] = useState('');
  const [professorId, setProfessorId] = useState<string | null>(null);
  const [dataNascimento, setDataNascimento] = useState('');
  const [tempoContrato, setTempoContrato] = useState('');
  const [dataInicioContrato, setDataInicioContrato] = useState('');
  const [contratoUrl, setContratoUrl] = useState('');
  const [respNome, setRespNome] = useState('');
  const [respCpf, setRespCpf] = useState('');
  const [respEmail, setRespEmail] = useState('');
  const [respTelefone, setRespTelefone] = useState('');
  const [respVinculo, setRespVinculo] = useState<'CONTRATANTE' | 'DEPENDENTE'>('CONTRATANTE');

  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [novoVinculoAberto, setNovoVinculoAberto] = useState(false);
  const [nvProfessorId, setNvProfessorId] = useState<string | null>(null);
  const [nvTurmaId, setNvTurmaId] = useState<string | null>(null);
  const [nvPersonalizado, setNvPersonalizado] = useState(false);
  const [nvPlanoId, setNvPlanoId] = useState<string | null>(null);
  const [nvDescricaoPersonalizado, setNvDescricaoPersonalizado] = useState('');
  const [nvValor, setNvValor] = useState('');
  const [nvVencimento, setNvVencimento] = useState('10');
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  React.useEffect(() => {
    if (!visivel) return;
    setNome(aluno.nome || '');
    setEmail(aluno.email || '');
    setSenha('');
    setTelefone(aluno.telefone || '');
    setCurso(aluno.curso || '');
    setProfessorId(aluno.professor?.id || professores[0]?.id || null);
    setDataNascimento(aluno.dataNascimento ? String(aluno.dataNascimento).slice(0, 10) : '');
    setTempoContrato(aluno.tempoContrato != null ? String(aluno.tempoContrato) : '');
    setDataInicioContrato(aluno.dataInicioContrato ? String(aluno.dataInicioContrato).slice(0, 10) : '');
    setContratoUrl(aluno.contratoUrl || '');
    setRespNome(aluno.responsavel?.nome || '');
    setRespCpf(aluno.responsavel?.cpf || '');
    setRespEmail(aluno.responsavel?.email || '');
    setRespTelefone(aluno.responsavel?.telefone || '');
    setRespVinculo(aluno.vinculoResponsavel === 'DEPENDENTE' ? 'DEPENDENTE' : 'CONTRATANTE');
    setMatriculas(aluno.matriculas || []);
    setNovoVinculoAberto(false);
  }, [aluno, visivel]);

  const idade = calcularIdade(dataNascimento || null);

  const salvar = async () => {
    if (!nome.trim() || !email.trim()) { Alert.alert('Atenção', 'Nome e e-mail são obrigatórios.'); return; }
    if (ehNovo && (senha.length < 6 || !professorId)) { Alert.alert('Atenção', 'Senha (mín. 6 caracteres) e professor são obrigatórios pra um aluno novo.'); return; }

    const responsavel = respNome.trim() ? { nome: respNome, cpf: respCpf, email: respEmail, telefone: respTelefone, vinculo: respVinculo } : undefined;

    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const url = ehNovo ? `${BASE_URL}/api/escola/alunos/criar` : `${BASE_URL}/api/escola/alunos/${aluno.id}`;
      const body: any = {
        nome: nome.trim(), email: email.trim(), telefone, curso,
        dataNascimento: dataNascimento || null,
        tempoContrato: tempoContrato ? Number(tempoContrato) : null,
        dataInicioContrato: dataInicioContrato || null,
        contratoUrl: contratoUrl || null,
        responsavel,
      };
      if (ehNovo) { body.senha = senha; body.professorId = professorId; }
      else { body.professorId = professorId; if (senha) body.novaSenha = senha; }

      const res = await fetchComRetry(url, {
        method: ehNovo ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const dados = await res.json();
      if (res.ok) aoSalvar();
      else Alert.alert('Não foi possível salvar', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const adicionarVinculo = async () => {
    const valor = parseFloat(nvValor.replace(',', '.'));
    if (!valor || valor <= 0) { Alert.alert('Atenção', 'Informe um valor de mensalidade válido.'); return; }
    if (!nvPersonalizado && !nvPlanoId && planos.length > 0) { Alert.alert('Atenção', 'Escolha um plano ou marque "Personalizado".'); return; }
    setSalvandoVinculo(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/matriculas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alunoId: aluno.id,
          professorId: nvProfessorId || undefined,
          turmaId: nvTurmaId || undefined,
          valorMensalidade: valor,
          diaVencimento: parseInt(nvVencimento, 10) || 10,
          planoPagamentoId: nvPersonalizado ? undefined : (nvPlanoId || undefined),
          planoPersonalizadoDescricao: nvPersonalizado ? nvDescricaoPersonalizado : undefined,
        }),
      });
      const nova = await res.json();
      if (res.ok) {
        setMatriculas((atual) => [...atual, nova]);
        setNovoVinculoAberto(false);
        setNvProfessorId(null); setNvTurmaId(null); setNvPersonalizado(false); setNvPlanoId(null);
        setNvDescricaoPersonalizado(''); setNvValor(''); setNvVencimento('10');
      } else {
        Alert.alert('Não foi possível adicionar', nova.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoVinculo(false);
    }
  };

  const removerVinculo = async (matriculaId: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/matriculas/${matriculaId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) setMatriculas((atual) => atual.filter((m) => m.id !== matriculaId));
      else Alert.alert('Não foi possível remover', dados.erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  const enviarContratoDeVinculo = async (matriculaId: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/matriculas/${matriculaId}/contrato`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ testemunhas: [] }),
      });
      const dados = await res.json();
      if (res.ok) {
        Alert.alert(dados.emailEnviado ? 'Contrato enviado!' : 'Contrato criado', dados.mensagem);
        setMatriculas((atual) => atual.map((m) => (m.id === matriculaId ? { ...m, contratos: [dados.contrato || { status: 'ENVIADO' }] } : m)));
      } else {
        Alert.alert('Não foi possível enviar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  return (
    <Modal visivel={visivel} titulo={ehNovo ? 'Novo aluno' : `Editar ${aluno?.nome || ''}`} onFechar={onFechar} largura={620}>
      <Text style={estilos.secao}>Dados pessoais</Text>
      <Campo label="Nome completo" value={nome} onChangeText={setNome} placeholder="Nome do aluno" />
      <Campo label="E-mail" value={email} onChangeText={setEmail} placeholder="email@exemplo.com" autoCapitalize="none" keyboardType="email-address" />
      <Campo label={ehNovo ? 'Senha de acesso' : 'Nova senha (opcional)'} value={senha} onChangeText={setSenha} placeholder="Mínimo 6 caracteres" secureTextEntry />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Campo label="Telefone" value={telefone} onChangeText={setTelefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" /></View>
        <View style={{ flex: 1 }}>
          <Campo label="Data de nascimento" value={dataNascimento} onChangeText={setDataNascimento} placeholder="AAAA-MM-DD" />
          {idade != null && <Text style={estilos.idadeTexto}>{idade} anos {idade < 18 ? '· menor de idade' : ''}</Text>}
        </View>
      </View>

      <Text style={estilos.secao}>Contrato</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Campo label="Tempo de contrato (meses)" value={tempoContrato} onChangeText={setTempoContrato} placeholder="12" keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Campo label="Início do contrato" value={dataInicioContrato} onChangeText={setDataInicioContrato} placeholder="AAAA-MM-DD" /></View>
      </View>
      <Campo label="URL do contrato anexado" value={contratoUrl} onChangeText={setContratoUrl} placeholder="https://..." autoCapitalize="none" />

      <Text style={estilos.secao}>{idade != null && idade < 18 ? 'Responsável (menor de idade)' : 'Contato / responsável financeiro'}</Text>
      <Campo label="Nome do responsável" value={respNome} onChangeText={setRespNome} placeholder="Se vazio, o próprio aluno é o contratante" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Campo label="CPF" value={respCpf} onChangeText={setRespCpf} placeholder="000.000.000-00" /></View>
        <View style={{ flex: 1 }}><Campo label="Telefone" value={respTelefone} onChangeText={setRespTelefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" /></View>
      </View>
      <Campo label="E-mail do responsável" value={respEmail} onChangeText={setRespEmail} placeholder="email@exemplo.com" autoCapitalize="none" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <Chip label="Contratante (paga por si)" ativo={respVinculo === 'CONTRATANTE'} onPress={() => setRespVinculo('CONTRATANTE')} />
        <Chip label="Dependente (responsável paga)" ativo={respVinculo === 'DEPENDENTE'} onPress={() => setRespVinculo('DEPENDENTE')} />
      </View>

      <Text style={estilos.secao}>Professor principal</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {professores.map((p) => <Chip key={p.id} label={p.nome} ativo={professorId === p.id} onPress={() => setProfessorId(p.id)} />)}
        </View>
      </ScrollView>

      <Botao texto={ehNovo ? 'Criar aluno' : 'Salvar alterações'} onPress={salvar} carregando={salvando} />

      {!ehNovo && (
        <>
          <Text style={estilos.secao}>Cursos, professores e planos (múltiplos)</Text>
          {matriculas.length === 0 ? (
            <EstadoVazio icone="library-outline" texto="Nenhum vínculo de curso/professor adicional ainda." />
          ) : (
            matriculas.map((m) => {
              const contrato = m.contratos?.[0];
              return (
                <View key={m.id} style={estilos.vinculoCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.vinculoTitulo}>{m.turma?.curso?.nome || m.turma?.nome || 'Sem curso'} · {m.professor?.nome}</Text>
                    <Text style={estilos.vinculoSub}>
                      {m.planoPersonalizadoDescricao || m.planoPagamento?.nome || 'Sem plano'} · R$ {Number(m.valorMensalidade).toFixed(2).replace('.', ',')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      {contrato
                        ? <Badge texto={(STATUS_CONTRATO[contrato.status] || STATUS_CONTRATO.ENVIADO).texto} tom={(STATUS_CONTRATO[contrato.status] || STATUS_CONTRATO.ENVIADO).tom} />
                        : <Botao texto="Enviar contrato" variante="secundario" onPress={() => enviarContratoDeVinculo(m.id)} />}
                    </View>
                  </View>
                  <Pressable onPress={() => removerVinculo(m.id)}><Text style={estilos.removerVinculo}>remover</Text></Pressable>
                </View>
              );
            })
          )}

          {novoVinculoAberto ? (
            <View style={estilos.novoVinculoBox}>
              <Text style={estilos.label}>Professor</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {professores.map((p) => <Chip key={p.id} label={p.nome} ativo={nvProfessorId === p.id} onPress={() => setNvProfessorId(p.id)} />)}
                </View>
              </ScrollView>
              {turmas.length > 0 && (
                <>
                  <Text style={estilos.label}>Turma / curso</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Chip label="Nenhuma" ativo={!nvTurmaId} onPress={() => setNvTurmaId(null)} />
                      {turmas.map((t: any) => <Chip key={t.id} label={t.nome} ativo={nvTurmaId === t.id} onPress={() => setNvTurmaId(t.id)} />)}
                    </View>
                  </ScrollView>
                </>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <Chip label="Plano global" ativo={!nvPersonalizado} onPress={() => setNvPersonalizado(false)} />
                <Chip label="Plano personalizado" ativo={nvPersonalizado} onPress={() => setNvPersonalizado(true)} />
              </View>
              {nvPersonalizado ? (
                <Campo label="Descrição do plano personalizado" value={nvDescricaoPersonalizado} onChangeText={setNvDescricaoPersonalizado} placeholder="Ex.: Plano família 2 aulas/semana" />
              ) : planos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {planos.map((p: any) => <Chip key={p.id} label={p.nome} ativo={nvPlanoId === p.id} onPress={() => setNvPlanoId(p.id)} />)}
                  </View>
                </ScrollView>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Campo label="Valor mensal (R$)" value={nvValor} onChangeText={setNvValor} keyboardType="decimal-pad" placeholder="250,00" /></View>
                <View style={{ flex: 1 }}><Campo label="Dia de vencimento" value={nvVencimento} onChangeText={setNvVencimento} keyboardType="number-pad" placeholder="10" /></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao texto="Adicionar vínculo" onPress={adicionarVinculo} carregando={salvandoVinculo} />
                <Botao texto="Cancelar" variante="secundario" onPress={() => setNovoVinculoAberto(false)} />
              </View>
            </View>
          ) : (
            <Botao texto="+ Adicionar curso/professor" variante="secundario" onPress={() => setNovoVinculoAberto(true)} />
          )}
        </>
      )}
    </Modal>
  );
}

const estilos = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
  secao: { fontSize: 12, fontWeight: '800', color: ERP.textoMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 10 },
  idadeTexto: { fontSize: 11.5, color: ERP.textoMuted, marginTop: -10, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
  vinculoCard: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1, borderColor: ERP.borda, borderRadius: ERP.raio.md, marginBottom: 8 },
  vinculoTitulo: { fontSize: 13, fontWeight: '700', color: ERP.texto },
  vinculoSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
  removerVinculo: { fontSize: 11.5, color: ERP.perigo, fontWeight: '600' },
  novoVinculoBox: { padding: 14, backgroundColor: ERP.fundo, borderRadius: ERP.raio.md, borderWidth: 1, borderColor: ERP.borda, marginBottom: 10 },
});
