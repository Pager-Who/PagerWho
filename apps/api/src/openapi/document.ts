const uuidParam = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: {
    type: "string",
    format: "uuid",
  },
});

const workspaceQueryParam = {
  name: "workspace_id",
  in: "query",
  schema: {
    type: "string",
    format: "uuid",
  },
};

const limitQueryParam = {
  name: "limit",
  in: "query",
  schema: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 25,
  },
};

const cursorQueryParam = {
  name: "cursor",
  in: "query",
  schema: {
    type: "string",
    format: "uuid",
  },
};

const actorUserHeader = {
  name: "Cookie",
  in: "header",
  required: true,
  schema: {
    type: "string",
  },
  description: "Authenticated session cookie.",
};

const jsonBody = (schemaRef: string) => ({
  required: true,
  content: {
    "application/json": {
      schema: {
        $ref: schemaRef,
      },
    },
  },
});

const dataResponse = (description: string, schemaRef: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            $ref: schemaRef,
          },
        },
      },
    },
  },
});

const dataArrayResponse = (description: string, schemaRef: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "array",
            items: {
              $ref: schemaRef,
            },
          },
        },
      },
    },
  },
});

const dataPaginatedResponse = (description: string, schemaRef: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            $ref: schemaRef,
          },
        },
      },
    },
  },
});

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Incident Management API",
    version: "0.1.0",
    description: "API for service-centric incident response, on-call, escalation, webhooks, notifications, and operations.",
  },
  servers: [
    {
      url: "http://127.0.0.1:3000",
      description: "Local API server",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Services" },
    { name: "Incidents" },
    { name: "Webhooks" },
    { name: "On-call" },
    { name: "Escalation policies" },
    { name: "Notifications" },
    { name: "Activity logs" },
    { name: "Audit logs" },
    { name: "Users" },
    { name: "Teams" },
    { name: "Workspaces" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": dataResponse("API server is healthy", "#/components/schemas/Health"),
        },
      },
    },
    "/api/v1/auth/providers": {
      get: {
        tags: ["Auth"],
        summary: "List configured auth providers",
        responses: {
          "200": dataResponse("Configured auth provider", "#/components/schemas/AuthProviderList"),
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        responses: {
          "200": dataResponse("Current authenticated user", "#/components/schemas/AuthMe"),
        },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register with email and password",
        requestBody: jsonBody("#/components/schemas/RegisterRequest"),
        responses: {
          "201": dataResponse("Registered user", "#/components/schemas/RegisterResponse"),
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        requestBody: jsonBody("#/components/schemas/LoginRequest"),
        responses: {
          "200": dataResponse("Created auth session", "#/components/schemas/AuthSessionResponse"),
        },
      },
    },
    "/api/v1/auth/email-verification/resend": {
      post: {
        tags: ["Auth"],
        summary: "Resend email verification",
        requestBody: jsonBody("#/components/schemas/ResendEmailVerificationRequest"),
        responses: {
          "200": dataResponse("Email verification resend result", "#/components/schemas/AcceptedResponse"),
        },
      },
    },
    "/api/v1/auth/email-verification/confirm": {
      post: {
        tags: ["Auth"],
        summary: "Confirm email verification",
        requestBody: jsonBody("#/components/schemas/ConfirmEmailVerificationRequest"),
        responses: {
          "200": dataResponse("Verified user", "#/components/schemas/ConfirmEmailVerificationResponse"),
        },
      },
    },
    "/api/v1/auth/password-reset/start": {
      post: {
        tags: ["Auth"],
        summary: "Start password reset",
        requestBody: jsonBody("#/components/schemas/StartPasswordResetRequest"),
        responses: {
          "200": dataResponse("Password reset start result", "#/components/schemas/AcceptedResponse"),
        },
      },
    },
    "/api/v1/auth/password-reset/complete": {
      post: {
        tags: ["Auth"],
        summary: "Complete password reset",
        requestBody: jsonBody("#/components/schemas/CompletePasswordResetRequest"),
        responses: {
          "200": dataResponse("Password reset completion result", "#/components/schemas/CompletePasswordResetResponse"),
        },
      },
    },
    "/api/v1/auth/oidc/start": {
      get: {
        tags: ["Auth"],
        summary: "Start OIDC login",
        parameters: [
          {
            name: "return_to",
            in: "query",
            schema: { type: "string" },
            description: "Optional relative web app path to return to after login.",
          },
        ],
        responses: {
          "302": {
            description: "Redirect to OIDC provider authorization endpoint",
          },
        },
      },
    },
    "/api/v1/auth/oidc/callback": {
      get: {
        tags: ["Auth"],
        summary: "Complete OIDC login",
        parameters: [
          { name: "code", in: "query", schema: { type: "string" } },
          { name: "state", in: "query", schema: { type: "string" } },
          { name: "error", in: "query", schema: { type: "string" } },
          { name: "error_description", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "302": {
            description: "Redirect back to web app after login",
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout current session",
        responses: {
          "200": dataResponse("Logout result", "#/components/schemas/LogoutResponse"),
        },
      },
    },
    "/api/v1/services": {
      get: {
        tags: ["Services"],
        summary: "List services",
        parameters: [workspaceQueryParam, limitQueryParam, cursorQueryParam],
        responses: {
          "200": dataPaginatedResponse("Service list", "#/components/schemas/PaginatedServices"),
        },
      },
      post: {
        tags: ["Services"],
        summary: "Create service",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateServiceRequest"),
        responses: {
          "201": dataResponse("Created service with default webhook one-time secret", "#/components/schemas/CreateServiceResponse"),
        },
      },
    },
    "/api/v1/workspaces": {
      post: {
        tags: ["Workspaces"],
        summary: "Create workspace",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateWorkspaceRequest"),
        responses: {
          "201": dataResponse("Created workspace", "#/components/schemas/Workspace"),
        },
      },
    },
    "/api/v1/me/workspaces": {
      get: {
        tags: ["Workspaces"],
        summary: "List my workspaces",
        parameters: [actorUserHeader],
        responses: {
          "200": dataArrayResponse("My workspaces", "#/components/schemas/Workspace"),
        },
      },
    },
    "/api/v1/me/invites": {
      get: {
        tags: ["Workspaces"],
        summary: "List my pending workspace invites",
        parameters: [actorUserHeader],
        responses: {
          "200": dataArrayResponse("Workspace invites", "#/components/schemas/WorkspaceInvite"),
        },
      },
    },
    "/api/v1/me/invites/{inviteId}/accept": {
      post: {
        tags: ["Workspaces"],
        summary: "Accept workspace invite",
        parameters: [actorUserHeader, uuidParam("inviteId")],
        responses: {
          "200": dataResponse("Workspace member", "#/components/schemas/WorkspaceMember"),
        },
      },
    },
    "/api/v1/me/invites/{inviteId}/decline": {
      post: {
        tags: ["Workspaces"],
        summary: "Decline workspace invite",
        parameters: [actorUserHeader, uuidParam("inviteId")],
        responses: {
          "200": dataResponse("Workspace invite", "#/components/schemas/WorkspaceInvite"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/members": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspace members",
        parameters: [actorUserHeader, uuidParam("workspaceId")],
        responses: {
          "200": dataArrayResponse("Workspace members", "#/components/schemas/WorkspaceMember"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/members/{userId}/roles": {
      patch: {
        tags: ["Workspaces"],
        summary: "Update workspace member role keys",
        parameters: [actorUserHeader, uuidParam("workspaceId"), uuidParam("userId")],
        requestBody: jsonBody("#/components/schemas/UpdateWorkspaceMemberRolesRequest"),
        responses: {
          "200": dataResponse("Updated workspace member", "#/components/schemas/WorkspaceMember"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/invites": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspace invites",
        parameters: [actorUserHeader, uuidParam("workspaceId")],
        responses: {
          "200": dataArrayResponse("Workspace invites", "#/components/schemas/WorkspaceInvite"),
        },
      },
      post: {
        tags: ["Workspaces"],
        summary: "Invite registered user to workspace",
        parameters: [actorUserHeader, uuidParam("workspaceId")],
        requestBody: jsonBody("#/components/schemas/CreateWorkspaceInviteRequest"),
        responses: {
          "201": dataResponse("Created workspace invite", "#/components/schemas/WorkspaceInvite"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/invites/{inviteId}": {
      delete: {
        tags: ["Workspaces"],
        summary: "Revoke pending workspace invite",
        parameters: [actorUserHeader, uuidParam("workspaceId"), uuidParam("inviteId")],
        responses: {
          "200": dataResponse("Revoked workspace invite", "#/components/schemas/WorkspaceInvite"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/notification-provider-settings": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspace notification provider settings",
        parameters: [actorUserHeader, uuidParam("workspaceId")],
        responses: {
          "200": dataArrayResponse("Notification provider settings", "#/components/schemas/WorkspaceNotificationProviderSetting"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/notification-provider-settings/{provider}": {
      put: {
        tags: ["Workspaces"],
        summary: "Update workspace notification provider setting",
        parameters: [
          actorUserHeader,
          uuidParam("workspaceId"),
          {
            name: "provider",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/WorkspaceNotificationProvider" },
          },
        ],
        requestBody: jsonBody("#/components/schemas/UpdateWorkspaceNotificationProviderSettingRequest"),
        responses: {
          "200": dataResponse("Notification provider setting", "#/components/schemas/WorkspaceNotificationProviderSetting"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/webhook-integrations": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspace webhook integrations",
        parameters: [actorUserHeader, uuidParam("workspaceId")],
        responses: {
          "200": dataArrayResponse("Webhook integrations", "#/components/schemas/WorkspaceWebhookIntegration"),
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/webhook-integrations/{type}": {
      put: {
        tags: ["Workspaces"],
        summary: "Update workspace webhook integration",
        parameters: [
          actorUserHeader,
          uuidParam("workspaceId"),
          { name: "type", in: "path", required: true, schema: { $ref: "#/components/schemas/WorkspaceWebhookIntegrationType" } },
        ],
        requestBody: jsonBody("#/components/schemas/UpdateWorkspaceWebhookIntegrationRequest"),
        responses: {
          "200": dataResponse("Webhook integration", "#/components/schemas/WorkspaceWebhookIntegration"),
        },
      },
    },
    "/api/v1/services/{serviceId}": {
      get: {
        tags: ["Services"],
        summary: "Get service",
        parameters: [uuidParam("serviceId")],
        responses: {
          "200": dataResponse("Service", "#/components/schemas/Service"),
        },
      },
      put: {
        tags: ["Services"],
        summary: "Update service",
        parameters: [actorUserHeader, uuidParam("serviceId")],
        requestBody: jsonBody("#/components/schemas/UpdateServiceRequest"),
        responses: {
          "200": dataResponse("Updated service", "#/components/schemas/Service"),
        },
      },
      delete: {
        tags: ["Services"],
        summary: "Delete service",
        parameters: [actorUserHeader, uuidParam("serviceId")],
        responses: {
          "200": dataResponse("Deleted service", "#/components/schemas/Service"),
        },
      },
    },
    "/api/v1/services/{serviceId}/incidents": {
      get: {
        tags: ["Services", "Incidents"],
        summary: "List incidents for a service",
        parameters: [
          uuidParam("serviceId"),
          { name: "severity", in: "query", schema: { $ref: "#/components/schemas/IncidentSeverity" } },
          { name: "priority", in: "query", schema: { $ref: "#/components/schemas/IncidentPriority" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/IncidentStatus" } },
          limitQueryParam,
          cursorQueryParam,
        ],
        responses: {
          "200": dataPaginatedResponse("Incident list", "#/components/schemas/PaginatedIncidents"),
        },
      },
    },
    "/api/v1/services/{serviceId}/webhook-endpoint": {
      get: {
        tags: ["Services", "Webhooks"],
        summary: "Get active webhook endpoint for a service",
        parameters: [uuidParam("serviceId")],
        responses: {
          "200": dataResponse("Webhook endpoint", "#/components/schemas/WebhookEndpoint"),
        },
      },
    },
    "/api/v1/services/{serviceId}/webhook-endpoints": {
      get: {
        tags: ["Services", "Webhooks"],
        summary: "List webhook endpoints for a service",
        parameters: [uuidParam("serviceId")],
        responses: {
          "200": dataArrayResponse("Webhook endpoints", "#/components/schemas/WebhookEndpoint"),
        },
      },
      post: {
        tags: ["Services", "Webhooks"],
        summary: "Create service webhook",
        parameters: [actorUserHeader, uuidParam("serviceId")],
        responses: {
          "201": dataResponse("Created webhook endpoint with one-time secret", "#/components/schemas/WebhookEndpointWithSecret"),
        },
      },
    },
    "/api/v1/services/{serviceId}/webhook-integrations": {
      get: {
        tags: ["Services", "Webhooks"],
        summary: "List service webhook integrations",
        parameters: [actorUserHeader, uuidParam("serviceId")],
        responses: { "200": dataArrayResponse("Service webhook integrations", "#/components/schemas/ServiceWebhookIntegration") },
      },
    },
    "/api/v1/services/{serviceId}/webhook-integrations/{type}": {
      put: {
        tags: ["Services", "Webhooks"],
        summary: "Update a service webhook integration",
        parameters: [actorUserHeader, uuidParam("serviceId"), { name: "type", in: "path", required: true, schema: { $ref: "#/components/schemas/WorkspaceWebhookIntegrationType" } }],
        requestBody: jsonBody("#/components/schemas/UpdateServiceWebhookIntegrationRequest"),
        responses: { "200": dataResponse("Service webhook integration", "#/components/schemas/ServiceWebhookIntegration") },
      },
    },
    "/api/v1/incidents": {
      get: {
        tags: ["Incidents"],
        summary: "List incidents",
        parameters: [
          { name: "service_id", in: "query", schema: { type: "string", format: "uuid" } },
          workspaceQueryParam,
          { name: "severity", in: "query", schema: { $ref: "#/components/schemas/IncidentSeverity" } },
          { name: "priority", in: "query", schema: { $ref: "#/components/schemas/IncidentPriority" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/IncidentStatus" } },
          limitQueryParam,
          cursorQueryParam,
        ],
        responses: {
          "200": dataPaginatedResponse("Incident list", "#/components/schemas/PaginatedIncidents"),
        },
      },
      post: {
        tags: ["Incidents"],
        summary: "Create manual incident",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateIncidentRequest"),
        responses: {
          "201": dataResponse("Created incident", "#/components/schemas/Incident"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}": {
      get: {
        tags: ["Incidents"],
        summary: "Get incident",
        parameters: [uuidParam("incidentId")],
        responses: {
          "200": dataResponse("Incident", "#/components/schemas/Incident"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/detail": {
      get: {
        tags: ["Incidents", "Notifications", "Escalation policies"],
        summary: "Get incident detail summary",
        parameters: [uuidParam("incidentId")],
        responses: {
          "200": dataResponse("Incident detail", "#/components/schemas/IncidentDetail"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/ack": {
      post: {
        tags: ["Incidents"],
        summary: "Acknowledge incident",
        parameters: [actorUserHeader, uuidParam("incidentId")],
        requestBody: jsonBody("#/components/schemas/IncidentActionRequest"),
        responses: {
          "200": dataResponse("Acknowledged incident", "#/components/schemas/Incident"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/resolve": {
      post: {
        tags: ["Incidents"],
        summary: "Resolve incident",
        parameters: [actorUserHeader, uuidParam("incidentId")],
        requestBody: jsonBody("#/components/schemas/IncidentActionRequest"),
        responses: {
          "200": dataResponse("Resolved incident", "#/components/schemas/Incident"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/priority": {
      patch: {
        tags: ["Incidents"],
        summary: "Update incident priority",
        parameters: [actorUserHeader, uuidParam("incidentId")],
        requestBody: jsonBody("#/components/schemas/UpdateIncidentPriorityRequest"),
        responses: {
          "200": dataResponse("Updated incident", "#/components/schemas/Incident"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/timeline": {
      get: {
        tags: ["Incidents"],
        summary: "List incident timeline entries",
        parameters: [uuidParam("incidentId"), limitQueryParam, cursorQueryParam],
        responses: {
          "200": dataPaginatedResponse("Timeline", "#/components/schemas/PaginatedIncidentTimelineEntries"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/notifications": {
      get: {
        tags: ["Incidents", "Notifications"],
        summary: "List incident notifications",
        parameters: [
          uuidParam("incidentId"),
          { name: "status", in: "query", schema: { type: "string", enum: ["pending", "sending", "sent", "sent_after_ack", "failed", "retrying", "skipped"] } },
          { name: "channel", in: "query", schema: { type: "string", enum: ["slack", "email", "sms", "phone", "webhook"] } },
          limitQueryParam,
          cursorQueryParam,
        ],
        responses: {
          "200": dataPaginatedResponse("Notifications", "#/components/schemas/PaginatedNotificationLogs"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/escalation": {
      get: {
        tags: ["Incidents", "Escalation policies"],
        summary: "Get incident escalation state",
        parameters: [uuidParam("incidentId")],
        responses: {
          "200": dataResponse("Escalation state", "#/components/schemas/IncidentEscalationState"),
        },
      },
    },
    "/api/v1/incidents/{incidentId}/escalation/manual-trigger": {
      post: {
        tags: ["Incidents", "Escalation policies"],
        summary: "Trigger manual incident escalation",
        parameters: [actorUserHeader, uuidParam("incidentId")],
        requestBody: jsonBody("#/components/schemas/ManualEscalationRequest"),
        responses: {
          "200": dataResponse("Escalation state", "#/components/schemas/IncidentEscalationState"),
        },
      },
    },
    "/api/v1/webhooks/{endpointId}": {
      post: {
        tags: ["Webhooks"],
        summary: "Receive webhook event",
        parameters: [
          uuidParam("endpointId"),
          {
            name: "token",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Webhook secret token from the secret-bearing URL returned as url_with_secret when the endpoint is created or rotated.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WebhookIncidentPayload" },
            },
          },
        },
        responses: {
          "200": dataResponse("Merged or duplicate webhook event", "#/components/schemas/WebhookIngestionResult"),
          "201": dataResponse("Created incident from webhook", "#/components/schemas/WebhookIngestionResult"),
        },
      },
    },
    "/api/v1/webhooks/endpoints/{endpointId}/rotate-secret": {
      post: {
        tags: ["Webhooks"],
        summary: "Rotate webhook endpoint secret",
        parameters: [actorUserHeader, uuidParam("endpointId")],
        responses: {
          "200": dataResponse("Webhook endpoint with new one-time secret", "#/components/schemas/WebhookEndpointWithSecret"),
        },
      },
    },
    "/api/v1/webhooks/endpoints/{endpointId}": {
      delete: {
        tags: ["Webhooks"],
        summary: "Delete webhook endpoint",
        parameters: [actorUserHeader, uuidParam("endpointId")],
        responses: {
          "200": dataResponse("Deleted webhook endpoint", "#/components/schemas/WebhookEndpoint"),
        },
      },
    },
    "/api/v1/webhooks/endpoints/{endpointId}/disable": {
      post: {
        tags: ["Webhooks"],
        summary: "Disable webhook endpoint",
        parameters: [actorUserHeader, uuidParam("endpointId")],
        responses: {
          "200": dataResponse("Disabled webhook endpoint", "#/components/schemas/WebhookEndpoint"),
        },
      },
    },
    "/api/v1/on-call": {
      get: {
        tags: ["On-call"],
        summary: "Get current on-call responders",
        parameters: [
          { name: "service_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          { name: "at", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": dataResponse("Current on-call", "#/components/schemas/CurrentOnCall"),
        },
      },
    },
    "/api/v1/on-call/schedules": {
      get: {
        tags: ["On-call"],
        summary: "List on-call schedules",
        parameters: [workspaceQueryParam],
        responses: {
          "200": dataArrayResponse("Schedules", "#/components/schemas/OnCallSchedule"),
        },
      },
      post: {
        tags: ["On-call"],
        summary: "Create on-call schedule",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateOnCallScheduleRequest"),
        responses: {
          "201": dataResponse("Created schedule", "#/components/schemas/OnCallSchedule"),
        },
      },
    },
    "/api/v1/on-call/schedules/{scheduleId}": {
      get: {
        tags: ["On-call"],
        summary: "Get on-call schedule",
        parameters: [uuidParam("scheduleId")],
        responses: {
          "200": dataResponse("Schedule", "#/components/schemas/OnCallSchedule"),
        },
      },
      put: {
        tags: ["On-call"],
        summary: "Update on-call schedule",
        parameters: [actorUserHeader, uuidParam("scheduleId")],
        requestBody: jsonBody("#/components/schemas/UpdateOnCallScheduleRequest"),
        responses: {
          "200": dataResponse("Updated schedule", "#/components/schemas/OnCallSchedule"),
        },
      },
      delete: {
        tags: ["On-call"],
        summary: "Delete on-call schedule",
        parameters: [actorUserHeader, uuidParam("scheduleId")],
        responses: {
          "200": dataResponse("Deleted schedule", "#/components/schemas/OnCallSchedule"),
          "409": dataResponse("Schedule is used by an escalation policy", "#/components/schemas/ApiError"),
        },
      },
    },
    "/api/v1/on-call/schedules/{scheduleId}/preview": {
      get: {
        tags: ["On-call"],
        summary: "Preview on-call schedule in its timezone",
        parameters: [
          uuidParam("scheduleId"),
          { name: "starts_at", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "ends_at", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "step_minutes", in: "query", schema: { type: "integer", minimum: 15, maximum: 1440, default: 1440 } },
        ],
        responses: {
          "200": dataResponse("Schedule preview", "#/components/schemas/OnCallSchedulePreview"),
        },
      },
    },
    "/api/v1/on-call/overrides": {
      post: {
        tags: ["On-call"],
        summary: "Create on-call override",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateOnCallOverrideRequest"),
        responses: {
          "201": dataResponse("Created override", "#/components/schemas/OnCallOverride"),
        },
      },
    },
    "/api/v1/on-call/overrides/{overrideId}": {
      delete: {
        tags: ["On-call"],
        summary: "Delete on-call override",
        parameters: [actorUserHeader, uuidParam("overrideId")],
        responses: {
          "200": dataResponse("Deleted override", "#/components/schemas/OnCallOverride"),
        },
      },
    },
    "/api/v1/escalation-policies": {
      get: {
        tags: ["Escalation policies"],
        summary: "List escalation policies",
        parameters: [workspaceQueryParam],
        responses: {
          "200": dataArrayResponse("Policies", "#/components/schemas/EscalationPolicy"),
        },
      },
      post: {
        tags: ["Escalation policies"],
        summary: "Create escalation policy",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateEscalationPolicyRequest"),
        responses: {
          "201": dataResponse("Created policy", "#/components/schemas/EscalationPolicy"),
        },
      },
    },
    "/api/v1/escalation-policies/{policyId}": {
      get: {
        tags: ["Escalation policies"],
        summary: "Get escalation policy",
        parameters: [uuidParam("policyId")],
        responses: {
          "200": dataResponse("Policy", "#/components/schemas/EscalationPolicy"),
        },
      },
      put: {
        tags: ["Escalation policies"],
        summary: "Update escalation policy",
        parameters: [actorUserHeader, uuidParam("policyId")],
        requestBody: jsonBody("#/components/schemas/UpdateEscalationPolicyRequest"),
        responses: {
          "200": dataResponse("Updated policy", "#/components/schemas/EscalationPolicy"),
        },
      },
      delete: {
        tags: ["Escalation policies"],
        summary: "Delete escalation policy",
        parameters: [actorUserHeader, uuidParam("policyId")],
        responses: {
          "200": dataResponse("Deleted policy", "#/components/schemas/EscalationPolicy"),
        },
      },
    },
    "/api/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notification logs",
        parameters: [
          { name: "incident_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["pending", "sending", "sent", "sent_after_ack", "failed", "retrying", "skipped"] } },
          { name: "channel", in: "query", schema: { type: "string", enum: ["slack", "email", "sms", "phone", "webhook"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          { name: "cursor", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": dataPaginatedResponse("Notifications", "#/components/schemas/PaginatedNotificationLogs"),
        },
      },
    },
    "/api/v1/notifications/dead-letter": {
      get: {
        tags: ["Notifications"],
        summary: "List final failed notifications",
        parameters: [
          { name: "incident_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "channel", in: "query", schema: { type: "string", enum: ["slack", "email", "sms", "phone", "webhook"] } },
          limitQueryParam,
          cursorQueryParam,
        ],
        responses: {
          "200": dataPaginatedResponse("Dead-letter notifications", "#/components/schemas/PaginatedNotificationLogs"),
        },
      },
    },
    "/api/v1/notifications/{notificationId}": {
      get: {
        tags: ["Notifications"],
        summary: "Get notification log",
        parameters: [uuidParam("notificationId")],
        responses: {
          "200": dataResponse("Notification", "#/components/schemas/NotificationLog"),
        },
      },
    },
    "/api/v1/notifications/{notificationId}/attempts": {
      get: {
        tags: ["Notifications"],
        summary: "List notification delivery attempts",
        parameters: [uuidParam("notificationId")],
        responses: {
          "200": dataArrayResponse("Notification delivery attempts", "#/components/schemas/NotificationDeliveryAttempt"),
        },
      },
    },
    "/api/v1/workers/health": {
      get: {
        tags: ["Workers"],
        summary: "Get worker health from latest run logs",
        responses: {
          "200": dataResponse("Worker health", "#/components/schemas/WorkerHealth"),
          "503": dataResponse("Worker health degraded", "#/components/schemas/WorkerHealth"),
        },
      },
    },
    "/api/v1/workers/readiness": {
      get: {
        tags: ["Workers"],
        summary: "Get worker readiness from latest successful runs",
        parameters: [
          {
            name: "max_run_age_seconds",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 86400, default: 120 },
          },
          {
            name: "response_status",
            in: "query",
            schema: { type: "string", enum: ["default", "always_200"], default: "default" },
            description: "Use always_200 for UI polling that should receive not-ready state as data instead of an HTTP 503.",
          },
        ],
        responses: {
          "200": dataResponse("Worker readiness", "#/components/schemas/WorkerReadiness"),
          "503": dataResponse("Worker not ready", "#/components/schemas/WorkerReadiness"),
        },
      },
    },
    "/api/v1/workers/runs": {
      get: {
        tags: ["Workers"],
        summary: "List worker run logs for platform admins",
        parameters: [
          actorUserHeader,
          { name: "worker_name", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/WorkerRunStatus" } },
          limitQueryParam,
          cursorQueryParam,
        ],
        responses: {
          "200": dataPaginatedResponse("Worker run logs", "#/components/schemas/PaginatedWorkerRunLogs"),
        },
      },
    },
    "/api/v1/workers/stuck-escalations": {
      get: {
        tags: ["Workers", "Escalation policies"],
        summary: "List active escalation states whose next run is overdue",
        parameters: [
          workspaceQueryParam,
          {
            name: "older_than_seconds",
            in: "query",
            schema: { type: "integer", minimum: 0, default: 300 },
          },
          limitQueryParam,
          cursorQueryParam,
        ],
        responses: {
          "200": dataPaginatedResponse("Stuck escalations", "#/components/schemas/PaginatedStuckEscalations"),
        },
      },
    },
    "/api/v1/activity-logs": {
      get: {
        tags: ["Activity logs"],
        summary: "List activity logs",
        parameters: [
          { name: "resource_type", in: "query", schema: { $ref: "#/components/schemas/ActivityResourceType" } },
          workspaceQueryParam,
          { name: "resource_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          { name: "cursor", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": dataPaginatedResponse("Activity logs", "#/components/schemas/PaginatedActivityLogs"),
        },
      },
    },
    "/api/v1/audit-logs": {
      get: {
        tags: ["Audit logs"],
        summary: "List project audit logs",
        parameters: [
          { ...workspaceQueryParam, required: true },
          { name: "actor_user_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "resource_type", in: "query", schema: { $ref: "#/components/schemas/ActivityResourceType" } },
          { name: "resource_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "search", in: "query", schema: { type: "string", minLength: 1, maxLength: 200 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          { name: "cursor", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": dataPaginatedResponse("Audit logs", "#/components/schemas/PaginatedActivityLogs"),
        },
      },
    },
    "/api/v1/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        parameters: [
          {
            name: "workspace_id",
            in: "query",
            required: false,
            schema: {
              type: "string",
              format: "uuid",
            },
            description: "When provided, lists users in that workspace after verifying membership. Without it, returns only the signed-in user.",
          },
        ],
        responses: {
          "200": dataArrayResponse("Users", "#/components/schemas/User"),
        },
      },
    },
    "/api/v1/users/{userId}/notification-preferences": {
      put: {
        tags: ["Users", "Notifications"],
        summary: "Update user notification contacts and channel preferences",
        parameters: [uuidParam("userId")],
        requestBody: jsonBody("#/components/schemas/UpdateUserNotificationPreferencesRequest"),
        responses: {
          "200": dataResponse("Updated notification preferences", "#/components/schemas/UserNotificationPreferences"),
        },
      },
    },
    "/api/v1/users/{userId}/phone-verification/start": {
      post: {
        tags: ["Users", "Notifications"],
        summary: "Send a Twilio phone verification code to a user's phone number",
        parameters: [uuidParam("userId")],
        requestBody: jsonBody("#/components/schemas/StartUserPhoneVerificationRequest"),
        responses: {
          "200": dataResponse("Phone verification status", "#/components/schemas/UserPhoneVerificationStatus"),
        },
      },
    },
    "/api/v1/users/{userId}/phone-verification/check": {
      post: {
        tags: ["Users", "Notifications"],
        summary: "Confirm a Twilio phone verification code",
        parameters: [uuidParam("userId")],
        requestBody: jsonBody("#/components/schemas/CheckUserPhoneVerificationRequest"),
        responses: {
          "200": dataResponse("Phone verification status", "#/components/schemas/UserPhoneVerificationStatus"),
        },
      },
    },
    "/api/v1/teams": {
      get: {
        tags: ["Teams"],
        summary: "List teams",
        parameters: [workspaceQueryParam],
        responses: {
          "200": dataArrayResponse("Teams", "#/components/schemas/Team"),
        },
      },
      post: {
        tags: ["Teams"],
        summary: "Create team",
        parameters: [actorUserHeader],
        requestBody: jsonBody("#/components/schemas/CreateTeamRequest"),
        responses: {
          "201": dataResponse("Created team", "#/components/schemas/Team"),
        },
      },
    },
    "/api/v1/teams/{teamId}/members": {
      get: {
        tags: ["Teams"],
        summary: "List team members",
        parameters: [actorUserHeader, uuidParam("teamId")],
        responses: {
          "200": dataArrayResponse("Team members", "#/components/schemas/TeamMember"),
        },
      },
      post: {
        tags: ["Teams"],
        summary: "Add team member",
        parameters: [actorUserHeader, uuidParam("teamId")],
        requestBody: jsonBody("#/components/schemas/CreateTeamMemberRequest"),
        responses: {
          "201": dataResponse("Created team member", "#/components/schemas/TeamMember"),
        },
      },
    },
    "/api/v1/teams/{teamId}/members/{userId}": {
      delete: {
        tags: ["Teams"],
        summary: "Remove team member",
        parameters: [actorUserHeader, uuidParam("teamId"), uuidParam("userId")],
        responses: {
          "200": dataResponse("Deleted team member", "#/components/schemas/TeamMember"),
        },
      },
    },
  },
  components: {
    schemas: {
      Health: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", enum: ["ok"] } },
      },
      IncidentSeverity: { type: "string", enum: ["critical", "high", "medium", "low"] },
      IncidentPriority: { type: "string", enum: ["P1", "P2", "P3", "P4", "P5"] },
      IncidentStatus: { type: "string", enum: ["triggered", "acknowledged", "resolved"] },
      ServiceStatus: { type: "string", enum: ["normal", "degraded", "major", "critical"] },
      ActivityResourceType: {
        type: "string",
        enum: [
          "workspace",
          "workspace_invite",
          "workspace_notification_provider_setting",
          "user",
          "service",
          "incident",
          "webhook_endpoint",
          "on_call_schedule",
          "on_call_override",
          "escalation_policy",
          "notification",
        ],
      },
      EscalationTargetType: {
        type: "string",
        enum: ["primary_on_call", "secondary_on_call", "team", "user", "team_channel", "webhook"],
      },
      OnCallLayer: { type: "string", enum: ["primary", "secondary"] },
      OnCallRotationType: { type: "string", enum: ["daily", "weekly", "custom"] },
      WorkspaceRole: { type: "string", enum: ["owner", "admin", "responder", "viewer"] },
      WorkspaceRoleKey: {
        type: "string",
        enum: [
          "project_owner",
          "project_admin",
          "project_viewer",
          "incident_viewer",
          "incident_responder",
          "incident_manager",
          "incident_admin",
          "service_viewer",
          "service_manager",
          "service_admin",
          "on_call_viewer",
          "on_call_participant",
          "on_call_manager",
          "on_call_admin",
          "escalation_viewer",
          "escalation_manager",
          "escalation_admin",
          "notification_recipient",
          "notification_manager",
        ],
      },
      WorkspaceInviteStatus: { type: "string", enum: ["pending", "accepted", "declined", "revoked", "expired"] },
      WorkspaceNotificationProvider: { type: "string", enum: ["slack", "email", "twilio"] },
      WorkerRunStatus: { type: "string", enum: ["running", "succeeded", "failed"] },
      AuthenticatedUser: {
        type: "object",
        required: ["id", "email", "email_verified", "name"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          email_verified: { type: "boolean" },
          name: { type: "string" },
        },
      },
      AuthMe: {
        type: "object",
        required: ["user", "auth_source"],
        properties: {
          user: { $ref: "#/components/schemas/AuthenticatedUser" },
          auth_source: { type: "string", enum: ["session"] },
        },
      },
      AuthProvider: {
        type: "object",
        required: ["id", "label", "enabled", "login_url"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          enabled: { type: "boolean" },
          login_url: { type: "string" },
        },
      },
      AuthProviderList: {
        type: "object",
        required: ["active_provider", "email_password_enabled"],
        properties: {
          active_provider: {
            allOf: [{ $ref: "#/components/schemas/AuthProvider" }],
            nullable: true,
          },
          email_password_enabled: { type: "boolean" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "name", "password", "password_confirmation"],
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string" },
          password: { type: "string", minLength: 8, maxLength: 128 },
          password_confirmation: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      ResendEmailVerificationRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
      ConfirmEmailVerificationRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string" },
        },
      },
      StartPasswordResetRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
      CompletePasswordResetRequest: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string" },
          password: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      AuthSession: {
        type: "object",
        required: ["id", "expires_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          expires_at: { type: "string", format: "date-time" },
        },
      },
      AuthSessionResponse: {
        type: "object",
        required: ["user", "session"],
        properties: {
          user: { $ref: "#/components/schemas/AuthenticatedUser" },
          session: { $ref: "#/components/schemas/AuthSession" },
        },
      },
      RegisterResponse: {
        type: "object",
        required: ["user", "email_verification_required"],
        properties: {
          user: { $ref: "#/components/schemas/AuthenticatedUser" },
          email_verification_required: { type: "boolean" },
        },
      },
      ConfirmEmailVerificationResponse: {
        type: "object",
        required: ["user"],
        properties: {
          user: { $ref: "#/components/schemas/AuthenticatedUser" },
        },
      },
      AcceptedResponse: {
        type: "object",
        required: ["accepted"],
        properties: {
          accepted: { type: "boolean" },
        },
      },
      CompletePasswordResetResponse: {
        type: "object",
        required: ["success"],
        properties: {
          success: { type: "boolean" },
        },
      },
      LogoutResponse: {
        type: "object",
        required: ["revoked"],
        properties: {
          revoked: { type: "boolean" },
        },
      },
      Service: {
        type: "object",
        required: ["id", "workspace_id", "name", "description", "team_id", "escalation_policy_id", "status", "open_incident_count", "created_at", "updated_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          team_id: { type: "string", format: "uuid", nullable: true },
          escalation_policy_id: { type: "string", format: "uuid", nullable: true },
          status: { $ref: "#/components/schemas/ServiceStatus" },
          open_incident_count: { type: "integer", minimum: 0 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      PaginatedServices: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Service" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      CreateServiceRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          workspace_id: { type: "string", format: "uuid" },
          team_id: { type: "string", format: "uuid", nullable: true },
          escalation_policy_id: { type: "string", format: "uuid", nullable: true },
        },
      },
      CreateServiceResponse: {
        type: "object",
        required: ["service", "default_webhook_endpoint"],
        properties: {
          service: { $ref: "#/components/schemas/Service" },
          default_webhook_endpoint: { $ref: "#/components/schemas/WebhookEndpointWithSecret" },
        },
      },
      UpdateServiceRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          team_id: { type: "string", format: "uuid", nullable: true },
          escalation_policy_id: { type: "string", format: "uuid", nullable: true },
        },
      },
      Incident: {
        type: "object",
        required: ["id", "workspace_id", "service_id", "title", "description", "severity", "priority", "status", "source", "fingerprint", "dedup_key", "acknowledged_by", "acknowledged_at", "resolved_by", "resolved_at", "created_at", "updated_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          service_id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          severity: { $ref: "#/components/schemas/IncidentSeverity" },
          priority: { $ref: "#/components/schemas/IncidentPriority" },
          status: { $ref: "#/components/schemas/IncidentStatus" },
          source: { type: "string" },
          fingerprint: { type: "string" },
          dedup_key: { type: "string", nullable: true },
          acknowledged_by: { type: "string", format: "uuid", nullable: true },
          acknowledged_at: { type: "string", format: "date-time", nullable: true },
          resolved_by: { type: "string", format: "uuid", nullable: true },
          resolved_at: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      PaginatedIncidents: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Incident" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      CreateIncidentRequest: {
        type: "object",
        required: ["service_id", "title", "severity"],
        properties: {
          service_id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          severity: { $ref: "#/components/schemas/IncidentSeverity" },
          priority: { $ref: "#/components/schemas/IncidentPriority" },
          source: { type: "string", default: "manual" },
          dedup_key: { type: "string", nullable: true },
        },
      },
      UpdateIncidentPriorityRequest: {
        type: "object",
        required: ["priority"],
        properties: {
          priority: { $ref: "#/components/schemas/IncidentPriority" },
        },
      },
      IncidentActionRequest: {
        type: "object",
        properties: {
          actor_user_id: { type: "string", format: "uuid" },
        },
      },
      IncidentTimelineEntry: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          incident_id: { type: "string", format: "uuid" },
          type: { type: "string" },
          message: { type: "string" },
          metadata: {},
          actor_user_id: { type: "string", format: "uuid", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      PaginatedIncidentTimelineEntries: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/IncidentTimelineEntry" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      IncidentDetail: {
        type: "object",
        required: ["incident", "escalation", "timeline_summary", "notification_summary"],
        properties: {
          incident: { $ref: "#/components/schemas/Incident" },
          escalation: {
            allOf: [{ $ref: "#/components/schemas/IncidentEscalationState" }],
            nullable: true,
          },
          timeline_summary: {
            type: "object",
            required: ["total", "latest_created_at"],
            properties: {
              total: { type: "integer", minimum: 0 },
              latest_created_at: { type: "string", format: "date-time", nullable: true },
            },
          },
          notification_summary: {
            type: "object",
            required: ["total", "by_status"],
            properties: {
              total: { type: "integer", minimum: 0 },
              by_status: {
                type: "array",
                items: {
                  type: "object",
                  required: ["status", "count"],
                  properties: {
                    status: { type: "string", enum: ["pending", "sending", "sent", "sent_after_ack", "failed", "retrying", "skipped"] },
                    count: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          },
        },
      },
      WebhookEndpoint: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          service_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          url: { type: "string", format: "uri" },
          has_secret: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
          disabled_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      WebhookEndpointWithSecret: {
        allOf: [
          { $ref: "#/components/schemas/WebhookEndpoint" },
          {
            type: "object",
            properties: {
              secret: { type: "string" },
              url_with_secret: { type: "string", format: "uri" },
            },
          },
        ],
      },
      CreateWebhookEndpointRequest: {
        type: "object",
        properties: {},
      },
      WebhookIncidentPayload: {
        type: "object",
        additionalProperties: true,
        description: "Flexible webhook JSON. Generic incident creation requires only title; all other fields are optional and receive defaults. Supported provider payloads can use their native title fields through provider-specific normalization.",
        properties: {
          event_key: { type: "string", description: "Stable external event id. Reuse it with status resolved to resolve the incident created by its triggered event." },
          eventKey: { type: "string", description: "Camel-case alias for event_key." },
          fingerprint: { type: "string", description: "Stable incident grouping key used to merge related open events." },
          status: { type: "string", description: "Incident state. Send resolved with the same event_key to resolve the incident created by its triggered event." },
          state: { type: "string", description: "Provider-compatible alias for status." },
          action: { type: "string", description: "Provider-compatible alias for status." },
          title: { type: "string", description: "Required incident title for generic webhook payloads." },
          description: { type: "string" },
          details: { description: "Optional structured details preserved in raw payload and summarized into the incident description when description is absent." },
          severity: { $ref: "#/components/schemas/IncidentSeverity" },
          priority: { $ref: "#/components/schemas/IncidentPriority" },
          source: { type: "string" },
          links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                url: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
      WebhookIngestionResult: {
        type: "object",
        properties: {
          event_id: { type: "string", format: "uuid" },
          incident: { $ref: "#/components/schemas/Incident" },
          normalized_event: { type: "object", additionalProperties: true },
          action: { type: "string", enum: ["created", "merged", "resolved", "duplicate"] },
        },
      },
      EscalationPolicyStep: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          policy_id: { type: "string", format: "uuid" },
          step_order: { type: "integer", minimum: 1 },
          delay_seconds: { type: "integer", minimum: 0 },
          target_type: { $ref: "#/components/schemas/EscalationTargetType" },
          target_id: {
            type: "string",
            nullable: true,
            description: "Target identifier. URL-based targets are masked in responses.",
          },
        },
      },
      EscalationPolicy: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          repeat_enabled: { type: "boolean" },
          repeat_interval_seconds: { type: "integer", nullable: true },
          repeat_limit: { type: "integer", nullable: true },
          steps: { type: "array", items: { $ref: "#/components/schemas/EscalationPolicyStep" } },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CreateEscalationPolicyRequest: {
        type: "object",
        required: ["workspace_id", "name", "steps"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          repeat_enabled: { type: "boolean" },
          repeat_interval_seconds: { type: "integer", nullable: true },
          repeat_limit: { type: "integer", nullable: true },
          steps: { type: "array", items: { $ref: "#/components/schemas/UpsertEscalationPolicyStepRequest" } },
        },
      },
      UpdateEscalationPolicyRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          repeat_enabled: { type: "boolean" },
          repeat_interval_seconds: { type: "integer", nullable: true },
          repeat_limit: { type: "integer", nullable: true },
          steps: { type: "array", items: { $ref: "#/components/schemas/UpsertEscalationPolicyStepRequest" } },
        },
      },
      UpsertEscalationPolicyStepRequest: {
        type: "object",
        required: ["step_order", "delay_seconds", "target_type"],
        properties: {
          id: { type: "string", format: "uuid" },
          step_order: { type: "integer", minimum: 1 },
          delay_seconds: { type: "integer", minimum: 0 },
          target_type: { $ref: "#/components/schemas/EscalationTargetType" },
          target_id: {
            type: "string",
            nullable: true,
            description: "Required for on-call schedule, team, user, legacy team_channel, and webhook targets. primary_on_call and secondary_on_call expect an on-call schedule UUID; team and user expect UUIDs; webhook targets expect an HTTP URL.",
          },
        },
      },
      IncidentEscalationState: {
        type: "object",
        properties: {
          incident_id: { type: "string", format: "uuid" },
          policy_id: { type: "string", format: "uuid" },
          current_step: { type: "integer" },
          repeat_iteration: { type: "integer" },
          next_run_at: { type: "string", format: "date-time", nullable: true },
          status: { type: "string", enum: ["active", "paused", "stopped", "completed"] },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      ManualEscalationRequest: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["trigger_current_step", "advance_to_next_step", "run_specific_step"],
          },
          step_order: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1, maxLength: 500 },
          force: { type: "boolean", default: false },
          update_current_step: { type: "boolean", default: false },
        },
      },
      OnCallRotationParticipant: {
        type: "object",
        properties: {
          user_id: { type: "string", format: "uuid" },
          position: { type: "integer" },
        },
      },
      OnCallRotation: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          schedule_id: { type: "string", format: "uuid" },
          layer: { $ref: "#/components/schemas/OnCallLayer" },
          rotation_type: { $ref: "#/components/schemas/OnCallRotationType" },
          rotation_interval: {
            type: "integer",
            description: "Interval unit depends on rotation_type: daily=days, weekly=weeks, custom=hours.",
          },
          starts_at: { type: "string", format: "date-time" },
          timezone: { type: "string", description: "IANA timezone used for daily and weekly calendar-boundary calculations." },
          participants: { type: "array", items: { $ref: "#/components/schemas/OnCallRotationParticipant" } },
        },
      },
      OnCallOverride: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          schedule_id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          layer: { $ref: "#/components/schemas/OnCallLayer" },
          starts_at: { type: "string", format: "date-time" },
          ends_at: { type: "string", format: "date-time" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      OnCallSchedule: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          team_id: { type: "string", format: "uuid", nullable: true },
          service_id: { type: "string", format: "uuid", nullable: true },
          timezone: { type: "string" },
          rotations: { type: "array", items: { $ref: "#/components/schemas/OnCallRotation" } },
          overrides: { type: "array", items: { $ref: "#/components/schemas/OnCallOverride" } },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      OnCallPreviewEntry: {
        type: "object",
        required: ["starts_at", "ends_at", "local_starts_at", "local_ends_at", "primary_user_id", "secondary_user_id"],
        properties: {
          starts_at: { type: "string", format: "date-time" },
          ends_at: { type: "string", format: "date-time" },
          local_starts_at: { type: "string" },
          local_ends_at: { type: "string" },
          primary_user_id: { type: "string", format: "uuid", nullable: true },
          secondary_user_id: { type: "string", format: "uuid", nullable: true },
        },
      },
      OnCallSchedulePreview: {
        type: "object",
        required: ["schedule_id", "timezone", "starts_at", "ends_at", "step_minutes", "entries"],
        properties: {
          schedule_id: { type: "string", format: "uuid" },
          timezone: { type: "string" },
          starts_at: { type: "string", format: "date-time" },
          ends_at: { type: "string", format: "date-time" },
          step_minutes: { type: "integer", minimum: 15 },
          entries: { type: "array", items: { $ref: "#/components/schemas/OnCallPreviewEntry" } },
        },
      },
      CreateOnCallScheduleRequest: {
        type: "object",
        description: "On-call schedules define rotations. All rotations in one schedule must share the same cadence. Services use schedules through escalation policy steps.",
        required: ["workspace_id", "name", "timezone", "rotations"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          // Deprecated compatibility fields for older service/team-scoped schedules.
          team_id: { type: "string", format: "uuid", nullable: true },
          service_id: { type: "string", format: "uuid", nullable: true },
          timezone: { type: "string" },
          rotations: { type: "array", items: { $ref: "#/components/schemas/UpsertOnCallRotationRequest" } },
        },
      },
      UpdateOnCallScheduleRequest: {
        type: "object",
        description: "Updates an on-call rotation schedule. All rotations in one schedule must share the same cadence. team_id and service_id are deprecated compatibility fields.",
        properties: {
          name: { type: "string" },
          team_id: { type: "string", format: "uuid", nullable: true },
          service_id: { type: "string", format: "uuid", nullable: true },
          timezone: { type: "string" },
          rotations: { type: "array", items: { $ref: "#/components/schemas/UpsertOnCallRotationRequest" } },
        },
      },
      UpsertOnCallRotationRequest: {
        type: "object",
        required: ["layer", "rotation_type", "rotation_interval", "starts_at", "timezone", "participants"],
        properties: {
          id: { type: "string", format: "uuid" },
          layer: { $ref: "#/components/schemas/OnCallLayer" },
          rotation_type: { $ref: "#/components/schemas/OnCallRotationType" },
          rotation_interval: {
            type: "integer",
            minimum: 1,
            description: "Interval unit depends on rotation_type: daily=days, weekly=weeks, custom=hours.",
          },
          starts_at: { type: "string", format: "date-time" },
          timezone: { type: "string", description: "IANA timezone used for daily and weekly calendar-boundary calculations." },
          participants: { type: "array", items: { type: "string", format: "uuid" } },
        },
      },
      CreateOnCallOverrideRequest: {
        type: "object",
        required: ["schedule_id", "user_id", "layer", "starts_at", "ends_at"],
        properties: {
          schedule_id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          layer: { $ref: "#/components/schemas/OnCallLayer" },
          starts_at: { type: "string", format: "date-time" },
          ends_at: { type: "string", format: "date-time" },
        },
      },
      CurrentOnCall: {
        type: "object",
        properties: {
          primary_user_id: { type: "string", format: "uuid", nullable: true },
          secondary_user_id: { type: "string", format: "uuid", nullable: true },
          resolved_at: { type: "string", format: "date-time" },
        },
      },
      NotificationLog: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          incident_id: { type: "string", format: "uuid" },
          policy_step_id: { type: "string", format: "uuid", nullable: true },
          repeat_iteration: { type: "integer", nullable: true },
          channel: { type: "string", enum: ["slack", "email", "sms", "phone", "webhook"] },
          target_type: { $ref: "#/components/schemas/EscalationTargetType" },
          target_id: { type: "string", nullable: true },
          target_address: { type: "string" },
          status: { type: "string", enum: ["pending", "sending", "sent", "sent_after_ack", "failed", "retrying", "skipped"] },
          attempt: { type: "integer" },
          idempotency_key: { type: "string" },
          event_action: { type: "string" },
          provider_message_id: { type: "string", nullable: true },
          error_message: { type: "string", nullable: true },
          next_retry_at: { type: "string", format: "date-time", nullable: true },
          sent_at: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      PaginatedNotificationLogs: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/NotificationLog" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      NotificationDeliveryAttempt: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          notification_log_id: { type: "string", format: "uuid" },
          attempt: { type: "integer", minimum: 1 },
          status: { type: "string", enum: ["sending", "sent", "failed", "skipped", "timed_out"] },
          provider: { type: "string" },
          provider_message_id: { type: "string", nullable: true },
          error_message: { type: "string", nullable: true },
          retry_after_seconds: { type: "integer", nullable: true },
          started_at: { type: "string", format: "date-time" },
          completed_at: { type: "string", format: "date-time", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
        },
      },
      WorkerRunLog: {
        type: "object",
        required: [
          "id",
          "worker_name",
          "status",
          "started_at",
          "completed_at",
          "duration_ms",
          "processed_count",
          "error_message",
          "metadata",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          worker_name: { type: "string" },
          status: { $ref: "#/components/schemas/WorkerRunStatus" },
          started_at: { type: "string", format: "date-time" },
          completed_at: { type: "string", format: "date-time", nullable: true },
          duration_ms: { type: "integer", minimum: 0, nullable: true },
          processed_count: { type: "integer", minimum: 0 },
          error_message: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
        },
      },
      PaginatedWorkerRunLogs: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkerRunLog" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      WorkerHealth: {
        type: "object",
        required: ["status", "checked_at", "latest_runs"],
        properties: {
          status: { type: "string", enum: ["ok", "degraded", "unhealthy"] },
          checked_at: { type: "string", format: "date-time" },
          latest_runs: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkerRunLog" },
          },
        },
      },
      WorkerReadiness: {
        type: "object",
        required: ["ready", "checked_at", "max_run_age_seconds", "stale_workers", "latest_runs"],
        properties: {
          ready: { type: "boolean" },
          checked_at: { type: "string", format: "date-time" },
          max_run_age_seconds: { type: "integer", minimum: 1 },
          stale_workers: {
            type: "array",
            items: { type: "string" },
          },
          latest_runs: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkerRunLog" },
          },
        },
      },
      StuckEscalation: {
        type: "object",
        required: [
          "incident_id",
          "workspace_id",
          "service_id",
          "policy_id",
          "current_step",
          "repeat_iteration",
          "next_run_at",
          "status",
          "incident_status",
          "overdue_seconds",
          "updated_at",
        ],
        properties: {
          incident_id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          service_id: { type: "string", format: "uuid" },
          policy_id: { type: "string", format: "uuid" },
          current_step: { type: "integer" },
          repeat_iteration: { type: "integer", minimum: 0 },
          next_run_at: { type: "string", format: "date-time", nullable: true },
          status: { type: "string", enum: ["active", "paused", "stopped", "completed"] },
          incident_status: { $ref: "#/components/schemas/IncidentStatus" },
          overdue_seconds: { type: "integer", minimum: 0 },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      PaginatedStuckEscalations: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/StuckEscalation" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      ActivityLog: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid", nullable: true },
          resource_type: { $ref: "#/components/schemas/ActivityResourceType" },
          resource_id: { type: "string", format: "uuid", nullable: true },
          action: { type: "string" },
          message: { type: "string" },
          actor_user_id: { type: "string", format: "uuid", nullable: true },
          metadata: { type: "object", nullable: true, additionalProperties: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      PaginatedActivityLogs: {
        type: "object",
        required: ["items", "next_cursor"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ActivityLog" },
          },
          next_cursor: { type: "string", format: "uuid", nullable: true },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          email_verified: { type: "boolean" },
          name: { type: "string" },
          notification_settings: { $ref: "#/components/schemas/UserNotificationSettings" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      UserNotificationSettings: {
        type: "object",
        properties: {
          contacts: { $ref: "#/components/schemas/UserNotificationContactStatus" },
          preferences: {
            type: "array",
            items: { $ref: "#/components/schemas/UserNotificationChannelPreference" },
          },
        },
      },
      UserNotificationContactStatus: {
        type: "object",
        properties: {
          has_email_delivery_webhook_url: { type: "boolean" },
          has_phone_number: { type: "boolean" },
          phone_number_verified: { type: "boolean" },
          phone_number_masked: { type: "string", nullable: true },
          has_sms_phone_number: { type: "boolean" },
          sms_phone_number: { type: "string", nullable: true },
          sms_phone_number_masked: { type: "string", nullable: true },
          sms_verified: { type: "boolean" },
          has_voice_phone_number: { type: "boolean" },
          voice_phone_number: { type: "string", nullable: true },
          voice_phone_number_masked: { type: "string", nullable: true },
          voice_verified: { type: "boolean" },
        },
      },
      UserNotificationChannelPreference: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "sms", "phone"] },
          enabled: { type: "boolean" },
          delay_seconds: { type: "integer", minimum: 0 },
        },
      },
      UserNotificationPreferences: {
        type: "object",
        properties: {
          user_id: { type: "string", format: "uuid" },
          contacts: { $ref: "#/components/schemas/UserNotificationContactStatus" },
          preferences: {
            type: "array",
            items: { $ref: "#/components/schemas/UserNotificationChannelPreference" },
          },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      UserPhoneVerificationStatus: {
        type: "object",
        properties: {
          user_id: { type: "string", format: "uuid" },
          has_phone_number: { type: "boolean" },
          phone_number_masked: { type: "string", nullable: true },
          phone_number_verified: { type: "boolean" },
          has_sms_phone_number: { type: "boolean" },
          sms_phone_number: { type: "string", nullable: true },
          sms_phone_number_masked: { type: "string", nullable: true },
          sms_verified: { type: "boolean" },
          has_voice_phone_number: { type: "boolean" },
          voice_phone_number: { type: "string", nullable: true },
          voice_phone_number_masked: { type: "string", nullable: true },
          voice_verified: { type: "boolean" },
          verification_sent_at: { type: "string", format: "date-time", nullable: true },
          sms_verification_sent_at: { type: "string", format: "date-time", nullable: true },
          voice_verification_sent_at: { type: "string", format: "date-time", nullable: true },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      UpdateUserNotificationPreferencesRequest: {
        type: "object",
        properties: {
          email_delivery_webhook_url: {
            type: "string",
            format: "uri",
            nullable: true,
            deprecated: true,
            description: "Deprecated. Project email provider settings deliver responder email alerts to the user's account email.",
          },
          phone_number: {
            type: "string",
            nullable: true,
            deprecated: true,
            description: "Deprecated E.164 phone number field. Prefer sms_phone_number and voice_phone_number.",
          },
          sms_phone_number: {
            type: "string",
            nullable: true,
            description: "E.164 phone number used for SMS alerts. Changing it clears SMS verification.",
          },
          sms_verified: {
            type: "boolean",
            enum: [false],
            description: "Set false to clear SMS phone verification while keeping the saved number.",
          },
          voice_phone_number: {
            type: "string",
            nullable: true,
            description: "E.164 phone number used for voice call alerts. Changing it clears voice verification.",
          },
          voice_verified: {
            type: "boolean",
            enum: [false],
            description: "Set false to clear voice phone verification while keeping the saved number.",
          },
          preferences: {
            type: "array",
            items: { $ref: "#/components/schemas/UserNotificationChannelPreference" },
          },
        },
      },
      StartUserPhoneVerificationRequest: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["sms", "call"], default: "sms" },
          workspace_id: { type: "string", format: "uuid" },
        },
      },
      CheckUserPhoneVerificationRequest: {
        type: "object",
        required: ["code"],
        properties: {
          channel: { type: "string", enum: ["sms", "call"], default: "sms" },
          code: { type: "string" },
          workspace_id: { type: "string", format: "uuid" },
        },
      },
      Workspace: {
        type: "object",
        required: ["id", "name", "slug", "created_by_user_id", "created_at", "updated_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          role: { $ref: "#/components/schemas/WorkspaceRole", deprecated: true },
          roles: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkspaceRoleKey" },
          },
          created_by_user_id: { type: "string", format: "uuid", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      WorkspaceMember: {
        type: "object",
        required: ["workspace_id", "user_id", "role", "roles", "created_at", "updated_at"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          role: { $ref: "#/components/schemas/WorkspaceRole", deprecated: true },
          roles: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkspaceRoleKey" },
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      WorkspaceInvite: {
        type: "object",
        required: [
          "id",
          "workspace_id",
          "workspace_name",
          "invited_user_id",
          "invited_user_email",
          "invited_by_user_id",
          "role",
          "roles",
          "status",
          "accepted_at",
          "declined_at",
          "revoked_at",
          "expires_at",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          workspace_name: { type: "string" },
          invited_user_id: { type: "string", format: "uuid", nullable: true },
          invited_user_email: { type: "string", format: "email" },
          invited_by_user_id: { type: "string", format: "uuid" },
          role: { $ref: "#/components/schemas/WorkspaceRole", deprecated: true },
          roles: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkspaceRoleKey" },
          },
          status: { $ref: "#/components/schemas/WorkspaceInviteStatus" },
          accepted_at: { type: "string", format: "date-time", nullable: true },
          declined_at: { type: "string", format: "date-time", nullable: true },
          revoked_at: { type: "string", format: "date-time", nullable: true },
          expires_at: { type: "string", format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      WorkspaceNotificationProviderSetting: {
        type: "object",
        required: ["workspace_id", "provider", "enabled", "configured", "details", "created_at", "updated_at"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          provider: { $ref: "#/components/schemas/WorkspaceNotificationProvider" },
          enabled: { type: "boolean" },
          configured: { type: "boolean" },
          details: {
            type: "object",
            properties: {
              has_slack_webhook_url: { type: "boolean" },
              smtp_host: { type: "string", nullable: true },
              smtp_port: { type: "integer", nullable: true },
              smtp_security: { type: "string", enum: ["starttls", "tls"], nullable: true },
              smtp_username: { type: "string", nullable: true },
              has_smtp_password: { type: "boolean" },
              from_name: { type: "string", nullable: true },
              from_email: { type: "string", format: "email", nullable: true },
              account_sid: { type: "string", nullable: true },
              account_sid_masked: { type: "string", nullable: true },
              has_auth_token: { type: "boolean" },
              from_phone_number: { type: "string", nullable: true },
              from_phone_number_masked: { type: "string", nullable: true },
              event_actions: {
                type: "array",
                items: { type: "string", enum: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"] },
              },
            },
          },
          created_at: { type: "string", format: "date-time", nullable: true },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      WorkspaceWebhookIntegrationType: {
        type: "string",
        enum: ["slack", "discord", "teams", "custom"],
      },
      WorkspaceWebhookIntegration: {
        type: "object",
        required: ["workspace_id", "type", "enabled", "configured", "details", "created_at", "updated_at"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          type: { $ref: "#/components/schemas/WorkspaceWebhookIntegrationType" },
          enabled: { type: "boolean" },
          configured: { type: "boolean" },
          details: {
            type: "object",
            properties: {
              url: { type: "string", format: "uri", nullable: true },
              default_body: { type: "object", additionalProperties: true, nullable: true },
              event_actions: {
                type: "array",
                items: { type: "string", enum: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"] },
              },
            },
          },
          created_at: { type: "string", format: "date-time", nullable: true },
          updated_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      UpdateWorkspaceWebhookIntegrationRequest: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          url: { type: "string", format: "uri", nullable: true },
          default_body: { type: "object", additionalProperties: true, nullable: true },
          event_actions: {
            type: "array",
            minItems: 1,
            items: { type: "string", enum: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"] },
          },
        },
      },
      ServiceWebhookIntegration: {
        allOf: [
          { $ref: "#/components/schemas/WorkspaceWebhookIntegration" },
          {
            type: "object",
            properties: {
              service_id: { type: "string", format: "uuid" },
              routing_mode: { type: "string", enum: ["inherit", "override", "both"] },
            },
          },
        ],
      },
      UpdateServiceWebhookIntegrationRequest: {
        allOf: [
          { $ref: "#/components/schemas/UpdateWorkspaceWebhookIntegrationRequest" },
          { type: "object", properties: { routing_mode: { type: "string", enum: ["inherit", "override", "both"] } } },
        ],
      },
      CreateWorkspaceRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
        },
      },
      CreateWorkspaceInviteRequest: {
        type: "object",
        required: ["invited_user_email"],
        properties: {
          invited_user_email: { type: "string", format: "email" },
          role: { $ref: "#/components/schemas/WorkspaceRole", deprecated: true },
          roles: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkspaceRoleKey" },
          },
          expires_in_days: { type: "integer", minimum: 1, maximum: 90, default: 14 },
        },
      },
      UpdateWorkspaceMemberRolesRequest: {
        type: "object",
        required: ["roles"],
        properties: {
          roles: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/WorkspaceRoleKey" },
          },
        },
      },
      UpdateWorkspaceNotificationProviderSettingRequest: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          slack: {
            type: "object",
            deprecated: true,
            properties: {
              webhook_url: {
                type: "string",
                format: "uri",
                nullable: true,
                description: "Deprecated legacy Slack Incoming Webhook. Prefer Workflow HTTP actions for Slack delivery.",
              },
            },
          },
          email: {
            type: "object",
            properties: {
              smtp_host: { type: "string", nullable: true },
              smtp_port: { type: "integer", minimum: 1, maximum: 65535, nullable: true },
              smtp_security: { type: "string", enum: ["starttls", "tls"], nullable: true },
              smtp_username: { type: "string", nullable: true },
              smtp_password: { type: "string", format: "password", nullable: true, writeOnly: true },
              from_name: { type: "string", nullable: true },
              from_email: { type: "string", format: "email", nullable: true },
              event_actions: {
                type: "array",
                minItems: 1,
                items: { type: "string", enum: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"] },
              },
            },
          },
          twilio: {
            type: "object",
            properties: {
              account_sid: { type: "string", nullable: true },
              auth_token: { type: "string", nullable: true },
              from_phone_number: { type: "string", nullable: true },
              event_actions: {
                type: "array",
                minItems: 1,
                items: { type: "string", enum: ["incident.created", "incident.acknowledged", "incident.resolved", "incident.priority_updated"] },
              },
            },
          },
        },
      },
      Team: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CreateTeamRequest: {
        type: "object",
        required: ["workspace_id", "name"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
        },
      },
      TeamMember: {
        type: "object",
        properties: {
          team_id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
          role: { type: "string" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      CreateTeamMemberRequest: {
        type: "object",
        required: ["user_id"],
        properties: {
          user_id: { type: "string", format: "uuid" },
          role: { type: "string", default: "member" },
        },
      },
    },
  },
} as const;
