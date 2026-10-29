import type { Page } from "@playwright/test";
import type { OnCallOverride, OnCallSchedule } from "@im/contracts";
import { apiPattern, fulfillJson, fulfillUnhandledApi } from "./api";
import {
  e2eActiveWorkspace,
  e2eNow,
  e2eOnCallOverrideId,
  e2eOnCallPrimaryRotationId,
  e2eOnCallScheduleId,
  e2eOnCallSecondaryRotationId,
  e2eSecondaryUserId,
  e2eUserId,
  e2eWorkspaceId,
} from "./test-data";

type ScheduleInput = {
  name: string;
  rotations: Array<{
    layer: "primary" | "secondary";
    participants: string[];
    rotation_interval: number;
    rotation_type: "custom" | "daily" | "weekly";
    starts_at: string;
    timezone: string;
  }>;
  timezone: string;
  workspace_id: string;
};

type MockSchedule = OnCallSchedule;
type MockOverride = OnCallOverride;

type OverrideInput = {
  ends_at: string;
  layer: "primary" | "secondary";
  schedule_id: string;
  starts_at: string;
  user_id: string;
};

export async function mockOnCallScheduleCreateFlow(page: Page) {
  let schedule: MockSchedule | null = null;

  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/api/v1/me/workspaces") {
      return fulfillJson(route, {
        data: [e2eActiveWorkspace],
      });
    }

    if (method === "GET" && path === "/api/v1/me/invites") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/incidents") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/on-call/schedules") {
      return fulfillJson(route, {
        data: schedule ? [schedule] : [],
      });
    }

    if (method === "POST" && path === "/api/v1/on-call/schedules") {
      schedule = createSchedule(request.postDataJSON() as ScheduleInput);

      return fulfillJson(route, {
        data: schedule,
      }, 201);
    }

    if (method === "GET" && path === `/api/v1/on-call/schedules/${e2eOnCallScheduleId}/preview`) {
      return fulfillJson(route, {
        data: createPreview(url),
      });
    }

    if (method === "GET" && path === "/api/v1/services") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/teams") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/users") {
      return fulfillJson(route, {
        data: e2eOnCallUsers,
      });
    }

    if (method === "GET" && path === `/api/v1/workspaces/${e2eWorkspaceId}/members`) {
      return fulfillJson(route, {
        data: e2eOnCallUsers.map((user) => ({
          workspace_id: e2eWorkspaceId,
          user_id: user.id,
          role: user.id === e2eUserId ? "responder" : "admin",
          created_at: e2eNow,
          updated_at: e2eNow,
        })),
      });
    }

    return fulfillUnhandledApi(route);
  });
}

export async function mockOnCallOverrideCreateFlow(page: Page) {
  let schedule = createSeedSchedule();

  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/api/v1/me/workspaces") {
      return fulfillJson(route, {
        data: [e2eActiveWorkspace],
      });
    }

    if (method === "GET" && path === "/api/v1/me/invites") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/incidents") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/on-call/schedules") {
      return fulfillJson(route, {
        data: [schedule],
      });
    }

    if (method === "POST" && path === "/api/v1/on-call/overrides") {
      const override = createOverride(request.postDataJSON() as OverrideInput);
      schedule = {
        ...schedule,
        overrides: [override],
        updated_at: e2eNow,
      };

      return fulfillJson(route, {
        data: override,
      }, 201);
    }

    if (method === "GET" && path === `/api/v1/on-call/schedules/${e2eOnCallScheduleId}/preview`) {
      return fulfillJson(route, {
        data: createPreview(url),
      });
    }

    if (method === "GET" && path === "/api/v1/services") {
      return fulfillJson(route, {
        data: {
          items: [],
          next_cursor: null,
        },
      });
    }

    if (method === "GET" && path === "/api/v1/teams") {
      return fulfillJson(route, {
        data: [],
      });
    }

    if (method === "GET" && path === "/api/v1/users") {
      return fulfillJson(route, {
        data: e2eOnCallUsers,
      });
    }

    if (method === "GET" && path === `/api/v1/workspaces/${e2eWorkspaceId}/members`) {
      return fulfillJson(route, {
        data: e2eOnCallUsers.map((user) => ({
          workspace_id: e2eWorkspaceId,
          user_id: user.id,
          role: user.id === e2eUserId ? "responder" : "admin",
          created_at: e2eNow,
          updated_at: e2eNow,
        })),
      });
    }

    return fulfillUnhandledApi(route);
  });
}

const e2eOnCallUsers = [
  {
    id: e2eUserId,
    email: "primary@example.com",
    name: "Primary Responder",
    notification_settings: {
      contacts: {
        has_slack_webhook_url: false,
        has_email_delivery_webhook_url: false,
        has_phone_number: false,
        phone_number_verified: false,
        phone_number_masked: null,
      },
      preferences: [],
    },
    created_at: e2eNow,
    updated_at: e2eNow,
  },
  {
    id: e2eSecondaryUserId,
    email: "secondary@example.com",
    name: "Secondary Responder",
    notification_settings: {
      contacts: {
        has_slack_webhook_url: false,
        has_email_delivery_webhook_url: false,
        has_phone_number: false,
        phone_number_verified: false,
        phone_number_masked: null,
      },
      preferences: [],
    },
    created_at: e2eNow,
    updated_at: e2eNow,
  },
];

function createSchedule(input: ScheduleInput): MockSchedule {
  return {
    id: e2eOnCallScheduleId,
    workspace_id: input.workspace_id,
    name: input.name,
    team_id: null,
    service_id: null,
    timezone: input.timezone,
    rotations: input.rotations.map((rotation) => ({
      id: rotation.layer === "primary" ? e2eOnCallPrimaryRotationId : e2eOnCallSecondaryRotationId,
      schedule_id: e2eOnCallScheduleId,
      layer: rotation.layer,
      rotation_type: rotation.rotation_type,
      rotation_interval: rotation.rotation_interval,
      starts_at: rotation.starts_at,
      timezone: rotation.timezone,
      participants: rotation.participants.map((userId, position) => ({
        user_id: userId,
        position,
      })),
    })),
    overrides: [],
    created_at: e2eNow,
    updated_at: e2eNow,
  };
}

function createSeedSchedule() {
  return createSchedule({
    name: "Checkout responders",
    rotations: [
      {
        layer: "primary",
        participants: [e2eUserId],
        rotation_interval: 1,
        rotation_type: "weekly",
        starts_at: e2eNow,
        timezone: "Asia/Seoul",
      },
      {
        layer: "secondary",
        participants: [e2eSecondaryUserId],
        rotation_interval: 1,
        rotation_type: "weekly",
        starts_at: e2eNow,
        timezone: "Asia/Seoul",
      },
    ],
    timezone: "Asia/Seoul",
    workspace_id: e2eWorkspaceId,
  });
}

function createOverride(input: OverrideInput): MockOverride {
  return {
    id: e2eOnCallOverrideId,
    schedule_id: input.schedule_id,
    user_id: input.user_id,
    layer: input.layer,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    created_at: e2eNow,
  };
}

function createPreview(url: URL) {
  const startsAt = url.searchParams.get("starts_at") ?? e2eNow;
  const endsAt = url.searchParams.get("ends_at") ?? "2026-06-23T00:00:00.000Z";
  const startsAtDate = new Date(startsAt);
  const endsAtDate = new Date(startsAtDate.getTime() + 60 * 60 * 1000);

  return {
    schedule_id: e2eOnCallScheduleId,
    timezone: "Asia/Seoul",
    starts_at: startsAt,
    ends_at: endsAt,
    step_minutes: Number(url.searchParams.get("step_minutes") ?? 60),
    entries: [{
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      local_starts_at: startsAtDate.toISOString(),
      local_ends_at: endsAtDate.toISOString(),
      primary_user_id: e2eUserId,
      secondary_user_id: e2eSecondaryUserId,
    }],
  };
}
