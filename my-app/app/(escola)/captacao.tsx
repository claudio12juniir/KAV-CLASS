import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Kpi, Modal, PageHeader, SectionCard, SubAbasSimples, Tabela } from './_ui';

type Sub = 'funil' | 'leads' | 'experimentais';

const STATUS_EXPERIMENTAL: Record<string, { texto: string; tom: 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info' }> = {
  AGENDADA: { texto: 'Agendada', tom: 'info' },
  REALIZADA: { texto: 'Realizada', tom: 'sucesso' },
  NAO_COMPARECEU: { texto: 'Não compareceu', tom: 'alerta' },
  CANCELADA: { texto: 'Cancelada', tom: 'default' },
};

export default function CaptacaoEscola() {
  const [sub, setSub] = useState<Sub>('funil');
  const [carregando, setCarregando] = useState(true);

  const [estagiosFunil, setEstagiosFunil] = useState<{ id: string; nome: string; ordem: number; totalLeads: number }[]>([]);
  const [relatorioConversao, setRelatorioConversao] = useState<{ totalExperimentais: number; convertidas: number; taxaConversao: number } | null>(null);
  const [linksCaptacao, setLinksCaptacao] = useState<any[]>([]);
  const [criandoLink, setCriandoLink] = useState(false);

  const [leads, setLeads] = useState<any[]>([]);
  const [experimentais, setExperimentais] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [professores, setProfessores] = useState<any[]>([]);

  const [modalEstagioAberto, setModalEstagioAberto] = useState(false);
  const [nomeEstagio, setNomeEstagio] = useState('');
  const [criandoEstagio, setCriandoEstagio] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);
      const paraYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10);

      const [resFunil, resConversao, resLinks, resLeads, resExp, resCursos, resProf] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/funil/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/relatorios/conversao-experimental?de=${paraYYYYMMDD(trintaDiasAtras)}&ate=${paraYYYYMMDD(hoje)}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/links-captacao`, { headers }),
        fetchComRetry(`${BASE_URL}/api/leads`, { headers }),
        fetchComRetry(`${BASE_URL}/api/aulas-experimentais`, { headers }),
        fetchComRetry(`${BASE_URL}/api/cursos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
      ]);
      if (resFunil.ok) setEstagiosFunil((await resFunil.json()).estagios || []);
      if (resConversao.ok) setRelatorioConversao(await resConversao.json());
      if (resLinks.ok) setLinksCaptacao(await resLinks.json());
      if (resLeads.ok) setLeads(await resLeads.json());
      if (resExp.ok) setExperimentais(await resExp.json());
      if (resCursos.ok) setCursos(await resCursos.json());
      if (resProf.ok) setProfessores(await resProf.json());
    } catch (err) {
      console.error('Erro ao carregar Captação:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const criarLinkCaptacao = async (tipo: 'CADASTRO' | 'AGENDAMENTO_EXPERIMENTAL') => {
    setCriandoLink(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/links-captacao`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      });
      if (res.ok) carregarDados();
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível criar o link.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoLink(false);
    }
  };

  const alternarLinkCaptacao = async (id: string, ativo: boolean) => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/links-captacao/${id}/${ativo ? 'desativar' : 'reativar'}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) carregarDados();
    else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível atualizar.');
  };

  const copiarLinkCaptacao = async (linkToken: string) => {
    await Clipboard.setStringAsync(`${BASE_URL}/captacao/${linkToken}`);
    Alert.alert('Copiado!', 'Link de captação copiado.');
  };

  const criarEstagio = async () => {
    if (!nomeEstagio.trim()) { Alert.alert('Atenção', 'Informe o nome do estágio.'); return; }
    setCriandoEstagio(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/estagios-funil`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeEstagio.trim(), ordem: estagiosFunil.length }),
      });
      if (res.ok) { setModalEstagioAberto(false); setNomeEstagio(''); carregarDados(); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoEstagio(false);
    }
  };

  if (carregando) {
    return <ErpShell titulo="Captação"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Captação">
      <PageHeader titulo="Captação e CRM" subtitulo="Funil de leads, follow-up e aulas experimentais até a matrícula" />

      <SubAbasSimples
        opcoes={[
          { chave: 'funil', rotulo: 'Funil' },
          { chave: 'leads', rotulo: `Leads · ${leads.length}` },
          { chave: 'experimentais', rotulo: 'Aulas experimentais' },
        ]}
        ativa={sub} onMudar={setSub}
      />

      {sub === 'funil' && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Botao texto="Novo estágio" variante="secundario" icone="add" onPress={() => setModalEstagioAberto(true)} />
          </View>
          <View style={estilos.kpiGrade}>
            {estagiosFunil.map((e) => <Kpi key={e.id} label={e.nome} valor={e.totalLeads} />)}
            {relatorioConversao && relatorioConversao.totalExperimentais > 0 && (
              <Kpi label="Conversão experimental → matrícula (30d)" valor={`${relatorioConversao.taxaConversao}%`} tom="sucesso" />
            )}
          </View>

          <Modal visivel={modalEstagioAberto} titulo="Novo estágio do funil" onFechar={() => setModalEstagioAberto(false)}>
            <Campo label="Nome" value={nomeEstagio} onChangeText={setNomeEstagio} placeholder="Ex: Contato feito, Aula agendada..." />
            <Text style={{ fontSize: 12, color: ERP.textoMuted, marginBottom: 16 }}>Entra no fim da fila — dá pra reordenar depois.</Text>
            <Botao texto="Criar estágio" onPress={criarEstagio} carregando={criandoEstagio} />
          </Modal>

          <SectionCard
            titulo="Links de captação"
            subtitulo="Compartilhe em redes sociais ou embuta no site — sem precisar do app"
            acao={(
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao texto="Formulário" variante="secundario" icone="add" carregando={criandoLink} onPress={() => criarLinkCaptacao('CADASTRO')} />
                <Botao texto="Aula experimental" variante="secundario" icone="add" carregando={criandoLink} onPress={() => criarLinkCaptacao('AGENDAMENTO_EXPERIMENTAL')} />
              </View>
            )}
          >
            {linksCaptacao.length === 0 ? (
              <EstadoVazio icone="link-outline" texto="Nenhum link criado ainda." />
            ) : (
              <Tabela
                vazioTexto=""
                dados={linksCaptacao}
                colunas={[
                  { chave: 'tipo', titulo: 'Tipo', flex: 3, render: (l: any) => (
                    <View>
                      <Text style={estilos.linhaTitulo}>{l.tipo === 'AGENDAMENTO_EXPERIMENTAL' ? 'Aula experimental' : 'Formulário de contato'}</Text>
                      {l.professor?.nome && <Text style={estilos.linhaSub}>{l.professor.nome}</Text>}
                    </View>
                  )},
                  { chave: 'status', titulo: 'Status', flex: 2, render: (l: any) => (
                    <Text style={[estilos.linhaSub, { color: l.ativo ? ERP.sucesso : ERP.perigo, fontWeight: '700' }]}>{l.ativo ? 'Ativo' : 'Desativado'}</Text>
                  )},
                  { chave: 'acoes', titulo: '', flex: 2, alinhar: 'right', render: (l: any) => (
                    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'flex-end' }}>
                      <TouchableOpacity onPress={() => copiarLinkCaptacao(l.token)}><Ionicons name="copy-outline" size={18} color={ERP.acento} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => alternarLinkCaptacao(l.id, l.ativo)}>
                        <Ionicons name={l.ativo ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color={ERP.textoSecundario} />
                      </TouchableOpacity>
                    </View>
                  )},
                ]}
              />
            )}
          </SectionCard>
        </>
      )}

      {sub === 'leads' && (
        <AbaLeads leads={leads} estagios={estagiosFunil} professores={professores} cursos={cursos} recarregar={carregarDados} />
      )}

      {sub === 'experimentais' && (
        <AbaExperimentais experimentais={experimentais} recarregar={carregarDados} />
      )}
    </ErpShell>
  );
}

// ─── Leads ──────────────────────────────────────────────────────────────

function AbaLeads({ leads, estagios, professores, cursos, recarregar }: { leads: any[]; estagios: any[]; professores: any[]; cursos: any[]; recarregar: () => void }) {
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [origem, setOrigem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [leadAberto, setLeadAberto] = useState<any | null>(null);
  const [descricaoTarefa, setDescricaoTarefa] = useState('');
  const [dataTarefa, setDataTarefa] = useState('');
  const [criandoTarefa, setCriandoTarefa] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [dataExperimental, setDataExperimental] = useState('');
  const [cursoExperimental, setCursoExperimental] = useState<string | null>(null);
  const [agendandoExperimental, setAgendandoExperimental] = useState(false);

  const abrirNovo = () => { setNome(''); setTelefone(''); setEmail(''); setOrigem(''); setModalNovoAberto(true); };

  const criarLead = async () => {
    if (!nome.trim()) { Alert.alert('Atenção', 'Informe o nome do lead.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/leads`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), telefone: telefone.trim() || undefined, email: email.trim() || undefined, origem: origem.trim() || undefined }),
      });
      if (res.ok) { setModalNovoAberto(false); recarregar(); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirDetalhe = (lead: any) => { setLeadAberto(lead); setDescricaoTarefa(''); setDataTarefa(''); setDataExperimental(''); setCursoExperimental(cursos[0]?.id ?? null); };

  const moverEstagio = async (estagioId: string) => {
    if (!leadAberto) return;
    setMovendo(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/leads/${leadAberto.id}/estagio`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ estagioId }),
      });
      if (res.ok) { setLeadAberto(null); recarregar(); }
      else Alert.alert('Não foi possível mover', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setMovendo(false);
    }
  };

  const arquivarLead = async () => {
    if (!leadAberto) return;
    Alert.alert('Arquivar lead?', `${leadAberto.nome} sai da lista ativa do funil.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Arquivar', style: 'destructive', onPress: async () => {
        const token = await SecureStore.getItemAsync('kav_token');
        const res = await fetchComRetry(`${BASE_URL}/api/leads/${leadAberto.id}/arquivar`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { setLeadAberto(null); recarregar(); }
      } },
    ]);
  };

  const criarTarefa = async () => {
    if (!leadAberto || !descricaoTarefa.trim() || !dataTarefa.trim()) {
      Alert.alert('Atenção', 'Preencha a descrição e a data prevista (AAAA-MM-DD).');
      return;
    }
    setCriandoTarefa(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/leads/${leadAberto.id}/tarefas`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: descricaoTarefa.trim(), dataPrevista: dataTarefa.trim() }),
      });
      if (res.ok) { setDescricaoTarefa(''); setDataTarefa(''); Alert.alert('Tarefa criada!', 'Aparece na tela inicial do gestor.'); }
      else Alert.alert('Não foi possível criar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoTarefa(false);
    }
  };

  const agendarExperimental = async () => {
    if (!leadAberto || !dataExperimental.trim()) { Alert.alert('Atenção', 'Informe a data e hora (AAAA-MM-DDTHH:MM).'); return; }
    setAgendandoExperimental(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/leads/${leadAberto.id}/aula-experimental`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataHora: dataExperimental.trim(), cursoId: cursoExperimental || undefined }),
      });
      if (res.ok) { setLeadAberto(null); recarregar(); Alert.alert('Agendada!', 'A aula experimental já aparece na aba própria.'); }
      else Alert.alert('Não foi possível agendar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setAgendandoExperimental(false);
    }
  };

  return (
    <SectionCard titulo="Leads ativos" acao={<Botao texto="Novo lead" icone="add" onPress={abrirNovo} disabled={estagios.length === 0} />}>
      {estagios.length === 0 && (
        <Text style={{ fontSize: 12.5, color: ERP.textoMuted, marginBottom: 12 }}>
          Cadastre pelo menos um estágio de funil (aba Funil, botão "Novo estágio") antes de criar leads.
        </Text>
      )}
      <Tabela
        vazioTexto="Nenhum lead ativo no funil."
        vazioIcone="person-add-outline"
        dados={leads}
        onLinhaPress={abrirDetalhe}
        colunas={[
          { chave: 'nome', titulo: 'Nome', flex: 2, render: (l: any) => (
            <View>
              <Text style={estilos.linhaTitulo}>{l.nome}</Text>
              <Text style={estilos.linhaSub}>{l.telefone || l.email || 'Sem contato'}</Text>
            </View>
          )},
          { chave: 'estagio', titulo: 'Estágio', flex: 1.5, render: (l: any) => <Badge texto={l.estagio?.nome || '—'} tom="info" /> },
          { chave: 'origem', titulo: 'Origem', flex: 1, render: (l: any) => <Text style={estilos.linhaSub}>{l.origem || '—'}</Text> },
          { chave: 'professor', titulo: 'Professor', flex: 1.5, render: (l: any) => <Text style={estilos.linhaSub}>{l.professor?.nome || '—'}</Text> },
        ]}
      />

      <Modal visivel={modalNovoAberto} titulo="Novo lead" onFechar={() => setModalNovoAberto(false)}>
        <Campo label="Nome" value={nome} onChangeText={setNome} placeholder="Nome do interessado" />
        <Campo label="Telefone (opcional)" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" placeholder="(00) 00000-0000" />
        <Campo label="E-mail (opcional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Campo label="Origem (opcional)" value={origem} onChangeText={setOrigem} placeholder="Ex: Instagram, indicação..." />
        <Botao texto="Criar lead" onPress={criarLead} carregando={salvando} />
      </Modal>

      <Modal visivel={!!leadAberto} titulo={leadAberto?.nome || ''} onFechar={() => setLeadAberto(null)} largura={520}>
        {leadAberto && (
          <>
            <Text style={estilos.label}>Mover para estágio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {estagios.map((e: any) => (
                  <TouchableOpacity
                    key={e.id}
                    style={[estilos.chip, leadAberto.estagioId === e.id && estilos.chipAtivo]}
                    onPress={() => moverEstagio(e.id)}
                    disabled={movendo}
                  >
                    <Text style={[estilos.chipTexto, leadAberto.estagioId === e.id && { color: '#fff' }]}>{e.nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={estilos.label}>Nova tarefa de follow-up</Text>
            <Campo label="Descrição" value={descricaoTarefa} onChangeText={setDescricaoTarefa} placeholder="Ex: Ligar pra confirmar interesse" />
            <Campo label="Data prevista (AAAA-MM-DD)" value={dataTarefa} onChangeText={setDataTarefa} placeholder="2026-09-15" />
            <View style={{ marginBottom: 18 }}>
              <Botao texto="Criar tarefa" variante="secundario" onPress={criarTarefa} carregando={criandoTarefa} />
            </View>

            <Text style={estilos.label}>Agendar aula experimental</Text>
            <Campo label="Data e hora (AAAA-MM-DDTHH:MM)" value={dataExperimental} onChangeText={setDataExperimental} placeholder="2026-09-15T14:00" />
            {cursos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {cursos.map((c: any) => (
                    <TouchableOpacity key={c.id} style={[estilos.chip, cursoExperimental === c.id && estilos.chipAtivo]} onPress={() => setCursoExperimental(c.id)}>
                      <Text style={[estilos.chipTexto, cursoExperimental === c.id && { color: '#fff' }]}>{c.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            <View style={{ marginBottom: 18 }}>
              <Botao texto="Agendar aula experimental" variante="secundario" onPress={agendarExperimental} carregando={agendandoExperimental} />
            </View>

            <Botao texto="Arquivar lead" variante="perigo" icone="archive-outline" onPress={arquivarLead} />
          </>
        )}
      </Modal>
    </SectionCard>
  );
}

// ─── Aulas experimentais ────────────────────────────────────────────────

function AbaExperimentais({ experimentais, recarregar }: { experimentais: any[]; recarregar: () => void }) {
  const atualizarStatus = async (id: string, status: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas-experimentais/${id}/status`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) recarregar();
      else Alert.alert('Não foi possível atualizar', (await res.json()).erro || 'Tente novamente.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    }
  };

  return (
    <SectionCard titulo="Aulas experimentais">
      <Tabela
        vazioTexto="Nenhuma aula experimental agendada. Agende uma pela aba Leads."
        vazioIcone="calendar-outline"
        dados={experimentais}
        colunas={[
          { chave: 'lead', titulo: 'Lead', flex: 2, render: (a: any) => (
            <View>
              <Text style={estilos.linhaTitulo}>{a.lead?.nome}</Text>
              <Text style={estilos.linhaSub}>{a.curso?.nome || 'Sem curso definido'} · {a.professor?.nome}</Text>
            </View>
          )},
          { chave: 'dataHora', titulo: 'Data', flex: 1.5, render: (a: any) => (
            <Text style={estilos.linhaSub}>{new Date(a.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
          )},
          { chave: 'status', titulo: 'Status', flex: 2, render: (a: any) => {
            const cfg = STATUS_EXPERIMENTAL[a.status] || STATUS_EXPERIMENTAL.AGENDADA;
            return (
              <View style={{ gap: 6 }}>
                <Badge texto={cfg.texto} tom={cfg.tom} />
                {a.status === 'AGENDADA' && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => atualizarStatus(a.id, 'REALIZADA')}>
                      <Text style={{ color: ERP.sucesso, fontSize: 12, fontWeight: '700' }}>Realizada</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => atualizarStatus(a.id, 'NAO_COMPARECEU')}>
                      <Text style={{ color: ERP.perigo, fontSize: 12, fontWeight: '700' }}>Não veio</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }},
        ]}
      />
    </SectionCard>
  );
}

const estilos = StyleSheet.create({
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
