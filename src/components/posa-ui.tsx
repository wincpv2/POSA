import type { ReactNode } from 'react';
import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from './posa-theme';

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.surface, style]}>{children}</View>;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={[ui.pageIntro, width < 640 && ui.pageIntroCompact]}>
      <View style={ui.pageIntroCopy}>
        <Text style={ui.eyebrow}>{eyebrow}</Text>
        <Text style={ui.pageTitle}>{title}</Text>
        <Text style={ui.pageDescription}>{description}</Text>
      </View>
      {badge ? <Pill label={badge} /> : null}
    </View>
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={ui.sectionTitleRow}>
      <View style={ui.sectionTitleCopy}>
        <Text style={ui.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={ui.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Pill({
  label,
  tone = 'mint',
}: {
  label: string;
  tone?: 'mint' | 'rose' | 'amber' | 'blue' | 'neutral';
}) {
  return (
    <View style={[ui.pill, pillTones[tone]]}>
      <View style={[ui.pillDot, pillDots[tone]]} />
      <Text style={[ui.pillText, pillTexts[tone]]}>{label}</Text>
    </View>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'mint',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'mint' | 'rose' | 'blue';
}) {
  return (
    <Surface style={ui.metricCard}>
      <Text style={ui.metricLabel}>{label}</Text>
      <Text style={[ui.metricValue, metricTones[tone]]}>{value}</Text>
      <Text style={ui.metricDetail}>{detail}</Text>
    </Surface>
  );
}

export function AppButton({
  children,
  href,
  onPress,
  variant = 'primary',
  disabled = false,
  compact = false,
  style,
}: {
  children: ReactNode;
  href?: Href;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const buttonStyle = [
    ui.button,
    buttonVariants[variant],
    compact && ui.buttonCompact,
    disabled && ui.buttonDisabled,
    style,
  ];
  const handlePress = () => {
    onPress?.();
    if (href) router.push(href);
  };

  return (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      disabled={disabled}
      onPress={onPress || href ? handlePress : undefined}
      style={({ pressed }) => StyleSheet.flatten([
        ...buttonStyle,
        pressed && !disabled && ui.buttonPressed,
      ])}>
      {children}
    </Pressable>
  );
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <Text style={ui.formLabel}>{children}</Text>;
}

export const ui = StyleSheet.create({
  surface: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    boxShadow: '0 8px 24px -4px rgba(6, 90, 130, 0.08), 0 2px 6px -1px rgba(6, 90, 130, 0.04)',
    elevation: 2,
  },
  pageIntro: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 18,
    marginBottom: 10,
  },
  pageIntroCopy: { flex: 1, minWidth: 0, gap: 5 },
  pageIntroCompact: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  eyebrow: {
    color: colors.mint,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  pageDescription: { color: colors.textSoft, fontSize: 14, lineHeight: 21, maxWidth: 720 },
  sectionTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitleCopy: { flex: 1, minWidth: 120, gap: 4 },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  sectionSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.55 },
  metricCard: { flex: 1, minWidth: 145, minHeight: 116, justifyContent: 'space-between' },
  metricLabel: { color: colors.textSoft, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.4 },
  metricValue: { fontSize: 30, lineHeight: 36, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricDetail: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  button: {
    minHeight: 46,
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonCompact: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9 },
  buttonDisabled: { opacity: 0.42 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonLabel: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  formLabel: { color: colors.textSoft, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.4 },
});

const pillTones = StyleSheet.create({
  mint: { backgroundColor: colors.mintSoft },
  rose: { backgroundColor: colors.roseSoft },
  amber: { backgroundColor: colors.amberSoft },
  blue: { backgroundColor: colors.cyanSoft },
  neutral: { backgroundColor: colors.panelRaised },
});
const pillDots = StyleSheet.create({
  mint: { backgroundColor: colors.mint },
  rose: { backgroundColor: colors.rose },
  amber: { backgroundColor: colors.amber },
  blue: { backgroundColor: colors.cyan },
  neutral: { backgroundColor: colors.muted },
});
const pillTexts = StyleSheet.create({
  mint: { color: colors.mint },
  rose: { color: colors.rose },
  amber: { color: colors.amber },
  blue: { color: colors.cyan },
  neutral: { color: colors.textSoft },
});
const metricTones = StyleSheet.create({
  mint: { color: colors.mint },
  rose: { color: colors.rose },
  blue: { color: colors.cyan },
});
const buttonVariants = StyleSheet.create({
  primary: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  secondary: { backgroundColor: colors.panelRaised, borderColor: colors.border },
  quiet: { backgroundColor: 'transparent', borderColor: colors.border },
  danger: { backgroundColor: colors.roseSoft, borderColor: colors.rose },
});
