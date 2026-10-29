export type IncidentErrorCode =
  | "actor_not_found"
  | "incident_not_found"
  | "invalid_incident_transition"
  | "service_not_found";

export class IncidentError extends Error {
  constructor(
    public readonly code: IncidentErrorCode,
    message: string,
  ) {
    super(message);
  }
}

