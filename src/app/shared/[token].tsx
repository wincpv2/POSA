import { router, useLocalSearchParams } from 'expo-router';

import PatientResult from '@/components/patient-result';
import { tokenFromInput } from '@/lib/queries';

// Opening a shared link directly (e.g. http://localhost:8081/shared/<token>)
// lands here, with or without a signed-in session.
export default function SharedResultRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PatientResult token={tokenFromInput(token ?? '') ?? ''} onBack={() => router.replace('/')} />;
}
