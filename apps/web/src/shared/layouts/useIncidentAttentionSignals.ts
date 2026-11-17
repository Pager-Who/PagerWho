import type { Incident } from "@im/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useStaticText } from "../i18n";

type DesktopAlertPermission = NotificationPermission | "unsupported";

const titleCountPrefix = /^\(\d+\+?\)\s/;

// Surfaces triggered incidents outside the page: a "(n)" tab-title prefix and, once the user opts in,
// a desktop notification for each newly triggered incident while the window is not focused.
export function useIncidentAttentionSignals({
  hasMore,
  incidents,
  projectId,
}: {
  hasMore: boolean;
  incidents: Incident[] | undefined;
  projectId: string | undefined;
}) {
  const t = useStaticText();
  const navigate = useNavigate();
  const [permission, setPermission] = useState<DesktopAlertPermission>(readPermission);
  const seenIdsRef = useRef<{ projectId: string | undefined; ids: Set<string> } | null>(null);
  const count = incidents?.length ?? 0;

  useEffect(() => {
    const baseTitle = document.title.replace(titleCountPrefix, "");
    document.title = count > 0 ? `(${count}${hasMore ? "+" : ""}) ${baseTitle}` : baseTitle;

    return () => {
      document.title = document.title.replace(titleCountPrefix, "");
    };
  }, [count, hasMore]);

  useEffect(() => {
    if (!incidents) return;

    const seen = seenIdsRef.current;
    // First result for a project is the baseline: incidents already open are not "new".
    if (!seen || seen.projectId !== projectId) {
      seenIdsRef.current = { projectId, ids: new Set(incidents.map((incident) => incident.id)) };
      return;
    }

    const newIncidents = incidents.filter((incident) => !seen.ids.has(incident.id));
    for (const incident of newIncidents) seen.ids.add(incident.id);

    if (permission !== "granted" || document.hasFocus()) return;

    for (const incident of newIncidents) {
      try {
        const notification = new Notification(`${incident.priority} · ${incident.title}`, {
          body: t("New triggered incident. Open Pager Who to respond."),
          icon: "/pager-who-mark.png",
          // Same tag across tabs lets the browser collapse duplicates.
          tag: `pagerwho-incident-${incident.id}`,
        });
        notification.onclick = () => {
          window.focus();
          navigate(`/incidents/${incident.id}`);
          notification.close();
        };
      } catch {
        // Some mobile browsers expose Notification but only allow it from a service worker.
      }
    }
  }, [incidents, navigate, permission, projectId, t]);

  const requestPermission = useCallback(async () => {
    if (permission === "unsupported") return;
    setPermission(await Notification.requestPermission());
  }, [permission]);

  return { desktopAlertPermission: permission, requestDesktopAlertPermission: requestPermission };
}

function readPermission(): DesktopAlertPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
