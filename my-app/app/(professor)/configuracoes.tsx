import { BASE_URL, fetchComRetry } from '../api';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import SyncLoader from '../../components/SyncLoader';

const API_URL = BASE_URL;

interface Assinatura {
  assinaturaStatus: 'PENDENTE' | 'ATIVO' | 'INATIVO' | 'VITALICIO' | 'CANCELADO';
  assinaturaFim: string | null;
}

const STATUS_LABEL: Record<Assinatura['assinaturaStatus'], string> = {
  ATIVO: 'Ativa',
  VITALICIO: 'Vitalícia',
  PENDENTE: 'Pendente',
  INATIVO: 'Inativa',
  CANCELADO: 'Cancelada',
};

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [carregandoAssinatura, setCarregandoAssinatura] = useState(true);
  const [cancelando, setCancelando] = useState(false);

  const carregarAssinatura = useCallback(async () => {
    try {
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/professor/assinatura/${professorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAssinatura(await res.json());
      }
    } catch (err) {
      console.error('Erro ao carregar assinatura:', err);
    } finally {
      setCarregandoAssinatura(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregarAssinatura(); }, [carregarAssinatura]));

  const cancelarAssinatura = () => {
    Alert.alert(
      'Cancelar assinatura',
      'Você vai manter acesso normal até o fim do período que já pagou. Depois disso, sua conta deixa de ser cobrada e o acesso é encerrado. Deseja continuar?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar assinatura',
          style: 'destructive',
          onPress: async () => {
            setCancelando(true);
            try {
              const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
              const token = await SecureStore.getItemAsync('kav_token');
              const res = await fetchComRetry(`${API_URL}/api/professor/assinatura/cancelar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ professorId }),
              });
              const dados = await res.json();
              if (res.ok) {
                const dataFim = dados.cancelaEm
                  ? new Date(dados.cancelaEm).toLocaleDateString('pt-BR')
                  : 'o fim do período atual';
                Alert.alert('Assinatura cancelada', `Seu acesso continua ativo até ${dataFim}.`);
                carregarAssinatura();
              } else {
                Alert.alert('Erro', dados.erro || 'Não foi possível cancelar a assinatura.');
              }
            } catch (err) {
              console.error('Erro ao cancelar assinatura:', err);
              Alert.alert('Erro', 'Não foi possível cancelar a assinatura. Tente novamente.');
            } finally {
              setCancelando(false);
            }
          },
        },
      ]
    );
  };

  const fazerLogout = () => {
    Alert.alert("Sair", "Deseja encerrar a sessão?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await SecureStore.deleteItemAsync('kav_token');
          await SecureStore.deleteItemAsync('kav_papel');
          await SecureStore.deleteItemAsync('kav_professor_id');
          router.replace('/login');
        }
      }
    ]);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Assinatura</Text>

        {carregandoAssinatura ? (
          <SyncLoader size="small" color="#000000" />
        ) : assinatura ? (
          <View style={styles.cardAssinatura}>
            <Text style={styles.statusAssinatura}>{STATUS_LABEL[assinatura.assinaturaStatus]}</Text>

            {assinatura.assinaturaStatus === 'VITALICIO' && (
              <Text style={styles.subtextoAssinatura}>Plano vitalício — sem cobrança recorrente.</Text>
            )}

            {assinatura.assinaturaStatus === 'ATIVO' && (
              <>
                {assinatura.assinaturaFim && (
                  <Text style={styles.subtextoAssinatura}>
                    Próxima cobrança em {new Date(assinatura.assinaturaFim).toLocaleDateString('pt-BR')}.
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.botaoCancelarAssinatura}
                  onPress={cancelarAssinatura}
                  disabled={cancelando}
                >
                  {cancelando ? (
                    <SyncLoader size="small" color="#D9534F" />
                  ) : (
                    <Text style={styles.textoCancelarAssinatura}>Cancelar assinatura</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {(assinatura.assinaturaStatus === 'CANCELADO' ||
              assinatura.assinaturaStatus === 'INATIVO' ||
              assinatura.assinaturaStatus === 'PENDENTE') && (
              <Text style={styles.subtextoAssinatura}>
                {assinatura.assinaturaStatus === 'CANCELADO'
                  ? 'Sua assinatura foi cancelada.'
                  : 'Nenhuma assinatura ativa no momento.'}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Conta</Text>

        <TouchableOpacity style={styles.botaoSair} onPress={fazerLogout}>
          <Ionicons name="log-out-outline" size={24} color="#D9534F" />
          <Text style={styles.textoSair}>Encerrar Sessão</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  secao: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  tituloSecao: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 15,
  },
  cardAssinatura: {
    backgroundColor: '#F0F4F8',
    padding: 15,
    borderRadius: 12,
  },
  statusAssinatura: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  subtextoAssinatura: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  botaoCancelarAssinatura: {
    marginTop: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9534F',
  },
  textoCancelarAssinatura: {
    color: '#D9534F',
    fontSize: 15,
    fontWeight: 'bold',
  },
  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
    padding: 15,
    borderRadius: 12,
    gap: 12,
  },
  textoSair: {
    color: '#D9534F',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
