import { LinearGradient } from 'expo-linear-gradient';
import { Link, Slot, router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
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
  const [displayedLayoutTab, setDisplayedLayoutTab] = useState<string>(pathname);
  const [shrinkingTab, setShrinkingTab] = useState<string | null>(null);
  const activeHrefRef = useRef<string>(pathname);

  useEffect(() => {
    const prevRoute = activeHrefRef.current;
    if (prevRoute === pathname) return;
    activeHrefRef.current = pathname;

    const hasOldTab = navItems.some((it) => it.href === prevRoute);
    const hasNewTab = navItems.some((it) => it.href === pathname);

    if (hasOldTab && hasNewTab) {
      // Step 1: Shrink old tab indicator horizontally until gone
      setShrinkingTab(prevRoute);
      const timer = setTimeout(() => {
        // Step 2: Reverse on new tab (expand horizontally from 0 to 1)
        setShrinkingTab(null);
        setDisplayedLayoutTab(pathname);
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setShrinkingTab(null);
      setDisplayedLayoutTab(pathname);
    }
  }, [pathname]);

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
          const isLayoutActive = displayedLayoutTab === item.href;
          const isRouteActive = pathname === item.href;
          const isShrinking = shrinkingTab === item.href;
          const blocked = (item.href === '/processing' && study.status === 'empty')
            || ((item.href === '/detail' || item.href === '/summary') && study.status !== 'ready');
          const done = item.href === '/' ? true
            : item.href === '/upload' ? study.status !== 'empty'
            : item.href === '/processing' ? study.status === 'ready'
              : item.href === '/detail' ? study.status === 'ready' && (pathname === '/summary' || study.reportStatus !== 'Draft')
                : item.href === '/summary' ? study.reportStatus === 'Approved' : false;
          const upcoming = item.href === nextRequired;
          const iconName = item.href === '/' ? 'home' : item.href.slice(1) as keyof typeof icons;
          const label = isRouteActive ? `${item.label}, current` : done ? `${item.label}, done` : upcoming ? `${item.label}, next required` : `${item.label}, upcoming`;

          return <DockNavItem
            key={item.href}
            item={item}
            isLayoutActive={isLayoutActive}
            isRouteActive={isRouteActive}
            isShrinking={isShrinking}
            blocked={blocked}
            done={done}
            upcoming={upcoming}
            iconName={iconName}
            label={label}
            currentPathname={pathname}
          />;
        })}
      </View>
    </View>
    {menuOpen ? <AccountMenu name={displayName} email={email} onClose={() => setMenuOpen(false)} onSignOut={() => { setMenuOpen(false); void signOut(); }} onOpenLog={() => { setMenuOpen(false); router.push('/activity' as never); }} /> : null}
  </View>;
}

interface DockNavItemProps {
  item: (typeof navItems)[number];
  isLayoutActive: boolean;
  isRouteActive: boolean;
  isShrinking: boolean;
  blocked: boolean;
  done: boolean;
  upcoming: boolean;
  iconName: keyof typeof icons;
  label: string;
  currentPathname: string;
}

function DockNavItem({
  item,
  isLayoutActive,
  isRouteActive,
  isShrinking,
  blocked,
  done,
  upcoming,
  iconName,
  label,
  currentPathname,
}: DockNavItemProps) {
  const [anim] = useState(() => new Animated.Value(isLayoutActive ? 1 : 0));

  useEffect(() => {
    if (isShrinking) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else if (isLayoutActive) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      anim.setValue(0);
    }
  }, [isShrinking, isLayoutActive, anim]);

  return (
    <Link href={blocked ? currentPathname as never : item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityState={{ selected: isRouteActive, disabled: blocked }}
        disabled={blocked}
        style={StyleSheet.flatten([styles.navButton, isLayoutActive && styles.navActive])}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicatorContainer,
            {
              transform: [{ scaleX: anim }],
              opacity: anim.interpolate({
                inputRange: [0, 0.05, 1],
                outputRange: [0, 1, 1],
              }),
            },
          ]}
        >
          <View style={styles.indicatorPill} />
          <View style={styles.indicatorBottomBar} />
        </Animated.View>

        <View style={styles.navIcon}>
          <NavIcon name={iconName} color={isLayoutActive ? colors.accentText : colors.text} />
        </View>
        {done && !isLayoutActive ? <PosaText style={styles.homeDone}>✓</PosaText> : null}
        {isLayoutActive ? (
          <Animated.View style={{ opacity: anim }}>
            <PosaText style={styles.navLabel}>{item.label}</PosaText>
          </Animated.View>
        ) : upcoming && !done ? (
          <View style={styles.nextDot} />
        ) : null}
      </Pressable>
    </Link>
  );
}

function AccountMenu({ name, email, onClose, onSignOut, onOpenLog }: { name: string; email: string; onClose: () => void; onSignOut: () => void; onOpenLog: () => void }) {
  return <>
    <Pressable accessibilityLabel="Close account menu" onPress={onClose} style={styles.menuBackdrop} />
    <View accessibilityRole="menu" style={[styles.menu, Platform.OS === 'web' && ({ backdropFilter: 'blur(18px)' } as unknown as ViewStyle)]}>
      <View style={styles.menuIdentity}>
        <PosaText style={styles.menuName}>{name}</PosaText>
        {email && email !== name ? <PosaText style={styles.menuEmail}>{email}</PosaText> : null}
      </View>
      <View style={styles.menuDivider} />
      <Pressable accessibilityRole="menuitem" onPress={onOpenLog} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></Svg>
        <PosaText selectable={false} style={styles.menuLog}>Deletion log</PosaText>
      </Pressable>
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
  menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 4, borderRadius: 14 }, menuItemPressed: { backgroundColor: colors.cyanSoft }, menuSignOut: { color: colors.coral, fontSize: 14, fontWeight: '800' }, menuLog: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dockAnchor: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
  dock: { width: '100%', maxWidth: 660, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 4, padding: 8, borderRadius: 999, backgroundColor: 'rgba(2,3,58,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' },
  navButton: { minWidth: 48, minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 10, position: 'relative', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' } as never,
  navActive: { flex: 1.7 },
  navIcon: { zIndex: 1, elevation: 1 },
  navLabel: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  indicatorContainer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  indicatorPill: { ...StyleSheet.absoluteFill, borderRadius: 999, backgroundColor: colors.accent },
  indicatorBottomBar: { position: 'absolute', bottom: 3, height: 3, width: 24, borderRadius: 1.5, backgroundColor: colors.accentText },
  homeDone: { color: colors.accentText, backgroundColor: colors.accent, fontSize: 9, lineHeight: 13, fontWeight: '800', width: 13, height: 13, textAlign: 'center', borderRadius: 7, position: 'absolute', right: 5, bottom: 5, overflow: 'hidden' },
  nextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, position: 'absolute', top: 7, right: 7 },
});
