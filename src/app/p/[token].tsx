import { router, useLocalSearchParams } from 'expo-router';

import PatientDashboard from '@/components/patient-dashboard';
import { tokenFromInput } from '@/lib/queries';

// Opening a patient dashboard link directly (e.g. http://localhost:8081/p/<token>)
// lands here, with or without a signed-in session.
export default function PatientDashboardRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PatientDashboard token={tokenFromInput(token ?? '') ?? ''} onBack={() => router.replace('/')} />;
}
