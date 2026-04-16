import * as SecureStore from 'expo-secure-store';

const BASE_URL = "http://TEU_IP:3000/api";

export const apiFetch = async (endpoint: string, options: any = {}) => {
  const token = await SecureStore.getItemAsync('kav_token');
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` // O servidor agora exige isto
  };

  return fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers }
  });
};