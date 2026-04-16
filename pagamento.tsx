import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// ⚠️ IP DA TUA MÁQUINA
const ipDaSuaMaquina = "10.0.0.210"; 

export default function FinanceiroProfessorScreen() {
  const [mensalidades, setMensalidades] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // 1. Buscar os pagamentos reais na base de dados
  const carregarPagamentos = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      // Provisório: enviando ID fixo ou buscando do store se tiveres salvo
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || ""; 

      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/pagamentos?professorId=${professorId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        
        // Se a base de dados não tiver pagamentos, cria um mock visual para não ficar vazio
        if (dados.length === 0) {
          setMensalidades([
            { id: '1', aluno: { nome: 'João Pedro' }, vencimento: new Date().toISOString(), valor: 150, status: 'PENDENTE' },
            { id: '2', aluno: { nome: 'Maria Clara' }, vencimento: new Date().toISOString(), valor: 150, status: 'PAGO' }
          ]);
        } else {
          setMensalidades(dados);
        }
      }
    } catch (error) {
      console.error("Erro financeiro:", error);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPagamentos();
  }, []);

  // 2. Atualizar status para PAGO no Backend
  const aprovarPagamento = async (id: string, nomeAluno: string) => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      
      const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/pagamentos/${id}/aprovar`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        Alert.alert('Sucesso! 💰', `Pagamento de ${nomeAluno} aprovado.`);
        carregarPagamentos(); // Recarrega a lista para atualizar os números
      } else {
        Alert.alert('Erro', 'Não foi possível aprovar o pagamento.');
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      Alert.alert('Erro de Conexão', 'Verifique o servidor.');
    }
  };

  const cobrarAluno = (nome: string) => {
    Alert.alert('Cobrança Enviada', `Um lembrete foi enviado para o WhatsApp de ${nome}.`);
  };

  // Cálculos Automáticos
  const totalArrecadado = mensalidades.filter(m => m.status === 'PAGO').reduce((acc, curr) => acc + curr.valor, 0);
  const totalPrevisto = mensalidades.reduce((acc, curr) => acc + curr.valor, 0);
  const percentual = totalPrevisto > 0 ? (totalArrecadado / totalPrevisto) * 100 : 0;

  const renderBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PAGO': return <View style={[styles.badge, { backgroundColor: '#E8F8EE' }]}><Text style={[styles.textoBadge, { color: '#154a22' }]}>Pago</Text></View>;
      case 'PENDENTE': return <View style={[styles.badge, { backgroundColor: '#FFF4E5' }]}><Text style={[styles.textoBadge, { color: '#E65100' }]}>Pendente</Text></View>;
      case 'EM_ANALISE': return <View style={[styles.badge, { backgroundColor: '#E3F2FD' }]}><Text style={[styles.textoBadge, { color: '#1976D2' }]}>Em Análise</Text></View>;
      case 'ATRASADO': return <View style={[styles.badge, { backgroundColor: '#FFEBEE' }]}><Text style={[styles.textoBadge, { color: '#C62828' }]}>Atrasado</Text></View>;
      default: return null;
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      
      <View style={styles.header}>
        <Text style={styles.titulo}>Financeiro</Text>
        <Text style={styles.subtitulo}>Acompanhe seus recebimentos</Text>
      </View>

      <View style={styles.resumoContainer}>
        <View style={styles.cardTotal}>
          <Text style={styles.labelTotal}>Total Recebido</Text>
          <Text style={styles.valorTotal}>R$ {totalArrecadado.toFixed(2).replace('.', ',')}</Text>
          <View style={styles.barraFundo}>
            <View style={[styles.barraProgresso, { width: `${percentual}%` }]} />
          </View>
          <Text style={styles.textoProgresso}>Meta do mês: R$ {totalPrevisto.toFixed(2).replace('.', ',')}</Text>
        </View>
      </View>

      <FlatList
        data={mensalidades}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.lista}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View>
                <Text style={styles.nomeAluno}>{item.aluno?.nome || 'Aluno Desconhecido'}</Text>
                <Text style={styles.vencimento}>Venc: {new Date(item.vencimento).toLocaleDateString('pt-BR')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.valor}>R$ {item.valor.toFixed(2).replace('.', ',')}</Text>
                {renderBadge(item.status)}
              </View>
            </View>

            {item.status !== 'PAGO' && (
              <View style={styles.acoesRow}>
                {item.status === 'PENDENTE' || item.status === 'ATRASADO' ? (
                  <TouchableOpacity style={styles.botaoCobrar} onPress={() => cobrarAluno(item.aluno?.nome)}>
                    <Ionicons name="logo-whatsapp" size={16} color="#ffffff" />
                    <Text style={styles.textoBotaoCobrar}>Cobrar</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity style={styles.botaoAprovar} onPress={() => aprovarPagamento(item.id, item.aluno?.nome)}>
                  <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                  <Text style={styles.textoBotaoAprovar}>Aprovar Pagamento</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  titulo: { color: '#000000ff', fontSize: 26, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2 },
  resumoContainer: { paddingHorizontal: 20, marginBottom: 20 },
  cardTotal: { backgroundColor: '#000000ff', borderRadius: 16, padding: 20, elevation: 4 },
  labelTotal: { color: '#A0B0B9', fontSize: 14, fontWeight: '600' },
  valorTotal: { color: '#ffffff', fontSize: 36, fontWeight: 'bold', marginVertical: 10 },
  barraFundo: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' },
  barraProgresso: { height: '100%', backgroundColor: '#32BCAD', borderRadius: 4 },
  textoProgresso: { color: '#A0B0B9', fontSize: 12, marginTop: 10, textAlign: 'right' },
  lista: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#F0F4F8', borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#D0D8DC' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  nomeAluno: { color: '#000000ff', fontSize: 18, fontWeight: 'bold' },
  vencimento: { color: '#666', fontSize: 13, marginTop: 2 },
  valor: { color: '#154a22', fontSize: 18, fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4, alignSelf: 'flex-end' },
  textoBadge: { fontSize: 11, fontWeight: 'bold' },
  acoesRow: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingTop: 12, gap: 10 },
  botaoAprovar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#154a22', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, gap: 6 },
  textoBotaoAprovar: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  botaoCobrar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#25D366', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, gap: 6 },
  textoBotaoCobrar: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
});