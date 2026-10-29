import {
  BellRing,
  BookOpen,
  CalendarDays,
  GitBranch,
  KeyRound,
  PlugZap,
  RadioTower,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { AppLocale } from "../../shared/i18n";
import { koDocs, zhDocs } from "./docsTranslations";

export type DocsSection = {
  heading: string;
  paragraphs?: string[];
  steps?: Array<{ title: string; body: string }>;
  bullets?: string[];
  note?: string;
  code?: string;
};

export type DocsArticle = {
  description: string;
  icon: LucideIcon;
  slug: string;
  title: string;
  group: "Get started" | "Respond" | "Configure" | "Automate" | "Reference";
  readingTime: string;
  sections: DocsSection[];
};

export const docsArticles: DocsArticle[] = [
  {
    slug: "getting-started",
    title: "Get started with PagerWho",
    description: "Create a project and verify your first end-to-end alert flow.",
    group: "Get started",
    icon: BookOpen,
    readingTime: "8 min",
    sections: [
      {
        heading: "What you will set up",
        paragraphs: [
          "A working PagerWho project needs a service, an on-call schedule, an escalation policy, and at least one notification provider. Complete them in that order so each later step can reference the resources created before it.",
        ],
        bullets: [
          "A project that contains your incident-response resources",
          "A service with an incoming webhook endpoint",
          "An on-call schedule with at least one participant",
          "An escalation policy connected to the service",
          "A test incident that reaches the expected responder",
        ],
      },
      {
        heading: "Set up the project",
        steps: [
          { title: "Create or select a project", body: "Open Projects, create a project, and give it a short recognizable name. The selected project controls every resource shown in the app." },
          { title: "Invite responders", body: "Open Project settings → Access and invite the people who will receive or respond to incidents. Assign only the roles they need." },
          { title: "Create a service", body: "Open Services and create the system you want to monitor. PagerWho creates an incoming webhook endpoint for the service." },
          { title: "Build the response path", body: "Create an on-call schedule, then create an escalation policy that targets a user, team, or schedule. Attach the policy to the service." },
          { title: "Configure delivery", body: "Open Project settings → Providers and configure Slack, SMTP email, or Twilio using credentials owned by your organization." },
          { title: "Send a test alert", body: "Post a sample event to the service webhook and confirm the incident, notification, acknowledgement, and resolution flow." },
        ],
      },
      {
        heading: "Know when setup is complete",
        bullets: [
          "The service shows an escalation policy",
          "The schedule preview shows the expected current responder",
          "At least one notification provider is enabled and tested",
          "A webhook request creates an incident under the correct service",
          "The responder can acknowledge and resolve the incident",
        ],
        note: "Do not use PagerWho as the only channel for life-safety or emergency communication.",
      },
    ],
  },
  {
    slug: "services-and-webhooks",
    title: "Services and incoming webhooks",
    description: "Connect monitoring tools and turn events into deduplicated incidents.",
    group: "Configure",
    icon: PlugZap,
    readingTime: "9 min",
    sections: [
      {
        heading: "How alert intake works",
        paragraphs: [
          "A service represents a system your team operates. Each webhook endpoint belongs to one service, so alerts created through that endpoint inherit its escalation policy and response configuration.",
          "PagerWho uses the event key and fingerprint fields to prevent repeated deliveries from creating unnecessary duplicate incidents.",
        ],
      },
      {
        heading: "Send an event",
        code: `POST <webhook URL>\nContent-Type: application/json\n\n{\n  "event_key": "checkout-api/latency",\n  "fingerprint": "checkout-api-latency",\n  "title": "Checkout latency is above threshold",\n  "severity": "high",\n  "source": "monitoring",\n  "status": "triggered"\n}`,
        bullets: [
          "Use a stable fingerprint for repeated reports of the same underlying problem",
          "Keep the same event_key for trigger and resolve updates from the same source event",
          "Store the endpoint URL and secret as credentials in the sending system",
        ],
      },
      {
        heading: "Resolve an incident from the source",
        paragraphs: [
          "Send a new event with status set to resolved and the same fingerprint as the open incident. PagerWho resolves the matching incident and sends the incident.resolved event to enabled workflows and webhook integrations.",
        ],
        code: `POST <webhook URL>\nContent-Type: application/json\n\n{\n  "event_key": "checkout-api/latency",\n  "fingerprint": "checkout-api-latency",\n  "title": "Checkout latency recovered",\n  "source": "monitoring",\n  "status": "resolved"\n}`,
        note: "Reuse the trigger event_key for its resolve update. Repeating the resolved update remains idempotent.",
      },
      {
        heading: "Rotate or disable an endpoint",
        steps: [
          { title: "Create the replacement first", body: "Rotate the secret or create a replacement endpoint before changing the monitoring system." },
          { title: "Update the sender", body: "Replace the URL or secret in the source and send a test event." },
          { title: "Remove the old route", body: "Disable the old endpoint only after the replacement delivery appears in PagerWho." },
        ],
        note: "Treat webhook URLs and secrets as credentials. Do not paste them into tickets, chat messages, or public logs.",
      },
    ],
  },
  {
    slug: "incidents",
    title: "Respond to incidents",
    description: "Understand incident state, priority, acknowledgement, and resolution.",
    group: "Respond",
    icon: RadioTower,
    readingTime: "7 min",
    sections: [
      {
        heading: "Incident lifecycle",
        steps: [
          { title: "Triggered", body: "PagerWho received an alert and started the configured escalation path." },
          { title: "Acknowledged", body: "A responder has taken ownership. Pending escalation and queued notifications are stopped where applicable." },
          { title: "Resolved", body: "The active response is complete. Add useful context to the timeline before closing the incident." },
        ],
      },
      {
        heading: "Priority and severity",
        paragraphs: [
          "Severity describes the impact reported by the alert source. Priority expresses the response urgency your team assigns. They can differ: a technically severe event may be contained, while a smaller fault affecting a critical customer path may require a higher priority.",
        ],
        bullets: [
          "P1: immediate coordinated response",
          "P2: urgent response with material impact",
          "P3: prompt investigation during active operations",
          "P4–P5: lower urgency or follow-up work",
        ],
      },
      {
        heading: "Acknowledge safely",
        bullets: [
          "Confirm that you can actively respond before acknowledging",
          "Review the service, alert source, and incident timeline",
          "Use manual escalation when another responder or step is needed",
          "Resolve only after the condition is stable and follow-up is recorded elsewhere if needed",
        ],
      },
    ],
  },
  {
    slug: "on-call",
    title: "On-call schedules",
    description: "Build rotations, preview coverage, and add temporary overrides.",
    group: "Configure",
    icon: CalendarDays,
    readingTime: "8 min",
    sections: [
      {
        heading: "Create predictable coverage",
        paragraphs: ["Schedules calculate who is responsible at a given time. A schedule can contain primary and secondary rotations, and can be linked to a team or service."],
        steps: [
          { title: "Choose the timezone", body: "Use the timezone in which the rotation is administered. Review daylight-saving transitions before relying on the preview." },
          { title: "Add participants", body: "Only accepted project members with on-call participation access can be selected." },
          { title: "Set the handoff", body: "Choose the start time and rotation interval. Keep handoffs consistent and communicate them outside PagerWho as part of your team process." },
          { title: "Check the preview", body: "Verify the current and upcoming responder before connecting the schedule to an escalation policy." },
        ],
      },
      {
        heading: "Use overrides for temporary changes",
        paragraphs: ["An override replaces scheduled coverage for a defined time range without changing the underlying rotation."],
        bullets: [
          "Set explicit start and end times",
          "Choose the primary or secondary layer",
          "Confirm the replacement user is an active project member",
          "Review overlapping overrides before saving",
        ],
      },
    ],
  },
  {
    slug: "escalation-policies",
    title: "Escalation policies",
    description: "Route notifications through users, teams, and on-call schedules.",
    group: "Configure",
    icon: GitBranch,
    readingTime: "10 min",
    sections: [
      {
        heading: "Design an escalation path",
        paragraphs: ["An escalation policy is an ordered set of notification steps. Each step selects a target and defines how long PagerWho waits before moving to the next step."],
        steps: [
          { title: "Notify the primary owner", body: "Start with the on-call schedule or responder responsible for the service." },
          { title: "Escalate to a wider group", body: "Use a team or secondary schedule when the first step does not acknowledge in time." },
          { title: "Set deliberate delays", body: "Allow enough time for delivery and response without leaving an urgent incident unattended." },
          { title: "Decide whether to repeat", body: "Repeat only when repeated notifications are operationally useful. Set a finite repeat limit." },
        ],
      },
      {
        heading: "Target behavior",
        bullets: [
          "User targets notify that accepted project member",
          "Team targets expand to eligible members of the team",
          "Schedule targets resolve the active participant at execution time",
          "Empty or currently unroutable targets are recorded without stopping the worker",
        ],
        note: "Test the policy after membership, schedule, or provider changes. A structurally valid policy can still have no deliverable recipient.",
      },
    ],
  },
  {
    slug: "notification-providers",
    title: "Notification providers",
    description: "Configure Slack, SMTP email, and Twilio with your own provider accounts.",
    group: "Configure",
    icon: BellRing,
    readingTime: "11 min",
    sections: [
      {
        heading: "Bring your own provider",
        paragraphs: ["PagerWho sends operational notifications using credentials configured for each project. Usage, billing, sender verification, deliverability, and provider policy remain with the provider account owner."],
      },
      {
        heading: "SMTP email",
        bullets: [
          "Enter the SMTP host, port, username, and password supplied by your mail provider",
          "Use an app password when Google, Naver, or another provider requires one",
          "Use STARTTLS for a plain connection upgraded to TLS, or TLS for an encrypted connection from the start",
          "The From email must be allowed by the SMTP account or verified domain",
          "Send a provider test before relying on incident delivery",
        ],
      },
      {
        heading: "Slack and Twilio",
        bullets: [
          "Slack requires a valid project-owned integration and destination configuration",
          "Twilio messages use the account SID, auth token, and sender owned by your organization",
          "Recipient phone numbers and user notification contacts must be configured separately",
          "Rotate compromised credentials in the provider first, then update PagerWho immediately",
        ],
      },
    ],
  },
  {
    slug: "workflows",
    title: "Workflow automation",
    description: "Run conditional actions from project events without creating loops.",
    group: "Automate",
    icon: Workflow,
    readingTime: "13 min",
    sections: [
      {
        heading: "Workflow model",
        bullets: [
          "Trigger: the project event that starts evaluation",
          "Filter: equals, in, or exists checks applied to event data",
          "Condition: a true or false branch inside the action graph",
          "Action: an HTTP call or a supported PagerWho operation",
          "Run-as user: the project member whose current permissions authorize each action",
        ],
      },
      {
        heading: "Build and test",
        steps: [
          { title: "Choose a specific trigger", body: "Start with the narrowest event and resource type that represents the automation." },
          { title: "Add filters", body: "Filter on stable event metadata so unrelated events do not create runs." },
          { title: "Connect every branch", body: "Define both success and failure paths when a condition or external request can fail." },
          { title: "Run a test", body: "Select a resource from the current project and inspect every Action result in the run history." },
          { title: "Enable after verification", body: "Disabled workflows can be tested manually but do not run from live events." },
        ],
      },
      {
        heading: "Use previous output",
        code: `{{event.metadata.priority}}\n{{actions.create_service.output.service.id}}\n{{actions.http_request.output.status}}`,
        paragraphs: ["Templates can read event fields and successful output from an earlier action. If the expected output does not exist, the receiving action should be expected to fail validation or target lookup."],
      },
      {
        heading: "Safety boundaries",
        bullets: [
          "Actions cannot target resources in another project",
          "Permissions are checked again when the action executes",
          "Workflow-origin events are not consumed as new workflow triggers",
          "Duplicate processing of one event does not create duplicate runs",
          "HTTP requests time out and record their failure in run history",
        ],
      },
    ],
  },
  {
    slug: "roles-and-permissions",
    title: "Roles and permissions",
    description: "Give members only the project access required for their work.",
    group: "Reference",
    icon: ShieldCheck,
    readingTime: "7 min",
    sections: [
      {
        heading: "Common project roles",
        bullets: [
          "Project Owner: full project control, including ownership-sensitive changes",
          "Project Admin: project configuration without platform administration",
          "Viewer: read-only access to project data",
          "Incident Responder: acknowledge and resolve incidents",
          "Notification Recipient: eligible for notification routing",
          "On-call Participant: eligible for schedule rotations",
          "Service Manager: manage services and webhook endpoints",
        ],
      },
      {
        heading: "Apply least privilege",
        paragraphs: ["Roles take effect on the next request, including existing sessions. Automation also uses the current permissions of its run-as user, so removing a permission can safely stop future actions."],
        bullets: [
          "Keep at least one Project Owner",
          "Do not grant Project Admin solely to make someone a notification recipient",
          "Review run-as users before removing members or changing roles",
          "Platform Admin access is separate from ordinary project administration",
        ],
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "Find the cause when alerts, notifications, or workflows do not run.",
    group: "Reference",
    icon: KeyRound,
    readingTime: "12 min",
    sections: [
      {
        heading: "An alert did not create an incident",
        bullets: [
          "Confirm the webhook endpoint is enabled and belongs to the expected service",
          "Check the request URL, authentication secret, content type, and JSON body",
          "Use a new event_key when retrying a test delivery",
          "Check whether the same dedup_key updated an existing open incident",
        ],
      },
      {
        heading: "A notification was not delivered",
        bullets: [
          "Confirm the incident service has an escalation policy",
          "Confirm the selected target resolves to an eligible member",
          "Check that the recipient has the required email, Slack, or phone contact",
          "Test the project provider and review the delivery log in Operations",
          "Check provider-side rejection, rate limit, sender verification, and account balance",
        ],
      },
      {
        heading: "A workflow did not run",
        bullets: [
          "Confirm the workflow is enabled",
          "Compare the event action, resource type, and filter values",
          "Verify the trigger is connected to an entry action",
          "Check the run-as user is still a project member with the required permission",
          "Open run history to inspect the failed action, HTTP status, or timeout",
        ],
      },
      {
        heading: "Escalate a support request",
        paragraphs: ["Include the approximate time, project and resource names, expected behavior, and the visible error code. Never send provider passwords, webhook secrets, tokens, raw user data, or full request payloads in a public Discord channel."],
      },
    ],
  },
];

export const docsGroups = ["Get started", "Respond", "Configure", "Automate", "Reference"] as const;

export function getDocsArticles(locale: AppLocale): DocsArticle[] {
  const translations = locale === "ko" ? koDocs : locale === "zh-CN" ? zhDocs : null;
  if (!translations) return docsArticles;

  return docsArticles.map((article) => ({
    ...article,
    ...(translations[article.slug] ?? {}),
  }));
}

export function getDocsArticle(slug: string | undefined, locale: AppLocale = "en") {
  return getDocsArticles(locale).find((article) => article.slug === slug);
}
