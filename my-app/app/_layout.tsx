import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ContaProvider } from './_contaContexto';

export default function RootLayout() {
  return (
    <ContaProvider>
      <StatusBar style="light" backgroundColor="#d5d5d5ff" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(professor)" />
        <Stack.Screen name="(aluno)" />
        <Stack.Screen name="esqueceu-senha" />
        <Stack.Screen name="redefinir-senha" />
        <Stack.Screen name="perfil-publico" />
      </Stack>
    </ContaProvider>
  );
}