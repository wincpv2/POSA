import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';
import { PosaMark } from './posa-logo';

// Verbatim disclaimers from the backend/auth course guide (see posa.md
// "Security & medical-app compliance").
export const SHORT_DISCLAIMER = 'แอปพลิเคชันนี้ใช้สำหรับการศึกษาทางวิศวกรรมชีวการแพทย์เท่านั้น';
export const FULL_DISCLAIMER = 'ระบบช่วยวิเคราะห์ด้วย AI เพื่อการสาธิตและการศึกษาทางวิศวกรรมชีวการแพทย์เท่านั้น ไม่ใช่เครื่องมือทดแทนการวินิจฉัยหรือการตัดสินใจโดยบุคลากรทางการแพทย์';

// Frame for the screens shown before sign-in (role choice, patient access,
// shared result): same gradient and brand as the clinician shell.
export function PublicScreen({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.root}>
      <LinearGradient pointerEvents="none" colors={[colors.background, colors.gradientEnd]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          ) : <View style={styles.back} />}
          <View style={styles.brand}><PosaMark size={26} /><Text style={styles.brandName}>POSA</Text><Text style={styles.brandSub}>Sleep lab</Text></View>
          <View style={styles.back} />
        </View>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: colors.background },
  page: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandName: { color: colors.text, fontSize: 20, fontWeight: '800' }, brandSub: { color: colors.text, fontSize: 14 },
  content: { flex: 1, justifyContent: 'center', gap: 16, paddingTop: 12 },
});
