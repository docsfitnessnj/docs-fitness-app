import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';

export type FaqItem = {
  key: string;
  question: string;
  // Plain copy for every question but one -- WHERE IS THE GYM? needs part
  // of its own answer (the address) to stay a real tappable link to Google
  // Maps, so that single item supplies a render function instead of a bare
  // string.
  answer: string | (() => React.ReactNode);
};

type Props = {
  items: FaqItem[];
  defaultOpenKey?: string | null;
};

// One open at a time -- tapping the already-open row's own question
// closes it rather than leaving it stuck open with nothing else able to
// expand, same as any other single-select accordion in this app.
export function FaqAccordion({ items, defaultOpenKey = null }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(defaultOpenKey);

  return (
    <View testID="about-faq-accordion">
      {items.map((item) => {
        const open = item.key === openKey;
        return (
          <Pressable
            key={item.key}
            style={styles.row}
            onPress={() => setOpenKey(open ? null : item.key)}
            testID={`about-faq-${item.key}`}
          >
            <View style={styles.questionRow}>
              <Text style={styles.question}>{item.question}</Text>
              <Ionicons name={open ? 'remove' : 'add'} size={20} color={colors.gold} />
            </View>
            {open && (
              <View style={styles.answerWrap} testID={`about-faq-${item.key}-answer`}>
                {typeof item.answer === 'string' ? (
                  <Text style={styles.answer}>{item.answer}</Text>
                ) : (
                  item.answer()
                )}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  question: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  answerWrap: {
    marginTop: 12,
  },
  answer: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
});
