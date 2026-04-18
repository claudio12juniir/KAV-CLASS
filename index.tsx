import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const API_URL = "https://kav-class-1.onrender.com"; 

export default function ProfessorDashboard() {
  const router = useRouter();
  const [aulasHoje, setAulasHoje] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [codigoConvite, setCodigoConvite] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregarDashboard = async () => {
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

      // 🚨 Correção da URL: Removido o 'http://' e o ':3000'
      const resposta = await fetch(`${API_URL}/api/dashboard?professorId=${professorId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        setAulasHoje(dados.aulasHoje || []);
        setAlertas(dados.alertas || []);
        setCodigoConvite(dados.codigoConvite || "CÓDIGO NÃO ENCONTRADO");
      } else {
        setCodigoConvite("KAV-XXXX"); // Fallback visual caso a API não exista ainda
      }
    } catch (error) {
      console.error("Erro no dashboard:", error);
      setCodigoConvite("ERRO DE REDE");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDashboard();
  }, []);

  const fazerLogout = async () => {
    await SecureStore.deleteItemAsync('kav_token');
    await SecureStore.deleteItemAsync('kav_professor_id');
    await SecureStore.deleteItemAsync('kav_papel');
    router.replace('/login');
  };

  // Funções Nativas de Copiar e Compartilhar
  const copiarCodigo = async () => {
    if (!codigoConvite || codigoConvite.includes("ERRO")) return;
    await Clipboard.setStringAsync(codigoConvite);
    Alert.alert("Sucesso!", "Código copiado para a área de transferência.");
  };

  const compartilharCodigo = async () => {
    if (!codigoConvite || codigoConvite.includes("ERRO")) return;
    try {
      await Share.share({
        message: `Olá! Baixe o app KAV-CLASS e use meu código para se matricular nas minhas aulas: ${codigoConvite}`,
      });
    } catch (error) {
      Alert.alert("Erro", "Não foi possível abrir o compartilhamento.");
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={{ marginTop: 10, color: '#666' }}>A preparar o teu dia...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {/* Cabeçalho */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.saudacao}>Olá, Professor!</Text>
          <Text style={styles.dataHoje}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          
          {/* Card Interativo do Código */}
          <View style={styles.cardCodigo}>
            <View>
              <Text style={styles.textoCodigoLabel}>Código de Convite</Text>
              <Text style={styles.textoCodigo}>{codigoConvite}</Text>
            </View>
            <View style={styles.botoesCodigoBox}>
              <TouchableOpacity style={styles.botaoAcaoIcone} onPress={copiarCodigo}>
                <Ionicons name="copy-outline" size={20} color="#000000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.botaoAcaoIcone} onPress={compartilharCodigo}>
                <Ionicons name="share-social-outline" size={20} color="#000000" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.botaoSair} onPress={fazerLogout}>
          <Ionicons name="log-out-outline" size={24} color="#D9534F" />
        </TouchableOpacity>
      </View>

      {/* Alertas / Notificações */}
      {alertas.length > 0 && (
        <View style={styles.secao}>
          <Text style={styles.tituloSecao}>Pendências ({alertas.length})</Text>
          {alertas.map((alerta, index) => (
            <View key={index} style={styles.cardAlerta}>
              <Ionicons name="warning" size={20} color="#E65100" />
              <Text style={styles.textoAlerta}>{alerta.texto}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Aulas do Dia */}
      <View style={styles.secao}>
        <View style={styles.linhaTitulo}>
          <Text style={styles.tituloSecao}>Aulas Agendadas</Text>
          <TouchableOpacity onPress={() => router.push('/agendamento')}>
            <Text style={styles.linkVerTudo}>+ Nova Aula</Text>
          </TouchableOpacity>
        </View>

        {aulasHoje.length === 0 ? (
          <View style={styles.cardVazio}>
            <Ionicons name="calendar-clear-outline" size={32} color="#A0B0B9" />
            <Text style={styles.textoVazio}>Sem aulas marcadas para os próximos dias.</Text>
          </View>
        ) : (
          aulasHoje.map((aula) => (
            <View key={aula.id} style={styles.cardAula}>
              <View style={styles.horarioBox}>
                <Text style={styles.textoHorario}>
                  {new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomeAluno}>{aula.aluno?.nome || 'Aluno'}</Text>
                <Text style={styles.cursoAluno}>{aula.tipo === 'REGULAR' ? 'Aula Regular' : 'Reposição'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#A0B0B9" />
            </View>
          ))
        )}
      </View>

      {/* Acesso Rápido */}
      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Acesso Rápido</Text>
        <View style={styles.gridAcessoRapido}>
          
          <TouchableOpacity style={styles.botaoAcesso} onPress={() => router.push('/alunos')}>
            <View style={styles.iconeBox}><Ionicons name="people" size={24} color="#000000" /></View>
            <Text style={styles.textoAcesso}>Alunos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.botaoAcesso} onPress={() => router.push('/pagamento')}>
            <View style={styles.iconeBox}><Ionicons name="cash" size={24} color="#000000" /></View>
            <Text style={styles.textoAcesso}>Financeiro</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.botaoAcesso} onPress={() => router.push('/relatorios')}>
            <View style={styles.iconeBox}><Ionicons name="bar-chart" size={24} color="#000000" /></View>
            <Text style={styles.textoAcesso}>Relatórios</Text>
          </TouchableOpacity>

        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  saudacao: { color: '#000000', fontSize: 26, fontWeight: 'bold' },
  dataHoje: { color: '#666', fontSize: 14, marginTop: 2, textTransform: 'capitalize' },
  
  // Novo Estilo do Card do Código
  cardCodigo: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    alignItems: 'center', 
    backgroundColor: '#F0F4F8', 
    paddingHorizontal: 15, 
    paddingVertical: 12, 
    borderRadius: 8, 
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#D0D8DC'
  },
  textoCodigoLabel: { fontSize: 12, color: '#666', marginBottom: 2, textTransform: 'uppercase', fontWeight: 'bold' },
  textoCodigo: { fontSize: 20, fontWeight: 'bold', color: '#000000', letterSpacing: 1.5 },
  botoesCodigoBox: { flexDirection: 'row', gap: 10 },
  botaoAcaoIcone: { backgroundColor: '#ffffff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#D0D8DC' },
  
  botaoSair: { padding: 8, backgroundColor: '#FFEBEE', borderRadius: 8 },
  
  secao: { paddingHorizontal: 20, marginBottom: 25 },
  linhaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  tituloSecao: { color: '#000000', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  linkVerTudo: { color: '#000000', fontWeight: 'bold', fontSize: 14 },

  cardAlerta: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF4E5', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#FFE0B2', gap: 10 },
  textoAlerta: { color: '#E65100', fontWeight: '600', flex: 1 },

  cardAula: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4F8', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#D0D8DC' },
  horarioBox: { backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 14, borderWidth: 1, borderColor: '#D0D8DC' },
  textoHorario: { color: '#000000', fontWeight: 'bold', fontSize: 15 },
  nomeAluno: { color: '#000000', fontSize: 16, fontWeight: 'bold' },
  cursoAluno: { color: '#666', fontSize: 13, marginTop: 2 },
  
  cardVazio: { alignItems: 'center', backgroundColor: '#F9F9F9', padding: 30, borderRadius: 12, borderWidth: 1, borderColor: '#EEEEEE', borderStyle: 'dashed' },
  textoVazio: { color: '#A0B0B9', marginTop: 10, textAlign: 'center' },

  gridAcessoRapido: { flexDirection: 'row', justifyContent: 'space-between' },
  botaoAcesso: { flex: 1, alignItems: 'center', backgroundColor: '#F0F4F8', paddingVertical: 20, borderRadius: 12, marginHorizontal: 4, borderWidth: 1, borderColor: '#D0D8DC' },
  iconeBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  textoAcesso: { color: '#000000', fontWeight: 'bold', fontSize: 13 }
});