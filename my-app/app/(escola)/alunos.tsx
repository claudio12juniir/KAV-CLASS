import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, Modal, SectionCard, Tabela } from './_ui';

export default function AlunosEscola() {
  const [carregando, setCarregando] = useState(true);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [professores, setProfessores] = useState<any[]>([]);
  const [codigoEscola, setCodigoEscola] = useState<string | null>(null);

  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [professorId, setProfessorId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Atribuição de professor pra aluno que entrou pelo código da Escola (S6.1)
  // e ainda não tem ninguém responsável por ele.
  const [modalAtribuirAberto, setModalAtribuirAberto] = useState(false);
  const [alunoParaAtribuir, setAlunoParaAtribuir] = useState<any | null>(null);
  const [professorEscolhido, setProfessorEscolhido] = useState<string | null>(null);
  const [atribuindo, setAtribuindo] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resAlunos, resProfessores, resPerfil] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/perfil`, { headers }),
      ]);
      if (resAlunos.ok) setAlunos(await resAlunos.json());
      if (resProfessores.ok) setProfessores(await resProfessores.json());
      if (resPerfil.ok) setCodigoEscola((await resPerfil.json()).codigoConvite);
    } catch (err) {
      console.error('Erro ao carregar Alunos:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const abrirModal = () => {
    setNome(''); setEmail(''); setSenha(''); setTelefone('');
    setProfessorId(professores[0]?.id || null);
    setModalAberto(true);
  };

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
      if (res.ok) {
        setModalAtribuirAberto(false);
        carregarDados();
        Alert.alert('Professor atribuído', dados.mensagem);
      } else {
        Alert.alert('Não foi possível atribuir', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setAtribuindo(false);
    }
  };

  const criarAluno = async () => {
    if (!nome.trim() || !email.trim() || senha.length < 6 || !professorId) {
      Alert.alert('Atenção', 'Preencha nome, e-mail, senha (mín. 6 caracteres) e escolha o professor responsável.');
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/alunos/criar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), email: email.trim(), senha, telefone: telefone.trim(), professorId }),
      });
      const dados = await res.json();
      if (res.ok) {
        setModalAberto(false);
        carregarDados();
        Alert.alert('Aluno criado', `${nome} já pode entrar com o e-mail e a senha cadastrados.`);
      } else {
        Alert.alert('Não foi possível criar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const copiarCodigoEscola = async () => {
    if (!codigoEscola) return;
    await Clipboard.setStringAsync(codigoEscola);
    Alert.alert('Copiado!', 'Código da escola copiado — envie pro aluno se cadastrar sozinho.');
  };

  const alunosSemProfessor = alunos.filter((a) => !a.professor);

  return (
    <ErpShell titulo="Alunos" acao={<Botao texto="Novo aluno" icone="add" onPress={abrirModal} disabled={professores.length === 0} />}>
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: ERP.texto }}>Alunos da escola</Text>
        <Text style={{ fontSize: 13, color: ERP.textoSecundario, marginTop: 3 }}>
          {alunos.length} {alunos.length === 1 ? 'aluno matriculado' : 'alunos matriculados'}, de todos os professores
        </Text>
      </View>

      <SectionCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: ERP.texto }}>Código de autoingresso da escola</Text>
            <Text style={{ fontSize: 12, color: ERP.textoSecundario, marginTop: 3 }}>
              Aluno que digitar este código no cadastro entra sem escolher professor — você atribui aqui embaixo.
            </Text>
          </View>
          <TouchableOpacity
            onPress={copiarCodigoEscola}
            disabled={!codigoEscola}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: ERP.texto, letterSpacing: 1 }}>{codigoEscola || '...'}</Text>
          </TouchableOpacity>
        </View>
      </SectionCard>

      {alunosSemProfessor.length > 0 && (
        <SectionCard>
          <Text style={{ fontSize: 13, fontWeight: '700', color: ERP.texto, marginBottom: 10 }}>
            {alunosSemProfessor.length} {alunosSemProfessor.length === 1 ? 'aluno aguardando' : 'alunos aguardando'} atribuição de professor
          </Text>
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

      <SectionCard>
        {carregando ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
        ) : (
          <Tabela
            vazioTexto="Nenhum aluno cadastrado ainda."
            vazioIcone="school-outline"
            dados={alunos}
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

      <Modal visivel={modalAberto} titulo="Adicionar aluno" onFechar={() => setModalAberto(false)}>
        <Campo label="Nome completo" value={nome} onChangeText={setNome} placeholder="Nome do aluno" />
        <Campo label="E-mail" value={email} onChangeText={setEmail} placeholder="email@exemplo.com" autoCapitalize="none" keyboardType="email-address" />
        <Campo label="Senha de acesso" value={senha} onChangeText={setSenha} placeholder="Mínimo 6 caracteres" secureTextEntry />
        <Campo label="Telefone (opcional)" value={telefone} onChangeText={setTelefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" />

        <Text style={estilos.label}>Professor responsável</Text>
        {professores.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: ERP.textoMuted, marginBottom: 16 }}>Cadastre um professor antes de matricular alunos.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {professores.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[estilos.chip, professorId === p.id && estilos.chipAtivo]}
                  onPress={() => setProfessorId(p.id)}
                >
                  <Text style={[estilos.chipTexto, professorId === p.id && { color: '#fff' }]}>{p.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        <Botao texto="Criar aluno" onPress={criarAluno} carregando={salvando} disabled={professores.length === 0} />
      </Modal>

      <Modal
        visivel={modalAtribuirAberto}
        titulo={`Atribuir professor a ${alunoParaAtribuir?.nome || ''}`}
        onFechar={() => setModalAtribuirAberto(false)}
      >
        <Text style={estilos.label}>Professor responsável</Text>
        {professores.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: ERP.textoMuted, marginBottom: 16 }}>Cadastre um professor antes de atribuir alunos.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {professores.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[estilos.chip, professorEscolhido === p.id && estilos.chipAtivo]}
                  onPress={() => setProfessorEscolhido(p.id)}
                >
                  <Text style={[estilos.chipTexto, professorEscolhido === p.id && { color: '#fff' }]}>{p.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
        <Botao texto="Confirmar atribuição" onPress={confirmarAtribuicao} carregando={atribuindo} disabled={professores.length === 0} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
