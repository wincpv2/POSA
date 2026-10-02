export function parseRecordHeader(name: string, bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  if (/\.hea$/i.test(name)) {
    const lines = text.trim().split(/\r?\n/);
    const [record, countText, rateText] = lines[0].trim().split(/\s+/);
    const sampleRate = Number(rateText?.split('/')[0]);
    const count = Number(countText);
    if (!record || !Number.isInteger(count) || count < 1 || !Number.isFinite(sampleRate) || sampleRate <= 0 || lines.length < count + 1) throw new Error('WFDB header is incomplete or invalid.');
    const lead = lines[1]?.trim().split(/\s+/).at(-1) || '';
    return { format: 'wfdb' as const, sampleRate, lead };
  }
  if (/\.edf$/i.test(name)) {
    if (bytes.length < 256) throw new Error('EDF header is shorter than 256 bytes.');
    const field = (from: number, length: number) => text.slice(from, from + length).trim();
    const headerBytes = Number(field(184, 8));
    const signals = Number(field(252, 4));
    const duration = Number(field(244, 8));
    if (!Number.isInteger(signals) || signals < 1 || !Number.isInteger(headerBytes) || headerBytes < 256 + signals * 256 || bytes.length < headerBytes || !Number.isFinite(duration) || duration <= 0) throw new Error('EDF header fields are invalid or incomplete.');
    const labels = Array.from({ length: signals }, (_, i) => field(256 + i * 16, 16));
    const samplesAt = 256 + signals * 216;
    const samples = Array.from({ length: signals }, (_, i) => Number(field(samplesAt + i * 8, 8)));
    const ecg = labels.findIndex((label) => /ECG|EKG|LEAD/i.test(label));
    const valid = ecg >= 0 && Number.isFinite(samples[ecg]) && samples[ecg] > 0 ? ecg : samples.findIndex((value) => Number.isFinite(value) && value > 0);
    if (valid < 0) throw new Error('EDF sampling information is missing.');
    return { format: 'edf' as const, sampleRate: samples[valid] / duration, lead: labels[valid] || 'ECG' };
  }
  throw new Error('Choose an EDF file or a WFDB .hea header with its matching .dat file.');
}

export function formatDeidentifiedStudyId(input: string) {
  const compact = input.trim().toUpperCase().replace(/^REC-?/, '').replaceAll('-', '');
  if (!/^\d{0,4}[A-Z]{0,2}$/.test(compact)) return { value: '', preview: 'Check ID format', valid: false };
  const digits = compact.slice(0, 4);
  const suffix = compact.slice(4);
  const preview = digits.length < 4
    ? `REC-${digits.padEnd(4, '·')}-··`
    : `REC-${digits}-${suffix.length ? `${suffix}…` : '...'}`;
  const valid = digits.length === 4 && suffix.length === 2;
  return { value: valid ? `REC-${digits}-${suffix}` : '', preview: valid ? `REC-${digits}-${suffix}` : preview, valid };
}
