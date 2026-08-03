import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import { CORES } from '../constants/theme';

type Props = {
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const DIAMETRO = { small: 6, large: 10 } as const;
const ESPACAMENTO = { small: 5, large: 8 } as const;
const DURACAO = 600;

export default function SyncLoader({ size = 'large', color = CORES.acento, style }: Props) {
  const diametro = DIAMETRO[size];
  const valores = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animacoes = valores.map((valor, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * (DURACAO / 3)),
          Animated.timing(valor, {
            toValue: 1,
            duration: DURACAO,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(valor, {
            toValue: 0,
            duration: DURACAO,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * (DURACAO / 3)),
        ])
      )
    );
    Animated.stagger(0, animacoes).start();
    return () => animacoes.forEach(a => a.stop());
  }, [valores]);

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      {valores.map((valor, i) => (
        <Animated.View
          key={i}
          style={{
            width: diametro,
            height: diametro,
            borderRadius: diametro / 2,
            backgroundColor: color,
            marginHorizontal: ESPACAMENTO[size] / 2,
            opacity: valor.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [
              {
                translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [0, -diametro] }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
