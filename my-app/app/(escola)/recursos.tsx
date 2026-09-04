import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, SectionCard, SubAbasSimples, Tabela } from './_ui';

type Sub = 'salas' | 'estoque';

export default function RecursosEscola() {
  const [sub, setSub] = useState<Sub>('salas');
  const [carregando, setCarregando] = useState(true);

  const [salas, setSalas] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [emprestimosAtivos, setEmprestimosAtivos] = useState<any[]>([]);

  const [modalSalaAberto, setModalSalaAberto] = useState(false);
  const [nomeSala, setNomeSala] = useState('');
  const [criandoSala, setCriandoSala] = useState(false);

  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [nomeProduto, setNomeProduto] = useState('');
  const [criandoProduto, setCriandoProduto] = useState(false);

  const [movProdutoId, setMovProdutoId] = useState<string | null>(null);
  const [movTipo, setMovTipo] = useState<'ENTRADA' | 'SAIDA' | 'EMPRESTIMO' | 'DEVOLUCAO'>('ENTRADA');
  const [movQuantidade, setMovQuantidade] = useState('1');
  const [movAlunoId, setMovAlunoId] = useState<string | null>(null);
  const [salvandoMov, setSalvandoMov] = useState(false);

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
      console.error('Erro ao carregar Recursos:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarDados(); }, [carregarDados]));

  const criarSala = async () => {
    if (!nomeSala.trim()) { Alert.alert('Atenção', 'Informe o nome da sala.'); return; }
    setCriandoSala(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/salas`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeSala.trim() }),
      });
      const dados = await res.json();
      if (res.ok) { setModalSalaAberto(false); setNomeSala(''); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível criar a sala.');
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
    if (!nomeProduto.trim()) { Alert.alert('Atenção', 'Informe o nome do produto.'); return; }
    setCriandoProduto(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/produtos`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeProduto.trim() }),
      });
      const dados = await res.json();
      if (res.ok) { setModalProdutoAberto(false); setNomeProduto(''); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível criar o produto.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCriandoProduto(false);
    }
  };

  const abrirMovimentacao = (produtoId: string) => {
    setMovProdutoId(produtoId); setMovTipo('ENTRADA'); setMovQuantidade('1'); setMovAlunoId(null);
  };

  const registrarMovimentacao = async () => {
    const quantidade = parseInt(movQuantidade, 10);
    if (!movProdutoId || !Number.isInteger(quantidade) || quantidade <= 0) { Alert.alert('Atenção', 'Informe uma quantidade válida.'); return; }
    if ((movTipo === 'EMPRESTIMO' || movTipo === 'DEVOLUCAO') && !movAlunoId) { Alert.alert('Atenção', 'Selecione o aluno.'); return; }
    setSalvandoMov(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/produtos/${movProdutoId}/movimentacoes`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: movTipo, quantidade, alunoId: movAlunoId }),
      });
      const dados = await res.json();
      if (res.ok) { setMovProdutoId(null); carregarDados(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível registrar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoMov(false);
    }
  };

  if (carregando) {
    return <ErpShell titulo="Recursos"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell
      titulo="Recursos"
      acao={<Botao texto={sub === 'salas' ? 'Nova sala' : 'Novo produto'} icone="add" onPress={() => sub === 'salas' ? setModalSalaAberto(true) : setModalProdutoAberto(true)} />}
    >
      <Text style={estilos.titulo}>Salas e estoque</Text>
      <Text style={estilos.subtitulo}>Espaços físicos e materiais compartilhados pela escola</Text>

      <SubAbasSimples opcoes={[{ chave: 'salas', rotulo: 'Salas' }, { chave: 'estoque', rotulo: 'Estoque' }]} ativa={sub} onMudar={setSub} />

      {sub === 'salas' && (
        <SectionCard>
          {salas.length === 0 ? (
            <EstadoVazio icone="business-outline" texto="Nenhuma sala cadastrada." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={salas}
              colunas={[
                { chave: 'nome', titulo: 'Sala', flex: 3, render: (s: any) => (
                  <View>
                    <Text style={estilos.linhaTitulo}>{s.nome}</Text>
                    {!s.ativa && <Text style={{ fontSize: 12, color: ERP.perigo, marginTop: 2 }}>Inativa</Text>}
                  </View>
                )},
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (s: any) => (
                  <TouchableOpacity onPress={() => abrirCartazSala(s.id)}><Ionicons name="qr-code-outline" size={20} color={ERP.acento} /></TouchableOpacity>
                )},
              ]}
            />
          )}
        </SectionCard>
      )}

      {sub === 'estoque' && (
        <SectionCard>
          {produtos.length === 0 ? (
            <EstadoVazio icone="cube-outline" texto="Nenhum produto cadastrado." />
          ) : (
            <Tabela
              vazioTexto=""
              dados={produtos}
              colunas={[
                { chave: 'nome', titulo: 'Produto', flex: 3, render: (p: any) => <Text style={estilos.linhaTitulo}>{p.nome}</Text> },
                { chave: 'estoque', titulo: 'Em estoque', flex: 2, render: (p: any) => <Badge texto={`${p.quantidadeEstoque} un.`} /> },
                { chave: 'acao', titulo: '', flex: 1, alinhar: 'right', render: (p: any) => (
                  <Botao texto="Movimentar" variante="secundario" onPress={() => abrirMovimentacao(p.id)} />
                )},
              ]}
            />
          )}
          {emprestimosAtivos.length > 0 && (
            <View style={{ marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: ERP.borda }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 }}>EMPRÉSTIMOS ATIVOS</Text>
              {emprestimosAtivos.map((e, i) => (
                <Text key={i} style={{ fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 }}>{e.alunoNome} está com {e.saldo}x {e.produtoNome}</Text>
              ))}
            </View>
          )}
        </SectionCard>
      )}

      <Modal visivel={modalSalaAberto} titulo="Nova sala" onFechar={() => setModalSalaAberto(false)}>
        <Campo label="Nome da sala" value={nomeSala} onChangeText={setNomeSala} placeholder="Ex: Sala 3 — Piano" />
        <Botao texto="Criar sala" onPress={criarSala} carregando={criandoSala} />
      </Modal>

      <Modal visivel={modalProdutoAberto} titulo="Novo produto" onFechar={() => setModalProdutoAberto(false)}>
        <Campo label="Nome do produto" value={nomeProduto} onChangeText={setNomeProduto} placeholder="Ex: Metrônomo" />
        <Botao texto="Criar produto" onPress={criarProduto} carregando={criandoProduto} />
      </Modal>

      <Modal visivel={!!movProdutoId} titulo="Movimentar estoque" onFechar={() => setMovProdutoId(null)}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO'] as const).map((t) => (
            <Botao
              key={t}
              texto={t === 'ENTRADA' ? 'Entrada' : t === 'SAIDA' ? 'Saída' : t === 'EMPRESTIMO' ? 'Empréstimo' : 'Devolução'}
              variante={movTipo === t ? 'primario' : 'secundario'}
              onPress={() => setMovTipo(t)}
            />
          ))}
        </View>
        <Campo label="Quantidade" value={movQuantidade} onChangeText={setMovQuantidade} keyboardType="numeric" placeholder="1" />
        {(movTipo === 'EMPRESTIMO' || movTipo === 'DEVOLUCAO') && (
          <>
            <Text style={estilos.campoLabel}>Aluno</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {alunos.map((a) => (
                  <TouchableOpacity key={a.id} style={[estilosLocal.chip, movAlunoId === a.id && estilosLocal.chipAtivo]} onPress={() => setMovAlunoId(a.id)}>
                    <Text style={[estilosLocal.chipTexto, movAlunoId === a.id && { color: '#fff' }]}>{a.nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}
        <Botao texto="Confirmar" onPress={registrarMovimentacao} carregando={salvandoMov} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '800', color: ERP.texto },
  subtitulo: { fontSize: 13, color: ERP.textoSecundario, marginTop: 3, marginBottom: 16 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '600', color: ERP.texto },
  campoLabel: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
});

const estilosLocal = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
