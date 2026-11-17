import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";

import { LandingPage } from "../features/landing/pages/LandingPage";
import { useAuth } from "../shared/auth";
import { LanguageSelect, useStaticText } from "../shared/i18n";

// Route-level code splitting: only the landing page ships in the entry chunk.
const AppLayout = lazy(() => import("../shared/layouts/AppLayout").then((module) => ({ default: module.AppLayout })));
const AdminPage = lazy(() => import("../features/admin/pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const AuthPage = lazy(() => import("../features/auth/pages/AuthPage").then((module) => ({ default: module.AuthPage })));
const DocsPage = lazy(() => import("../features/docs/pages/DocsPage").then((module) => ({ default: module.DocsPage })));
const EscalationPoliciesPage = lazy(() => import("../features/escalation-policies/pages/EscalationPoliciesPage").then((module) => ({ default: module.EscalationPoliciesPage })));
const IncidentAckPage = lazy(() => import("../features/incidents/pages/IncidentAckPage").then((module) => ({ default: module.IncidentAckPage })));
const IncidentDetailPage = lazy(() => import("../features/incidents/pages/IncidentDetailPage").then((module) => ({ default: module.IncidentDetailPage })));
const IncidentListPage = lazy(() => import("../features/incidents/pages/IncidentListPage").then((module) => ({ default: module.IncidentListPage })));
const LegalPage = lazy(() => import("../features/legal/pages/LegalPage").then((module) => ({ default: module.LegalPage })));
const OnCallPage = lazy(() => import("../features/on-call/pages/OnCallPage").then((module) => ({ default: module.OnCallPage })));
const OperationsPage = lazy(() => import("../features/operations/pages/OperationsPage").then((module) => ({ default: module.OperationsPage })));
const OverviewPage = lazy(() => import("../features/overview/pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const ProjectSetupPage = lazy(() => import("../features/projects/pages/ProjectSetupPage").then((module) => ({ default: module.ProjectSetupPage })));
const ServiceDetailPage = lazy(() => import("../features/services/pages/ServiceDetailPage").then((module) => ({ default: module.ServiceDetailPage })));
const ServiceListPage = lazy(() => import("../features/services/pages/ServiceListPage").then((module) => ({ default: module.ServiceListPage })));
const ProjectSettingsPage = lazy(() => import("../features/settings/pages/ProjectSettingsPage").then((module) => ({ default: module.ProjectSettingsPage })));
const UserSettingsPage = lazy(() => import("../features/settings/pages/UserSettingsPage").then((module) => ({ default: module.UserSettingsPage })));
const WorkflowsPage = lazy(() => import("../features/workflows/pages/WorkflowsPage").then((module) => ({ default: module.WorkflowsPage })));

export function App() {
  return (
    <>
      <Suspense fallback={<RouteLoadingScreen />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/ack/:token" element={<IncidentAckPage />} />
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
      </Suspense>
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

function RouteLoadingScreen() {
  return <main aria-busy="true" className="min-h-screen bg-canvas" />;
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
