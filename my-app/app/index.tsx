import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export default function Index() {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.75)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Navega uma única vez, seja pelo fim "de verdade" da animação (nativo)
    // ou pelo temporizador de segurança abaixo — no React Native Web, sem
    // useNativeDriver, o callback de Animated.parallel().start() às vezes
    // nunca dispara, e a splash travava para sempre nessa tela.
    let navegou = false;
    const navegar = () => {
      if (navegou) return;
      navegou = true;
      router.replace('/login');
    };

    // Entrance animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold logo for a moment, then fade out
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 400,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(navegar);
      }, 1200);
    });

    const seguranca = setTimeout(navegar, 2600);
    return () => clearTimeout(seguranca);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <Animated.Image
        source={require('@/assets/images/kavclass.png')}
        style={[styles.logo, { opacity, transform: [{ scale }, { translateY }] }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 350,
    height: 350,
  },
});
