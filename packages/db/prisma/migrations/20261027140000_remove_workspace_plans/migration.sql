-- Preserve workspace quota overrides and audit metadata; remove commercial tiers.
DROP INDEX "workspace_entitlements_plan_idx";
ALTER TABLE "workspace_entitlements" DROP COLUMN "plan", DROP COLUMN "source";
