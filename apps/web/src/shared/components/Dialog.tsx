import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "./Button";
import { useTranslateNode } from "../i18n";

type DialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  description?: ReactNode;
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm?: (() => void) | undefined;
  open: boolean;
  title: ReactNode;
  tone?: "default" | "danger";
};

export function Dialog({
  cancelLabel = "Cancel",
  children,
  confirmLabel = "Confirm",
  description,
  isConfirming = false,
  onClose,
  onConfirm,
  open,
  title,
  tone = "default",
}: DialogProps) {
  const translateNode = useTranslateNode();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-hairline bg-surface-1 p-5 text-ink shadow-[0_24px_80px_rgba(0,0,0,0.32)] [overflow-wrap:anywhere] backdrop:bg-black/55"
      onCancel={(event) => {
        event.preventDefault();
        if (!isConfirming) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isConfirming) onClose();
      }}
      ref={dialogRef}
    >
        <div className="grid gap-2">
          <h2 className="m-0 text-lg font-[700] leading-tight text-ink" id={titleId}>{translateNode(title)}</h2>
          {description ? <p className="m-0 text-sm leading-[1.5] text-ink-muted" id={descriptionId}>{translateNode(description)}</p> : null}
          {children}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <Button disabled={isConfirming} onClick={onClose} variant="ghost">{cancelLabel}</Button>
          {onConfirm ? (
            <Button
              isLoading={isConfirming}
              onClick={onConfirm}
              variant={tone === "danger" ? "danger" : "primary"}
            >
              {confirmLabel}
            </Button>
          ) : null}
        </div>
    </dialog>
  );
}
