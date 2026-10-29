import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BookOpenText, ChevronDown, GitBranch, Layers, LogOut, Menu, Phone, Settings, Shield, UserRound, X, LayoutDashboard, Workflow as WorkflowIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { workspaceApi } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { hasWorkspacePermission, useAuth } from "../auth";
import { BrandMark } from "../components";
import { ThemeToggleButton } from "../theme";
import { cn } from "../utils";
import { ActionCenter } from "./ActionCenter";

const primaryNavItems = [
  { icon: LayoutDashboard, label: "Overview", labelKey: "nav.overview", match: "/overview", to: "/overview" },
  { icon: AlertCircle, label: "Incidents", labelKey: "nav.incidents", match: "/incidents", to: "/incidents" },
  { icon: Layers, label: "Services", labelKey: "nav.services", match: "/services", to: "/services" },
  { icon: Phone, label: "On-call", labelKey: "nav.onCall", match: "/on-call", to: "/on-call" },
  { icon: GitBranch, label: "Escalation", labelKey: "nav.escalation", match: "/escalation-policies", to: "/escalation-policies" },
  { icon: WorkflowIcon, label: "Workflows", labelKey: "nav.workflows", match: "/workflows", to: "/workflows" },
];

const utilityLinkBase = "inline-flex items-center justify-center rounded-md text-[13px] font-[650] leading-none min-h-8.5 px-2.5 no-underline whitespace-nowrap transition-colors duration-120 ease";
const menuItemBase = "flex items-center gap-2.5 rounded-md text-[13px] font-[650] leading-none min-h-9.5 px-2.5 no-underline transition-colors duration-120 ease";

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isPlatformAdmin, logout, projectId, selectProject } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  const utilityMenuRef = useRef<HTMLDivElement>(null);
  const utilityButtonRef = useRef<HTMLButtonElement>(null);
  const firstUtilityMenuItemRef = useRef<HTMLAnchorElement>(null);
  const projectsQuery = useQuery({
    queryKey: queryKeys.workspaces.mine(),
    queryFn: () => workspaceApi.listMyWorkspaces(),
  });
  const projects = projectsQuery.data ?? [];
  const currentProject = projects.find((project) => project.id === projectId);
  const canViewOperations = isPlatformAdmin || hasWorkspacePermission(currentProject?.roles ?? [], "project.manage");
  const visiblePrimaryNavItems = primaryNavItems.filter((item) =>
    item.to !== "/workflows" || canViewOperations,
  );
  const isUtilityRouteActive = ["/admin", "/projects", "/project-settings", "/user-settings"].some((route) =>
    isActiveRoute(location.pathname, route),
  );

  async function handleLogout() {
    setIsUtilityMenuOpen(false);
    await logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    setIsUtilityMenuOpen(false);
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isUtilityMenuOpen) return;

    function handleUtilityMenuDismiss(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        event.preventDefault();
        setIsUtilityMenuOpen(false);
        utilityButtonRef.current?.focus();
        return;
      }

      if (event instanceof MouseEvent && utilityMenuRef.current && !utilityMenuRef.current.contains(event.target as Node)) {
        setIsUtilityMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleUtilityMenuDismiss);
    document.addEventListener("keydown", handleUtilityMenuDismiss);
    return () => {
      document.removeEventListener("mousedown", handleUtilityMenuDismiss);
      document.removeEventListener("keydown", handleUtilityMenuDismiss);
    };
  }, [isUtilityMenuOpen]);

  useEffect(() => {
    if (!isUtilityMenuOpen) return;

    const frame = requestAnimationFrame(() => firstUtilityMenuItemRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isUtilityMenuOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-4.5 min-h-16 px-4 py-3 sm:px-7.5 bg-canvas/86 backdrop-blur-[18px] border-b border-hairline-soft">
        <Link
          aria-label="Pager Who incidents"
          className="inline-flex items-center gap-2.5 text-ink text-[15px] font-bold leading-none min-w-max no-underline"
          to="/overview"
        >
          <BrandMark />
          <span className="hidden sm:inline">Pager Who</span>
        </Link>

        <nav
          aria-label={t("nav.primary")}
          className="hidden items-center justify-self-stretch gap-0.75 max-w-full min-w-0 overflow-x-auto px-1 py-1 bg-white/4 border border-hairline rounded-full xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:flex xl:justify-self-center"
        >
          {visiblePrimaryNavItems.map((item) => {
            const active = isActiveRoute(location.pathname, item.match);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full text-sm font-semibold leading-none px-3.5 py-2.5 no-underline whitespace-nowrap transition-colors duration-120 ease",
                  active
                    ? "bg-surface-2 text-ink [&_svg]:opacity-100"
                    : "text-ink-muted hover:bg-surface-1 hover:text-ink [&_svg]:opacity-70 hover:[&_svg]:opacity-100",
                )}
                key={item.to}
                to={item.to}
              >
                <item.icon className="shrink-0" size={14} strokeWidth={2} />
                {t(item.labelKey, { defaultValue: item.label })}
              </Link>
            );
          })}
        </nav>

        <div className="col-span-1 row-start-1 flex min-w-0 items-center justify-end gap-1.5 xl:col-span-1 xl:col-start-3 xl:justify-end xl:gap-2.5">
          <div className="flex items-center gap-1">
            <ActionCenter canViewOperations={canViewOperations} projectId={projectId} />

            <Link
              aria-label="Documentation"
              className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-transparent p-0 text-ink-muted no-underline transition-colors duration-120 ease hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              title="Documentation"
              to="/docs"
            >
              <BookOpenText aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>

          <button
            aria-controls="mobile-primary-navigation"
            aria-expanded={isMobileNavOpen}
            aria-label={t("nav.primary")}
            className={cn(
              "inline-flex h-8.5 w-8.5 shrink-0 cursor-pointer items-center justify-center rounded-md border border-hairline bg-transparent p-0 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:hidden",
              isMobileNavOpen ? "bg-surface-2 text-ink" : "",
            )}
            onClick={() => setIsMobileNavOpen((current) => !current)}
            title={t("nav.primary")}
            type="button"
          >
            {isMobileNavOpen ? <X aria-hidden="true" size={16} /> : <Menu aria-hidden="true" size={16} />}
          </button>

          <div className="hidden min-w-0 max-w-44 flex-1 items-center gap-2 xl:flex xl:flex-none">
            <div className="relative min-w-0 flex-1">
              <select
                aria-busy={projectsQuery.isLoading}
                aria-label={t("nav.currentProject")}
                className="appearance-none bg-surface-1 border border-hairline rounded-md text-ink text-[13px] font-[650] leading-none max-w-55 min-h-8.5 min-w-0 w-full px-2.5 pr-8 sm:min-w-40"
                disabled={projectsQuery.isLoading || projectsQuery.isError}
                onChange={(event) => {
                  if (event.target.value) {
                    selectProject(event.target.value);
                    navigate("/overview", { replace: true });
                  }
                }}
                title={currentProject?.name ?? t("nav.selectProject")}
                value={projectId ?? ""}
              >
                <option value="">
                  {projectsQuery.isLoading
                    ? t("nav.projectsLoading")
                    : projectsQuery.isError
                      ? t("nav.projectsLoadError")
                      : t("nav.selectProject")}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle" size={14} />
            </div>
            {projectsQuery.isError ? (
              <button
                className="min-h-8.5 shrink-0 rounded-md border border-hairline bg-transparent px-2.5 text-xs font-[650] text-ink-muted hover:bg-surface-2 hover:text-ink"
                onClick={() => void projectsQuery.refetch()}
                type="button"
              >
                {t("state.retry")}
              </button>
            ) : null}
          </div>

          <div className="relative border-l border-hairline pl-2.5" ref={utilityMenuRef}>
            <button
              aria-expanded={isUtilityMenuOpen}
              aria-haspopup="menu"
              aria-label={t("nav.userMenu")}
              className={cn(
                utilityLinkBase,
                "gap-1.5 bg-transparent border border-hairline cursor-pointer px-2.25",
                isUtilityMenuOpen || isUtilityRouteActive
                  ? "bg-surface-2 text-ink"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
              onClick={() => setIsUtilityMenuOpen((current) => !current)}
              ref={utilityButtonRef}
              title={t("nav.userMenu")}
              type="button"
            >
              <UserRound size={15} strokeWidth={2} />
              <ChevronDown className={cn("transition-transform duration-120 ease", isUtilityMenuOpen ? "rotate-180" : "")} size={13} strokeWidth={2} />
            </button>

            {isUtilityMenuOpen ? (
              <div
                aria-label={t("nav.userMenu")}
                className="absolute right-0 top-11 z-50 bg-canvas-raised border border-hairline rounded-lg shadow-[0_24px_80px_rgba(0,0,0,0.45)] grid gap-1 p-2 min-w-52"
                role="menu"
              >
                <Link
                  className={cn(
                    menuItemBase,
                    isActiveRoute(location.pathname, "/projects")
                      ? "bg-surface-2 text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                  role="menuitem"
                  ref={firstUtilityMenuItemRef}
                  to="/projects"
                >
                  <Layers size={14} strokeWidth={2} />
                  {t("nav.projects")}
                </Link>
                {isPlatformAdmin ? (
                  <Link
                    className={cn(
                      menuItemBase,
                      isActiveRoute(location.pathname, "/admin")
                        ? "bg-surface-2 text-ink"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                    role="menuitem"
                    to="/admin"
                  >
                    <Shield size={14} strokeWidth={2} />
                    Admin
                  </Link>
                ) : null}
                <Link
                  className={cn(
                    menuItemBase,
                    isActiveRoute(location.pathname, "/project-settings")
                      ? "bg-surface-2 text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                  role="menuitem"
                  to="/project-settings"
                >
                  <Settings size={14} strokeWidth={2} />
                  {t("nav.projectSettings")}
                </Link>
                <Link
                  className={cn(
                    menuItemBase,
                    isActiveRoute(location.pathname, "/user-settings")
                      ? "bg-surface-2 text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                  role="menuitem"
                  to="/user-settings"
                >
                  <UserRound size={14} strokeWidth={2} />
                  {t("nav.userSettings")}
                </Link>
                <ThemeToggleButton className={menuItemBase} variant="menu" />
                <button
                  className={cn(
                    menuItemBase,
                    "bg-transparent border-0 text-ink-muted cursor-pointer text-left hover:bg-surface-2 hover:text-ink",
                  )}
                  onClick={handleLogout}
                  role="menuitem"
                  type="button"
                >
                  <LogOut size={14} strokeWidth={2} />
                  {t("nav.logout")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 xl:hidden">
          <div className="min-w-0 flex-1">
            <div className="relative min-w-0 flex-1">
            <select
              aria-busy={projectsQuery.isLoading}
              aria-label={t("nav.currentProject")}
              className="appearance-none bg-surface-1 border border-hairline rounded-md text-ink text-[13px] font-[650] leading-none min-h-8.5 min-w-0 w-full px-2.5 pr-8"
              disabled={projectsQuery.isLoading || projectsQuery.isError}
              onChange={(event) => {
                if (event.target.value) {
                  selectProject(event.target.value);
                  navigate("/overview", { replace: true });
                }
              }}
              title={currentProject?.name ?? t("nav.selectProject")}
              value={projectId ?? ""}
            >
              <option value="">
                {projectsQuery.isLoading
                  ? t("nav.projectsLoading")
                  : projectsQuery.isError
                    ? t("nav.projectsLoadError")
                    : t("nav.selectProject")}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle" size={14} />
            </div>
          </div>
          {projectsQuery.isError ? (
            <button
              className="min-h-8.5 shrink-0 rounded-md border border-hairline bg-transparent px-2.5 text-xs font-[650] text-ink-muted hover:bg-surface-2 hover:text-ink"
              onClick={() => void projectsQuery.refetch()}
              type="button"
            >
              {t("state.retry")}
            </button>
          ) : null}
        </div>

        {isMobileNavOpen ? (
          <nav
            aria-label={t("nav.primary")}
            className="col-span-2 row-start-3 grid gap-1 rounded-lg border border-hairline bg-surface-1 p-1.5 xl:hidden"
            id="mobile-primary-navigation"
          >
            {visiblePrimaryNavItems.map((item) => {
              const active = isActiveRoute(location.pathname, item.match);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm font-semibold no-underline transition-colors",
                    active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                  key={item.to}
                  onClick={() => setIsMobileNavOpen(false)}
                  to={item.to}
                >
                  <item.icon aria-hidden="true" size={15} strokeWidth={2} />
                  {t(item.labelKey, { defaultValue: item.label })}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main className="min-w-0 p-4 sm:p-7.5 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0)_240px),var(--color-canvas)]">
        <div className="mx-auto max-w-295 min-w-0 w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function isActiveRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}
