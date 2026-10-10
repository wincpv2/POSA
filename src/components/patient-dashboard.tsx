import { useEffect, useState } from 'react';

import { getPatientDashboard, type PatientDashboard as Dashboard } from '@/lib/queries';

import PatientReportView, { type PatientReportData } from './patient-report-view';

export default function PatientDashboard({ token, onBack }: { token: string; onBack: () => void }) {
  const [state, setState] = useState<{ loading: boolean; data: Dashboard | null; error: string }>({ loading: true, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    getPatientDashboard(token)
      .then((data) => { if (!cancelled) setState({ loading: false, data, error: '' }); })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null, error: 'load' }); });
    return () => { cancelled = true; };
  }, [token]);

  const { loading, data, error } = state;
  const latest = data?.nights[0];
  const report: PatientReportData | null = latest ? {
    patientCode: data?.subjectCode ?? null,
    createdAt: latest.createdAt,
    status: latest.status,
    patientExplanation: latest.patientExplanation,
    approvedAt: latest.approvedAt,
    apneaMinutes: latest.apneaMinutes,
    totalMinutes: latest.totalMinutes,
    apneaPercent: latest.apneaPercent,
  } : null;

  return <PatientReportView data={report} validLink={Boolean(data)} token={token} kind="dashboard" loading={loading} error={error} onBack={onBack} />;
}
