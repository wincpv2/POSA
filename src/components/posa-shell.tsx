import { LinearGradient } from 'expo-linear-gradient';
import { Link, Slot, usePathname } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { PosaText } from './posa-ui';
import { UploadProvider, useUploadState } from './posa-state';
import { colors, navItems } from './posa-theme';
import { useAuth } from '@/lib/auth-context';

function initialsOf(name: string) {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

const icons = {
  home: <Path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  upload: <><Path d="M12 16V4m-5 5 5-5 5 5" /><Path d="M4 17v4h16v-4" /></>,
  processing: <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>,
  detail: <Path d="M3 12h4l3-7 4 14 3-7h4" />,
  summary: <><Path d="M6 3h9l4 4v14H6z" /><Path d="M15 3v5h4M9 12h7M9 16h7" /></>,
} as const;

function NavIcon({ name, color }: { name: keyof typeof icons; color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{icons[name]}</Svg>;
}

function Workspace() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { study } = useUploadState();
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const email = session?.user?.email ?? '';
  const displayName: string = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Clinician';
  const nextRequired = study.status === 'ready' && study.reportStatus === 'Approved' ? null
    : study.status === 'empty' || study.status === 'uploaded' ? '/upload'
      : study.status === 'processing' || study.status === 'failed' ? '/processing'
        : pathname === '/detail' ? '/summary' : '/detail';
  const caseLine = study.studyId
    ? `${study.studyId} · ${study.age ? `${study.age} y` : 'Age unavailable'} · ${study.sex || 'Sex unavailable'} · BMI ${study.bmi || '—'}`
    : 'Clinician workspace · No study selected';

  return <View style={styles.root}>
    <LinearGradient pointerEvents="none" colors={[colors.background, colors.gradientEnd]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
    <StatusBar style="light" />
    <View style={styles.header}>
      <Link href="/" asChild><Pressable accessibilityRole="link" accessibilityLabel="POSA Sleep lab home" style={styles.brand}>
        <PosaText style={styles.moon}>{'\u263e'}</PosaText><PosaText style={styles.brandName}>POSA</PosaText><PosaText style={styles.brandSub}>Sleep lab</PosaText>
      </Pressable></Link>
      <Pressable accessibilityRole="button" accessibilityLabel={`Signed in as ${displayName}. Open account menu`} accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen((open) => !open)} style={[styles.avatar, menuOpen && styles.avatarOpen]}><PosaText style={styles.avatarText}>{initialsOf(displayName)}</PosaText></Pressable>
    </View>
    <View style={[styles.contentTop, width < 500 && styles.contentTopCompact]}>
      <View style={styles.caseChip}>
        <PosaText style={styles.case}>{caseLine}</PosaText>
        {study.severity ? <View style={[styles.severity, study.severity === 'Moderate' && styles.moderate, study.severity === 'Mild / Normal' && styles.mild, study.severity === 'Pending' && styles.pending]}><PosaText style={[styles.severityText, study.severity === 'Pending' && styles.severityLight]}>{study.severity === 'Severe OSA' ? '▲' : study.severity === 'Moderate' ? '◆' : study.severity === 'Mild / Normal' ? '✓' : '○'} {study.severity}</PosaText></View> : null}
      </View>
      <View style={styles.notice}><PosaText style={styles.noticeText}>Uploads are stored securely. Clinical analysis and PDF export are not connected yet.</PosaText></View>
    </View>
    <View style={styles.route}><Slot /></View>
    <View pointerEvents="box-none" style={styles.dockAnchor}>
      <View accessibilityRole="list" accessibilityLabel="Main navigation" style={[styles.dock, Platform.OS === 'web' && ({ backdropFilter: 'blur(18px)' } as unknown as ViewStyle)]}>
        {navItems.map((item) => {
          const active = pathname === item.href;
          const blocked = (item.href === '/processing' && study.status === 'empty')
            || ((item.href === '/detail' || item.href === '/summary') && study.status !== 'ready');
          const done = item.href === '/' ? true
            : item.href === '/upload' ? study.status !== 'empty'
            : item.href === '/processing' ? study.status === 'ready'
              : item.href === '/detail' ? study.status === 'ready' && (pathname === '/summary' || study.reportStatus !== 'Draft')
                : item.href === '/summary' ? study.reportStatus === 'Approved' : false;
          const upcoming = item.href === nextRequired;
          const iconName = item.href === '/' ? 'home' : item.href.slice(1) as keyof typeof icons;
          const label = active ? `${item.label}, current` : done ? `${item.label}, done` : upcoming ? `${item.label}, next required` : `${item.label}, upcoming`;
          return <Link key={item.href} href={blocked ? pathname as never : item.href} asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ selected: active, disabled: blocked }} disabled={blocked} style={StyleSheet.flatten([styles.navButton, active && styles.navActive])}>
              <NavIcon name={iconName} color={active ? colors.accentText : colors.text} />
              {done && !active ? <PosaText style={styles.homeDone}>✓</PosaText> : null}
              {active ? <PosaText style={styles.navLabel}>{item.label}</PosaText> : upcoming && !done ? <View style={styles.nextDot} /> : null}
            </Pressable>
          </Link>;
        })}
      </View>
    </View>
    {menuOpen ? <AccountMenu name={displayName} email={email} onClose={() => setMenuOpen(false)} onSignOut={() => { setMenuOpen(false); void signOut(); }} /> : null}
  </View>;
}

function AccountMenu({ name, email, onClose, onSignOut }: { name: string; email: string; onClose: () => void; onSignOut: () => void }) {
  return <>
    <Pressable accessibilityLabel="Close account menu" onPress={onClose} style={styles.menuBackdrop} />
    <View accessibilityRole="menu" style={[styles.menu, Platform.OS === 'web' && ({ backdropFilter: 'blur(18px)' } as unknown as ViewStyle)]}>
      <View style={styles.menuIdentity}>
        <PosaText style={styles.menuName}>{name}</PosaText>
        {email && email !== name ? <PosaText style={styles.menuEmail}>{email}</PosaText> : null}
      </View>
      <View style={styles.menuDivider} />
      <Pressable accessibilityRole="menuitem" onPress={onSignOut} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.coral} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Svg>
        <PosaText style={styles.menuSignOut}>Sign out</PosaText>
      </Pressable>
    </View>
  </>;
}

export default function PosaShell() { return <UploadProvider><Workspace /></UploadProvider>; }

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: colors.background },
  header: { minHeight: 68, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
  moon: { color: colors.muted, fontSize: 22 }, brandName: { color: colors.text, fontSize: 20, fontWeight: '800' }, brandSub: { color: colors.text, fontSize: 14 },
  avatar: { width: 42, height: 42, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  contentTop: { width: '100%', maxWidth: 1440, alignSelf: 'center', paddingHorizontal: 20, gap: 8 }, contentTopCompact: { paddingHorizontal: 12 },
  caseChip: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  case: { color: colors.text, fontSize: 14, fontWeight: '700' }, severity: { backgroundColor: colors.coral, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }, moderate: { backgroundColor: '#FFD166' }, mild: { backgroundColor: colors.accent }, pending: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.text }, severityText: { color: colors.accentText, fontSize: 14, fontWeight: '800' }, severityLight: { color: colors.text },
  notice: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10 }, noticeText: { color: colors.text, fontSize: 14 },
  route: { flex: 1, minHeight: 0, paddingBottom: 92 },
  avatarOpen: { borderWidth: 2, borderColor: colors.text },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  menu: { position: 'absolute', top: 62, right: 16, zIndex: 21, minWidth: 220, maxWidth: 300, padding: 8, borderRadius: 20, backgroundColor: 'rgba(2,3,58,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' },
  menuIdentity: { paddingHorizontal: 12, paddingVertical: 10, gap: 2 }, menuName: { color: colors.text, fontSize: 15, fontWeight: '800' }, menuEmail: { color: colors.muted, fontSize: 13 },
  menuDivider: { height: 1, marginHorizontal: 8, backgroundColor: colors.border },
  menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 4, borderRadius: 14 }, menuItemPressed: { backgroundColor: colors.cyanSoft }, menuSignOut: { color: colors.coral, fontSize: 14, fontWeight: '800' },
  dockAnchor: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
  dock: { width: '100%', maxWidth: 660, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 4, padding: 8, borderRadius: 999, backgroundColor: 'rgba(2,3,58,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' },
  navButton: { minWidth: 48, minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 10 }, navActive: { flex: 1.7, backgroundColor: colors.accent }, navLabel: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  homeDone: { color: colors.accentText, backgroundColor: colors.accent, fontSize: 9, lineHeight: 13, fontWeight: '800', width: 13, height: 13, textAlign: 'center', borderRadius: 7, position: 'absolute', right: 5, bottom: 5, overflow: 'hidden' }, nextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, position: 'absolute', top: 7, right: 7 },
});
