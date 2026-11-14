import { Suspense } from 'react';
import { AdminApp } from '../../components/admin-app';
export default function Page() {
  return (
    <Suspense>
      <AdminApp />
    </Suspense>
  );
}
