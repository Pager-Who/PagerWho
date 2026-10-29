import type { Page } from "@playwright/test";
import { e2eUserId } from "./test-data";

type AuthenticateSessionOptions = {
  userId?: string;
  workspaceId?: string | null;
};

export async function authenticateSession(page: Page, options: AuthenticateSessionOptions = {}) {
  await page.addInitScript(
    ({ currentUserId, currentWorkspaceId }) => {
      localStorage.setItem("pagerwho.currentUserId", currentUserId);

      if (currentWorkspaceId) {
        localStorage.setItem("pagerwho.currentProjectId", currentWorkspaceId);
        return;
      }

      localStorage.removeItem("pagerwho.currentProjectId");
    },
    {
      currentUserId: options.userId ?? e2eUserId,
      currentWorkspaceId: options.workspaceId ?? null,
    },
  );
}
