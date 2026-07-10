import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

const INFO_PLANO: Record<string, { badge: string; detalhe: string; icone: any }> = {
  pro: {
    badge: 'Plano PRO ativado',
    detalhe: 'R$ 29,98/mês • Até 35 alunos • Cancele quando quiser',
    icone: 'shield-checkmark-outline',
  },
  premium: {
    badge: 'Plano PREMIUM ativado',
    detalhe: 'R$ 59,98/mês • Até 60 alunos • Suporte prioritário',
    icone: 'star-outline',
  },
  'one-time': {
    badge: 'Acesso Vitalício liberado',
    detalhe: 'Pagamento único • Até 70 alunos • Sem mensalidade',
    icone: 'infinite-outline',
  },
};

export default function PagamentoSucessoScreen() {
  const { plano, codigoConvite } = useLocalSearchParams<{
    plano: string;
    codigoConvite: string;
  }>();

  const circleScale  = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(40)).current;
  const contentFade  = useRef(new Animated.Value(0)).current;
  const glowPulse    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(circleScale, {
        toValue: 1, tension: 55, friction: 6, useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1, duration: 250, useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(contentFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(contentSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 1.08, duration: 1400, useNativeDriver: true }),
          Animated.timing(glowPulse, { toValue: 1,    duration: 1400, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  const info = INFO_PLANO[plano] ?? INFO_PLANO['pro'];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* Fundo com gradiente escuro */}
      <LinearGradient
        colors={['#000000', '#0a2622', '#000000']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Círculos decorativos de fundo */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Ícone animado de sucesso */}
        <View style={styles.iconArea}>
          <Animated.View style={[styles.glowRing, { transform: [{ scale: glowPulse }] }]} />
          <Animated.View style={[styles.iconCircle, { transform: [{ scale: circleScale }] }]}>
            <Animated.View style={{ opacity: checkOpacity }}>
              <Ionicons name="checkmark" size={52} color="#fff" />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Texto principal */}
        <Animated.View
          style={[
            styles.mainBlock,
            { opacity: contentFade, transform: [{ translateY: contentSlide }] },
          ]}
        >
          <Text style={styles.muitoBem}>Muito bem!</Text>
          <Text style={styles.bemVindoLabel}>Bem-vindo à</Text>
          <Text style={styles.kavClass}>KAV-CLASS</Text>

          {/* Linha decorativa */}
          <View style={styles.linha}>
            <View style={styles.linhaSegmento} />
            <Ionicons name="star" size={12} color="#32BCAD" style={{ marginHorizontal: 8 }} />
            <View style={styles.linhaSegmento} />
          </View>

          {/* Badge do plano */}
          <View style={styles.planoBadge}>
            <Ionicons name={info.icone} size={17} color="#32BCAD" />
            <Text style={styles.planoBadgeText}>{info.badge}</Text>
          </View>
          <Text style={styles.planoDetalhe}>{info.detalhe}</Text>

          {/* Código de convite */}
          {codigoConvite ? (
            <View style={styles.codigoBox}>
              <Text style={styles.codigoLabel}>SEU CÓDIGO DE CONVITE</Text>
              <Text style={styles.codigoValor}>{codigoConvite}</Text>
              <View style={styles.codigoDivider} />
              <View style={styles.codigoDicaRow}>
                <Ionicons name="people-outline" size={14} color="#32BCAD" />
                <Text style={styles.codigoDica}>
                  Compartilhe com seus alunos para que eles se cadastrem no app.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Cards de features rápidas */}
          <View style={styles.featuresRow}>
            {[
              { icone: 'calendar-outline',   label: 'Calendário' },
              { icone: 'cash-outline',        label: 'Cobranças'  },
              { icone: 'chatbubble-outline',  label: 'Chat'       },
            ].map((f) => (
              <View key={f.label} style={styles.featureCard}>
                <Ionicons name={f.icone as any} size={22} color="#32BCAD" />
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* Botão principal */}
          <TouchableOpacity
            style={styles.btnEntrar}
            onPress={() => router.replace('/login')}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#32BCAD', '#28a99c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Text style={styles.btnTexto}>Acessar meu painel</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  bgCircle1: {
    position: 'absolute', width: width * 1.2, height: width * 1.2,
    borderRadius: width * 0.6, backgroundColor: 'rgba(50,188,173,0.06)',
    top: -width * 0.4, left: -width * 0.1,
  },
  bgCircle2: {
    position: 'absolute', width: width * 0.8, height: width * 0.8,
    borderRadius: width * 0.4, backgroundColor: 'rgba(50,188,173,0.04)',
    bottom: -width * 0.2, right: -width * 0.2,
  },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 48,
    paddingHorizontal: 24,
  },

  // Ícone
  iconArea: { alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  glowRing: {
    position: 'absolute',
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(50,188,173,0.15)',
    borderWidth: 1, borderColor: 'rgba(50,188,173,0.25)',
  },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#32BCAD',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#32BCAD', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 14,
  },

  // Texto principal
  mainBlock: { width: '100%', alignItems: 'center' },

  muitoBem: {
    color: '#32BCAD',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bemVindoLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 1,
    marginBottom: 2,
  },
  kavClass: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 6,
    marginBottom: 20,
  },

  // Linha decorativa
  linha: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 24, width: '60%',
  },
  linhaSegmento: { flex: 1, height: 1, backgroundColor: 'rgba(50,188,173,0.35)' },

  // Plano badge
  planoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(50,188,173,0.12)',
    borderWidth: 1, borderColor: 'rgba(50,188,173,0.3)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    marginBottom: 8,
  },
  planoBadgeText: { color: '#32BCAD', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  planoDetalhe: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12, textAlign: 'center', marginBottom: 28, lineHeight: 18,
  },

  // Código de convite
  codigoBox: {
    width: '100%',
    backgroundColor: 'rgba(50,188,173,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(50,188,173,0.35)',
    borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24,
  },
  codigoLabel: {
    color: '#32BCAD', fontSize: 10, fontWeight: 'bold',
    letterSpacing: 2.5, marginBottom: 10,
  },
  codigoValor: {
    color: '#ffffff', fontSize: 34, fontWeight: 'bold',
    letterSpacing: 8, fontFamily: 'monospace', marginBottom: 14,
  },
  codigoDivider: { width: '80%', height: 1, backgroundColor: 'rgba(50,188,173,0.2)', marginBottom: 12 },
  codigoDicaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '100%' },
  codigoDica: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12, flex: 1, lineHeight: 17,
  },

  // Features
  featuresRow: {
    flexDirection: 'row', gap: 12, marginBottom: 28, width: '100%',
  },
  featureCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6,
  },
  featureLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },

  // Botão
  btnEntrar: {
    width: '100%', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#32BCAD', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, gap: 10,
  },
  btnTexto: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
});
