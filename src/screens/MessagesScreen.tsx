import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { DocThreadView } from '../components/DocThreadView';
import { useDocsInbox } from '../context/DocsInboxContext';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Prefills the draft and surfaces a photo attachment prompt above the
  // input — used by THE JOKER's VERIFY OWNERSHIP flow, which needs Doc to
  // see a photo of the physical deck.
  initialDraft?: string;
};

// A member's one real conversation with Doc — see supabase/setup.sql /
// migration_006.sql for the doc_threads / doc_messages schema this reads
// and writes. Opening this screen marks the thread read, clearing the gold
// unread dot on the MESSAGE DOC hamburger row.
export function MessagesScreen({ visible, onClose, initialDraft }: Props) {
  const inbox = useDocsInbox();

  useEffect(() => {
    if (visible) inbox.markMyThreadRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <ModalHeader title="MESSAGE DOC" onBack={onClose} backTestID="close-messages" />
      <DocThreadView
        messages={inbox.myMessages}
        onSend={inbox.sendMyMessage}
        onUnsend={inbox.unsendMessage}
        initialDraft={initialDraft}
        emptyStateText="Drop your questions here and Doc will get back to you personally."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
});
