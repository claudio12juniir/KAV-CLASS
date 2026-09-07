import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, Modal, SectionCard, SubAbasSimples, Tabela } from './_ui';

type Aba = 'cursos' | 'turmas' | 'modalidades' | 'valores';

const FREQUENCIAS = ['SEMANAL', 'QUINZENAL', 'MENSAL'] as const;
const PERIODICIDADES = ['MENSAL', 'SEMESTRAL', 'ANUAL', 'LIVRE'] as const;

export default function CatalogoEscola() {
  const [aba, setAba] = useState<Aba>('cursos');
  const [carregando, setCarregando] = useState(true);

  const [cursos, setCursos] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);
  const [tabelas, setTabelas] = useState<any[]>([]);
  const [salas, setSalas] = useState<any[]>([]);
  const [professores, setProfessores] = useState<any[]>([]);

  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [rC, rT, rM, rP, rTV, rS, rProf] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/cursos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/turmas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/modalidades`, { headers }),
        fetchComRetry(`${BASE_URL}/api/planos-pagamento`, { headers }),
        fetchComRetry(`${BASE_URL}/api/tabelas-valores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/salas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
      ]);
      if (rC.ok) setCursos(await rC.json());
      if (rT.ok) setTurmas(await rT.json());
      if (rM.ok) setModalidades(await rM.json());
      if (rP.ok) setPlanos(await rP.json());
      if (rTV.ok) setTabelas(await rTV.json());
      if (rS.ok) setSalas(await rS.json());
      if (rProf.ok) setProfessores(await rProf.json());
    } catch (err) {
      console.error('Erro ao carregar Catálogo:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarTudo(); }, [carregarTudo]));

  return (
    <ErpShell titulo="Catálogo">
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: ERP.texto }}>Catálogo da escola</Text>
        <Text style={{ fontSize: 13, color: ERP.textoSecundario, marginTop: 3 }}>
          Cursos, turmas, modalidades e tabela de valores — a base de tudo que vira matrícula.
        </Text>
      </View>

      <SubAbasSimples
        opcoes={[
          { chave: 'cursos', rotulo: 'Cursos' },
          { chave: 'turmas', rotulo: 'Turmas' },
          { chave: 'modalidades', rotulo: 'Modalidades' },
          { chave: 'valores', rotulo: 'Tabela de Valores' },
        ]}
        ativa={aba}
        onMudar={setAba}
      />

      {carregando ? (
        <SectionCard><View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></SectionCard>
      ) : aba === 'cursos' ? (
        <AbaCursos cursos={cursos} tabelas={tabelas} recarregar={carregarTudo} />
      ) : aba === 'turmas' ? (
        <AbaTurmas turmas={turmas} cursos={cursos} salas={salas} professores={professores} recarregar={carregarTudo} />
      ) : aba === 'modalidades' ? (
        <AbaModalidades modalidades={modalidades} recarregar={carregarTudo} />
      ) : (
        <AbaValores tabelas={tabelas} planos={planos} recarregar={carregarTudo} />
      )}
    </ErpShell>
  );
}

// ─── Cursos ─────────────────────────────────────────────────────────────

function AbaCursos({ cursos, tabelas, recarregar }: { cursos: any[]; tabelas: any[]; recarregar: () => void }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [nome, setNome] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [tabelaValoresId, setTabelaValoresId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const abrirNovo = () => { setEditando(null); setNome(''); setAtivo(true); setTabelaValoresId(null); setModalAberto(true); };
  const abrirEdicao = (c: any) => { setEditando(c); setNome(c.nome); setAtivo(c.ativo); setTabelaValoresId(c.tabelaValoresId); setModalAberto(true); };

  const salvar = async () => {
    if (!nome.trim()) { Alert.alert('Atenção', 'Informe o nome do curso.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = editando
        ? await fetchComRetry(`${BASE_URL}/api/cursos/${editando.id}`, { method: 'PATCH', headers, body: JSON.stringify({ nome, ativo, tabelaValoresId }) })
        : await fetchComRetry(`${BASE_URL}/api/cursos`, { method: 'POST', headers, body: JSON.stringify({ nome }) });
      if (res.ok) { setModalAberto(false); recarregar(); }
      else Alert.alert('Não foi possível salvar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SectionCard>
      <View style={estilos.cabecalhoLista}>
        <Text style={estilos.contagem}>{cursos.length} {cursos.length === 1 ? 'curso' : 'cursos'}</Text>
        <Botao texto="Novo curso" icone="add" onPress={abrirNovo} />
      </View>
      <Tabela
        vazioTexto="Nenhum curso cadastrado ainda."
        vazioIcone="book-outline"
        dados={cursos}
        onLinhaPress={abrirEdicao}
        colunas={[
          { chave: 'nome', titulo: 'Nome', flex: 3, render: (c: any) => <Text style={estilos.linhaTitulo}>{c.nome}</Text> },
          { chave: 'tabela', titulo: 'Tabela de valores', flex: 2, render: (c: any) => (
            <Text style={estilos.linhaSub}>{tabelas.find((t: any) => t.id === c.tabelaValoresId)?.nome || '—'}</Text>
          )},
          { chave: 'status', titulo: 'Status', flex: 1, render: (c: any) => <Badge texto={c.ativo ? 'Ativo' : 'Inativo'} tom={c.ativo ? 'sucesso' : 'default'} /> },
        ]}
      />

      <Modal visivel={modalAberto} titulo={editando ? 'Editar curso' : 'Novo curso'} onFechar={() => setModalAberto(false)}>
        <Campo label="Nome do curso" value={nome} onChangeText={setNome} placeholder="Ex: Violão, Inglês, Jiu-Jitsu" />
        {editando && (
          <>
            <Text style={estilos.label}>Tabela de valores vinculada</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Nenhuma" ativo={!tabelaValoresId} onPress={() => setTabelaValoresId(null)} />
                {tabelas.map((t: any) => (
                  <Chip key={t.id} label={t.nome} ativo={tabelaValoresId === t.id} onPress={() => setTabelaValoresId(t.id)} />
                ))}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <Text style={estilos.label}>Curso ativo</Text>
              <Switch value={ativo} onValueChange={setAtivo} trackColor={{ true: ERP.acento }} />
            </View>
          </>
        )}
        <Botao texto={editando ? 'Salvar alterações' : 'Criar curso'} onPress={salvar} carregando={salvando} />
      </Modal>
    </SectionCard>
  );
}

// ─── Turmas ─────────────────────────────────────────────────────────────

function AbaTurmas({ turmas, cursos, salas, professores, recarregar }: { turmas: any[]; cursos: any[]; salas: any[]; professores: any[]; recarregar: () => void }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [nome, setNome] = useState('');
  const [cursoId, setCursoId] = useState<string | null>(null);
  const [salaId, setSalaId] = useState<string | null>(null);
  const [professorId, setProfessorId] = useState<string | null>(null);
  const [limiteAlunos, setLimiteAlunos] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const abrirNovo = () => {
    setEditando(null); setNome(''); setCursoId(cursos[0]?.id ?? null); setSalaId(null);
    setProfessorId(professores[0]?.id ?? null); setLimiteAlunos(''); setAtiva(true); setModalAberto(true);
  };
  const abrirEdicao = (t: any) => {
    setEditando(t); setNome(t.nome); setSalaId(t.salaId); setLimiteAlunos(t.limiteAlunos != null ? String(t.limiteAlunos) : ''); setAtiva(t.ativa);
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!nome.trim()) { Alert.alert('Atenção', 'Informe o nome da turma.'); return; }
    if (!editando && !cursoId) { Alert.alert('Atenção', 'Escolha o curso da turma.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const limite = limiteAlunos.trim() ? parseInt(limiteAlunos, 10) : null;
      const res = editando
        ? await fetchComRetry(`${BASE_URL}/api/turmas/${editando.id}`, { method: 'PATCH', headers, body: JSON.stringify({ nome, salaId, limiteAlunos: limite, ativa }) })
        : await fetchComRetry(`${BASE_URL}/api/turmas`, { method: 'POST', headers, body: JSON.stringify({ nome, cursoId, salaId, professorId, limiteAlunos: limite }) });
      if (res.ok) { setModalAberto(false); recarregar(); }
      else Alert.alert('Não foi possível salvar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SectionCard>
      <View style={estilos.cabecalhoLista}>
        <Text style={estilos.contagem}>{turmas.length} {turmas.length === 1 ? 'turma' : 'turmas'}</Text>
        <Botao texto="Nova turma" icone="add" onPress={abrirNovo} disabled={cursos.length === 0} />
      </View>
      {cursos.length === 0 && (
        <Text style={{ fontSize: 12.5, color: ERP.textoMuted, marginBottom: 12 }}>Cadastre um curso antes de criar turmas.</Text>
      )}
      <Tabela
        vazioTexto="Nenhuma turma cadastrada ainda."
        vazioIcone="people-outline"
        dados={turmas}
        onLinhaPress={abrirEdicao}
        colunas={[
          { chave: 'nome', titulo: 'Turma', flex: 2, render: (t: any) => (
            <View>
              <Text style={estilos.linhaTitulo}>{t.nome}</Text>
              <Text style={estilos.linhaSub}>{t.curso?.nome}</Text>
            </View>
          )},
          { chave: 'professor', titulo: 'Professor', flex: 2, render: (t: any) => <Text style={estilos.linhaSub}>{t.professor?.nome || '—'}</Text> },
          { chave: 'sala', titulo: 'Sala', flex: 1.5, render: (t: any) => <Text style={estilos.linhaSub}>{t.sala?.nome || '—'}</Text> },
          { chave: 'ocupacao', titulo: 'Ocupação', flex: 1.5, render: (t: any) => (
            <Text style={estilos.linhaSub}>{t._count?.matriculas ?? 0}{t.limiteAlunos != null ? `/${t.limiteAlunos}` : ''}</Text>
          )},
          { chave: 'status', titulo: 'Status', flex: 1, render: (t: any) => <Badge texto={t.ativa ? 'Ativa' : 'Inativa'} tom={t.ativa ? 'sucesso' : 'default'} /> },
        ]}
      />

      <Modal visivel={modalAberto} titulo={editando ? 'Editar turma' : 'Nova turma'} onFechar={() => setModalAberto(false)}>
        <Campo label="Nome da turma" value={nome} onChangeText={setNome} placeholder="Ex: Violão Iniciante — Terças 18h" />

        {!editando && (
          <>
            <Text style={estilos.label}>Curso</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {cursos.map((c: any) => <Chip key={c.id} label={c.nome} ativo={cursoId === c.id} onPress={() => setCursoId(c.id)} />)}
              </View>
            </ScrollView>

            <Text style={estilos.label}>Professor responsável</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {professores.map((p: any) => <Chip key={p.id} label={p.nome} ativo={professorId === p.id} onPress={() => setProfessorId(p.id)} />)}
              </View>
            </ScrollView>
          </>
        )}

        <Text style={estilos.label}>Sala (opcional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Nenhuma" ativo={!salaId} onPress={() => setSalaId(null)} />
            {salas.map((s: any) => <Chip key={s.id} label={s.nome} ativo={salaId === s.id} onPress={() => setSalaId(s.id)} />)}
          </View>
        </ScrollView>

        <Campo label="Limite de alunos (opcional)" value={limiteAlunos} onChangeText={setLimiteAlunos} placeholder="Ex: 8" keyboardType="number-pad" />

        {editando && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <Text style={estilos.label}>Turma ativa</Text>
            <Switch value={ativa} onValueChange={setAtiva} trackColor={{ true: ERP.acento }} />
          </View>
        )}

        <Botao texto={editando ? 'Salvar alterações' : 'Criar turma'} onPress={salvar} carregando={salvando} />
      </Modal>
    </SectionCard>
  );
}

// ─── Modalidades ────────────────────────────────────────────────────────

function AbaModalidades({ modalidades, recarregar }: { modalidades: any[]; recarregar: () => void }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [nome, setNome] = useState('');
  const [frequencia, setFrequencia] = useState<string>('SEMANAL');
  const [duracaoMinutos, setDuracaoMinutos] = useState('60');
  const [padrao, setPadrao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const abrirNovo = () => { setEditando(null); setNome(''); setFrequencia('SEMANAL'); setDuracaoMinutos('60'); setPadrao(false); setModalAberto(true); };
  const abrirEdicao = (m: any) => { setEditando(m); setNome(m.nome); setFrequencia(m.frequencia); setDuracaoMinutos(String(m.duracaoMinutos)); setPadrao(m.padrao); setModalAberto(true); };

  const salvar = async () => {
    if (!nome.trim()) { Alert.alert('Atenção', 'Informe o nome da modalidade.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const body = { nome, frequencia, duracaoMinutos: parseInt(duracaoMinutos, 10) || 60, padrao };
      const res = editando
        ? await fetchComRetry(`${BASE_URL}/api/modalidades/${editando.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
        : await fetchComRetry(`${BASE_URL}/api/modalidades`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.ok) { setModalAberto(false); recarregar(); }
      else Alert.alert('Não foi possível salvar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SectionCard>
      <View style={estilos.cabecalhoLista}>
        <Text style={estilos.contagem}>{modalidades.length} {modalidades.length === 1 ? 'modalidade' : 'modalidades'}</Text>
        <Botao texto="Nova modalidade" icone="add" onPress={abrirNovo} />
      </View>
      <Tabela
        vazioTexto="Nenhuma modalidade cadastrada ainda."
        vazioIcone="repeat-outline"
        dados={modalidades}
        onLinhaPress={abrirEdicao}
        colunas={[
          { chave: 'nome', titulo: 'Nome', flex: 2, render: (m: any) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={estilos.linhaTitulo}>{m.nome}</Text>
              {m.padrao && <Badge texto="Padrão" tom="info" />}
            </View>
          )},
          { chave: 'frequencia', titulo: 'Frequência', flex: 1.5, render: (m: any) => <Text style={estilos.linhaSub}>{m.frequencia}</Text> },
          { chave: 'duracao', titulo: 'Duração', flex: 1, render: (m: any) => <Text style={estilos.linhaSub}>{m.duracaoMinutos} min</Text> },
        ]}
      />

      <Modal visivel={modalAberto} titulo={editando ? 'Editar modalidade' : 'Nova modalidade'} onFechar={() => setModalAberto(false)}>
        <Campo label="Nome" value={nome} onChangeText={setNome} placeholder="Ex: Aula individual semanal" />
        <Text style={estilos.label}>Frequência</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {FREQUENCIAS.map((f) => <Chip key={f} label={f} ativo={frequencia === f} onPress={() => setFrequencia(f)} />)}
        </View>
        <Campo label="Duração (minutos)" value={duracaoMinutos} onChangeText={setDuracaoMinutos} keyboardType="number-pad" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <Text style={estilos.label}>Modalidade padrão</Text>
          <Switch value={padrao} onValueChange={setPadrao} trackColor={{ true: ERP.acento }} />
        </View>
        <Botao texto={editando ? 'Salvar alterações' : 'Criar modalidade'} onPress={salvar} carregando={salvando} />
      </Modal>
    </SectionCard>
  );
}

// ─── Tabela de Valores ──────────────────────────────────────────────────

function AbaValores({ tabelas, planos, recarregar }: { tabelas: any[]; planos: any[]; recarregar: () => void }) {
  const [modalNovaTabela, setModalNovaTabela] = useState(false);
  const [nomeTabela, setNomeTabela] = useState('');
  const [modalNovoPlano, setModalNovoPlano] = useState(false);
  const [nomePlano, setNomePlano] = useState('');
  const [periodicidadePlano, setPeriodicidadePlano] = useState<string>('MENSAL');
  const [tabelaAberta, setTabelaAberta] = useState<any | null>(null);
  const [detalheTabela, setDetalheTabela] = useState<any | null>(null);
  const [novaVersaoValores, setNovaVersaoValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const criarTabela = async () => {
    if (!nomeTabela.trim()) { Alert.alert('Atenção', 'Informe o nome da tabela.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/tabelas-valores`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeTabela }),
      });
      if (res.ok) { setModalNovaTabela(false); setNomeTabela(''); recarregar(); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const criarPlano = async () => {
    if (!nomePlano.trim()) { Alert.alert('Atenção', 'Informe o nome do plano.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/planos-pagamento`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomePlano, periodicidade: periodicidadePlano }),
      });
      if (res.ok) { setModalNovoPlano(false); setNomePlano(''); recarregar(); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirDetalheTabela = async (tabela: any) => {
    setTabelaAberta(tabela);
    setDetalheTabela(null);
    setNovaVersaoValores({});
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/tabelas-valores/${tabela.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDetalheTabela(await res.json());
    } catch (err) {
      console.error('Erro ao carregar tabela:', err);
    }
  };

  const criarVersao = async (ativarImediatamente: boolean) => {
    if (!tabelaAberta) return;
    const valores = planos
      .filter((p: any) => novaVersaoValores[p.id]?.trim())
      .map((p: any) => ({ planoPagamentoId: p.id, valor: parseFloat(novaVersaoValores[p.id].replace(',', '.')) }));
    if (valores.length === 0) { Alert.alert('Atenção', 'Preencha o valor de pelo menos um plano de pagamento.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/tabelas-valores/${tabelaAberta.id}/versoes`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valores, ativarImediatamente }),
      });
      if (res.ok) {
        Alert.alert('Versão criada!', ativarImediatamente ? 'Já está valendo pra novas matrículas.' : 'Salva como rascunho — ative quando quiser.');
        setNovaVersaoValores({});
        abrirDetalheTabela(tabelaAberta);
        recarregar();
      } else {
        Alert.alert('Não foi possível criar a versão', (await res.json()).erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const ativarVersao = async (versaoId: string) => {
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/tabelas-valores/versoes/${versaoId}/ativar`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { abrirDetalheTabela(tabelaAberta); recarregar(); }
      else Alert.alert('Não foi possível ativar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <SectionCard>
        <View style={estilos.cabecalhoLista}>
          <Text style={estilos.contagem}>Planos de pagamento ({planos.length})</Text>
          <Botao texto="Novo plano" variante="secundario" icone="add" onPress={() => setModalNovoPlano(true)} />
        </View>
        {planos.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: ERP.textoMuted }}>
            Cadastre planos de pagamento (ex: Mensal, Semestral) antes de montar uma tabela de valores.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {planos.map((p: any) => (
              <View key={p.id} style={estilos.chipPlano}>
                <Text style={estilos.chipPlanoTexto}>{p.nome} · {p.periodicidade}</Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard>
        <View style={estilos.cabecalhoLista}>
          <Text style={estilos.contagem}>{tabelas.length} {tabelas.length === 1 ? 'tabela' : 'tabelas'} de valores</Text>
          <Botao texto="Nova tabela" icone="add" onPress={() => setModalNovaTabela(true)} />
        </View>
        <Tabela
          vazioTexto="Nenhuma tabela de valores cadastrada ainda."
          vazioIcone="pricetags-outline"
          dados={tabelas}
          onLinhaPress={abrirDetalheTabela}
          colunas={[
            { chave: 'nome', titulo: 'Nome', flex: 2, render: (t: any) => <Text style={estilos.linhaTitulo}>{t.nome}</Text> },
            { chave: 'versaoAtiva', titulo: 'Versão ativa', flex: 3, render: (t: any) => {
              const v = t.versoes?.[0];
              if (!v) return <Text style={estilos.linhaSub}>Sem versão ativa</Text>;
              return <Text style={estilos.linhaSub}>{v.valores.length} valor(es) configurado(s)</Text>;
            }},
          ]}
        />
      </SectionCard>

      <Modal visivel={modalNovaTabela} titulo="Nova tabela de valores" onFechar={() => setModalNovaTabela(false)}>
        <Campo label="Nome" value={nomeTabela} onChangeText={setNomeTabela} placeholder="Ex: Tabela 2026" />
        <Botao texto="Criar tabela" onPress={criarTabela} carregando={salvando} />
      </Modal>

      <Modal visivel={modalNovoPlano} titulo="Novo plano de pagamento" onFechar={() => setModalNovoPlano(false)}>
        <Campo label="Nome" value={nomePlano} onChangeText={setNomePlano} placeholder="Ex: Mensal, Trimestral..." />
        <Text style={estilos.label}>Periodicidade</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {PERIODICIDADES.map((p) => <Chip key={p} label={p} ativo={periodicidadePlano === p} onPress={() => setPeriodicidadePlano(p)} />)}
        </View>
        <Botao texto="Criar plano" onPress={criarPlano} carregando={salvando} />
      </Modal>

      <Modal visivel={!!tabelaAberta} titulo={tabelaAberta?.nome || ''} onFechar={() => setTabelaAberta(null)} largura={560}>
        {!detalheTabela ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
        ) : (
          <>
            <Text style={[estilos.label, { marginTop: 0 }]}>Cursos usando esta tabela</Text>
            <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginBottom: 18 }}>
              {detalheTabela.cursos?.length ? detalheTabela.cursos.map((c: any) => c.nome).join(', ') : 'Nenhum curso vinculado ainda.'}
            </Text>

            <Text style={estilos.label}>Histórico de versões</Text>
            {detalheTabela.versoes.length === 0 ? (
              <Text style={{ fontSize: 12.5, color: ERP.textoMuted, marginBottom: 16 }}>Nenhuma versão criada ainda.</Text>
            ) : (
              detalheTabela.versoes.map((v: any) => (
                <View key={v.id} style={estilos.versaoCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={estilos.linhaTitulo}>{new Date(v.createdAt).toLocaleDateString('pt-BR')}</Text>
                    {v.ativa ? <Badge texto="Ativa" tom="sucesso" /> : (
                      <TouchableOpacity onPress={() => ativarVersao(v.id)} disabled={salvando}>
                        <Text style={{ color: ERP.acento, fontWeight: '700', fontSize: 12.5 }}>Ativar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {v.valores.map((val: any) => (
                    <View key={val.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={estilos.linhaSub}>{val.planoPagamento?.nome}{val.metodo ? ` (${val.metodo})` : ''}</Text>
                      <Text style={estilos.linhaSub}>R$ {Number(val.valor).toFixed(2).replace('.', ',')}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}

            <Text style={[estilos.label, { marginTop: 18 }]}>Nova versão</Text>
            {planos.length === 0 ? (
              <Text style={{ fontSize: 12.5, color: ERP.textoMuted }}>Cadastre um plano de pagamento primeiro.</Text>
            ) : (
              <>
                {planos.map((p: any) => (
                  <Campo
                    key={p.id}
                    label={`${p.nome} (${p.periodicidade})`}
                    value={novaVersaoValores[p.id] || ''}
                    onChangeText={(v) => setNovaVersaoValores((prev) => ({ ...prev, [p.id]: v }))}
                    placeholder="R$"
                    keyboardType="decimal-pad"
                  />
                ))}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Botao texto="Salvar rascunho" variante="secundario" onPress={() => criarVersao(false)} carregando={salvando} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Botao texto="Salvar e ativar" onPress={() => criarVersao(true)} carregando={salvando} />
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </Modal>
    </>
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
  cabecalhoLista: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  contagem: { fontSize: 13, fontWeight: '700', color: ERP.texto },
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaSub: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
  chipPlano: { backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chipPlanoTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.texto },
  versaoCard: { backgroundColor: ERP.fundo, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: ERP.borda },
});
