import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import Auth from "./pages/Auth";

const AppLayout = lazy(() => import("@/components/AppLayout").then((module) => ({ default: module.AppLayout })));
const Hub = lazy(() => import("./pages/Hub"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Conciliacao = lazy(() => import("./pages/Conciliacao"));
const Comercial = lazy(() => import("./pages/Comercial"));
const DevisDetail = lazy(() => import("./pages/DevisDetail"));
const Operacao = lazy(() => import("./pages/Operacao"));
const Gestao = lazy(() => import("./pages/Gestao"));
const BI = lazy(() => import("./pages/BI"));
const Admin = lazy(() => import("./pages/Admin"));
const AceitarProposta = lazy(() => import("./pages/AceitarProposta"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function RouteShell({ children, message = "Carregando..." }: { children: React.ReactNode; message?: string }) {
  return <Suspense fallback={<LoadingScreen message={message} />}>{children}</Suspense>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen message="Verificando acesso..." />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, userRole } = useAuth();
  if (loading) return <LoadingScreen message="Verificando permissões..." />;
  if (!user) return <Navigate to="/auth" replace />;
  if (userRole !== "admin") return <Navigate to="/hub" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/hub" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RouteShell message="Abrindo sistema...">
            <Routes>
              <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/proposta/aceite/:token" element={<AceitarProposta />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/hub" element={<Hub />} />
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/conciliacao" element={<Conciliacao />} />
                <Route path="/comercial" element={<Comercial />} />
                <Route path="/comercial/devis/:id" element={<DevisDetail />} />
                <Route path="/operacao" element={<Operacao />} />
                <Route path="/gestao" element={<Gestao />} />
                <Route path="/bi" element={<BI />} />
                <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </RouteShell>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
