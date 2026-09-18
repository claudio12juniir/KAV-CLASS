import { BASE_URL, fetchComRetry } from './api';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import SyncLoader from '../components/SyncLoader';
import { CORES } from '../constants/theme';
import { PlanoId, planosPorPacote } from '../constants/planos';

const API_URL = BASE_URL;
const LINK_FALE_CONOSCO = 'https://kavsite.netlify.app';

export default function EscolherPlanoScreen() {
  const { professorId, email, codigoConvite, nome, telefone, cursos, pacote, modalidadeEnsino } = useLocalSearchParams<{
    professorId: string;
    email: string;
    codigoConvite: string;
    nome: string;
    telefone: string;
    cursos: string;
    pacote: string;
    modalidadeEnsino: string;
  }>();

  const PLANOS = planosPorPacote(pacote);
  const modalidades = (modalidadeEnsino || '').split(',').filter(Boolean);
  const incluiOnline = modalidades.includes('ONLINE');

  const [carregando, setCarregando] = useState<PlanoId | null>(null);
  const [verificando, setVerificando] = useState(false);

  const verificarSessao = async (sessionId: string, plano: PlanoId, codigoBase: string) => {
    setVerificando(true);
    try {
      const verifyRes = await fetchComRetry(`${API_URL}/checkout/verify/${sessionId}`);
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        if (verifyData.ativo) {
          const codigoFinal = verifyData.professor?.codigoConvite || codigoBase;
          router.replace({
            pathname: '/pagamento-sucesso',
            params: { plano, codigoConvite: codigoFinal },
          });
          return;
        }
      }
    } catch {
      // silencioso — mostra o alert abaixo
    } finally {
      setVerificando(false);
    }
    Alert.alert(
      'Pagamento não confirmado',
      'Se você concluiu o pagamento, aguarde alguns segundos e tente novamente.',
      [
        { text: 'Tentar novamente', onPress: () => verificarSessao(sessionId, plano, codigoBase) },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  };

  const abrirCompletoOnline = () => {
    Alert.alert(
      'Plano Completo em desenho para Online',
      'O pacote Completo (Rede Social) para quem dá aula 100% online ainda está sendo desenhado. Fale com a gente pra saber mais, ou continue com o plano Básico por enquanto.',
      [
        { text: 'Falar com a gente', onPress: () => Linking.openURL(LINK_FALE_CONOSCO) },
        { text: 'Voltar', style: 'cancel' },
      ],
    );
  };

  const iniciarCheckout = async (plano: PlanoId) => {
    if (!email) {
      Alert.alert('Erro', 'E-mail do professor não encontrado. Tente se cadastrar novamente.');
      return;
    }

    if (incluiOnline && plano.endsWith('_completo')) {
      abrirCompletoOnline();
      return;
    }

    setCarregando(plano);
    try {
      // Lê a senha do SecureStore — evita corrupção por URL encoding
      const senha = await SecureStore.getItemAsync('kav_reg_senha');
      const fotoUrl = await SecureStore.getItemAsync('kav_reg_foto');
      const cursosStr = Array.isArray(cursos) ? cursos[0] : cursos;
      const body: Record<string, any> = { email, plano };
      if (professorId) body.professorId = professorId;
      if (nome)      body.nome     = nome;
      if (senha)     body.senha    = senha;
      if (telefone)  body.telefone = telefone;
      if (cursosStr) body.cursos   = JSON.parse(cursosStr);
      if (fotoUrl)   body.fotoUrl  = fotoUrl;

      const res = await fetchComRetry(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let dados: any;
      try {
        dados = await res.json();
      } catch {
        throw new Error('Serviço temporariamente indisponível. Tente novamente em instantes.');
      }

      if (!res.ok || !dados.url) {
        throw new Error(dados.erro || 'Não foi possível iniciar o pagamento.');
      }

      // Abre checkout do Stripe no navegador
      await WebBrowser.openAuthSessionAsync(dados.url, 'kavclass://pagamento-sucesso');

      // Verifica pagamento após o browser fechar
      await verificarSessao(dados.sessionId, plano, codigoConvite || '');

    } catch (err: any) {
      Alert.alert('Erro no pagamento', err.message || 'Tente novamente em instantes.');
    } finally {
      setCarregando(null);
      // Limpa a senha temporária independente do resultado
      await SecureStore.deleteItemAsync('kav_reg_senha').catch(() => {});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: CORES.fundo }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor={CORES.fundo} />

      <TouchableOpacity style={styles.voltarBtn} onPress={() => router.replace('/login')}>
        <Ionicons name="arrow-back" size={22} color={CORES.primaria} />
        <Text style={styles.voltarTexto}>Login</Text>
      </TouchableOpacity>

    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>K</Text>
        </View>
        <Text style={styles.logoNome}>KAV Class</Text>
      </View>

      <Text style={styles.titulo}>Escolha seu plano</Text>
      <Text style={styles.subtitulo}>
        Escolha um plano para continuar usando o KAV Class. Cancele quando quiser.
      </Text>

      {codigoConvite ? (
        <View style={styles.codigoContainer}>
          <Ionicons name="gift-outline" size={16} color={CORES.acento} />
          <Text style={styles.codigoLabel}>SEU CÓDIGO DE CONVITE</Text>
          <Text style={styles.codigoValor}>{codigoConvite}</Text>
        </View>
      ) : null}

      {PLANOS.map((plano) => (
        <View
          key={plano.id}
          style={[styles.card, plano.recomendado && styles.cardDestaque]}
        >
          {plano.recomendado && (
            <LinearGradient
              colors={[CORES.acento, '#28a99c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badgeRecomendado}
            >
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.badgeTexto}>RECOMENDADO</Text>
            </LinearGradient>
          )}

          <View style={styles.cardTopo}>
            <View>
              <Text style={[styles.planNome, plano.recomendado && styles.planNomeDestaque]}>
                {plano.nome}
              </Text>
              <Text style={styles.planDescricao}>{plano.descricao}</Text>
            </View>
            <View style={styles.precoWrap}>
              <Text style={[styles.preco, plano.recomendado && styles.precoDestaque]}>
                {plano.preco}
              </Text>
              <Text style={styles.periodo}>{plano.periodo}</Text>
            </View>
          </View>

          <View style={[styles.divider, plano.recomendado && styles.dividerDestaque]} />

          {plano.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={CORES.acento} />
              <Text style={[styles.featureTexto, plano.recomendado && styles.featureTextoDestaque]}>
                {f}
              </Text>
            </View>
          ))}

          <TouchableOpacity
            style={[
              styles.btn,
              plano.recomendado ? styles.btnDestaque : styles.btnNormal,
              (carregando !== null || verificando) && styles.btnDisabled,
            ]}
            onPress={() => iniciarCheckout(plano.id)}
            disabled={carregando !== null || verificando}
            activeOpacity={0.85}
          >
            {carregando === plano.id || verificando ? (
              <>
                <SyncLoader color={plano.recomendado ? '#fff' : CORES.acento} size="small" style={{ marginRight: 8 }} />
                <Text style={[styles.btnTexto, plano.recomendado ? styles.btnTextoDestaque : styles.btnTextoNormal]}>
                  {verificando ? 'Verificando...' : 'Aguarde...'}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="flash" size={16} color={plano.recomendado ? '#fff' : CORES.acento} style={{ marginRight: 6 }} />
                <Text style={[styles.btnTexto, plano.recomendado ? styles.btnTextoDestaque : styles.btnTextoNormal]}>
                  Assinar Agora
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ))}

      {incluiOnline && (
        <View style={styles.avisoOnline}>
          <Ionicons name="information-circle-outline" size={16} color={CORES.secundaria} />
          <Text style={styles.avisoOnlineTexto}>
            O plano Completo (Rede Social) para modalidade 100% online ainda está em desenho.
          </Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  scroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },

  voltarBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 40,
    left: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  voltarTexto: {
    color: CORES.primaria,
    fontSize: 15,
    fontWeight: '600',
  },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, marginTop: Platform.OS === 'ios' ? 52 : 44 },
  logoBadge: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: CORES.acento,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  logoText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoNome: { color: CORES.primaria, fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },

  titulo: { color: CORES.primaria, fontSize: 26, fontWeight: 'bold', marginBottom: 6 },
  subtitulo: { color: CORES.secundaria, fontSize: 14, marginBottom: 24, lineHeight: 20 },

  codigoContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CORES.acentoClaro, borderRadius: 10, paddingVertical: 10,
    paddingHorizontal: 16, marginBottom: 24, borderWidth: 1, borderColor: '#b2ece7',
  },
  codigoLabel: { color: CORES.acento, fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, flex: 1 },
  codigoValor: { color: CORES.primaria, fontSize: 16, fontWeight: 'bold', letterSpacing: 3, fontFamily: 'monospace' },

  card: {
    backgroundColor: CORES.superficie, borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: CORES.borda, overflow: 'hidden',
  },
  cardDestaque: {
    borderColor: CORES.acento, borderWidth: 2, backgroundColor: '#fff',
  },

  badgeRecomendado: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, marginBottom: 14,
  },
  badgeTexto: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5 },

  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  planNome: { color: CORES.secundaria, fontSize: 13, fontWeight: 'bold', letterSpacing: 2 },
  planNomeDestaque: { color: CORES.acento },
  planDescricao: { color: CORES.secundaria, fontSize: 12, marginTop: 2, maxWidth: 160 },

  precoWrap: { alignItems: 'flex-end' },
  preco: { color: CORES.primaria, fontSize: 22, fontWeight: 'bold' },
  precoDestaque: { color: CORES.acento },
  periodo: { color: CORES.secundaria, fontSize: 12, marginTop: 1 },

  divider: { height: 1, backgroundColor: CORES.borda, marginBottom: 14 },
  dividerDestaque: { backgroundColor: '#d4f5f2' },

  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  featureTexto: { color: CORES.secundaria, fontSize: 13, flex: 1 },
  featureTextoDestaque: { color: CORES.primaria },

  btn: {
    borderRadius: 10, padding: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', marginTop: 10, height: 50,
  },
  btnNormal: { borderWidth: 2, borderColor: CORES.acento },
  btnDestaque: { backgroundColor: CORES.acento },
  btnDisabled: { opacity: 0.55 },
  btnTexto: { fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 },
  btnTextoNormal: { color: CORES.acento },
  btnTextoDestaque: { color: '#fff' },

  avisoOnline: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: CORES.superficie, borderRadius: 10, borderWidth: 1, borderColor: CORES.borda,
    padding: 14, marginBottom: 16,
  },
  avisoOnlineTexto: { flex: 1, color: CORES.secundaria, fontSize: 12, lineHeight: 17 },
});
