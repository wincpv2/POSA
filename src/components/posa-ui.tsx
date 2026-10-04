import type { ReactNode } from 'react';
import { useState } from 'react';
import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as NativeText, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import { colors, fonts } from './posa-theme';

export function PosaText({ style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = flattened?.fontWeight;
  const fontFamily = weight === '800' || weight === '900' ? fonts.extraBold : weight === '700' || weight === 'bold' ? fonts.bold : weight === '600' ? fonts.semibold : fonts.regular;
  return <NativeText {...props} style={[{ fontFamily }, style]} />;
}

export function GlassPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.glassPanel, style]}><View pointerEvents="none" style={ui.frostTint} />{children}</View>;
}

export function PageIntro({ eyebrow, title, description, badge }: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <View style={ui.pageIntro}>
      <PosaText style={ui.eyebrow}>{eyebrow}</PosaText>
      <PosaText style={ui.pageTitle}>{title}</PosaText>
      <PosaText style={ui.pageDescription}>{description}</PosaText>
      {badge ? <PosaText style={ui.badge}>{badge}</PosaText> : null}
    </View>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={ui.sectionTitleRow}>
      <View style={ui.sectionTitleCopy}>
        <PosaText style={ui.sectionTitle}>{title}</PosaText>
        {subtitle ? <PosaText style={ui.sectionSubtitle}>{subtitle}</PosaText> : null}
      </View>
    </View>
  );
}

export function DetailsDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={ui.disclosure}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={ui.disclosureButton}>
        <PosaText style={ui.disclosureTitle}>{title}</PosaText>
        <PosaText style={ui.disclosureMark}>{open ? '-' : '+'}</PosaText>
      </Pressable>
      {open ? <View style={ui.disclosureContent}>{children}</View> : null}
    </View>
  );
}

export function AppButton({ children, href, onPress, variant = 'primary', disabled = false, compact = false, style }: {
  children: ReactNode;
  href?: Href;
  onPress?: () => void;
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const handlePress = () => {
    onPress?.();
    if (href) router.push(href);
  };
  return (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      disabled={disabled}
      onPress={onPress || href ? handlePress : undefined}
      style={({ pressed }) => [ui.button, ui[variant], compact && ui.buttonCompact, disabled && ui.buttonDisabled, pressed && !disabled && ui.buttonPressed, style]}>
      {children}
    </Pressable>
  );
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <PosaText style={ui.formLabel}>{children}</PosaText>;
}

export const ui = StyleSheet.create({
  pageIntro: { gap: 8, marginBottom: 12 },
  eyebrow: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
  pageTitle: { color: colors.text, fontSize: 28, lineHeight: 32, fontWeight: '700' },
  pageDescription: { color: colors.textSoft, fontSize: 14, lineHeight: 21, maxWidth: 720 },
  badge: { color: colors.textSoft, fontSize: 14, lineHeight: 21 },
  sectionTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  sectionTitleCopy: { flex: 1, minWidth: 120, gap: 4 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  sectionSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  disclosure: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 8 },
  disclosureButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  disclosureTitle: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
  disclosureMark: { color: colors.cyan, fontSize: 16, fontWeight: '600' },
  disclosureContent: { gap: 16, paddingTop: 12 },
  button: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start', cursor: 'pointer', userSelect: 'none' } as never,
  buttonCompact: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 14 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  primary: { backgroundColor: colors.accent, borderRadius: 999 },
  quiet: { backgroundColor: 'transparent' },
  formLabel: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  glassPanel: { position: 'relative', overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glassBase, padding: 16 },
  frostTint: { ...StyleSheet.absoluteFill, backgroundColor: colors.panel, borderRadius: 22 },
});

// Horizontal tap position inside the pressed element. On web, locationX is
// sometimes missing (depends on which child got the event); offsetX is the
// browser's equivalent. Returns null when neither is a usable number.
export function pressX(event: { nativeEvent: { locationX?: number; offsetX?: number } }): number | null {
  const { locationX, offsetX } = event.nativeEvent;
  if (typeof locationX === 'number' && Number.isFinite(locationX)) return locationX;
  if (typeof offsetX === 'number' && Number.isFinite(offsetX)) return offsetX;
  return null;
}
