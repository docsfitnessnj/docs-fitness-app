import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';

// Brand colors only, as literal hex — deliberately not `colors.background`,
// which is a slightly different off-white than the cream called for here.
const PARTICLE_COLORS = ['#076652', '#0B7F66', '#E5B80B', '#FFD520', '#F5F1E6', '#FFFFFF'];

// Four staggered waves so confetti keeps arriving instead of dumping all at
// once — each wave's pieces get its `delay` plus a little per-piece jitter.
const WAVES = [
  { count: 150, delay: 0 },
  { count: 120, delay: 500 },
  { count: 100, delay: 1000 },
  { count: 70, delay: 1800 },
];

type Particle = {
  id: number;
  left: number;
  color: string;
  width: number;
  height: number;
  duration: number;
  delay: number;
  spawnOffset: number;
  rotateDeg: number;
  swayA: number;
  swayB: number;
  drift: number;
};

function buildParticles(spanWidth: number): Particle[] {
  const particles: Particle[] = [];
  let id = 0;
  for (const wave of WAVES) {
    for (let i = 0; i < wave.count; i++) {
      particles.push({
        id: id++,
        left: Math.random() * spanWidth,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        width: 5 + Math.random() * 7,
        height: 8 + Math.random() * 9,
        // Varied fall speeds — some pieces take noticeably longer than others.
        duration: 1500 + Math.random() * 1300,
        delay: wave.delay + Math.random() * 180,
        // Spawns above the visible top edge so it drifts into view rather
        // than popping in right at the boundary.
        spawnOffset: 30 + Math.random() * 90,
        rotateDeg: 180 + Math.random() * 720,
        // Two sway keyframes so the horizontal path curves side to side
        // instead of drifting in a single straight diagonal.
        swayA: (Math.random() - 0.5) * 70,
        swayB: (Math.random() - 0.5) * 70,
        drift: (Math.random() - 0.5) * 60,
      });
    }
  }
  return particles;
}

function ConfettiPiece({ particle, fallDistance }: { particle: Particle; fallDistance: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: particle.duration,
      delay: particle.delay,
      // Gravity: starts slow, accelerates toward the bottom.
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-particle.spawnOffset, fallDistance],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.35, 0.7, 1],
    outputRange: [0, particle.swayA, particle.swayB, particle.drift],
  });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${particle.rotateDeg}deg`] });
  // Pieces stay fully opaque for almost the whole fall and only fade out
  // right at the very bottom edge, so the screen stays full throughout.
  const opacity = progress.interpolate({ inputRange: [0, 0.94, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: particle.left,
        top: 0,
        width: particle.width,
        height: particle.height,
        backgroundColor: particle.color,
        borderRadius: 1.5,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

// A full-screen falling confetti celebration — mount it once and let all
// four waves run; the parent controls how long it stays on screen (it
// doesn't unmount itself). Spans the full width, top edge to bottom edge.
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
        <ConfettiPiece key={p.id} particle={p} fallDistance={height + 40} />
      ))}
    </View>
  );
}
