import { lazy, Suspense } from 'react'
import { LoadingFallback } from './LoadingFallback'

const AuthGuard = lazy(() => import('@/shared/components/AuthGuard'))
const ProtectedRouter = lazy(() => import('./routes'))

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthGuard>
        <ProtectedRouter />
      </AuthGuard>
    </Suspense>
  )
}
