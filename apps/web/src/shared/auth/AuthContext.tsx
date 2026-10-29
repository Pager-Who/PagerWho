import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PlatformRole } from "@im/contracts";

import { authApi } from "../api/client";
import {
  clearStoredProject,
  clearStoredSession,
  getStoredProjectId,
  getStoredUserId,
  setStoredProjectId,
  setStoredUserId,
  subscribeToSessionChange,
} from "./session";

type AuthContextValue = {
  clearProject: () => void;
  isCheckingAuth: boolean;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  login: (userId: string) => void;
  logout: () => Promise<void>;
  platformRoles: PlatformRole[];
  projectId: string | undefined;
  refreshSession: () => Promise<string | undefined>;
  selectProject: (projectId: string) => void;
  userId: string | undefined;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function subscribe(listener: () => void) {
  return subscribeToSessionChange(listener);
}

function getSnapshot() {
  return `${getStoredUserId() ?? ""}:${getStoredProjectId() ?? ""}`;
}

function getServerSnapshot() {
  return ":";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [platformRoles, setPlatformRoles] = useState<PlatformRole[]>([]);
  const userId = getStoredUserId();
  const projectId = getStoredProjectId();

  const refreshSession = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setStoredUserId(me.user.id);
      setPlatformRoles(me.platform_roles ?? []);
      return me.user.id;
    } catch {
      setPlatformRoles([]);
      clearStoredSession();
      return undefined;
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Local state still needs to be cleared if the API is unavailable.
    } finally {
      clearStoredSession();
      setPlatformRoles([]);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    clearProject: clearStoredProject,
    isCheckingAuth,
    isAuthenticated: Boolean(userId),
    isPlatformAdmin: platformRoles.includes("platform_admin"),
    login: setStoredUserId,
    logout,
    platformRoles,
    projectId,
    refreshSession,
    selectProject: setStoredProjectId,
    userId,
  }), [isCheckingAuth, logout, platformRoles, projectId, refreshSession, userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
