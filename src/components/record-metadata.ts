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
  throw new Error('Choose a WFDB .hea header with its matching .dat file.');
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
