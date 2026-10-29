-- Add an in-flight notification state used by workers to claim rows before
-- performing external side effects.
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'sending';
