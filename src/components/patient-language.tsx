import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { PosaText as Text } from './posa-ui';

export type PatientLanguage = 'th' | 'en';

export const patientCopy = {
  th: {
    patient: 'ผู้ป่วย',
    report: 'ผลตรวจการนอน',
    patientCode: 'รหัสผู้ป่วย',
    reportDate: 'วันที่ตรวจ',
    severity: 'ผลประเมินเบื้องต้นจาก ECG',
    normal: 'ปกติ',
    mild: 'เล็กน้อย',
    moderate: 'ปานกลาง',
    severe: 'รุนแรง',
    pending: 'รอแพทย์ตรวจผล',
    failed: 'วิเคราะห์ไม่สำเร็จ',
    ahi: 'AHI โดยประมาณ',
    perHour: 'ครั้ง/ชม.',
    modelShare: 'สัดส่วนช่วงที่โมเดลจัดเป็น apnea',
    analysedTime: 'เวลาที่วิเคราะห์',
    recommendation: 'คำแนะนำจากแพทย์',
    noStudy: 'ยังไม่มีผลตรวจ',
    noStudyCopy: 'ผลตรวจจะแสดงที่นี่หลังจากได้รับการตรวจและอนุมัติจากแพทย์',
    loading: 'กำลังโหลดผลตรวจ…',
    loadError: 'โหลดผลตรวจไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองเปิดลิงก์อีกครั้ง',
    medicalDisclaimer: 'เป็นค่าประเมินจากสัญญาณ ECG เพื่อประกอบการศึกษา ไม่ใช่การวินิจฉัยหรือผลตรวจ PSG',
    invalid: 'ลิงก์นี้ใช้ไม่ได้หรือหมดอายุแล้ว',
    askClinician: 'กรุณาขอลิงก์ใหม่จากคลินิก',
    details: 'ดูรายละเอียดเพิ่มเติม',
    hideDetails: 'ซ่อนรายละเอียด',
    notMeasured: 'ไม่มีข้อมูลจากสัญญาณ ECG',
    odi: 'ODI',
    lowestSpo2: 'SpO₂ ต่ำสุด',
    ahiFormula: 'AHI โดยประมาณ = นาทีที่โมเดลจัดเป็น apnea ÷ เวลาที่วิเคราะห์เป็นชั่วโมง',
    modelAssumption: 'ในการประเมินนี้ ถือว่าทุกนาทีที่โมเดลจัดเป็น apnea เป็น 1 เหตุการณ์ apnea/hypopnea ผลนี้เป็นค่าประเมินจาก ECG ไม่ใช่ผล PSG',
    ecgOnly: 'การตรวจนี้ใช้สัญญาณ ECG จึงวัดค่าออกซิเจนในเลือดและ ODI ไม่ได้',
    reportPdf: 'รายงานผลตรวจ',
    download: 'ดาวน์โหลด',
    downloading: 'กำลังเตรียมไฟล์…',
    downloadError: 'ดาวน์โหลดไม่สำเร็จ ลองอีกครั้ง',
    retry: 'ลองตรวจเอกสารอีกครั้ง',
    back: 'กลับ',
    patientAccess: 'สำหรับผู้ป่วย',
    openDashboard: 'เปิดผลตรวจของคุณ',
    accessCopy: 'สแกน QR code หรือวางลิงก์ที่ได้รับจากคลินิก',
    scanQr: 'สแกน QR',
    pasteLink: 'วางลิงก์',
    cameraAccess: 'การใช้กล้อง',
    cameraReason: 'ใช้กล้องเพื่ออ่าน QR code จากคลินิกเท่านั้น',
    allowCamera: 'อนุญาตใช้กล้อง',
    cameraOff: 'กล้องถูกปิดไว้ อนุญาตในตั้งค่า หรือวางลิงก์แทน',
    pasteInstead: 'วางลิงก์แทน',
    pointCamera: 'เล็งกล้องไปที่ QR code',
    cameraError: 'เปิดกล้องไม่ได้ กรุณาวางลิงก์แทน',
    invalidQr: 'QR code นี้ไม่ใช่ลิงก์ POSA',
    invalidLink: 'ลิงก์ POSA ไม่ถูกต้อง กรุณาตรวจสอบว่าคัดลอกมาครบ',
    resultLink: 'ลิงก์ผลตรวจ',
    pastePlaceholder: 'วางลิงก์จากคลินิก',
    open: 'เปิด',
    patientCodeUnavailable: 'ไม่มีรหัสผู้ป่วย',
    expiry: 'ลิงก์ใช้ได้ถึง',
  },
  en: {
    patient: 'PATIENT',
    report: 'Sleep study report',
    patientCode: 'Patient code',
    reportDate: 'Study date',
    severity: 'ECG-based estimate',
    normal: 'Normal',
    mild: 'Mild',
    moderate: 'Moderate',
    severe: 'Severe',
    pending: 'Waiting for clinician review',
    failed: 'Analysis failed',
    ahi: 'Estimated AHI',
    perHour: 'events/hour',
    modelShare: 'Model-classified apnea share',
    analysedTime: 'Analysed time',
    recommendation: 'Advice from your clinician',
    noStudy: 'No study results yet',
    noStudyCopy: 'Results will appear here after your clinician reviews and approves them.',
    loading: 'Loading your result…',
    loadError: 'Could not load the result. Check your connection and reopen the link.',
    medicalDisclaimer: 'This ECG-based estimate is for study use and is not a diagnosis or PSG result.',
    invalid: 'This link is invalid or expired.',
    askClinician: 'Please ask your clinic for a new link.',
    details: 'More details',
    hideDetails: 'Hide details',
    notMeasured: 'Not available from ECG',
    odi: 'ODI',
    lowestSpo2: 'Lowest SpO₂',
    ahiFormula: 'Estimated AHI = model-classified apnea minutes ÷ analysed hours.',
    modelAssumption: 'For this estimate, each minute classified by the ECG model counts as one apnea/hypopnea event. This is not a PSG result.',
    ecgOnly: 'This study uses ECG only, so blood oxygen and ODI were not measured.',
    reportPdf: 'Study report',
    download: 'Download',
    downloading: 'Preparing file…',
    downloadError: 'Could not download the report. Try again.',
    retry: 'Check for report again',
    back: 'Back',
    patientAccess: 'PATIENT',
    openDashboard: 'Open your result',
    accessCopy: 'Scan the QR code or paste the link from your clinic.',
    scanQr: 'Scan QR',
    pasteLink: 'Paste link',
    cameraAccess: 'Camera access',
    cameraReason: 'POSA uses the camera only to read the QR code from your clinic.',
    allowCamera: 'Allow camera',
    cameraOff: 'Camera access is off. Allow it in settings or paste the link instead.',
    pasteInstead: 'Paste a link instead',
    pointCamera: 'Point the camera at the QR code.',
    cameraError: 'The camera could not start. Paste the link instead.',
    invalidQr: 'This QR code is not a POSA link.',
    invalidLink: 'This is not a valid POSA link. Check that you copied the whole link.',
    resultLink: 'Result link',
    pastePlaceholder: 'Paste the link from your clinic',
    open: 'Open',
    patientCodeUnavailable: 'Patient code unavailable',
    expiry: 'Link valid until',
  },
} as const;

export type PatientCopy = { [Key in keyof typeof patientCopy.en]: string };

export function usePatientLanguage() {
  const [language, setLanguage] = useState<PatientLanguage>('th');

  useEffect(() => {
    void AsyncStorage.getItem('posa.patient-language')
      .then((saved) => {
        if (saved === 'en' || saved === 'th') setLanguage(saved);
      })
      .catch(() => undefined);
  }, []);

  const chooseLanguage = (next: PatientLanguage) => {
    setLanguage(next);
    void AsyncStorage.setItem('posa.patient-language', next).catch(() => undefined);
  };

  return { language, setLanguage: chooseLanguage, copy: patientCopy[language] };
}

export function PatientLanguageSwitch({ language, onChange }: { language: PatientLanguage; onChange: (language: PatientLanguage) => void }) {
  const next = language === 'th' ? 'en' : 'th';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={next === 'en' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'} onPress={() => onChange(next)} style={styles.switch}>
      <Text style={styles.switchText}>{next === 'en' ? 'EN' : 'ไทย'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: { minWidth: 56, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#B5D8D0', backgroundColor: '#FFFFFF', paddingHorizontal: 14 },
  switchText: { color: '#1F665C', fontSize: 14, fontWeight: '800' },
});
