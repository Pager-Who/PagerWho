export class PlatformError extends Error {
  constructor(
    public readonly code:
      | "platform_admin_required"
      | "cannot_suspend_self"
      | "cannot_suspend_last_platform_admin"
      | "user_not_found"
      | "notification_not_found"
      | "notification_not_retryable"
      | "resource_not_found"
      | "invalid_quota_override"
      | "workspace_not_found",
    message: string,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}
