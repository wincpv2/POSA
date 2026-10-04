import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getSharedStudy, type SharedStudy } from '@/lib/queries';

import { FULL_DISCLAIMER, PublicScreen } from './public-screen';
import { AppButton, GlassPanel, PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';
import { EMPTY_RESULTS, SeveritySummary, SleepResultsPanel } from './sleep-results';

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

// Read-only view of the one study a clinician shared. Shows no patient
// identity: get_shared_study never returns it.
export default function PatientResult({ token, onBack }: { token: string; onBack: () => void }) {
  const [state, setState] = useState<{ loading: boolean; study: SharedStudy | null; error: string }>({ loading: true, study: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    getSharedStudy(token)
      .then((study) => { if (!cancelled) setState({ loading: false, study, error: '' }); })
      .catch((reason) => { if (!cancelled) setState({ loading: false, study: null, error: typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Could not load the result.' }); });
    return () => { cancelled = true; };
  }, [token]);

  const { loading, study, error } = state;

  return (
    <PublicScreen onBack={onBack}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>YOUR SLEEP STUDY</Text>
        <Text style={styles.title}>{study?.recordCode ?? 'Shared result'}</Text>
      </View>
      {loading ? <GlassPanel style={styles.panel}><ActivityIndicator color={colors.accent} /></GlassPanel>
        : error ? <GlassPanel style={styles.panel}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></GlassPanel>
        : !study ? (
          <GlassPanel style={styles.panel}>
            <Text style={styles.heading}>This link is not valid</Text>
            <Text style={styles.copy}>It may have expired or been replaced. Ask your clinician for a new QR code or link.</Text>
            <AppButton variant="quiet" onPress={onBack}><Text style={styles.quietText}>Try another link</Text></AppButton>
          </GlassPanel>
        ) : (
          <>
            <GlassPanel style={styles.panel}>
              <View style={styles.statusRow}>
                <View style={styles.pending}><Text style={styles.pendingText}>○ {study.status === 'failed' ? 'Analysis failed' : 'Awaiting analysis'}</Text></View>
              </View>
              <Text style={styles.copy}>Your recording was received. Your clinician will review the results with you once the analysis is ready.</Text>
              <View style={styles.facts}>
                <Fact label="Recorded" value={dateLabel(study.createdAt)} />
                <Fact label="Sampling rate" value={study.samplingRateHz ? `${study.samplingRateHz} Hz` : '—'} />
                <Fact label="Lead" value={study.leadConfiguration ?? '—'} />
              </View>
            </GlassPanel>
            <SeveritySummary ahi={EMPTY_RESULTS.ahi} />
            <SleepResultsPanel results={EMPTY_RESULTS} audience="patient" />
            <Text style={styles.disclaimer}>{FULL_DISCLAIMER}</Text>
            <Text style={styles.expiry}>This link works until {dateLabel(study.expiresAt)}.</Text>
          </>
        )}
    </PublicScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  intro: { gap: 6 },
  eyebrow: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  panel: { gap: 12 },
  statusRow: { flexDirection: 'row' },
  pending: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.text, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pendingText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flex: 1, minWidth: 120, padding: 12, borderRadius: 16, backgroundColor: colors.scrim, gap: 2 },
  factLabel: { color: colors.muted, fontSize: 13 },
  factValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  error: { color: colors.accentText, fontSize: 14, lineHeight: 21, backgroundColor: colors.coral, padding: 8, borderRadius: 8, overflow: 'hidden' },
  quietText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  disclaimer: { color: colors.text, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  expiry: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
