import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button, ErrorState, Field, TextArea } from "../../../shared/components";
import { useStaticText } from "../../../shared/i18n";

export type AdminAction = {
  title: string;
  description: string;
  target: string;
  danger?: boolean;
  submit: (reason: string) => Promise<unknown>;
};

type AdminActionDialogProps = {
  action: AdminAction | null;
  onClose: () => void;
  onSuccess: (title: string) => void;
};

export function AdminActionDialog({ action, onClose, onSuccess }: AdminActionDialogProps) {
  const t = useStaticText();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [isPending, setIsPending] = useState(false);
  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length >= 3 && trimmedReason.length <= 500;

  useEffect(() => {
    if (!action) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    setReason("");
    setError(null);
    setIsPending(false);
    submittingRef.current = false;
    dialog?.showModal();

    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [action]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !isValid || submittingRef.current) return;

    submittingRef.current = true;
    setIsPending(true);
    setError(null);
    try {
      await action.submit(trimmedReason);
    } catch (submitError) {
      setError(submitError);
      return;
    } finally {
      submittingRef.current = false;
      setIsPending(false);
    }
    onSuccess(action.title);
    onClose();
  }

  if (!action) return null;

  return (
    <dialog
      aria-describedby={`${id}-description`}
      aria-labelledby={`${id}-title`}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-hairline bg-surface-1 p-5 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.32)] [overflow-wrap:anywhere] backdrop:bg-black/60 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        if (!submittingRef.current) onClose();
      }}
      ref={dialogRef}
    >
      <form className="grid min-w-0 gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="grid min-w-0 gap-2">
          <h2 className="m-0 text-lg font-bold leading-tight" id={`${id}-title`}>{t(action.title)}</h2>
          <p className="m-0 text-sm leading-relaxed text-ink-muted" id={`${id}-description`}>{t(action.description)}</p>
        </div>

        <div className="rounded-lg border border-hairline bg-surface-2 p-3">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">{t("Target")}</span>
          <p className="m-0 text-sm font-semibold">{action.target}</p>
        </div>

        <Field label="Admin reason" required>
          <TextArea
            aria-label="Admin reason"
            aria-describedby={`${id}-reason-hint`}
            autoFocus
            disabled={isPending}
            maxLength={500}
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            value={reason}
          />
        </Field>
        <div className="-mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink-subtle">
          <span className="min-w-0 flex-1" id={`${id}-reason-hint`}>{t("Enter 3–500 characters. This reason is recorded in the audit log.")}</span>
          <span>{reason.length} / 500</span>
        </div>

        {error ? (
          <div role="alert">
            <ErrorState error={error} title="Change could not be applied" />
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-hairline pt-4">
          <Button disabled={isPending} onClick={onClose} variant="ghost">Cancel</Button>
          <Button disabled={!isValid} isLoading={isPending} type="submit" variant={action.danger ? "danger" : "primary"}>Apply change</Button>
        </div>
      </form>
    </dialog>
  );
}
