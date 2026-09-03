import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../../components/SyncLoader';
import { BASE_URL, fetchComRetry } from '../../api';
import { SubAbas } from './_componentes';
import { estilosConteudo as estilos } from './_estilos';

type Sub = 'salas' | 'estoque';

export default function RecursosEscola() {
  const [sub, setSub] = useState<Sub>('salas');
  const [carregando, setCarregando] = useState(true);

  const [salas, setSalas] = useState<any[]>([]);
  const [novoNomeSala, setNovoNomeSala] = useState('');
  const [criandoSala, setCriandoSala] = useState(false);

  const [alunos, setAlunos] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [emprestimosAtivos, setEmprestimosAtivos] = useState<any[]>([]);
  const [novoNomeProduto, setNovoNomeProduto] = useState('');
  const [criandoProduto, setCriandoProduto] = useState(false);
  const [movProdutoId, setMovProdutoId] = useState<string | null>(null);
  const [movTipo, setMovTipo] = useState<'ENTRADA' | 'SAIDA' | 'EMPRESTIMO' | 'DEVOLUCAO'>('ENTRADA');
  const [movQuantidade, setMovQuantidade] = useState('1');
  const [movAlunoId, setMovAlunoId] = useState<string | null>(null);
  const [salvandoMovimentacao, setSalvandoMovimentacao] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resSalas, resAlunos, resProdutos, resEmprestimos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/salas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/produtos`, { headers }),
        fetchComRetry(`${BASE_URL}/api/estoque/emprestimos-ativos`, { headers }),
      ]);
      if (resSalas.ok) setSalas(await resSalas.json());
      if (resAlunos.ok) setAlunos(await resAlunos.json());
      if (resProdutos.ok) setProdutos(await resProdutos.json());
      if (resEmprestimos.ok) setEmprestimosAtivos(await resEmprestimos.json());
    } catch (err) {
      console.error('Erro ao carregar Recursos da Escola:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const criarSala = async () => {
    if (!novoNomeSala.trim()) {
      Alert.alert('Atenção', 'Informe o nome da sala.');
      return;
    }
    setCriandoSala(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/salas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNomeSala.trim() }),
      });
      const dados = await res.json();
      if (res.ok) {
        setNovoNomeSala('');
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível criar a sala.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoSala(false);
    }
  };

  const abrirCartazSala = async (salaId: string) => {
    await WebBrowser.openBrowserAsync(`${BASE_URL}/api/salas/${salaId}/cartaz`);
  };

  const criarProduto = async () => {
    if (!novoNomeProduto.trim()) {
      Alert.alert('Atenção', 'Informe o nome do produto.');
      return;
    }
    setCriandoProduto(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/produtos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNomeProduto.trim() }),
      });
      const dados = await res.json();
      if (res.ok) {
        setNovoNomeProduto('');
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível criar o produto.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoProduto(false);
    }
  };

  const abrirMovimentacao = (produtoId: string) => {
    setMovProdutoId(produtoId);
    setMovTipo('ENTRADA');
    setMovQuantidade('1');
    setMovAlunoId(null);
  };

  const registrarMovimentacao = async () => {
    const quantidade = parseInt(movQuantidade, 10);
    if (!movProdutoId || !Number.isInteger(quantidade) || quantidade <= 0) {
      Alert.alert('Atenção', 'Informe uma quantidade válida.');
      return;
    }
    if ((movTipo === 'EMPRESTIMO' || movTipo === 'DEVOLUCAO') && !movAlunoId) {
      Alert.alert('Atenção', 'Selecione o aluno.');
      return;
    }
    setSalvandoMovimentacao(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/produtos/${movProdutoId}/movimentacoes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: movTipo, quantidade, alunoId: movAlunoId }),
      });
      const dados = await res.json();
      if (res.ok) {
        setMovProdutoId(null);
        carregarDados();
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível registrar.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoMovimentacao(false);
    }
  };

  if (carregando) {
    return (
      <View style={estilos.telaCentralizada}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={estilos.container} showsVerticalScrollIndicator={false}>
      <View style={estilos.subHeader}>
        <Text style={estilos.subTitulo}>Recursos</Text>
        <Text style={estilos.subtitulo}>Salas de aula e estoque de materiais</Text>
      </View>

      <SubAbas
        opcoes={[{ chave: 'salas', rotulo: 'Salas' }, { chave: 'estoque', rotulo: 'Estoque' }]}
        ativa={sub}
        onMudar={setSub}
      />

      {sub === 'salas' && (
        <View style={estilos.secaoLista}>
          <Text style={estilos.textoAjuda}>
            Cada sala pode ter um cartaz com QR Code — professor e aluno escaneiam pra confirmar presença sem toque manual.
          </Text>

          <View style={[estilos.papelRow, { alignItems: 'center' }]}>
            <TextInput
              style={[estilos.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Nome da sala"
              placeholderTextColor="#aaa"
              value={novoNomeSala}
              onChangeText={setNovoNomeSala}
            />
            <TouchableOpacity
              style={[botaoCriar.base, criandoSala && { opacity: 0.6 }]}
              onPress={criarSala}
              disabled={criandoSala}
            >
              {criandoSala ? <SyncLoader color="#ffffff" /> : <Text style={botaoCriar.texto}>Criar</Text>}
            </TouchableOpacity>
          </View>

          {salas.length === 0 ? (
            <Text style={[estilos.textoVazio, { marginTop: 12 }]}>Nenhuma sala cadastrada.</Text>
          ) : (
            salas.map((s) => (
              <View key={s.id} style={estilos.linhaPessoa}>
                <View style={estilos.avatarFallback}>
                  <Ionicons name="business-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nomePessoa}>{s.nome}</Text>
                  {!s.ativa && <Text style={estilos.emailPessoa}>Inativa</Text>}
                </View>
                <TouchableOpacity style={estilos.botaoIcone} onPress={() => abrirCartazSala(s.id)}>
                  <Ionicons name="qr-code-outline" size={20} color="#32BCAD" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {sub === 'estoque' && (
        <View style={estilos.secaoLista}>
          <View style={[estilos.papelRow, { alignItems: 'center' }]}>
            <TextInput
              style={[estilos.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Nome do produto"
              placeholderTextColor="#aaa"
              value={novoNomeProduto}
              onChangeText={setNovoNomeProduto}
            />
            <TouchableOpacity
              style={[botaoCriar.base, criandoProduto && { opacity: 0.6 }]}
              onPress={criarProduto}
              disabled={criandoProduto}
            >
              {criandoProduto ? <SyncLoader color="#ffffff" /> : <Text style={botaoCriar.texto}>Criar</Text>}
            </TouchableOpacity>
          </View>

          {produtos.length === 0 ? (
            <Text style={[estilos.textoVazio, { marginTop: 12 }]}>Nenhum produto cadastrado.</Text>
          ) : (
            produtos.map((p) => (
              <View key={p.id}>
                <TouchableOpacity style={estilos.linhaPessoa} onPress={() => abrirMovimentacao(p.id)}>
                  <View style={estilos.avatarFallback}>
                    <Ionicons name="cube-outline" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.nomePessoa}>{p.nome}</Text>
                  </View>
                  <View style={estilos.badgePapel}>
                    <Text style={estilos.badgePapelTexto}>{p.quantidadeEstoque} em estoque</Text>
                  </View>
                </TouchableOpacity>

                {movProdutoId === p.id && (
                  <View style={estilos.cardForm}>
                    <View style={estilos.papelRow}>
                      {(['ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO'] as const).map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[estilos.chipPapel, movTipo === t && estilos.chipPapelAtivo]}
                          onPress={() => setMovTipo(t)}
                        >
                          <Text style={[estilos.textoChip, movTipo === t && { color: '#fff' }]}>
                            {t === 'ENTRADA' ? 'Entrada' : t === 'SAIDA' ? 'Saída' : t === 'EMPRESTIMO' ? 'Empréstimo' : 'Devolução'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={estilos.input}
                      placeholder="Quantidade"
                      placeholderTextColor="#aaa"
                      keyboardType="numeric"
                      value={movQuantidade}
                      onChangeText={setMovQuantidade}
                    />
                    {(movTipo === 'EMPRESTIMO' || movTipo === 'DEVOLUCAO') && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                        {alunos.map((a) => (
                          <TouchableOpacity
                            key={a.id}
                            style={[estilos.chipPapel, { marginRight: 8 }, movAlunoId === a.id && estilos.chipPapelAtivo]}
                            onPress={() => setMovAlunoId(a.id)}
                          >
                            <Text style={[estilos.textoChip, movAlunoId === a.id && { color: '#fff' }]}>{a.nome}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity style={[estilos.botaoPrimario, { flex: 1, backgroundColor: '#888' }]} onPress={() => setMovProdutoId(null)}>
                        <Text style={estilos.botaoPrimarioTexto}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[estilos.botaoPrimario, { flex: 1 }, salvandoMovimentacao && { opacity: 0.6 }]}
                        onPress={registrarMovimentacao}
                        disabled={salvandoMovimentacao}
                      >
                        {salvandoMovimentacao ? <SyncLoader color="#ffffff" /> : <Text style={estilos.botaoPrimarioTexto}>Confirmar</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}

          {emprestimosAtivos.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={estilos.textoAjuda}>Empréstimos ativos</Text>
              {emprestimosAtivos.map((e, i) => (
                <Text key={i} style={estilos.emailPessoa}>{e.alunoNome} está com {e.saldo}x {e.produtoNome}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const botaoCriar = {
  base: { backgroundColor: '#000', borderRadius: 10, paddingHorizontal: 18, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
  texto: { color: '#fff', fontSize: 14, fontWeight: 'bold' as const },
};
