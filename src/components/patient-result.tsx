import { useEffect, useState } from 'react';

import { getSharedStudy, type SharedStudy } from '@/lib/queries';

import PatientReportView, { type PatientReportData } from './patient-report-view';

export default function PatientResult({ token, onBack }: { token: string; onBack: () => void }) {
  const [state, setState] = useState<{ loading: boolean; study: SharedStudy | null; error: string }>({ loading: true, study: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    getSharedStudy(token)
      .then((study) => { if (!cancelled) setState({ loading: false, study, error: '' }); })
      .catch(() => { if (!cancelled) setState({ loading: false, study: null, error: 'load' }); });
    return () => { cancelled = true; };
  }, [token]);

  const { loading, study, error } = state;
  const report: PatientReportData | null = study ? {
    patientCode: study.patientCode,
    createdAt: study.createdAt,
    status: study.status,
    patientExplanation: study.patientExplanation,
    approvedAt: study.approvedAt,
    apneaMinutes: study.apneaMinutes,
    totalMinutes: study.totalMinutes,
    apneaPercent: study.apneaPercent,
  } : null;

  return <PatientReportView data={report} validLink={Boolean(study)} token={token} kind="study" loading={loading} error={error} onBack={onBack} />;
}
