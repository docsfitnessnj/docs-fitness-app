import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConfettiBurst } from './ConfettiBurst';
import { useMembership } from '../context/MembershipContext';
import { useTour } from '../context/TourContext';
import { colors, fonts } from '../theme';

// Shown once, right after a real paid purchase (never the free trial, never
// Drop In — see MembershipContext's justPurchased flag). Blocks the app
// underneath until GET STARTED is tapped, so the spotlight tour (which
// starts as soon as the Community tab mounts) is only ever seen after this
// celebration is dismissed.
export function PurchaseCelebrationOverlay() {
  const { justPurchased, clearJustPurchased } = useMembership();
  const tour = useTour();

  if (!justPurchased) return null;

  const handleGetStarted = () => {
    clearJustPurchased();
    tour.start();
  };

  return (
    <View style={styles.root} testID="purchase-celebration">
      <ConfettiBurst />
      <View style={styles.card}>
        <Text style={styles.title}>WELCOME TO DOC'S FITNESS</Text>
        <Text style={styles.subtitle}>You're in. Time to get to work.</Text>
        <Pressable style={styles.button} onPress={handleGetStarted} testID="celebration-get-started">
          <Text style={styles.buttonText}>GET STARTED</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 30,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 26,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 40,
    paddingVertical: 15,
  },
  buttonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
