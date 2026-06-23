import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";

// Rotas secundárias carregadas sob demanda (corretor/correspondente/config não
// fazem parte do bundle inicial do CRM).
const ConfigurarIaPage = lazy(() => import("./pages/ConfigurarIaPage.tsx"));
const CorrespondentePanel = lazy(() => import("./pages/CorrespondentePanel.tsx"));
const GarantiaPanel = lazy(() => import("./pages/GarantiaPanel.tsx"));
const BrokerPanel = lazy(() => import("./pages/BrokerPanel.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const RouteFallback = () => (
  <div className="w-full h-screen flex items-center justify-center bg-background text-muted-foreground">
    Carregando…
  </div>
);

const queryClient = new QueryClient();

/**
 * Landing por role na raiz: usuários que são SOMENTE atendente/correspondente
 * (sem admin/corretor) caem direto no painel do correspondente; os demais veem
 * o CRM normal. Evita expor o Kanban a quem só analisa crédito.
 */
const HomeByRole = () => {
  const { roles, isAdmin } = useAuth();
  const isCorretor = roles.includes("corretor");
  const onlyCorrespondent =
    !isAdmin && !isCorretor && (roles.includes("atendente") || roles.includes("correspondente"));
  if (onlyCorrespondent) return <Navigate to="/correspondente" replace />;
  return <Index />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<ProtectedRoute><HomeByRole /></ProtectedRoute>} />
              <Route path="/correspondente" element={<CorrespondentePanel />} />
              <Route path="/garantia" element={<GarantiaPanel />} />
              <Route path="/corretor" element={<BrokerPanel />} />
              <Route path="/configurar-ia" element={<ProtectedRoute><ConfigurarIaPage /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
