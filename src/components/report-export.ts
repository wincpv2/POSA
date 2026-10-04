import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { StudyReport } from '@/lib/queries';

import type { Study } from './posa-state';
import { FULL_DISCLAIMER } from './public-screen';

// Builds the printable sleep-study report and exports it as PDF / prints it.
// - iOS / Android: expo-print renders the HTML to a real PDF file, then the
//   share sheet lets the clinician save or send it.
// - Web: expo-print would print the whole app page (it only calls
//   window.print()), so the report is printed from a hidden iframe instead.
//   Choosing "Save as PDF" in the browser's dialog produces the PDF.

// report: the clinician-written part from Supabase (null for sample studies).
export type ReportOptions = { study: Study; generatedBy: string; sample: boolean; report?: StudyReport | null };

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const row = (label: string, value: string | null | undefined) => `<tr><th>${escape(label)}</th><td>${escape(value && value.trim() ? value : '—')}</td></tr>`;
const cell = (label: string, value: string | null | undefined) => `<div class="kv"><span>${escape(label)}</span><b>${escape(value && value.trim() ? value : '—')}</b></div>`;

const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${escape(p).replace(/\n/g, '<br />')}</p>`).join('');
const signed = (name: string | null | undefined, at: string | null | undefined) => name && at ? `${escape(name)} · ${escape(new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}` : '';

export function reportHtml({ study, generatedBy, sample, report }: ReportOptions): string {
  const approved = study.reportStatus === 'Approved';
  const m = study.summaryMetrics;
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const results = sample
    ? `<div class="grid">
        ${cell('Apnea burden', study.apneaBurden)}
        ${cell('Apnea minutes', study.apneaMinutes)}
        ${cell('Minutes without events', study.noEventMinutes)}
        ${cell('Apnea event intervals', String(study.events.length))}
        ${m ? cell('Median heart rate', `${m.medianHrBpm} bpm`) + cell('SDNN / RMSSD', `${m.sdnnMs} ms / ${m.rmssdMs} ms`) + cell('Valid RR', `${m.validRrPercent.toFixed(1)}%`) : ''}
      </div>
      <p class="note">Illustrative sample values. No clinical interpretation.</p>`
    : `<p>Analysis output is not connected yet. No clinical interpretation is available for this study.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>POSA report ${escape(study.studyId || '')}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif; color: #10203a; font-size: 11pt; line-height: 1.45; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #04065E; padding-bottom: 6px; margin-bottom: 12px; }
  .brand { font-size: 20pt; font-weight: 800; color: #04065E; }
  .brand small { font-size: 11pt; font-weight: 600; color: #0077B6; margin-left: 6px; }
  .status { font-weight: 800; padding: 4px 12px; border-radius: 999px; border: 2px solid ${approved ? '#0b7a55' : '#b54708'}; color: ${approved ? '#0b7a55' : '#b54708'}; }
  h1 { font-size: 16pt; margin: 0 0 4px; } h2 { font-size: 12.5pt; margin: 14px 0 6px; color: #04065E; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #d5dde8; vertical-align: top; }
  th { width: 38%; color: #44526b; font-weight: 600; }
  p { margin: 0 0 6px; }
  .note { color: #44526b; font-size: 10pt; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
  .kv { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #d5dde8; }
  .kv span { color: #44526b; } .kv b { text-align: right; }
  .signoff td { height: 30px; }
  .disclaimer { margin-top: 16px; padding: 10px 12px; border: 1px solid #d5dde8; border-radius: 8px; font-size: 10.5pt; color: #44526b; }
  footer { margin-top: 10px; font-size: 9.5pt; color: #6b7891; }
  ${approved ? '' : `.watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 72pt; font-weight: 800; color: rgba(181,71,8,0.10); transform: rotate(-24deg); pointer-events: none; }`}
</style></head>
<body>
  ${approved ? '' : `<div class="watermark">${escape(study.reportStatus.toUpperCase())}</div>`}
  <header><div class="brand">☾ POSA<small>Sleep lab</small></div><div class="status">${escape(study.reportStatus)}</div></header>
  <h1>Sleep study report</h1>
  <p class="note">Study ${escape(study.studyId || '—')} · De-identified: no patient name is stored in POSA.</p>

  <h2>Study</h2>
  <div class="grid">
    ${cell('Study ID', study.studyId)}
    ${cell('Recording file', study.fileName)}
    ${cell('Sampling rate', study.sampleRate ? `${study.sampleRate} Hz` : null)}
    ${cell('Lead', study.lead)}
    ${cell('Age', study.age ? `${study.age} years` : null)}
    ${cell('Sex', study.sex)}
    ${cell('BMI', study.bmi)}
  </div>

  <h2>Results</h2>
  ${results}

  <h2>Clinician report</h2>
  <p class="note">System findings</p>
  <p>${sample ? `Illustrative sample: ${study.events.length} apnea event intervals across ${escape(study.duration || '—')} elapsed recording. This preview has no clinical interpretation.` : 'Analysis output is not connected. No clinical interpretation is available.'}</p>
  <p class="note">Clinician opinion</p>
  ${report?.clinicianOpinion.trim() ? paragraphs(report.clinicianOpinion) : '<p class="note">Not written yet.</p>'}

  <h2>Patient explanation</h2>
  ${report?.patientExplanation.trim() ? paragraphs(report.patientExplanation) : '<p class="note">Not written yet.</p>'}

  <h2>Sign-off</h2>
  <table class="signoff">
    ${row('Report status', study.reportStatus)}
    <tr><th>Reviewed by</th><td>${signed(report?.reviewedByName, report?.reviewedAt)}</td></tr>
    <tr><th>Approved and electronically signed by</th><td>${signed(report?.approvedByName, report?.approvedAt)}</td></tr>
    <tr><th>Signature</th><td></td></tr>
  </table>

  <div class="disclaimer">${escape(FULL_DISCLAIMER)}</div>
  <footer>Generated by ${escape(generatedBy)} on ${escape(generatedAt)} · POSA</footer>
</body></html>`;
}

// Web: print only the report, from a hidden iframe.
function printHtmlOnWeb(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) { frame.remove(); throw new Error('Printing is not available in this browser.'); }
  doc.open(); doc.write(html); doc.close();
  const win = frame.contentWindow;
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => { win.focus(); win.print(); }, 250);
}

// Returns a note for the UI about what happened.
export async function exportReportPdf(options: ReportOptions): Promise<string> {
  const html = reportHtml(options);
  if (Platform.OS === 'web') {
    printHtmlOnWeb(html);
    return 'Choose "Save as PDF" in the print dialog to download the report.';
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `POSA report ${options.study.studyId}` });
    return 'PDF created.';
  }
  return `PDF saved to ${uri}`;
}

// The PDF as a file the app can upload (Supabase keeps approved reports).
// - iOS / Android: expo-print's real PDF.
// - Web: html2pdf.js renders the report to an A4 PDF in the page (an image-
//   based PDF: Thai text always looks right, but it is not selectable).
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
  host.innerHTML = Array.from(parsed.head.querySelectorAll('style')).map((s) => s.outerHTML).join('') + parsed.body.innerHTML;
  document.body.appendChild(host);
  try {
    return await html2pdf()
      .set({ margin: [14, 16, 14, 16], image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } })
      .from(host)
      .outputPdf('blob');
  } finally {
    host.remove();
  }
}
