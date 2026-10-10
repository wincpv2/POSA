import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { getPatientReportPdf, type PatientLink } from '@/lib/queries';

import { PublicScreen } from './public-screen';
import { PatientLanguageSwitch, usePatientLanguage } from './patient-language';
import { PosaText as Text } from './posa-ui';
import { colors } from './posa-theme';

export type PatientReportData = {
  patientCode: string | null;
  createdAt: string;
  status: string;
  patientExplanation: string | null;
  approvedAt: string | null;
  apneaMinutes: number | null;
  totalMinutes: number | null;
  apneaPercent: number | null;
};

export default function PatientReportView({ data, validLink, token, kind, loading, error, onBack }: {
  data: PatientReportData | null;
  validLink: boolean;
  token: string;
  kind: PatientLink['kind'];
  loading: boolean;
  error: string;
  onBack: () => void;
}) {
  const { language, setLanguage, copy } = usePatientLanguage();
  const [pdfCheck, setPdfCheck] = useState<{ key: string; status: 'checking' | 'available' | 'none' | 'error' | 'downloading' }>({ key: '', status: 'checking' });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const approved = Boolean(data?.patientExplanation);
  const reportKey = kind + ':' + token;
  const pdfState = !approved ? 'none' : pdfCheck.key === reportKey ? pdfCheck.status : 'checking';
  const totalMinutes = data?.totalMinutes;
  const ahi = approved && data?.apneaMinutes != null && Number.isFinite(data.apneaMinutes) && data.apneaMinutes >= 0
    && totalMinutes != null && Number.isFinite(totalMinutes) && totalMinutes > 0 && data.apneaMinutes <= totalMinutes
    ? data.apneaMinutes / (totalMinutes / 60)
    : null;

  useEffect(() => {
    if (!approved || !token) return;
    let cancelled = false;
    void getPatientReportPdf(token, kind, false)
      .then(({ available }) => { if (!cancelled) setPdfCheck({ key: reportKey, status: available ? 'available' : 'none' }); })
      .catch(() => { if (!cancelled) setPdfCheck({ key: reportKey, status: 'error' }); });
    return () => { cancelled = true; };
  }, [approved, kind, reportKey, token]);

  const downloadPdf = async () => {
    setPdfCheck({ key: reportKey, status: 'downloading' });
    try {
      const result = await getPatientReportPdf(token, kind, true);
      if (!result.available || !result.url) { setPdfCheck({ key: reportKey, status: 'none' }); return; }
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(result.url);
      else await Linking.openURL(result.url);
      setPdfCheck({ key: reportKey, status: 'available' });
    } catch {
      setPdfCheck({ key: reportKey, status: 'error' });
    }
  };

  const label = ahi == null ? (data?.status === 'failed' ? copy.failed : approved ? (language === 'th' ? 'ไม่มีค่าประเมิน AHI' : 'AHI estimate unavailable') : copy.pending)
    : ahi < 5 ? copy.normal : ahi < 15 ? copy.mild : ahi < 30 ? copy.moderate : copy.severe;

  return (
    <PublicScreen
      onBack={onBack}
      variant="patient"
      backLabel={'← ' + copy.back}
      headerAction={<PatientLanguageSwitch language={language} onChange={setLanguage} />}
    >
      {loading ? (
        <View style={styles.stateCard}><ActivityIndicator color={colors.accent} /><Text style={styles.stateText}>{copy.loading}</Text></View>
      ) : error ? (
        <View style={styles.stateCard}><Text style={styles.stateTitle}>{copy.loadError}</Text></View>
      ) : !validLink ? (
        <View style={styles.stateCard}><Text style={styles.stateTitle}>{copy.invalid}</Text><Text style={styles.stateText}>{copy.askClinician}</Text></View>
      ) : !data ? (
        <View style={styles.stateCard}><Text style={styles.stateTitle}>{copy.noStudy}</Text><Text style={styles.stateText}>{copy.noStudyCopy}</Text></View>
      ) : (
        <>
          <LinearGradient colors={[colors.panelDeep, colors.gradientEnd]} start={{ x: 0, y: 0.15 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>☾ {copy.report}</Text>
              <Text style={styles.heroDate}>{new Date(data.createdAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text>
            </View>
            <Text style={styles.heroCaption}>{copy.patientCode}</Text>
            <Text style={styles.heroCode}>{data.patientCode || copy.patientCodeUnavailable}</Text>
            <Text style={styles.heroCaption}>{copy.severity}</Text>
            <Text style={styles.heroResult}>{label}</Text>
            {data.patientExplanation ? (
              <>
                <Text style={styles.heroAdviceLabel}>{copy.recommendation}</Text>
                <Text style={styles.heroAdvice}>{data.patientExplanation}</Text>
              </>
            ) : (
              <Text style={styles.heroAdvice}>{data.status === 'failed' ? copy.failed : copy.pending}</Text>
            )}
          </LinearGradient>

          {approved ? (
            <>
              <View style={styles.metrics}>
                {ahi != null ? <Metric label={copy.ahi} value={ahi.toFixed(1)} unit={copy.perHour} sub={language === 'th' ? 'ค่าประเมินจาก ECG' : 'ECG model estimate'} /> : null}
                {data.apneaPercent != null ? <Metric label={copy.modelShare} value={data.apneaPercent.toFixed(1) + '%'} unit="" sub={language === 'th' ? 'ประเมินโดยโมเดล ECG' : 'ECG model estimate'} /> : null}
              </View>
              {pdfState === 'available' || pdfState === 'downloading' ? (
                <Pressable accessibilityRole="button" disabled={pdfState === 'downloading'} onPress={() => void downloadPdf()} style={styles.pdfRow}>
                  <View style={styles.pdfIcon}><Text style={styles.pdfIconText}>▤</Text></View>
                  <View style={styles.pdfCopy}><Text style={styles.pdfTitle}>{copy.reportPdf}</Text><Text style={styles.pdfDate}>{copy.reportDate} · {new Date(data.approvedAt || data.createdAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US')}</Text></View>
                  <Text style={styles.downloadText}>{pdfState === 'downloading' ? copy.downloading : copy.download}</Text>
                </Pressable>
              ) : null}
              {pdfState === 'error' ? (
                <Pressable accessibilityRole="button" onPress={() => void downloadPdf()} style={styles.retryRow}><Text style={styles.retryText}>{copy.downloadError} · {copy.retry}</Text></Pressable>
              ) : null}
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)} style={styles.detailsButton}>
                <Text style={styles.detailsTitle}>{detailsOpen ? copy.hideDetails : copy.details}</Text><Text style={styles.detailsMark}>{detailsOpen ? '−' : '+'}</Text>
              </Pressable>
              {detailsOpen ? (
                <View style={styles.details}>
                  <Text style={styles.detailText}>{copy.ahiFormula}</Text>
                  <Text style={styles.detailText}>{copy.modelAssumption}</Text>
                  <Text style={styles.detailText}>{copy.ecgOnly}</Text>
                  <Detail label={copy.odi} value={copy.notMeasured} />
                  <Detail label={copy.lowestSpo2} value={copy.notMeasured} />
                  <Detail label={copy.analysedTime} value={totalMinutes == null ? copy.notMeasured : String(totalMinutes) + (language === 'th' ? ' นาที' : ' min')} />
                </View>
              ) : null}
            </>
          ) : null}

          <Text style={styles.disclaimer}>{copy.medicalDisclaimer}</Text>
        </>
      )}
    </PublicScreen>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}><Text style={styles.metricValue}>{value}</Text>{unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}</View>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 22, gap: 6, borderWidth: 1, borderColor: colors.border, shadowColor: colors.background, shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroLabel: { color: colors.text, fontSize: 16, fontWeight: '800' },
  heroDate: { color: colors.text, fontSize: 16, fontWeight: '700' },
  heroCode: { color: colors.accent, fontSize: 28, lineHeight: 36, fontWeight: '900', marginTop: 2 },
  heroCaption: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: 4 },
  heroResult: { color: colors.accent, fontSize: 32, lineHeight: 40, fontWeight: '900' },
  heroAdviceLabel: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  heroAdvice: { color: colors.text, fontSize: 15, lineHeight: 23, fontWeight: '600', marginTop: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: 180, minHeight: 116, borderRadius: 22, padding: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  metricLabel: { color: colors.muted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 },
  metricValue: { color: colors.text, fontSize: 33, lineHeight: 39, fontWeight: '900' },
  metricUnit: { color: colors.muted, fontSize: 14 },
  metricSub: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 2 },
  pdfRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderRadius: 20, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  pdfIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyanSoft },
  pdfIconText: { color: colors.accent, fontSize: 27, fontWeight: '800' },
  pdfCopy: { flex: 1, gap: 3 },
  pdfTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  pdfDate: { color: colors.muted, fontSize: 13 },
  downloadText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  retryRow: { paddingHorizontal: 4, paddingVertical: 6 },
  retryText: { color: colors.coral, fontSize: 13, fontWeight: '700' },
  detailsButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 3 },
  detailsTitle: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  detailsMark: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  details: { gap: 10, paddingHorizontal: 2, paddingBottom: 4 },
  detailText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
  detailLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  detailValue: { color: colors.muted, fontSize: 13, textAlign: 'right' },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  stateCard: { gap: 10, padding: 22, alignItems: 'center', borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  stateTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
