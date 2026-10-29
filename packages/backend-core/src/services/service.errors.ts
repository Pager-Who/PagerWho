export type ServiceCatalogErrorCode =
  | "service_has_incidents"
  | "service_not_found"
  | "team_not_found"
  | "escalation_policy_not_found"
  | "workspace_not_found"
  | "webhook_endpoint_already_exists"
  | "webhook_endpoint_disabled"
  | "webhook_endpoint_not_found"
  | "workspace_mismatch";

export class ServiceCatalogError extends Error {
  constructor(
    public readonly code: ServiceCatalogErrorCode,
    message: string,
  ) {
    super(message);
  }
}
