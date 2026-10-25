import { lazy, Suspense } from 'react'
import { LoadingFallback } from './LoadingFallback'
import { AppErrorBoundary } from './AppErrorBoundary'

const AuthGuard = lazy(() => import('@/shared/components/AuthGuard'))
const ProtectedRouter = lazy(() => import('./routes'))

export { AppErrorBoundary }

export default function AppRouter() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <AuthGuard>
          <ProtectedRouter />
        </AuthGuard>
      </Suspense>
    </AppErrorBoundary>
  )
}
