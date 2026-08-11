import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { BASE_URL, fetchComRetry } from '../app/api';

// Necessário para o navegador do OAuth fechar sozinho e resolver a Promise do prompt.
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_IDS = (Constants.expoConfig?.extra?.googleClientIds ?? {}) as {
  web?: string;
  ios?: string;
  android?: string;
};

/**
 * Login com Google compartilhado entre as telas de login e cadastro.
 * Fica indisponível (botão escondido) enquanto os Client IDs não forem configurados.
 *
 * `papelSugerido` é usado só na tela de cadastro (onde o usuário já escolheu
 * "aluno" ou "professor" antes de tocar em "Continuar com Google"), pra pular
 * essa pergunta na tela de completar cadastro.
 */
export function useGoogleAuth(papelSugerido?: 'professor' | 'aluno') {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.web || undefined,
    iosClientId: GOOGLE_CLIENT_IDS.ios || undefined,
    androidClientId: GOOGLE_CLIENT_IDS.android || undefined,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      processarLoginGoogle(response.params.id_token);
    } else if (response?.type === 'error') {
      Alert.alert('Erro', 'Não foi possível entrar com o Google.');
    }
  }, [response]);

  const processarLoginGoogle = async (idToken: string) => {
    setCarregando(true);
    try {
      const resposta = await fetchComRetry(`${BASE_URL}/api/auth/google/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const dados = await resposta.json();

      if (resposta.status === 403 && dados.assinaturaStatus) {
        router.replace({
          pathname: '/escolher-plano',
          params: { professorId: dados.professorId, email: dados.email, codigoConvite: dados.codigoConvite || '' },
        });
        return;
      }

      if (!resposta.ok) {
        Alert.alert('Erro', dados.erro || 'Não foi possível entrar com o Google.');
        return;
      }

      if (dados.existe) {
        await SecureStore.setItemAsync('kav_token', dados.token);
        await SecureStore.setItemAsync('kav_papel', dados.usuario.papel);
        if (dados.usuario.papel === 'professor') {
          await SecureStore.setItemAsync('kav_professor_id', String(dados.usuario.id));
          router.replace('/(professor)');
        } else {
          await SecureStore.setItemAsync('kav_aluno_id', String(dados.usuario.id));
          router.replace('/(aluno)');
        }
        return;
      }

      // Primeira vez com essa conta Google: falta completar o cadastro.
      router.push({
        pathname: '/google-completar-cadastro',
        params: {
          idToken,
          email: dados.email || '',
          nome: dados.nome || '',
          fotoUrl: dados.fotoUrl || '',
          papel: papelSugerido || '',
        },
      });
    } catch {
      Alert.alert('Erro de Conexão', 'Não foi possível falar com o servidor KAV.');
    } finally {
      setCarregando(false);
    }
  };

  return {
    disponivel: !!request,
    carregando,
    entrarComGoogle: () => promptAsync(),
  };
}
