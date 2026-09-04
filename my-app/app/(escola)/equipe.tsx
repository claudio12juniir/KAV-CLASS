import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { useEscolaContexto } from './_contexto';
import { Badge, Botao, Campo, ErpShell, Modal, SectionCard, SubAbasSimples, Tabela } from './_ui';

export default function EquipeEscola() {
  const { pacote } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [professores, setProfessores] = useState<any[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [modo, setModo] = useState<'criar' | 'convite'>('criar');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papelNovo, setPapelNovo] = useState<'PROFESSOR' | 'GESTOR'>('PROFESSOR');
  const [salvando, setSalvando] = useState(false);
  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null);

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

  const limparForm = () => { setNome(''); setEmail(''); setSenha(''); setPapelNovo('PROFESSOR'); setUltimoCodigo(null); };
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
        body: JSON.stringify({ nome: nome.trim(), email: email.trim(), senha, papel: papelNovo }),
      });
      const dados = await res.json();
      if (res.ok) {
        setModalAberto(false);
        carregarDados();
        Alert.alert('Professor criado', `${nome} já pode entrar com o e-mail e a senha cadastrados.`);
      } else {
        Alert.alert('Não foi possível criar', dados.erro || 'Tente novamente.');
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

  return (
    <ErpShell
      titulo="Equipe"
      acao={pacote === 'PACOTE_ESCOLA' ? <Botao texto="Novo professor" icone="add" onPress={abrirModal} /> : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: ERP.texto }}>Professores</Text>
          <Text style={{ fontSize: 13, color: ERP.textoSecundario, marginTop: 3 }}>
            {professores.length} {professores.length === 1 ? 'professor cadastrado' : 'professores cadastrados'} nesta escola
          </Text>
        </View>
      </View>

      {pacote !== 'PACOTE_ESCOLA' && (
        <SectionCard style={{ backgroundColor: ERP.avisoSoft, borderColor: '#F5D9A8', marginBottom: 20 }}>
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
            ]}
          />
        )}
      </SectionCard>

      <Modal visivel={modalAberto} titulo="Adicionar professor" onFechar={() => setModalAberto(false)}>
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
          <Campo label="Senha de acesso" value={senha} onChangeText={setSenha} placeholder="Mínimo 6 caracteres" secureTextEntry />
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
          texto={modo === 'criar' ? 'Criar professor' : 'Enviar convite'}
          onPress={modo === 'criar' ? criarProfessor : enviarConvite}
          carregando={salvando}
        />
      </Modal>
    </ErpShell>
  );
}
