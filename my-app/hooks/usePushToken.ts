import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const API_URL = 'https://kav-class-1.onrender.com';

// Configuração global: como exibir notificações enquanto o app está aberto
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registra o token de push do dispositivo no backend.
 * Deve ser chamado dentro dos layouts autenticados (professor e aluno).
 */
export function usePushToken() {
  useEffect(() => {
    registrarPushToken();
  }, []);
}

async function registrarPushToken() {
  try {
    // Android: cria o canal de notificações
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('kav-class', {
        name: 'KAV Class',
        description: 'Cobranças, lembretes e informações de aulas',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#32BCAD',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
        enableLights: true,
        enableVibrate: true,
        sound: 'default',
      });
    }

    // Solicita permissão
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permissão de notificação negada pelo usuário.');
      return;
    }

    // Obtém o token Expo
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '64029ca0-5e06-44fa-aaa6-b76d0a40635c',
    });
    const expoPushToken = tokenData.data;

    // Recupera credenciais do usuário
    const userId = await SecureStore.getItemAsync('kav_professor_id') ||
                   await SecureStore.getItemAsync('kav_aluno_id');
    const papel = await SecureStore.getItemAsync('kav_papel');
    const token = await SecureStore.getItemAsync('kav_token');

    if (!userId || !papel || !token) return;

    // Envia o token para o backend
    await fetch(`${API_URL}/api/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, papel, expoPushToken }),
    });

    console.log('[Push] Token registrado com sucesso:', expoPushToken);
  } catch (err) {
    console.error('[Push] Erro ao registrar token:', err);
  }
}
