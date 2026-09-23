// Secretaria — terceira persona da Escola (INSTITUTION, 21/09/2026): DONO/
// GESTOR cria o login direto aqui (mesmo endpoint de criação de professor,
// POST /api/escola/professores/criar, com papel=SECRETARIA) e decide,
// função a função, quais telas de Gestão/Crescimento/Operação/Instituição
// ela alcança — Painel e Social ficam sempre liberados pra qualquer papel
// (ver NAV_ESCOLA/SidebarNavGrupos). Aba própria, separada da Equipe, pra
// não misturar professores com esta persona administrativa.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Botao, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard } from './_ui';

const ROTULOS_PERMISSAO: Record<string, string> = {
  equipe: 'Equipe',
  alunos: 'Alunos',
  logistica: 'Logística',
  reposicoes: 'Reposições',
  coordenacao: 'Coordenação',
  calendario: 'Cronograma',
  chats: 'Chats das Turmas',
  captacao: 'Captação',
  comunicados: 'Comunicados',
  recursos: 'Recursos',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
  configuracoes: 'Configurações',
};

function ChipPermissao({ chave, ativa, onPress }: { chave: string; ativa: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[estilos.chip, ativa && estilos.chipAtiva]} onPress={onPress}>
      <Ionicons name={ativa ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={ativa ? '#fff' : ERP.textoMuted} />
      <Text style={[estilos.chipTexto, ativa && estilos.chipTextoAtiva]}>{ROTULOS_PERMISSAO[chave] || chave}</Text>
    </TouchableOpacity>
  );
}

export default function SecretariasEscola() {
  const [carregando, setCarregando] = useState(true);
  const [secretarias, setSecretarias] = useState<any[]>([]);
  const [chaves, setChaves] = useState<string[]>([]);

  const [modalCriarAberto, setModalCriarAberto] = useState(false);
  const [papelNovo, setPapelNovo] = useState<'SECRETARIA' | 'FUNCIONARIO'>('SECRETARIA');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cargo, setCargo] = useState('');
  const [permissoesNovas, setPermissoesNovas] = useState<string[]>([]);
  const [criando, setCriando] = useState(false);

  const [editando, setEditando] = useState<any | null>(null);
  const [permissoesEditando, setPermissoesEditando] = useState<string[]>([]);
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/secretarias`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const dados = await res.json();
        setSecretarias(dados.secretarias || []);
        setChaves(dados.chavesDisponiveis || []);
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const limparFormCriar = () => { setPapelNovo('SECRETARIA'); setNome(''); setEmail(''); setSenha(''); setCargo(''); setPermissoesNovas([]); };

  const alternarPermissaoNova = (chave: string) => {
    setPermissoesNovas((atual) => atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave]);
  };

  const criarSecretaria = async () => {
    if (!nome.trim() || !email.trim() || !senha) {
      Alert.alert('Atenção', 'Nome, e-mail e senha são obrigatórios.');
      return;
    }
    if (senha.length < 6) {
      Alert.alert('Atenção', 'A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    setCriando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/criar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(), email: email.trim(), senha, papel: papelNovo,
          cargo: papelNovo === 'FUNCIONARIO' ? cargo.trim() || undefined : undefined,
          permissoesSecretaria: permissoesNovas,
        }),
      });
      const dados = await res.json();
      if (res.ok) {
        setModalCriarAberto(false);
        limparFormCriar();
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível criar o funcionário.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriando(false);
    }
  };

  const abrirEdicaoPermissoes = (secretaria: any) => {
    setEditando(secretaria);
    setPermissoesEditando(secretaria.permissoesSecretaria || []);
  };

  const alternarPermissaoEditando = (chave: string) => {
    setPermissoesEditando((atual) => atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave]);
  };

  const salvarPermissoes = async () => {
    if (!editando) return;
    setSalvandoPermissoes(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/secretarias/${editando.id}/permissoes`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissoesSecretaria: permissoesEditando }),
      });
      if (res.ok) { setEditando(null); carregarDados(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar as permissões.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoPermissoes(false);
    }
  };

  const desligar = (secretaria: any) => {
    Alert.alert('Desligar secretaria?', `${secretaria.nome} perde o acesso imediatamente.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desligar', style: 'destructive', onPress: async () => {
          const token = await SecureStore.getItemAsync('kav_token');
          const res = await fetchComRetry(`${BASE_URL}/api/escola/professores/${secretaria.id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) carregarDados();
          else Alert.alert('Erro', 'Não foi possível desligar.');
        },
      },
    ]);
  };

  if (carregando) {
    return (
      <ErpShell titulo="Secretaria">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      </ErpShell>
    );
  }

  return (
    <ErpShell titulo="Funcionários">
      <PageHeader
        titulo="Funcionários"
        subtitulo="Crie o login de qualquer funcionário ou associado — secretaria ou outro segmento — e escolha exatamente quais funções ele pode abrir. Painel e Social ficam sempre liberados."
        acao={<Botao texto="Novo funcionário" icone="add" onPress={() => { limparFormCriar(); setModalCriarAberto(true); }} />}
      />

      <SectionCard>
        {secretarias.length === 0 ? (
          <EstadoVazio icone="key-outline" texto="Nenhum funcionário cadastrado ainda." />
        ) : (
          secretarias.map((s) => (
            <View key={s.id} style={estilos.linha}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={estilos.linhaTitulo}>{s.nome}{s.papel === 'FUNCIONARIO' && s.cargo ? ` · ${s.cargo}` : s.papel === 'SECRETARIA' ? ' · Secretaria' : ''}</Text>
                <Text style={estilos.linhaSub}>{s.email}</Text>
                <View style={estilos.linhaChips}>
                  {(s.permissoesSecretaria || []).length === 0 ? (
                    <Text style={estilos.semPermissao}>Sem nenhuma função liberada ainda</Text>
                  ) : (
                    (s.permissoesSecretaria || []).map((c: string) => (
                      <View key={c} style={estilos.badgeMini}><Text style={estilos.badgeMiniTexto}>{ROTULOS_PERMISSAO[c] || c}</Text></View>
                    ))
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao texto="Permissões" variante="secundario" icone="key-outline" onPress={() => abrirEdicaoPermissoes(s)} />
                <Botao texto="Desligar" variante="perigo" onPress={() => desligar(s)} />
              </View>
            </View>
          ))
        )}
      </SectionCard>

      <Modal visivel={modalCriarAberto} titulo="Novo funcionário" onFechar={() => setModalCriarAberto(false)} largura={520}>
        <Text style={estilos.permissoesLabel}>Tipo</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Botao texto="Secretaria" variante={papelNovo === 'SECRETARIA' ? 'primario' : 'secundario'} onPress={() => setPapelNovo('SECRETARIA')} />
          <Botao texto="Outro segmento" variante={papelNovo === 'FUNCIONARIO' ? 'primario' : 'secundario'} onPress={() => setPapelNovo('FUNCIONARIO')} />
        </View>

        <Campo label="Nome" value={nome} onChangeText={setNome} placeholder="Nome completo" />
        <Campo label="E-mail" value={email} onChangeText={setEmail} placeholder="email@suaescola.com" keyboardType="email-address" autoCapitalize="none" />
        <Campo label="Senha provisória" value={senha} onChangeText={setSenha} placeholder="Mínimo 6 caracteres" secureTextEntry />
        {papelNovo === 'FUNCIONARIO' && (
          <Campo label="Cargo / segmento" value={cargo} onChangeText={setCargo} placeholder="Ex.: Financeiro, Recepção, Limpeza" />
        )}

        <Text style={estilos.permissoesLabel}>Funções liberadas</Text>
        <View style={estilos.chipsWrap}>
          {chaves.map((c) => (
            <ChipPermissao key={c} chave={c} ativa={permissoesNovas.includes(c)} onPress={() => alternarPermissaoNova(c)} />
          ))}
        </View>

        <View style={{ marginTop: 18 }}>
          <Botao texto="Criar funcionário" onPress={criarSecretaria} carregando={criando} />
        </View>
      </Modal>

      <Modal visivel={!!editando} titulo={`Permissões · ${editando?.nome || ''}`} onFechar={() => setEditando(null)} largura={520}>
        <Text style={estilos.permissoesLabel}>Funções liberadas</Text>
        <View style={estilos.chipsWrap}>
          {chaves.map((c) => (
            <ChipPermissao key={c} chave={c} ativa={permissoesEditando.includes(c)} onPress={() => alternarPermissaoEditando(c)} />
          ))}
        </View>
        <View style={{ marginTop: 18 }}>
          <Botao texto="Salvar permissões" onPress={salvarPermissoes} carregando={salvandoPermissoes} />
        </View>
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave,
  },
  linhaTitulo: { fontSize: 14, fontWeight: '700', color: ERP.texto },
  linhaSub: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 },
  linhaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  semPermissao: { fontSize: 12, color: ERP.aviso, fontStyle: 'italic' },
  badgeMini: { backgroundColor: ERP.fundo, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: ERP.borda },
  badgeMiniTexto: { fontSize: 11.5, fontWeight: '600', color: ERP.textoSecundario },

  permissoesLabel: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginTop: 6, marginBottom: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: ERP.bordaForte, backgroundColor: ERP.superficie,
  },
  chipAtiva: { backgroundColor: ERP.acento, borderColor: ERP.acento },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
  chipTextoAtiva: { color: '#fff' },
});
