import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getPatientDashboard, type DashboardNight, type PatientDashboard as Dashboard } from '@/lib/queries';

import { FULL_DISCLAIMER, PublicScreen } from './public-screen';
import { AppButton, GlassPanel, PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const statusLabel = (status: string) => status === 'failed' ? 'Analysis failed' : 'Awaiting analysis';

// The patient's own dashboard: every night recorded for them. Opened from the
// QR code / link their clinician gives them; no account. Shows no identity:
// get_patient_dashboard never returns it.
//
// The health parameters shown here are not decided yet (they depend on the
// analysis model's output). They go in <ParameterGrid> once agreed.
export default function PatientDashboard({ token, onBack }: { token: string; onBack: () => void }) {
  const [state, setState] = useState<{ loading: boolean; data: Dashboard | null; error: string }>({ loading: true, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    getPatientDashboard(token)
      .then((data) => { if (!cancelled) setState({ loading: false, data, error: '' }); })
      .catch((reason) => { if (!cancelled) setState({ loading: false, data: null, error: typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Could not load your dashboard.' }); });
    return () => { cancelled = true; };
  }, [token]);

  const { loading, data, error } = state;
  const latest = data?.nights[0];

  return (
    <PublicScreen onBack={onBack}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>MY SLEEP DASHBOARD</Text>
        <Text style={styles.title}>Your sleep studies</Text>
        {data ? <Text style={styles.copy}>{data.nights.length} {data.nights.length === 1 ? 'night' : 'nights'} recorded</Text> : null}
      </View>

      {loading ? <GlassPanel style={styles.panel}><ActivityIndicator color={colors.accent} /></GlassPanel>
        : error ? <GlassPanel style={styles.panel}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></GlassPanel>
        : !data ? (
          <GlassPanel style={styles.panel}>
            <Text style={styles.heading}>This link is not valid</Text>
            <Text style={styles.copy}>It may have expired or been replaced. Ask your clinician for a new QR code or link.</Text>
            <AppButton variant="quiet" onPress={onBack}><Text style={styles.quietText}>Try another link</Text></AppButton>
          </GlassPanel>
        ) : (
          <>
            <GlassPanel style={styles.panel}>
              <Text style={styles.sectionLabel}>LATEST NIGHT</Text>
              {latest ? <>
                <View style={styles.latestHead}>
                  <Text style={styles.latestDate}>{dateLabel(latest.createdAt)}</Text>
                  <StatusPill status={latest.status} reviewed={Boolean(latest.patientExplanation)} />
                </View>
                <ParameterGrid night={latest} />
                <ClinicianMessage night={latest} />
              </> : <Text style={styles.copy}>No nights recorded yet. Your clinician will add them after each sleep study.</Text>}
            </GlassPanel>

            {data.nights.length > 0 ? (
              <GlassPanel style={styles.panel}>
                <Text style={styles.sectionLabel}>ALL NIGHTS</Text>
                {data.nights.map((night, index) => (
                  <View key={`${night.createdAt}-${index}`} style={[styles.nightItem, index > 0 && styles.nightDivider]}>
                    <View style={styles.nightRow}>
                      <View style={styles.nightCopy}>
                        <Text style={styles.nightDate}>{dateLabel(night.createdAt)}</Text>
                        <Text style={styles.nightMeta}>{night.recordCode ?? '—'}{night.samplingRateHz ? ` · ${night.samplingRateHz} Hz` : ''}</Text>
                      </View>
                      <StatusPill status={night.status} reviewed={Boolean(night.patientExplanation)} />
                    </View>
                    {index > 0 && night.patientExplanation ? <Text style={styles.nightNote}>{night.patientExplanation}</Text> : null}
                  </View>
                ))}
              </GlassPanel>
            ) : null}

            <Text style={styles.disclaimer}>{FULL_DISCLAIMER}</Text>
            <Text style={styles.expiry}>This link works until {dateLabel(data.expiresAt)}.</Text>
          </>
        )}
    </PublicScreen>
  );
}

// Placeholder tiles until the parameters are agreed with the clinical/ML team.
function ParameterGrid({ night }: { night: DashboardNight }) {
  const pending = night.status !== 'failed' && !night.patientExplanation;
  return (
    <View style={styles.grid}>
      {['Result', 'Breathing pauses', 'Sleep heart rate'].map((label) => (
        <View key={label} style={styles.tile}>
          <Text style={styles.tileLabel}>{label}</Text>
          <Text style={styles.tileValue}>—</Text>
          <Text style={styles.tileSub}>{pending ? 'Ready after analysis' : night.patientExplanation ? "See your clinician's message" : 'Not available'}</Text>
        </View>
      ))}
    </View>
  );
}

function StatusPill({ status, reviewed = false }: { status: string; reviewed?: boolean }) {
  if (reviewed) return <View style={[styles.pill, styles.pillReviewed]}><Text style={[styles.pillText, styles.pillTextFailed]}>✓ Reviewed by your clinician</Text></View>;
  return <View style={[styles.pill, status === 'failed' && styles.pillFailed]}><Text style={[styles.pillText, status === 'failed' && styles.pillTextFailed]}>○ {statusLabel(status)}</Text></View>;
}

// The plain-language explanation the clinician wrote, shown once they approved
// that night's report (get_patient_dashboard only returns it then).
function ClinicianMessage({ night }: { night: DashboardNight }) {
  if (!night.patientExplanation) return null;
  return (
    <View style={styles.message}>
      <Text style={styles.messageLabel}>MESSAGE FROM YOUR CLINICIAN</Text>
      <Text style={styles.messageText}>{night.patientExplanation}</Text>
      {night.approvedAt ? <Text style={styles.messageDate}>{dateLabel(night.approvedAt)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6 },
  eyebrow: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  panel: { gap: 12 },
  sectionLabel: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  latestHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  latestDate: { color: colors.text, fontSize: 20, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flex: 1, minWidth: 140, padding: 12, borderRadius: 16, backgroundColor: colors.scrim, gap: 2 },
  tileLabel: { color: colors.muted, fontSize: 13 },
  tileValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  tileSub: { color: colors.muted, fontSize: 12 },
  nightItem: { gap: 6, paddingVertical: 10 },
  nightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  nightNote: { color: colors.text, fontSize: 13, lineHeight: 19 },
  pillReviewed: { borderStyle: 'solid', borderColor: colors.accent, backgroundColor: colors.accent },
  message: { gap: 6, padding: 14, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: colors.accent, backgroundColor: colors.cyanSoft },
  messageLabel: { color: colors.cyan, fontSize: 12, fontWeight: '800' },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 23 },
  messageDate: { color: colors.muted, fontSize: 12 },
  nightDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  nightCopy: { flex: 1, gap: 2 },
  nightDate: { color: colors.text, fontSize: 15, fontWeight: '700' },
  nightMeta: { color: colors.muted, fontSize: 13 },
  pill: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.text, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillFailed: { borderStyle: 'solid', borderColor: colors.coral, backgroundColor: colors.coral },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  pillTextFailed: { color: colors.accentText },
  error: { color: colors.accentText, fontSize: 14, lineHeight: 21, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  quietText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  disclaimer: { color: colors.text, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  expiry: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
