import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { ModalHeader } from '../components/ModalHeader';
import { LOCATION_CITY, LOCATION_NAME, SCHEDULE } from '../data/schedule';
import { openLocationMaps } from '../lib/links';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FullScheduleScreen({ visible, onClose }: Props) {
  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ModalHeader title="BOATHOUSE SCHEDULE" onBack={onClose} backTestID="close-full-schedule" />

        <ScrollView contentContainerStyle={styles.body}>
          {SCHEDULE.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.rows.length > 0 ? (
                <View style={styles.card}>
                  {section.rows.map((row, index) => (
                    <View key={row.id} style={[styles.row, index === section.rows.length - 1 && styles.rowLast]}>
                      <Text style={styles.time}>{row.time}</Text>
                      <View style={styles.rowMain}>
                        <Text style={styles.className}>{row.className}</Text>
                        <Text style={styles.classType}>{row.classType}</Text>
                      </View>
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

          <Pressable style={styles.locationCard} onPress={openLocationMaps} testID="full-schedule-location">
            <Ionicons name="location-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationName}>{LOCATION_NAME}</Text>
              <Text style={styles.locationCity}>{LOCATION_CITY} · Get directions</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
          </Pressable>
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
  rowMain: {
    flex: 1,
  },
  className: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  classType: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
    marginTop: 1,
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
