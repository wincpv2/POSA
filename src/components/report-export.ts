import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { RecordSummary } from '@/lib/inference';
import type { EcgSymptomEvent, PredictionRun, StudyReport } from '@/lib/queries';

import type { Study } from './posa-state';
import { FULL_DISCLAIMER } from './public-screen';
import { POSA_MARK_SVG } from './posa-logo';

export type ReportOptions = {
  study: Study;
  generatedBy: string;
  prediction: PredictionRun | null;
  report?: StudyReport | null;
  symptomEvents?: EcgSymptomEvent[];
  recordSummary?: RecordSummary | null;
};

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const safe = (value: number | null | undefined, fallback = 0) => value != null && Number.isFinite(value) ? value : fallback;
const cell = (label: string, value: string | number | null | undefined) => `<div class="kv"><span>${escape(label)}</span><b>${value == null || value === '' ? 'Unavailable' : escape(String(value))}</b></div>`;
const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${escape(p).replace(/\n/g, '<br />')}</p>`).join('');
const signed = (name: string | null | undefined, at: string | null | undefined) => name && at ? `${escape(name)} · ${escape(new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}` : 'Unavailable';
const timeLabel = (seconds: number) => {
  const value = Math.max(0, Math.floor(safe(seconds)));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

export function reportHtml({ study, generatedBy, prediction, report, symptomEvents = [], recordSummary = null }: ReportOptions): string {
  const approved = study.reportStatus === 'Approved';
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const completed = prediction?.status === 'completed';
  const labelledMinutes = recordSummary?.labelledMinutes;
  const apneaLabelMinutes = recordSummary?.apneaLabelMinutes;
  const annotationShare = labelledMinutes && apneaLabelMinutes != null ? `${(apneaLabelMinutes * 100 / labelledMinutes).toFixed(1)}%` : 'Unavailable';
  const recordingSeconds = safe(recordSummary?.durationSeconds) || safe(study.durationSeconds) || safe(prediction?.total_minutes) * 60;
  const modelPositiveWindows = completed && prediction?.apnea_minutes != null ? prediction.apnea_minutes : null;
  const modelTotalWindows = completed && prediction?.total_minutes != null ? prediction.total_minutes : null;
  const proxyAhi = modelPositiveWindows != null && modelTotalWindows != null && modelTotalWindows > 0
    ? modelPositiveWindows / (modelTotalWindows / 60) : null;
  const modelResults = completed
    ? `<div class="grid">${cell('Analyzed minutes', prediction.total_minutes)}${cell('Model apnea-classified minutes', prediction.apnea_minutes)}${cell('Model apnea minute share', prediction.apnea_percent == null ? null : `${prediction.apnea_percent.toFixed(1)}%`)}${cell('Probability threshold', '50%')}${cell('Model ID', prediction.model_id)}</div>`
    : '<p>No completed model analysis is available.</p>';
  const modelMetrics = recordSummary?.modelMetrics;
  const ecgResults = `<div class="grid">
    ${cell('A-labeled minutes', recordSummary?.apneaAnnotationsAvailable ? apneaLabelMinutes : null)}
    ${cell('Labeled minutes', recordSummary?.apneaAnnotationsAvailable ? labelledMinutes : null)}
    ${cell('A-label share', recordSummary?.apneaAnnotationsAvailable ? annotationShare : null)}
    ${cell('Contiguous annotation runs', recordSummary?.apneaAnnotationsAvailable ? recordSummary.apneaIntervals.length : null)}
    ${cell('Median heart rate', recordSummary?.medianHrBpm == null ? null : `${recordSummary.medianHrBpm.toFixed(0)} bpm`)}
    ${cell('SDNN estimate', recordSummary?.sdnnMs == null ? null : `${recordSummary.sdnnMs.toFixed(0)} ms`)}
    ${cell('RMSSD estimate', recordSummary?.rmssdMs == null ? null : `${recordSummary.rmssdMs.toFixed(0)} ms`)}
    ${cell('Valid RR intervals', recordSummary?.validRrPercent == null ? null : `${recordSummary.validRrPercent.toFixed(1)}%`)}
    ${cell('R-peak source', recordSummary?.qrsAnnotationsAvailable ? 'Normal-beat QRS annotations' : recordSummary ? 'Automatic XQRS estimates' : null)}
  </div>`;
  const modelDerivedResults = `<div class="grid">
    ${cell('Probability-weighted minute score (Σpᵢ)', modelMetrics?.probabilityWeightedApneaMinutes == null ? null : modelMetrics.probabilityWeightedApneaMinutes.toFixed(1))}
    ${cell('Probability-weighted burden (100 × Σpᵢ / N)', modelMetrics?.probabilityWeightedApneaSharePercent == null ? null : `${modelMetrics.probabilityWeightedApneaSharePercent.toFixed(1)}%`)}
    ${cell('Threshold positive minutes (p ≥ 0.50)', modelMetrics?.thresholdApneaMinutes)}
    ${cell('Threshold positive-minute share', modelMetrics?.thresholdApneaSharePercent == null ? null : `${modelMetrics.thresholdApneaSharePercent.toFixed(1)}%`)}
    ${cell('Contiguous model-predicted runs', modelMetrics?.predictedRuns)}
    ${cell('Probability threshold', modelMetrics?.threshold == null ? null : `${(modelMetrics.threshold * 100).toFixed(0)}%`)}
  </div>`;
  const clinicalResults = `<div class="grid">
    ${cell('Estimated AHI proxy (model)', proxyAhi == null ? null : `${proxyAhi.toFixed(1)} events/h`)}
    ${cell('Model-positive windows / analyzed windows', modelPositiveWindows == null || modelTotalWindows == null ? null : `${modelPositiveWindows} / ${modelTotalWindows}`)}
    ${cell('Model-positive share', completed && prediction?.apnea_percent != null ? `${prediction.apnea_percent.toFixed(1)}%` : null)}
  </div><p class="note">Proxy = positive 1-minute windows / analyzed hours. Assumes one apnea/hypopnea event per positive window and treats analyzed time as sleep time. This is not a clinical AHI. Clinical AHI, AI/HI, apnea subtype counts, ODI and SpO2 values are unavailable from ECG-only data.</p>`;
  const symptoms = symptomEvents.length
    ? `<table><thead><tr><th>Recording time</th><th>Symptoms</th></tr></thead><tbody>${symptomEvents.map((event) => `<tr><td>${timeLabel(event.occurred_at_seconds)}</td><td>${event.symptoms.map(escape).join(', ')}</td></tr>`).join('')}</tbody></table>`
    : '<p class="note">No symptoms were recorded.</p>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>POSA ECG report ${escape(study.studyId)}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Nunito', 'Arial', sans-serif; color: #10203a; font-size: 10.5pt; line-height: 1.42; margin: 0; }
  header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #04065e; padding-bottom:7px; margin-bottom:14px; }
  .brand { display:flex; align-items:center; gap:7px; color:#04065e; font-size:21pt; font-weight:800; } .brand small { color:#0077b6; font-size:10pt; margin-left:7px; } .brand-mark,.brand-mark svg { width:25px; height:25px; display:block; }
  .status { border:2px solid ${approved ? '#0b7a55' : '#b54708'}; border-radius:99px; padding:3px 11px; color:${approved ? '#0b7a55' : '#b54708'}; font-weight:800; }
  h1 { font-size:18pt; margin:0 0 4px; } h2 { margin:14px 0 6px; padding:5px 8px; background:#34404a; color:#fff; font-size:12pt; font-weight:700; }
  h3 { color:#0077b6; font-size:10pt; margin:10px 0 4px; } p { margin:0 0 7px; }
  .note { color:#52616b; font-size:9pt; } .grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
  .kv { display:flex; justify-content:space-between; gap:12px; padding:5px 2px; border-bottom:1px solid #d5dde5; }
  .kv span { color:#52616b; } .kv b { text-align:right; }
  table { width:100%; border-collapse:collapse; } th,td { padding:5px 7px; text-align:left; border-bottom:1px solid #d5dde5; } th { color:#52616b; font-weight:600; }
  .page-break { break-before:page; page-break-before:always; } .chart { width:100%; display:block; margin:5px 0 12px; }
  .charts { display:grid; grid-template-columns:1fr 1fr; gap:10px; } .charts svg { width:100%; height:auto; }
  .chart svg { width:100%; height:auto; } .signoff td { height:28px; } .disclaimer { margin-top:14px; border:1px solid #d5dde5; border-radius:7px; padding:9px 11px; color:#52616b; font-size:9pt; }
  footer { margin-top:12px; color:#6b7891; font-size:8pt; }
  h2,h3 { break-after:avoid; page-break-after:avoid; } .grid,.kv,table,tr,.charts { break-inside:avoid; page-break-inside:avoid; }
  ${approved ? '' : `.watermark { position:fixed; top:43%; left:0; right:0; color:rgba(181,71,8,.10); font-size:70pt; font-weight:800; text-align:center; transform:rotate(-24deg); }`}
</style></head><body>
  ${approved ? '' : `<div class="watermark">${escape(study.reportStatus.toUpperCase())}</div>`}
  <header><div class="brand"><span class="brand-mark">${POSA_MARK_SVG}</span><span>POSA<small>Sleep lab</small></span></div><div class="status">${escape(study.reportStatus)}</div></header>
  <h1>ECG analysis report</h1><p class="note">Study ${escape(study.studyId || 'Unavailable')} · De-identified study record</p>
  <h2>Recording details</h2><div class="grid">
    ${cell('Study ID', study.studyId)}${cell('Recording file', study.fileName)}
    ${cell('Recording duration', recordingSeconds > 0 ? `${Math.floor(recordingSeconds / 3600)} h ${String(Math.floor(recordingSeconds / 60) % 60).padStart(2, '0')} m` : null)}
    ${cell('Sampling rate', study.sampleRate ? `${study.sampleRate} Hz` : null)}${cell('ECG lead', study.lead)}
    ${cell('Age', study.age ? `${study.age} years` : null)}${cell('Sex', study.sex)}${cell('BMI', study.bmi)}
  </div>
  <h2>Model results</h2>${modelResults}
  <p class="note">Independent per-minute ECG model classifications at a 50% probability threshold. These are model estimates for clinician review.</p>
  <h3>Minute-by-minute model predictions</h3>
  <div class="chart">${recordSummary?.charts.print.modelPredictionSvg ?? '<p class="note">Minute prediction chart unavailable.</p>'}</div>
  <p class="note">Each step represents one independently classified minute. Orange marks model-predicted apnea at the 50% threshold; these are model classifications, not scored clinical events.</p>
  <h2>ECG/model-derived estimates</h2>${modelDerivedResults}
  <p class="note">Probability-weighted scores sum the model's per-minute outputs and are not calibration-adjusted. Thresholded minutes count predictions at p ≥ 0.50; contiguous runs group adjacent positive minute windows and are not clinical event counts.</p>
  <h2>ECG-derived summary</h2>${ecgResults}
  <h2>Clinical sleep study results</h2>${clinicalResults}<p class="note">This upload contains ECG only. ECG model labels and WFDB A-labels cannot determine these PSG and oxygen measurements.</p>
  <p class="note">SDNN/RMSSD ${recordSummary?.qrsAnnotationsAvailable ? 'use normal-beat QRS annotations.' : 'are estimates from automatically detected R-peaks.'} Valid RR percentage uses intervals from 0.3 to 2.0 seconds.</p>
  <div class="disclaimer">${escape(FULL_DISCLAIMER)} Model minute labels and WFDB A-label runs are separate outputs; neither is a clinical apnea event count or AHI.</div>

  <section class="page-break"><h2>Night trends</h2><h3>Full-night apnea overview</h3>
    ${recordSummary?.charts.print.fullNightOverviewSvg ? `<div class="chart">${recordSummary.charts.print.fullNightOverviewSvg}</div>` : ''}
    <h3>Minute median heart rate</h3>
    <div class="chart">${recordSummary?.charts.print.heartRateSvg ?? '<p>Heart-rate chart unavailable.</p>'}</div>
    <p class="note">Light red = model apnea-classified minutes; dark red = WFDB A-label runs${recordSummary?.apneaAnnotationsAvailable ? '' : ' (no WFDB A-label file available)'}.</p>
    <div class="charts"><div><h3>Hourly model apnea burden</h3>${recordSummary?.charts.print.hourlyApneaSvg ?? '<p>Hourly model chart unavailable.</p>'}<p class="note">Model apnea-classified minutes / analyzed minutes in each recording hour.</p></div>
      <div><h3>Plausible RR-interval distribution</h3>${recordSummary?.charts.print.rrHistogramSvg ?? '<p>RR interval chart unavailable.</p>'}<p class="note">RR intervals from 0.3 to 2.0 seconds; R peaks: ${recordSummary?.qrsAnnotationsAvailable ? 'normal-beat QRS annotations' : 'automatic XQRS estimates'}.</p></div>
    </div>
    <h2>Symptoms recorded during playback</h2>${symptoms}
  </section>

  <section class="page-break"><h2>Clinician interpretation</h2><h3>Model findings</h3>
    <p>${completed ? `The model classified ${prediction.apnea_minutes ?? 'Unavailable'} of ${prediction.total_minutes ?? 'Unavailable'} analyzed minutes as apnea (${prediction.apnea_percent?.toFixed(1) ?? 'Unavailable'}%).` : 'No completed model result is available.'}</p>
    <p class="note">${proxyAhi == null ? 'No model-derived AHI proxy is available.' : `Estimated AHI proxy: ${proxyAhi.toFixed(1)} events/h. Assumes one model-positive minute window equals one apnea/hypopnea event and analyzed time equals sleep time; not clinical AHI.`}</p>
    <h3>Clinician opinion</h3>${report?.clinicianOpinion.trim() ? paragraphs(report.clinicianOpinion) : '<p class="note">Not written yet.</p>'}
    <h3>Patient explanation</h3>${report?.patientExplanation.trim() ? paragraphs(report.patientExplanation) : '<p class="note">Not written yet.</p>'}
    <h2>Sign-off</h2><table class="signoff"><tbody>
      <tr><th>Report status</th><td>${escape(study.reportStatus)}</td></tr>
      <tr><th>Reviewed by</th><td>${signed(report?.reviewedByName, report?.reviewedAt)}</td></tr>
      <tr><th>Approved and electronically signed by</th><td>${signed(report?.approvedByName, report?.approvedAt)}</td></tr>
      <tr><th>Signature</th><td></td></tr>
    </tbody></table>
    <div class="disclaimer">${escape(FULL_DISCLAIMER)}</div>
  </section>
  <footer>Generated by ${escape(generatedBy)} on ${escape(generatedAt)} · POSA</footer>
</body></html>`;
}

function printHtmlOnWeb(html: string) {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'POSA report print preview');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647', display: 'flex', flexDirection: 'column', background: '#04065E' });

  const toolbar = document.createElement('div');
  Object.assign(toolbar.style, { minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '8px 16px', background: '#02033A' });
  const makeButton = (label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, { minHeight: '38px', padding: '0 16px', border: '1px solid rgba(202,240,248,.25)', borderRadius: '20px', background: '#90E0EF', color: '#02033A', font: '600 14px Nunito, Arial, sans-serif', cursor: 'pointer' });
    return button;
  };
  const title = document.createElement('span');
  title.textContent = 'POSA · Report preview';
  Object.assign(title.style, { flex: '1', color: '#CAF0F8', font: '700 15px Nunito, Arial, sans-serif' });
  const frame = document.createElement('iframe');
  frame.title = 'POSA report print preview';
  Object.assign(frame.style, { flex: '1', width: '100%', border: '0', background: '#FFFFFF' });
  frame.srcdoc = html;
  const closeButton = makeButton('Close preview');
  const printButton = makeButton('Print / Save PDF');
  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  closeButton.addEventListener('click', close);
  printButton.addEventListener('click', () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); });
  toolbar.append(title, closeButton, printButton);
  overlay.append(toolbar, frame);
  document.addEventListener('keydown', onKeyDown);
  document.body.append(overlay);
}

export async function exportReportPdf(options: ReportOptions): Promise<string> {
  const html = reportHtml(options);
  if (Platform.OS === 'web') {
    const desktopPrint = (window as Window & {
      posaDesktop?: { previewReport: (content: string) => Promise<boolean> };
    }).posaDesktop?.previewReport;
    if (desktopPrint) {
      const opened = await desktopPrint(html);
      return opened ? 'Report preview opened. Review it, then choose Print / Save PDF.' : 'Could not open the report preview.';
    }
    printHtmlOnWeb(html);
    return 'Report preview opened. Review it, then choose Print / Save PDF.';
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `POSA report ${options.study.studyId}` });
    return 'PDF created.';
  }
  return `PDF saved to ${uri}`;
}

export async function reportPdfBlob(options: ReportOptions): Promise<Blob> {
  const html = reportHtml(options);
  if (Platform.OS !== 'web') {
    const { uri } = await Print.printToFileAsync({ html });
    return (await fetch(uri)).blob();
  }
  const { default: html2pdf } = await import('html2pdf.js');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: '178mm', background: '#ffffff' });
  host.innerHTML = Array.from(parsed.head.querySelectorAll('style')).map((style) => style.outerHTML).join('') + parsed.body.innerHTML;
  document.body.appendChild(host);
  try {
    return await html2pdf().set({ margin: [14, 16, 14, 16], image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['.grid', '.signoff', '.disclaimer', '.kv', 'tr', 'h2', 'h3'] } } as never).from(host).outputPdf('blob');
  } finally {
    host.remove();
  }
}
