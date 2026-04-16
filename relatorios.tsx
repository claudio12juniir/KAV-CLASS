import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

// ⚠️ IP DA SUA MÁQUINA
const ipDaSuaMaquina = "10.0.0.210"; 

export default function RelatoriosProfessorScreen() {
  const [faturamentoTotal, setFaturamentoTotal] = useState(0);
  const [grafico, setGrafico] = useState<any[]>([]);
  const [faltas, setFaltas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarDados() {
      try {
        const token = await SecureStore.getItemAsync('kav_token');
        const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

        const resposta = await fetch(`http://${ipDaSuaMaquina}:3000/api/relatorios?professorId=${professorId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resposta.ok) {
          const dados = await resposta.json();
          setFaturamentoTotal(dados.faturamentoAtual);
          
          // Se o faturamento for zero, mostra um gráfico zerado
          if (dados.faturamentoAtual === 0) {
            setGrafico([
              { mes: 'Jan', valor: 0, altura: '10%' },
              { mes: 'Fev', valor: 0, altura: '10%' },
              { mes: 'Mar', valor: 0, altura: '10%' },
              { mes: 'Abr', valor: 0, altura: '10%' },
            ]);
          } else {
            setGrafico(dados.grafico);
          }
          
          setFaltas(dados.faltas);
        }
      } catch (error) {
        console.error("Erro ao buscar relatórios:", error);
      } finally {
        setCarregando(false);
      }
    }
    
    carregarDados();
  }, []);

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.titulo}>Seu Desempenho</Text>
        <Text style={styles.subtitulo}>Acompanhe o crescimento do seu negócio</Text>
      </View>

      {/* 1. Faturamento Mensal (Resumo) */}
      <View style={styles.cardResumo}>
        <Text style={styles.labelResumo}>Faturamento Total (Aprovado)</Text>
        <Text style={styles.valorResumo}>R$ {faturamentoTotal.toFixed(2).replace('.', ',')}</Text>
        <Text style={styles.crescimento}>+ Atualizado em tempo real</Text>
      </View>

      {/* 2. Gráfico de Crescimento (Simulado com base no total) */}
      <View style={styles.cardGrafico}>
        <Text style={styles.tituloSecao}>Evolução da Receita</Text>
        
        <View style={styles.graficoArea}>
          {grafico.map((item, index) => (
            <View key={index} style={styles.colunaGrafico}>
              <Text style={styles.valorBarra}>
                {item.valor > 0 ? `R$${Math.round(item.valor)}` : ''}
              </Text>
              <View style={styles.trilhaBarra}>
                <View style={[
                  styles.barraPreenchida, 
                  { 
                    height: item.altura, 
                    backgroundColor: index === grafico.length - 1 ? '#000000' : '#A0B0B9' 
                  }
                ]} />
              </View>
              <Text style={styles.labelMes}>{item.mes}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 3. Alerta de Faltas (Mural de Atenção) */}
      <View style={styles.cardFaltas}>
        <Text style={styles.tituloSecao}>Atenção às Faltas</Text>
        
        {faltas.map(aluno => (
          <View key={aluno.id} style={styles.linhaFalta}>
            <View>
              <Text style={styles.nomeFalta}>{aluno.nome}</Text>
              <Text style={styles.qtdFalta}>{aluno.faltas} faltas no mês</Text>
            </View>
            <View style={[
              styles.badgeStatus,
              aluno.status === 'Excelente' ? { backgroundColor: '#E8F8EE' } :
              aluno.status === 'Bom' ? { backgroundColor: '#E3F2FD' } : 
              { backgroundColor: '#FFEBEE' }
            ]}>
              <Text style={[
                styles.textoStatusFalta,
                aluno.status === 'Excelente' ? { color: '#154a22' } :
                aluno.status === 'Bom' ? { color: '#1976D2' } : 
                { color: '#C62828' }
              ]}>{aluno.status}</Text>
            </View>
          </View>
        ))}
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  titulo: { color: '#000000', fontSize: 26, fontWeight: 'bold' },
  subtitulo: { color: '#666', fontSize: 14, marginTop: 2 },

  cardResumo: { backgroundColor: '#000000', marginHorizontal: 20, borderRadius: 16, padding: 20, marginBottom: 20, elevation: 4 },
  labelResumo: { color: '#A0B0B9', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  valorResumo: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' },
  crescimento: { color: '#32BCAD', fontSize: 14, fontWeight: 'bold', marginTop: 8 },

  cardGrafico: { backgroundColor: '#F0F4F8', marginHorizontal: 20, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#D0D8DC' },
  tituloSecao: { color: '#000000', fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  graficoArea: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 200, paddingTop: 20 },
  colunaGrafico: { alignItems: 'center', flex: 1 },
  valorBarra: { color: '#666', fontSize: 10, fontWeight: 'bold', marginBottom: 8 },
  trilhaBarra: { width: 24, height: 130, backgroundColor: '#E0E7ED', borderRadius: 12, justifyContent: 'flex-end', overflow: 'hidden', marginBottom: 8 },
  barraPreenchida: { width: '100%', borderRadius: 12 },
  labelMes: { color: '#000000', fontSize: 14, fontWeight: 'bold' },

  cardFaltas: { marginHorizontal: 20 },
  linhaFalta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0F4F8', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#D0D8DC' },
  nomeFalta: { color: '#000000', fontSize: 16, fontWeight: 'bold' },
  qtdFalta: { color: '#666', fontSize: 13, marginTop: 4 },
  badgeStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  textoStatusFalta: { fontSize: 12, fontWeight: 'bold' }
});