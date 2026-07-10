import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#d5d5d5ff" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(professor)" />
        <Stack.Screen name="(aluno)" />
        <Stack.Screen name="esqueceu-senha" />
        <Stack.Screen name="redefinir-senha" />
      </Stack>
    </>
  );
}