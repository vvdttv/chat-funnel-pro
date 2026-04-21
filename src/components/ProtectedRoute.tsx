import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="max-w-md mx-auto h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  // Sessão existe mas profile ainda não carregou — espera
  if (!profile) {
    return (
      <div className="max-w-md mx-auto h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
