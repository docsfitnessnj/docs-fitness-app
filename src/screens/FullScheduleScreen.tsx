import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { LOCATION_CITY, LOCATION_NAME, SCHEDULE } from '../data/schedule';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FullScheduleScreen({ visible, onClose }: Props) {
  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BOATHOUSE SCHEDULE</Text>
          <Pressable onPress={onClose} hitSlop={8} testID="close-full-schedule">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {SCHEDULE.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.rows.length > 0 ? (
                <View style={styles.card}>
                  {section.rows.map((row, index) => (
                    <View key={row.id} style={[styles.row, index === section.rows.length - 1 && styles.rowLast]}>
                      <Text style={styles.time}>{row.time}</Text>
                      <Text style={styles.label}>{row.label}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.note}>{section.note}</Text>
                </View>
              )}
            </View>
          ))}

          <View style={styles.locationCard}>
            <Ionicons name="location-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationName}>{LOCATION_NAME}</Text>
              <Text style={styles.locationCity}>{LOCATION_CITY}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  time: {
    width: 92,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    padding: 16,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.greenDeep,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  locationName: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  locationCity: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
});
