// Synthetic data only. Shared by deterministic regressions and opt-in provider evaluation.
export const summaryIncidentId = "44444444-4444-4444-8444-444444444444";
export const summaryWorkspaceId = "22222222-2222-4222-8222-222222222222";
export function summaryIncidentFixture() {
  return {
    title: "Checkout errors reported", description: "Webhook reports payment failures. Impact is not yet confirmed.",
    severity: "critical" as const, priority: "P1" as const, status: "acknowledged" as "triggered" | "acknowledged" | "resolved",
    createdAt: new Date("2030-01-07T00:00:00Z"), updatedAt: new Date("2030-01-07T00:05:00Z"),
    acknowledgedAt: new Date("2030-01-07T00:05:00Z"), resolvedAt: null as Date | null,
    service: { name: "checkout", team: { name: "Payments" } }, acknowledgedBy: { name: "Jordan" },
    timelineEntries: [{ type: "incident_acknowledged", createdAt: new Date("2030-01-07T00:05:00Z") },
      { type: "incident_created", createdAt: new Date("2030-01-07T00:00:00Z") }],
  };
}
