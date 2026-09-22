import * as LocalAuthentication from 'expo-local-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import { BASE_URL, fetchComRetry } from './api';
import { Ionicons } from '@expo/vector-icons';
import GoogleButton from '../components/GoogleButton';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { CORES, EMPRESA, RAIO } from '../constants/theme';
import { ERP_BREAKPOINT_DESKTOP } from '../constants/erpTheme';

const API_URL = BASE_URL;

// O login por biometria não passa pelo /api/login (que já bloqueia teste
// vencido/sem assinatura), então precisa checar isso aqui antes de liberar
// a entrada direto no app com o token já salvo no aparelho.
async function checarAssinaturaProfessorBloqueada() {
  try {
    const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${API_URL}/api/professor/assinatura/${professorId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const dados = await res.json();

    const testeVencido = dados.assinaturaStatus === 'TESTE' &&
      dados.assinaturaFim && new Date(dados.assinaturaFim) <= new Date();
    const semAssinatura = ['PENDENTE', 'INATIVO', 'CANCELADO'].includes(dados.assinaturaStatus);

    if (testeVencido || semAssinatura) {
      return {
        professorId, email: dados.email, codigoConvite: dados.codigoConvite,
        pacote: dados.pacote, modalidadeEnsino: dados.modalidadeEnsino,
      };
    }
    return null;
  } catch {
    // Sem conexão: não trava o professor fora do app por causa disso.
    return null;
  }
}

// Campo com rótulo flutuante e sublinhado — foca em teal, erra em vermelho.
// Fica local ao arquivo porque o padrão (label + underline + estado de
// foco) é específico dessa tela; o resto do app usa o input em caixa.
type CampoProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPressRightIcon?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: 'next' | 'done';
};

function Campo({
  label, value, onChangeText, secureTextEntry, keyboardType = 'default',
  autoCapitalize = 'sentences', rightIcon, onPressRightIcon, onSubmitEditing, returnKeyType,
}: CampoProps) {
  const [focado, setFocado] = useState(false);
  const ativo = focado || value.length > 0;

  return (
    <View style={styles.campoWrap}>
      <Text style={[styles.campoLabel, ativo && styles.campoLabelAtivo]}>
        {label}
      </Text>
      <View style={styles.campoLinha}>
        <TextInput
          style={styles.campoInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocado(true)}
          onBlur={() => setFocado(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
        />
        {rightIcon && (
          <TouchableOpacity onPress={onPressRightIcon} hitSlop={10}>
            <Ionicons name={rightIcon} size={19} color={CORES.secundaria} />
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.campoSublinhado, focado && styles.campoSublinhadoAtivo]} />
    </View>
  );
}

function Wordmark({ claro, grande }: { claro?: boolean; grande?: boolean }) {
  return (
    <View style={styles.wordmark}>
      <Text style={[styles.wordmarkKav, grande && styles.wordmarkKavGrande, claro && styles.wordmarkKavClaro]}>KAV</Text>
      <Text style={[styles.wordmarkClass, grande && styles.wordmarkClassGrande, claro && styles.wordmarkClassClaro]}>CLASS</Text>
    </View>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [bioDisponivel, setBioDisponivel] = useState(false);
  const [verificandoBio, setVerificandoBio] = useState(false);
  const router = useRouter();
  const { disponivel: googleDisponivel, carregando: carregandoGoogle, entrarComGoogle } = useGoogleAuth();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= ERP_BREAKPOINT_DESKTOP;

  useEffect(() => {
    verificarBiometria();
  }, []);

  const verificarBiometria = async () => {
    try {
      const temHardware = await LocalAuthentication.hasHardwareAsync();
      const inscrito = await LocalAuthentication.isEnrolledAsync();
      const temToken = await SecureStore.getItemAsync('kav_token');
      const temPapel = await SecureStore.getItemAsync('kav_papel');

      // Só mostra o botão — NÃO autentica sozinho. Um Face ID/Touch ID
      // disparado automaticamente ao abrir a tela corre pra dentro da
      // sessão antiga salva no aparelho antes do usuário conseguir digitar
      // outra credencial (ex.: trocar de conta pra testar um login
      // diferente) — precisa ser sempre uma ação explícita do usuário.
      if (temHardware && inscrito && temToken && temPapel) {
        setBioDisponivel(true);
      }
    } catch {
      // Dispositivo sem suporte a biometria — modo normal
    }
  };

  const autenticarComBiometria = async (token?: string, papel?: string) => {
    setVerificandoBio(true);
    try {
      const t = token ?? (await SecureStore.getItemAsync('kav_token'));
      const p = papel ?? (await SecureStore.getItemAsync('kav_papel'));
      if (!t || !p) { setVerificandoBio(false); return; }

      const resultado = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entrar no KAV Class',
        fallbackLabel: 'Usar senha',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (resultado.success) {
        if (p === 'professor') {
          const bloqueio = await checarAssinaturaProfessorBloqueada();
          if (bloqueio) {
            router.replace({
              pathname: '/escolher-plano',
              params: {
                professorId: bloqueio.professorId, email: bloqueio.email, codigoConvite: bloqueio.codigoConvite || '',
                pacote: bloqueio.pacote || '', modalidadeEnsino: (bloqueio.modalidadeEnsino || []).join(','),
              },
            });
          } else {
            router.replace('/(professor)');
          }
        } else {
          router.replace('/(aluno)');
        }
      }
    } catch {
      // falhou — mostra tela de login normal
    } finally {
      setVerificandoBio(false);
    }
  };

  const fazerLogin = async () => {
    const emailDigitado = email.trim().toLowerCase();
    if (!emailDigitado || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    try {
      const resposta = await fetchComRetry(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDigitado, senha: password }),
      });

      const dados = await resposta.json();

      if (resposta.ok) {
        await SecureStore.setItemAsync('kav_token', dados.token);
        await SecureStore.setItemAsync('kav_papel', dados.usuario.papel);
        // vinculos: campo novo (fundação de identidade unificada) — ausente em
        // respostas do backend antigo, por isso o fallback pra '[]'. Guardado
        // pra alimentar o seletor de "Trocar de conta" nos drawers quando a
        // Conta tiver mais de 1 vínculo (ver _contaContexto.tsx).
        await SecureStore.setItemAsync('kav_vinculos', JSON.stringify(dados.vinculos || []));

        if (dados.usuario.papel === 'professor') {
          await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
          router.replace('/(professor)');
        } else if (dados.usuario.papel === 'aluno') {
          await SecureStore.setItemAsync('kav_aluno_id', String(dados.usuario.id));
          router.replace('/(aluno)');
        } else {
          // papel 'conta': login neutro, sem vínculo nenhum ainda — a busca/
          // descoberta que dá sentido a esse estado é a Fase 2 (ainda não
          // tem tela). Não deveria acontecer hoje (nenhuma tela cria Conta
          // neutra), mas não custa não deixar cair silenciosamente em (aluno).
          Alert.alert('Conta sem vínculo', 'Sua conta ainda não está associada a nenhuma escola ou professor.');
        }
      } else if (resposta.status === 403 && dados.assinaturaStatus) {
        Alert.alert(
          'Assinatura necessária',
          dados.erro,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Escolher plano',
              onPress: () => router.replace({
                pathname: '/escolher-plano',
                params: {
                  professorId: dados.professorId, email: dados.email, codigoConvite: dados.codigoConvite || '',
                  pacote: dados.pacote || '', modalidadeEnsino: (dados.modalidadeEnsino || []).join(','),
                },
              }),
            },
          ],
        );
      } else {
        Alert.alert('Erro de Login', dados.erro || 'Falha ao entrar.');
      }
    } catch (erro) {
      console.error('Erro na requisição:', erro);
      Alert.alert('Erro de Conexão', 'Não foi possível falar com o servidor KAV.');
    }
  };

  const formulario = (
    <Animated.View
      entering={FadeInDown.duration(420).springify().damping(18)}
      style={[styles.cartaoForm, desktop && styles.cartaoFormDesktop]}
    >
      {!desktop && <Wordmark />}

      <Text style={styles.tituloForm}>{desktop ? 'Entrar' : 'Acesse sua conta'}</Text>
      {desktop && <Text style={styles.subtituloForm}>Use o e-mail e senha da sua conta KAV Class.</Text>}

      <Campo
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
      />

      <Campo
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!mostrarSenha}
        rightIcon={mostrarSenha ? 'eye-off-outline' : 'eye-outline'}
        onPressRightIcon={() => setMostrarSenha((v) => !v)}
        onSubmitEditing={fazerLogin}
        returnKeyType="done"
      />

      <TouchableOpacity onPress={() => router.push('/esqueceu-senha')} style={styles.linkEsqueceu}>
        <Text style={styles.textoEsqueceu}>Esqueceu a senha?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={fazerLogin} activeOpacity={0.85}>
        <Text style={styles.buttonText}>Entrar</Text>
        <Ionicons name="arrow-forward" size={18} color="#ffffff" />
      </TouchableOpacity>

      {googleDisponivel && (
        <GoogleButton onPress={entrarComGoogle} carregando={carregandoGoogle} />
      )}

      {bioDisponivel && (
        <TouchableOpacity
          style={styles.bioButton}
          onPress={() => autenticarComBiometria()}
          disabled={verificandoBio}
          activeOpacity={0.85}
        >
          <Ionicons name="finger-print-outline" size={22} color={CORES.primaria} />
          <Text style={styles.bioText}>
            {verificandoBio ? 'Verificando...' : 'Entrar com biometria'}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.avisoInstitucional}>
        Já tem login passado pela sua escola? Use o mesmo e-mail e senha que ela te deu — não precisa se cadastrar.
      </Text>

      <TouchableOpacity onPress={() => router.push('/aceitar-convite-professor')}>
        <Text style={styles.textoEsqueceuCentro}>Entrar com convite de escola</Text>
      </TouchableOpacity>

      <View style={styles.rodapeLinha} />

      <Link href="/register" asChild>
        <TouchableOpacity style={styles.linkContainer}>
          <Text style={styles.linkText}>
            Não tem uma conta?{' '}
            <Text style={styles.linkHighlight}>Cadastre-se</Text>
          </Text>
          <Text style={styles.linkSubtexto}>(se sua escola já te deu um login, não precisa cadastrar — é só entrar acima)</Text>
        </TouchableOpacity>
      </Link>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {desktop && (
        <Animated.View entering={FadeIn.duration(500)} style={styles.painelMarca}>
          <LinearGradient
            colors={['#0F1419', '#111A1C', '#0B1416']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[CORES.acento + '55', CORES.acento + '00']}
            start={{ x: 0, y: 1 }}
            end={{ x: 0.7, y: 0.2 }}
            style={styles.painelGlow}
          />

          <View style={styles.painelConteudo}>
            <Wordmark claro grande />

            <View style={styles.painelBase}>
              <View style={styles.painelRegra} />
              <Text style={styles.painelFrase}>{EMPRESA.slogan}.</Text>
              <Text style={styles.painelSubfrase}>
                A plataforma que conecta professores, escolas e alunos em um só lugar.
              </Text>
            </View>
          </View>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={styles.painelForm}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollConteudo, desktop && styles.scrollConteudoDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formulario}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: CORES.fundo,
  },

  // ─── Painel de marca (desktop) ──────────────────────────────────────
  painelMarca: {
    flex: 1,
    maxWidth: 560,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  painelGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  painelConteudo: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 56,
    paddingVertical: 64,
  },
  painelBase: {
    maxWidth: 380,
  },
  painelRegra: {
    width: 44,
    height: 3,
    borderRadius: RAIO.pill,
    backgroundColor: CORES.acento,
    marginBottom: 20,
  },
  painelFrase: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 36,
    marginBottom: 12,
  },
  painelSubfrase: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 21,
  },

  // ─── Painel de formulário ───────────────────────────────────────────
  painelForm: {
    flex: 1,
    backgroundColor: CORES.fundo,
  },
  scrollConteudo: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrollConteudoDesktop: {
    padding: 64,
  },

  cartaoForm: {
    width: '100%',
    maxWidth: 380,
  },
  cartaoFormDesktop: {
    maxWidth: 360,
  },

  // ─── Wordmark ───────────────────────────────────────────────────────
  wordmark: {
    alignItems: 'flex-start',
    marginBottom: 40,
  },
  wordmarkKav: {
    color: CORES.primaria,
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: 6,
  },
  wordmarkKavGrande: {
    fontSize: 32,
    letterSpacing: 10,
  },
  wordmarkKavClaro: {
    color: 'rgba(255,255,255,0.75)',
  },
  wordmarkClass: {
    color: CORES.primaria,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: -2,
  },
  wordmarkClassGrande: {
    fontSize: 58,
    marginTop: -4,
  },
  wordmarkClassClaro: {
    color: '#ffffff',
  },

  tituloForm: {
    color: CORES.primaria,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtituloForm: {
    color: CORES.secundaria,
    fontSize: 14,
    marginBottom: 32,
  },

  // ─── Campo ──────────────────────────────────────────────────────────
  campoWrap: {
    marginBottom: 26,
  },
  campoLabel: {
    color: CORES.secundaria,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  campoLabelAtivo: {
    color: CORES.acento,
  },
  campoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  campoInput: {
    flex: 1,
    color: CORES.primaria,
    fontSize: 16,
    paddingVertical: 8,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
  },
  campoSublinhado: {
    height: 1.5,
    backgroundColor: CORES.borda,
    marginTop: 8,
  },
  campoSublinhadoAtivo: {
    height: 2,
    backgroundColor: CORES.acento,
  },

  linkEsqueceu: {
    alignSelf: 'flex-end',
    marginBottom: 28,
    marginTop: -14,
  },
  textoEsqueceu: {
    color: CORES.secundaria,
    fontSize: 13,
    fontWeight: '500',
  },
  textoEsqueceuCentro: {
    color: CORES.secundaria,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 14,
  },
  avisoInstitucional: {
    color: CORES.secundaria,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 22,
    opacity: 0.85,
  },

  button: {
    flexDirection: 'row',
    width: '100%',
    height: 52,
    backgroundColor: CORES.primaria,
    borderRadius: RAIO.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    height: 52,
    borderRadius: RAIO.sm,
    borderWidth: 1.5,
    borderColor: CORES.borda,
    backgroundColor: CORES.superficie,
  },
  bioText: {
    color: CORES.primaria,
    fontSize: 15,
    fontWeight: '600',
  },

  rodapeLinha: {
    height: 1,
    backgroundColor: CORES.borda,
    marginTop: 28,
    marginBottom: 4,
  },
  linkContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: CORES.secundaria,
    fontSize: 14,
    textAlign: 'center',
  },
  linkHighlight: {
    color: CORES.primaria,
    fontWeight: '700',
  },
  linkSubtexto: {
    color: CORES.secundaria,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.8,
    maxWidth: 300,
  },
});
