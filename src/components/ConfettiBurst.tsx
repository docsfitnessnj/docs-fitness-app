import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme';

// Brand colors only — green, gold, and the app's cream background.
const PARTICLE_COLORS = [colors.green, colors.gold, colors.background];
const PARTICLE_COUNT = 28;

type Particle = {
  id: number;
  left: number;
  color: string;
  width: number;
  height: number;
  duration: number;
  delay: number;
  rotateDeg: number;
  drift: number;
};

function buildParticles(spanWidth: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * spanWidth,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    width: 5 + Math.random() * 5,
    height: 9 + Math.random() * 7,
    duration: 1700 + Math.random() * 1300,
    delay: Math.random() * 450,
    rotateDeg: 180 + Math.random() * 540,
    drift: (Math.random() - 0.5) * 100,
  }));
}

function ConfettiPiece({ particle, fallDistance }: { particle: Particle; fallDistance: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: particle.duration,
      delay: particle.delay,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-20, fallDistance] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.drift] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${particle.rotateDeg}deg`] });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: particle.left,
        top: 0,
        width: particle.width,
        height: particle.height,
        backgroundColor: particle.color,
        borderRadius: 2,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

// A single confetti burst — mount it once and let it fall; the parent
// controls how long it stays on screen (it doesn't unmount itself).
export function ConfettiBurst() {
  const { width, height } = useWindowDimensions();
  const particles = useRef(buildParticles(width)).current;

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      pointerEvents="none"
      testID="confetti-burst"
    >
      {particles.map((p) => (
        <ConfettiPiece key={p.id} particle={p} fallDistance={height + 20} />
      ))}
    </View>
  );
}
