import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AdminPage } from "../features/admin/pages/AdminPage";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { DocsPage } from "../features/docs/pages/DocsPage";
import { EscalationPoliciesPage } from "../features/escalation-policies/pages/EscalationPoliciesPage";
import { IncidentDetailPage } from "../features/incidents/pages/IncidentDetailPage";
import { IncidentListPage } from "../features/incidents/pages/IncidentListPage";
import { LandingPage } from "../features/landing/pages/LandingPage";
import { LegalPage } from "../features/legal/pages/LegalPage";
import { OnCallPage } from "../features/on-call/pages/OnCallPage";
import { OperationsPage } from "../features/operations/pages/OperationsPage";
import { OverviewPage } from "../features/overview/pages/OverviewPage";
import { ProjectSetupPage } from "../features/projects/pages/ProjectSetupPage";
import { ServiceDetailPage } from "../features/services/pages/ServiceDetailPage";
import { ServiceListPage } from "../features/services/pages/ServiceListPage";
import { ProjectSettingsPage } from "../features/settings/pages/ProjectSettingsPage";
import { UserSettingsPage } from "../features/settings/pages/UserSettingsPage";
import { WorkflowsPage } from "../features/workflows/pages/WorkflowsPage";
import { useAuth } from "../shared/auth";
import { LanguageSelect, useStaticText } from "../shared/i18n";
import { AppLayout } from "../shared/layouts/AppLayout";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:slug" element={<DocsPage />} />
        <Route path="/privacy" element={<LegalPage document="privacy" />} />
        <Route path="/terms" element={<LegalPage document="terms" />} />
        <Route element={<RequireAuth />}>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/projects" element={<ProjectSetupPage />} />
          <Route element={<RequireProject />}>
            <Route element={<AppLayout />}>
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/incidents" element={<IncidentListPage />} />
              <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
              <Route path="/services" element={<ServiceListPage />} />
              <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="/on-call" element={<OnCallPage />} />
              <Route path="/escalation-policies" element={<EscalationPoliciesPage />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/settings" element={<Navigate to="/user-settings" replace />} />
              <Route path="/user-settings" element={<UserSettingsPage />} />
              <Route path="/project-settings" element={<ProjectSettingsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
      <LanguageSelect variant="floating" />
    </>
  );
}

function RequireAuth() {
  const location = useLocation();
  const { isAuthenticated, isCheckingAuth } = useAuth();

  if (isCheckingAuth) {
    return <AuthLoadingScreen />;
  }

  return isAuthenticated
    ? <Outlet />
    : (
        <Navigate
          replace
          state={{ returnTo: `${location.pathname}${location.search}` }}
          to="/login"
        />
      );
}

function RequireProject() {
  const { projectId } = useAuth();

  return projectId ? <Outlet /> : <Navigate to="/projects" replace />;
}

function RequireAdmin() {
  const { isPlatformAdmin } = useAuth();

  return isPlatformAdmin ? <Outlet /> : <Navigate to="/overview" replace />;
}

function AuthLoadingScreen() {
  const t = useStaticText();

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-7.5">
      <div className="grid gap-2 text-center">
        <span className="text-ink text-sm font-[650]">{t("Opening session")}</span>
        <span className="text-ink-muted text-xs">{t("Checking authentication state.")}</span>
      </div>
    </main>
  );
}
