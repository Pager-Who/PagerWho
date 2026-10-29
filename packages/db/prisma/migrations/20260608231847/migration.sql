-- AlterTable
ALTER TABLE "worker_run_logs" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "notification_delivery_attempts_notification_log_id_started_at_i" RENAME TO "notification_delivery_attempts_notification_log_id_started__idx";
