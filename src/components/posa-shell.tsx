import { LinearGradient } from 'expo-linear-gradient';
import { Link, Slot, router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { PosaText } from './posa-ui';
import { UploadProvider, useUploadState } from './posa-state';
import { colors, navItems } from './posa-theme';
import { useAuth } from '@/lib/auth-context';
import { PosaMark } from './posa-logo';
import { getInferenceHealth, type InferenceHealth } from '@/lib/inference';
import WatercolorBackground from './watercolor-background';

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
  const desktopWeb = Platform.OS === 'web' && width >= 900;
  const { study } = useUploadState();
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [serverHealth, setServerHealth] = useState<InferenceHealth | null>(null);
  const [serverError, setServerError] = useState('');
  const [serverConnection, setServerConnection] = useState<'checking' | 'reachable' | 'unreachable' | 'response-error'>('checking');
  const [serverLoading, setServerLoading] = useState(false);
  const [serverRefreshKey, setServerRefreshKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    if (!desktopWeb || typeof document === 'undefined') return;
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, [desktopWeb]);

  useEffect(() => {
    if (!serverMenuOpen) return;
    let cancelled = false;
    let refreshing = false;
    let activeController: AbortController | null = null;
    const check = async () => {
      if (refreshing) return;
      refreshing = true;
      setServerLoading(true);
      activeController = new AbortController();
      const timeout = setTimeout(() => activeController?.abort(), 12_000);
      try {
        const status = await getInferenceHealth(activeController.signal);
        if (!cancelled) {
          setServerHealth(status);
          setServerError('');
          setServerConnection('reachable');
        }
      } catch (reason) {
        if (!cancelled) {
          const message = activeController?.signal.aborted ? 'Status request timed out after 12 seconds.' : reason instanceof Error ? reason.message : 'Could not check inference server.';
          const networkFailure = activeController?.signal.aborted || reason instanceof TypeError || /failed to fetch|network request failed|load failed/i.test(message);
          setServerConnection(networkFailure ? 'unreachable' : 'response-error');
          setServerError(message);
        }
      } finally {
        clearTimeout(timeout);
        refreshing = false;
        if (!cancelled) setServerLoading(false);
      }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      activeController?.abort();
    };
  }, [serverMenuOpen, serverRefreshKey]);

  async function toggleFullscreen() {
    if (typeof document === 'undefined') return;
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setMenuOpen(false);
    } catch {
      setFullscreenError('Could not change full screen. Try F11.');
    }
  }
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
    <WatercolorBackground />
    <View style={styles.foreground}>
    <StatusBar style="light" />
    <View style={styles.header}>
      <Link href="/" asChild><Pressable accessibilityRole="link" accessibilityLabel="POSA Sleep lab home" style={styles.brand}>
        <PosaMark size={28} /><PosaText style={styles.brandName}>POSA</PosaText><PosaText style={styles.brandSub}>Sleep lab</PosaText>
      </Pressable></Link>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open server status" accessibilityState={{ expanded: serverMenuOpen }} onPress={() => { setMenuOpen(false); setServerMenuOpen((open) => !open); }} style={[styles.serverButton, serverMenuOpen && styles.avatarOpen]}>
          <View style={[styles.serverDot, { backgroundColor: serverHealth?.ok && !serverError ? '#4ADE80' : serverError || serverHealth ? colors.coral : colors.muted }]} />
          <PosaText style={styles.serverButtonText}>Server</PosaText>
          <PosaText style={styles.serverChevron}>{serverMenuOpen ? '⌃' : '⌄'}</PosaText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Signed in as ${displayName}. Open account menu`} accessibilityState={{ expanded: menuOpen }} onPress={() => { setServerMenuOpen(false); setMenuOpen((open) => !open); }} style={[styles.avatar, menuOpen && styles.avatarOpen]}><PosaText style={styles.avatarText}>{initialsOf(displayName)}</PosaText></Pressable>
      </View>
    </View>
    <View style={[styles.contentTop, width < 500 && styles.contentTopCompact]}>
      <View style={styles.caseChip}>
        <PosaText style={styles.case}>{caseLine}</PosaText>
      </View>
      <View style={styles.notice}><PosaText style={styles.noticeText}>ECG recordings are stored privately. Analysis results are available for clinician review.</PosaText></View>
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
    {menuOpen ? <AccountMenu name={displayName} email={email} desktopWeb={desktopWeb} fullscreen={fullscreen} fullscreenError={fullscreenError} onToggleFullscreen={() => { void toggleFullscreen(); }} onClose={() => setMenuOpen(false)} onSignOut={() => { setMenuOpen(false); void signOut(); }} onOpenLog={() => { setMenuOpen(false); router.push('/activity' as never); }} /> : null}
    {serverMenuOpen ? <ServerStatusMenu health={serverHealth} error={serverError} connection={serverConnection} loading={serverLoading} onClose={() => setServerMenuOpen(false)} onRefresh={() => setServerRefreshKey((value) => value + 1)} /> : null}
    </View>
  </View>;
}

function ServerStatusMenu({ health, error, connection, loading, onClose, onRefresh }: { health: InferenceHealth | null; error: string; connection: 'checking' | 'reachable' | 'unreachable' | 'response-error'; loading: boolean; onClose: () => void; onRefresh: () => void }) {
  const overall = health?.ok && !error ? 'All systems normal' : health || error ? 'Needs attention' : 'Checking server';
  const apiStatus = connection === 'reachable' ? 'Reachable' : connection === 'unreachable' ? 'No response' : connection === 'response-error' ? 'Responding with an error' : 'Checking';
  const apiOk = connection === 'reachable' ? true : connection === 'unreachable' || connection === 'response-error' ? false : health?.api.ok;
  const row = (label: string, ok: boolean | undefined, detail: string) => <View key={label} style={styles.statusRow}>
    <View style={[styles.serverDot, { backgroundColor: ok === true ? '#4ADE80' : ok === false ? colors.coral : colors.muted }]} />
    <View style={styles.statusCopy}><PosaText style={styles.statusLabel}>{label}</PosaText><PosaText style={styles.statusDetail}>{detail}</PosaText></View>
  </View>;
  return <>
    <Pressable accessibilityLabel="Close server status" onPress={onClose} style={styles.menuBackdrop} />
    <View accessibilityRole="menu" accessibilityLabel="Server status menu" style={[styles.serverMenu, Platform.OS === 'web' && ({ backdropFilter: 'blur(18px)' } as unknown as ViewStyle)]}>
      <View style={styles.serverMenuHeader}><PosaText style={styles.menuName}>Server status</PosaText><PosaText style={[styles.overallStatus, { color: health?.ok ? '#4ADE80' : health || error ? colors.coral : colors.muted }]}>{overall}</PosaText></View>
      <View style={styles.menuDivider} />
      {row('Python inference API', apiOk, apiStatus)}
      {row('ML model', health?.model.ok, health ? `${health.model.name} · ${health.model.version}${health.model.device ? ` · ${health.model.device}` : ''}` : error || 'Waiting for status')}
      {row('Supabase database', health?.supabase.ok, health ? health.supabase.ok ? 'Connected' : `Unavailable · ${health.supabase.error || 'query failed'}` : 'Waiting for status')}
      {row('Prediction worker', health?.predictionWorker.ok, health ? `${health.predictionWorker.running} running · ${health.predictionWorker.queued} queued` : 'Waiting for status')}
      {row('Full-night summary worker', health?.summaryWorker.ok, health ? `${health.summaryWorker.running} running · ${health.summaryWorker.queued} queued` : 'Waiting for status')}
      {error ? <PosaText accessibilityRole="alert" style={styles.serverError}>{error}</PosaText> : null}
      <PosaText style={styles.checkedAt}>{health ? `Last checked ${new Date(health.checkedAt).toLocaleTimeString()}` : 'Status has not been checked yet'}</PosaText>
      <Pressable accessibilityRole="menuitem" disabled={loading} onPress={onRefresh} style={({ pressed }) => [styles.refreshButton, pressed && styles.menuItemPressed, loading && styles.refreshDisabled]}>
        <PosaText style={styles.menuLog}>{loading ? 'Checking…' : 'Refresh status'}</PosaText>
      </Pressable>
    </View>
  </>;
}

function AccountMenu({ name, email, desktopWeb, fullscreen, fullscreenError, onToggleFullscreen, onClose, onSignOut, onOpenLog }: { name: string; email: string; desktopWeb: boolean; fullscreen: boolean; fullscreenError: string; onToggleFullscreen: () => void; onClose: () => void; onSignOut: () => void; onOpenLog: () => void }) {
  return <>
    <Pressable accessibilityLabel="Close account menu" onPress={onClose} style={styles.menuBackdrop} />
    <View accessibilityRole="menu" style={[styles.menu, Platform.OS === 'web' && ({ backdropFilter: 'blur(18px)' } as unknown as ViewStyle)]}>
      <View style={styles.menuIdentity}>
        <PosaText style={styles.menuName}>{name}</PosaText>
        {email && email !== name ? <PosaText style={styles.menuEmail}>{email}</PosaText> : null}
      </View>
      <View style={styles.menuDivider} />
      {desktopWeb ? <>
        <Pressable accessibilityRole="menuitem" accessibilityState={{ selected: fullscreen }} onPress={onToggleFullscreen} style={({ pressed }) => [styles.menuItem, fullscreen && styles.menuItemPressed, pressed && styles.menuItemPressed]}>
          <PosaText style={styles.menuLog}>{fullscreen ? 'Exit full screen' : 'Enter full screen'}</PosaText>
        </Pressable>
        {fullscreenError ? <PosaText accessibilityRole="alert" style={styles.fullscreenError}>{fullscreenError}</PosaText> : null}
        <View style={styles.menuDivider} />
      </> : null}
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
  root: { flex: 1, minHeight: '100%', position: 'relative', backgroundColor: colors.background },
  foreground: { flex: 1, position: 'relative', zIndex: 1 },
  header: { minHeight: 68, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
  brandName: { color: colors.text, fontSize: 20, fontWeight: '800' }, brandSub: { color: colors.text, fontSize: 14 },
  avatar: { width: 42, height: 42, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  serverButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 11, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, serverButtonText: { color: colors.text, fontSize: 13, fontWeight: '800' }, serverChevron: { color: colors.muted, fontSize: 14, lineHeight: 16 }, serverDot: { width: 8, height: 8, borderRadius: 5 },
  contentTop: { width: '100%', maxWidth: 1440, alignSelf: 'center', paddingHorizontal: 20, gap: 8 }, contentTopCompact: { paddingHorizontal: 12 },
  caseChip: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  case: { color: colors.text, fontSize: 14, fontWeight: '700' },
  notice: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10 }, noticeText: { color: colors.text, fontSize: 14 },
  route: { flex: 1, minHeight: 0, paddingBottom: 92 },
  avatarOpen: { borderWidth: 2, borderColor: colors.text },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  menu: { position: 'absolute', top: 62, right: 16, zIndex: 21, minWidth: 220, maxWidth: 300, padding: 8, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' },
  serverMenu: { position: 'absolute', top: 62, right: 12, zIndex: 21, width: '92%', maxWidth: 340, minWidth: 250, padding: 12, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' },
  serverMenuHeader: { paddingHorizontal: 8, paddingVertical: 8, gap: 3 }, overallStatus: { fontSize: 13, fontWeight: '800' }, statusRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6 }, statusCopy: { flex: 1, gap: 2 }, statusLabel: { color: colors.text, fontSize: 13, fontWeight: '800' }, statusDetail: { color: colors.muted, fontSize: 12, flexWrap: 'wrap' }, serverError: { color: colors.coral, fontSize: 12, lineHeight: 17, paddingHorizontal: 8, paddingTop: 6 }, checkedAt: { color: colors.muted, fontSize: 11, paddingHorizontal: 8, paddingTop: 6 }, refreshButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 12, backgroundColor: colors.cyanSoft }, refreshDisabled: { opacity: 0.55 },
  menuIdentity: { paddingHorizontal: 12, paddingVertical: 10, gap: 2 }, menuName: { color: colors.text, fontSize: 15, fontWeight: '800' }, menuEmail: { color: colors.muted, fontSize: 13 },
  menuDivider: { height: 1, marginHorizontal: 8, backgroundColor: colors.border },
  fullscreenError: { color: colors.coral, fontSize: 12, paddingHorizontal: 12, paddingVertical: 6 },
  menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 4, borderRadius: 14 }, menuItemPressed: { backgroundColor: colors.cyanSoft }, menuSignOut: { color: colors.coral, fontSize: 14, fontWeight: '800' }, menuLog: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dockAnchor: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', paddingHorizontal: 16, zIndex: 10 },
  dock: { width: '100%', maxWidth: 660, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 4, padding: 8, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, boxShadow: '0 10px 30px rgba(0,0,0,0.16)' },
  navButton: { minWidth: 48, minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 10 }, navActive: { flex: 1.7, backgroundColor: colors.accent }, navLabel: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  homeDone: { color: colors.accentText, backgroundColor: colors.accent, fontSize: 9, lineHeight: 13, fontWeight: '800', width: 13, height: 13, textAlign: 'center', borderRadius: 7, position: 'absolute', right: 5, bottom: 5, overflow: 'hidden' }, nextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, position: 'absolute', top: 7, right: 7 },
});
