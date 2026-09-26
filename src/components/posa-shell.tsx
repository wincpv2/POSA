import { Link, Slot, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { UploadProvider } from './posa-state';
import { colors, navItems } from './posa-theme';

const titles: Record<string, string> = {
  '/': 'Home',
  '/upload': 'Upload',
  '/processing': 'Processing',
  '/detail': 'Detail',
  '/summary': 'Summary',
};

export default function PosaShell() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 940;

  return (
    <UploadProvider>
      <View style={styles.root}>
        {isDesktop ? <DesktopSidebar pathname={pathname} /> : null}
        <View style={styles.mainColumn}>
          <View style={styles.topbar}>
            <View style={styles.mobileBrand}>
              <View style={styles.brandMark}><Text style={styles.brandGlyph}>∿</Text></View>
              <View>
                <View style={styles.brandNameRow}>
                  <Text style={styles.brandName}>POSA</Text>
                  <Text style={styles.brandCode}>STA-04</Text>
                </View>
                <Text style={styles.brandCaption}>PhysioNet AI v2.4</Text>
              </View>
            </View>
            <View style={styles.topbarMeta}>
              {isDesktop ? <Text style={styles.breadcrumb}>SLEEP LAB  /  {titles[pathname] ?? 'Workspace'}</Text> : null}
              <View style={styles.caseMeta}>
                <View style={styles.caseMetaText}>
                  <Text style={styles.caseMetaTitle}>{isDesktop ? 'DEMO WORKSPACE' : titles[pathname] ?? 'Workspace'}</Text>
                  <Text style={styles.caseMetaSub}>REC-8842-PT</Text>
                </View>
                <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
              </View>
            </View>
          </View>
          <View style={styles.routeContainer}>
            <Slot />
          </View>
          {!isDesktop ? <MobileTabs pathname={pathname} /> : null}
        </View>
      </View>
    </UploadProvider>
  );
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <View style={styles.brandMarkLarge}><Text style={styles.brandGlyph}>∿</Text></View>
        <View>
          <View style={styles.brandNameRow}>
            <Text style={styles.brandName}>POSA</Text>
            <Text style={styles.brandCode}>STA-04</Text>
          </View>
          <Text style={styles.brandCaption}>PhysioNet AI v2.4</Text>
        </View>
      </View>

      <Text style={styles.navCaption}>WORKSPACE</Text>
      <View style={styles.navList}>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === '/' && pathname === '/index');
          return (
            <Link key={item.href} href={item.href} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                style={StyleSheet.flatten([styles.sideNavItem, active && styles.sideNavItemActive])}>
                <Text style={[styles.navMark, active && styles.navMarkActive]}>{item.mark}</Text>
                <View style={styles.navText}>
                  <Text style={[styles.sideNavLabel, active && styles.sideNavLabelActive]}>{item.label}</Text>
                  <Text style={styles.sideNavHint}>{item.hint}</Text>
                </View>
                {active ? <View style={styles.activeRail} /> : null}
              </Pressable>
            </Link>
          );
        })}
      </View>

      <View style={styles.sidebarSpacer} />
      <View style={styles.sidebarDemoCard}>
        <View style={styles.demoStatusRow}><View style={styles.demoStatusDot} /><Text style={styles.demoStatus}>DEMO ENVIRONMENT</Text></View>
        <Text style={styles.demoCopy}>Interface preview with illustrative values. No analysis service is connected.</Text>
      </View>
      <Text style={styles.sidebarFooter}>POSA SLEEP LAB · BUILD 2.4</Text>
    </View>
  );
}

function MobileTabs({ pathname }: { pathname: string }) {
  return (
    <View style={styles.mobileTabs}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTabsInner}>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === '/' && pathname === '/index');
          return (
            <Link key={item.href} href={item.href} asChild>
              <Pressable accessibilityRole="link" accessibilityState={{ selected: active }} style={styles.mobileTab}>
                <Text style={[styles.mobileTabMark, active && styles.mobileTabMarkActive]}>{item.mark}</Text>
                <Text style={[styles.mobileTabLabel, active && styles.mobileTabLabelActive]}>{item.label}</Text>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.background, minHeight: '100%' },
  sidebar: {
    width: 246,
    paddingHorizontal: 17,
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: colors.backgroundSoft,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  sidebarBrand: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 48, paddingHorizontal: 4 },
  brandMark: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  brandMarkLarge: { width: 43, height: 43, borderRadius: 13, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  brandGlyph: { color: colors.mint, fontSize: 25, fontWeight: '700', lineHeight: 29 },
  brandNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandName: { color: colors.text, fontFamily: 'Georgia', fontWeight: '700', fontSize: 17 },
  brandCode: { color: colors.mint, backgroundColor: 'rgba(24, 213, 164, 0.12)', borderRadius: 5, overflow: 'hidden', paddingVertical: 2, paddingHorizontal: 6, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  brandCaption: { marginTop: 4, color: colors.textSoft, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  navCaption: { color: colors.muted, fontSize: 9, letterSpacing: 1.4, fontWeight: '800', paddingHorizontal: 10, marginBottom: 11 },
  navList: { gap: 5 },
  sideNavItem: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 11, borderRadius: 11, position: 'relative', overflow: 'hidden' },
  sideNavItemActive: { backgroundColor: 'rgba(103, 245, 195, 0.09)' },
  navMark: { width: 22, textAlign: 'center', color: colors.muted, fontSize: 19, fontWeight: '700' },
  navMarkActive: { color: colors.mint },
  navText: { gap: 3 },
  sideNavLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  sideNavLabelActive: { color: colors.mint },
  sideNavHint: { color: colors.muted, fontSize: 10 },
  activeRail: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, backgroundColor: colors.mint, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  sidebarSpacer: { flex: 1 },
  sidebarDemoCard: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 13, padding: 13, gap: 8, marginBottom: 20 },
  demoStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  demoStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mint },
  demoStatus: { color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 0.65 },
  demoCopy: { color: colors.textSoft, fontSize: 10, lineHeight: 15 },
  sidebarFooter: { color: colors.muted, fontSize: 8, letterSpacing: 1, textAlign: 'center' },
  mainColumn: { flex: 1, minWidth: 0, backgroundColor: colors.background },
  topbar: { height: 68, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.backgroundSoft },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  topbarMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: 18 },
  breadcrumb: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  caseMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  caseMetaText: { alignItems: 'flex-end', gap: 3 },
  caseMetaTitle: { color: colors.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  caseMetaSub: { color: colors.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
  avatar: { width: 34, height: 34, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.background, fontFamily: 'Georgia', fontSize: 16, fontWeight: '700' },
  routeContainer: { flex: 1, minHeight: 0 },
  mobileTabs: { minHeight: 67, paddingBottom: 5, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.backgroundSoft, justifyContent: 'center' },
  mobileTabsInner: { flexGrow: 1, justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 5 },
  mobileTab: { width: 69, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 5 },
  mobileTabMark: { color: colors.textSoft, fontSize: 19, lineHeight: 22, fontWeight: '700' },
  mobileTabMarkActive: { color: colors.mint },
  mobileTabLabel: { color: colors.textSoft, fontSize: 9, fontWeight: '700' },
  mobileTabLabelActive: { color: colors.mint },
});
