import * as SecureStore from 'expo-secure-store';

export const BASE_URL = "https://kav-class-1.onrender.com";
const API_URL = `${BASE_URL}/api`;

// Retry com backoff exponencial para suportar cold start do Render
async function fetchComRetry(
  url: string,
  options: RequestInit = {},
  tentativas = 3,
  delayMs = 3000,
  timeoutMs = 60000,
): Promise<Response> {
  for (let i = 0; i < tentativas; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resposta = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return resposta;
    } catch (erro) {
      clearTimeout(timer);
      if (i === tentativas - 1) throw erro;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error('Falha na conexão após múltiplas tentativas.');
}

export const apiFetch = async (endpoint: string, options: any = {}) => {
  const token = await SecureStore.getItemAsync('kav_token');

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetchComRetry(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  });
};

export { fetchComRetry };
