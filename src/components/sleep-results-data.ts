// What the sleep-apnea results are: names, units and short Thai explanations.
// One source for the clinician Summary, the patient screens (sleep-results.tsx)
// and the PDF report (report-export.ts). Plain TypeScript: no React Native.
// Sleep-apnea results shown to the clinician (Summary) and the patient
// (dashboard). UI only for now: every value is null until the analysis model
// (and, for ODI / SpO2, a pulse-oximetry signal) provides it, and null shows
// as "—". Fill SleepResults in one place when the ML output is connected.
export type SleepResults = {
  ahi: number | null; // events / hour
  ai: number | null;
  hi: number | null;
  obstructive: number | null; // counts
  central: number | null;
  mixed: number | null;
  hypopneas: number | null;
  odi: number | null; // desaturations / hour
  spo2Baseline: number | null; // %
  spo2Average: number | null;
  spo2Lowest: number | null;
};

export const EMPTY_RESULTS: SleepResults = { ahi: null, ai: null, hi: null, obstructive: null, central: null, mixed: null, hypopneas: null, odi: null, spo2Baseline: null, spo2Average: null, spo2Lowest: null };

export type Audience = 'clinician' | 'patient';
export type ResultRow = { key: keyof SleepResults; label: string; unit: string; clinician: string; patient: string };
export type ResultGroup = { title: string; lead: keyof SleepResults; leadLabel: string; leadUnit: string; clinician: string; patient: string; rows: ResultRow[] };

export const RESULT_GROUPS: ResultGroup[] = [
  {
    title: 'AHI', lead: 'ahi', leadLabel: 'AHI (Apnea-Hypopnea Index)', leadUnit: 'events/h',
    clinician: 'จำนวนครั้งที่หยุดหายใจ + หายใจแผ่ว ต่อชั่วโมงการนอน ใช้จัดระดับความรุนแรงของ OSA',
    patient: 'จำนวนครั้งที่หยุดหายใจหรือหายใจแผ่วในแต่ละชั่วโมงที่หลับ ยิ่งน้อยยิ่งดี',
    rows: [
      { key: 'ai', label: 'AI (Apnea Index)', unit: '/h', clinician: 'หยุดหายใจ (apnea) ต่อชั่วโมง', patient: 'หยุดหายใจต่อชั่วโมง' },
      { key: 'hi', label: 'HI (Hypopnea Index)', unit: '/h', clinician: 'หายใจแผ่ว (hypopnea) ต่อชั่วโมง', patient: 'หายใจแผ่วต่อชั่วโมง' },
    ],
  },
  {
    title: 'Events Breakdown', lead: 'obstructive', leadLabel: 'Obstructive apnea', leadUnit: 'events',
    clinician: 'ชนิดของเหตุการณ์ทั้งคืน แยกตามสาเหตุของการหยุดหายใจ',
    patient: 'ชนิดของการหยุดหายใจที่พบตลอดคืน',
    rows: [
      { key: 'central', label: 'Central apnea', unit: 'events', clinician: 'สมองไม่สั่งให้หายใจ ไม่มีความพยายามหายใจ', patient: 'สมองไม่สั่งให้หายใจชั่วขณะ' },
      { key: 'mixed', label: 'Mixed apnea', unit: 'events', clinician: 'เริ่มแบบ central แล้วต่อด้วย obstructive', patient: 'แบบผสมทั้งสองชนิด' },
      { key: 'hypopneas', label: 'Hypopnoea count', unit: 'events', clinician: 'หายใจแผ่วลง ร่วมกับออกซิเจนลดหรือตื่น', patient: 'จำนวนครั้งที่หายใจแผ่วลง' },
    ],
  },
  {
    title: 'ODI', lead: 'odi', leadLabel: 'ODI (Oxygen Desaturation Index)', leadUnit: '/h',
    clinician: 'ออกซิเจนในเลือดลดลง ≥3% ต่อชั่วโมง (ต้องใช้สัญญาณ SpO₂ ไม่ได้มาจาก ECG)',
    patient: 'จำนวนครั้งที่ออกซิเจนในเลือดลดลงในแต่ละชั่วโมง',
    rows: [
      { key: 'spo2Baseline', label: 'SpO₂ Baseline', unit: '%', clinician: 'ระดับออกซิเจนปกติขณะหลับ', patient: 'ออกซิเจนปกติตอนหลับ' },
      { key: 'spo2Average', label: 'SpO₂ Avg', unit: '%', clinician: 'ค่าเฉลี่ยทั้งคืน', patient: 'ค่าเฉลี่ยทั้งคืน' },
      { key: 'spo2Lowest', label: 'SpO₂ Lowest', unit: '%', clinician: 'ค่าต่ำสุดที่วัดได้', patient: 'ต่ำสุดที่วัดได้' },
    ],
  },
];

export const formatResult = (value: number | null, unit: string) => value === null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}${unit.startsWith('/') || unit === '%' ? '' : ' '}${unit}`;


// The Obstructive count leads the Events group; listed as a row with the rest.
export const OBSTRUCTIVE_ROW: ResultRow = { key: 'obstructive', label: 'Obstructive apnea', unit: 'events', clinician: 'ทางเดินหายใจถูกอุดกั้น แต่ยังพยายามหายใจ', patient: 'ทางเดินหายใจถูกอุดกั้นระหว่างหลับ' };
export const rowsOf = (g: ResultGroup): ResultRow[] => g.lead === 'obstructive' ? [OBSTRUCTIVE_ROW, ...g.rows] : g.rows;
export const hasLeadValue = (g: ResultGroup) => g.lead !== 'obstructive';

// AHI severity bands (adult, AASM): < 5 normal, 5–15 mild, 15–30 moderate, ≥ 30 severe.
export const AHI_BANDS = [
  { label: 'ปกติ', range: '< 5', color: '#7AD7A6' },
  { label: 'น้อย', range: '5–15', color: '#FFD166' },
  { label: 'ปานกลาง', range: '15–30', color: '#FF9F5A' },
  { label: 'รุนแรง', range: '≥ 30', color: '#FF6B57' },
];

export const ahiBand = (ahi: number | null) => ahi === null ? -1 : ahi < 5 ? 0 : ahi < 15 ? 1 : ahi < 30 ? 2 : 3;
