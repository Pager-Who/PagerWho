import { LocalizedText } from "../i18n";
import { getProductDocsVersion, type CopilotClarification, type CopilotClarificationSubmission, type CopilotExecutionResult, type CopilotProposal, type CopilotSource, type CopilotQueryReceipt } from "@im/contracts";
import { Link } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, Bot, CheckCircle2, ClipboardList, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { copilotApi } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import { useAuth } from "../auth";
import { Button, CopilotMark, Field, Select, TextArea, TextInput } from "../components";
import { CopilotSetupNotice, type CopilotAvailability } from "../copilot";
import { normalizeLocale } from "../i18n";
import { cn } from "../utils";

type CopilotMessage = {
  clarification?: CopilotClarification | undefined;
  content: string;
  id: string;
  interactionStatus?: "dismissed" | "executed" | undefined;
  kind?: "message" | "clarification" | "proposal" | "execution_result" | undefined;
  mode?: "ai" | "direct" | undefined;
  proposal?: CopilotProposal | undefined;
  results?: CopilotExecutionResult[] | undefined;
  role: "assistant" | "user";
  sources?: CopilotSource[] | undefined;
  queryReceipts?: CopilotQueryReceipt[] | undefined;
};

type CopilotPanelProps = {
  availability: CopilotAvailability;
  isOpen: boolean;
  onClose: () => void;
  projectName?: string | undefined;
};

export function CopilotPanel({ availability, isOpen, onClose, projectName }: CopilotPanelProps) {
  const isReady = availability === "available";
  const { i18n, t } = useTranslation();
  const { projectId } = useAuth();
  const queryClient = useQueryClient();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const [input, setInput] = useState("");
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const suggestedQuestions = t("copilot.suggestions", { returnObjects: true }) as string[];
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      content: "",
      id: "welcome",
      role: "assistant",
    },
  ]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      wasOpenRef.current = true;
      setIsMounted(true);
      setIsClosing(false);
      return;
    }

    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      setIsClosing(true);
      const timeout = window.setTimeout(() => {
        setIsMounted(false);
        setIsClosing(false);
        previousFocusRef.current?.focus();
        previousFocusRef.current = null;
      }, 220);
      return () => window.clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMounted) return;

    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isMounted, isOpen]);

  if (!isMounted) {
    return null;
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])",
      ) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submitQuestion(rawQuestion: string, structuredInput?: CopilotClarificationSubmission | undefined) {
    const question = rawQuestion.trim();
    if (!isReady || !question || isSubmitting) return;

    setInput("");
    setIsSubmitting(true);
    setMessages((current) => [
      ...current,
      {
        content: question,
        id: crypto.randomUUID(),
        role: "user",
      },
    ]);

    try {
      const response = await copilotApi.ask({
        docs_version: getProductDocsVersion(),
        history: buildCopilotHistory(messages),
        locale,
        question,
        ...(structuredInput ? { structured_input: structuredInput } : {}),
        ...(projectId ? { workspace_id: projectId } : {}),
      });

      setMessages((current) => [
        ...current,
        {
          content: response.answer,
          clarification: response.clarification,
          id: crypto.randomUUID(),
          kind: response.kind,
          mode: response.mode,
          proposal: response.proposal,
          results: response.results,
          role: "assistant",
          sources: response.sources,
          queryReceipts: response.query_receipts,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          content: error instanceof Error ? error.message : "Copilot request failed",
          id: crypto.randomUUID(),
          role: "assistant",
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executeProposal(proposal: CopilotProposal) {
    if (executingProposalId) return;

    setExecutingProposalId(proposal.id);

    try {
      const response = await copilotApi.execute({
        approval: true,
        locale,
        proposal,
      });

      await invalidateCopilotExecutionQueries(queryClient);
      setMessages((current) => [
        ...current.map((message) => message.proposal?.id === proposal.id
          ? { ...message, interactionStatus: "executed" as const } : message),
        {
          content: response.answer,
          id: crypto.randomUUID(),
          kind: response.kind,
          mode: response.mode,
          results: response.results,
          role: "assistant",
          sources: response.sources,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copilot execution failed";
      setMessages((current) => [
        ...current,
        {
          content: message,
          id: crypto.randomUUID(),
          kind: "execution_result",
          role: "assistant",
          results: proposal.actions.map((action) => ({
            action_id: action.id,
            label: action.label,
            message,
            status: "failed" as const,
            type: action.type,
          })),
        },
      ]);
    } finally {
      setExecutingProposalId(null);
    }
  }

  function clearMessages() {
    setInput("");
    setMessages([
      {
        content: "",
        id: "welcome",
        role: "assistant",
      },
    ]);
  }

  function dismissInteraction(messageId: string) {
    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
            ...message,
            interactionStatus: "dismissed",
          }
        : message
    )));
  }

  return (
    <LocalizedText><>
      <div aria-hidden="true" className={cn("copilot-backdrop fixed inset-0 z-40 bg-black/45 lg:hidden", isClosing && "copilot-backdrop-exit")} onClick={onClose} />
      <aside
        aria-label="Copilot"
        aria-modal="true"
        className={cn(
          "fixed bottom-0 right-0 top-0 z-50 grid w-full grid-rows-[auto_1fr_auto] border-l border-hairline bg-canvas-raised shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:w-[min(430px,100vw)]",
          isClosing ? "copilot-panel-exit" : "copilot-panel-enter",
        )}
        onKeyDown={handlePanelKeyDown}
        ref={panelRef}
        role="dialog"
      >
      <header className="flex items-center justify-between gap-3 border-b border-hairline-soft bg-canvas-raised/92 px-4 py-3.5 backdrop-blur-[18px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <CopilotMark showStatusDot={isReady} />
          <div className="grid gap-0.5 min-w-0">
            <h2 className="m-0 text-[17px] font-[700] leading-tight text-ink">Copilot</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-[650] text-ink-muted">
              <Bot aria-hidden="true" size={12} strokeWidth={2.2} />
              {t("copilot.subtitle")}
              {projectName ? (
                <>
                  <span aria-hidden="true" className="text-ink-subtle">·</span>
                  <span className="max-w-32 truncate text-ink-subtle" title={projectName}>{projectName}</span>
                </>
              ) : null}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Clear Copilot chat"
            className="inline-flex h-8.5 w-8.5 cursor-pointer items-center justify-center rounded-full border border-hairline bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink"
            onClick={clearMessages}
            title={t("copilot.clearChat")}
            type="button"
          >
            <RotateCcw size={15} strokeWidth={2.2} />
          </button>
          <button
            aria-label="Close Copilot"
            className="inline-flex h-8.5 w-8.5 cursor-pointer items-center justify-center rounded-full border border-hairline bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <div aria-live="polite" className="grid min-h-0 content-start gap-4 overflow-y-auto p-4">
        {availability !== "available" ? <CopilotSetupNotice availability={availability} /> : (<>
        {messages.length <= 1 ? (
          <section className="grid gap-3 rounded-2xl border border-accent/20 bg-[linear-gradient(145deg,rgba(0,153,255,0.1),rgba(255,255,255,0.02))] p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Sparkles aria-hidden="true" size={13} strokeWidth={2.3} />
              </span>
              <p className="m-0 text-sm leading-[1.45] text-ink-muted">{t("copilot.disclaimer")}</p>
            </div>
            <span className="text-[11px] font-[750] uppercase leading-none text-ink-subtle">{t("copilot.tryAsking")}</span>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question) => (
              <button
                className="min-h-8 rounded-full border border-hairline bg-surface-1 px-3 text-left text-xs font-[650] leading-none text-ink-muted transition duration-120 ease hover:-translate-y-px hover:border-accent/35 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55 motion-reduce:transition-none"
                disabled={isSubmitting}
                key={question}
                onClick={() => void submitQuestion(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
          </section>
        ) : null}

        <section aria-label={t("copilot.conversation")} className="grid content-start gap-3">
          {messages.map((message) => (
            <CopilotMessageBubble
              isExecuting={Boolean(message.proposal && executingProposalId === message.proposal.id)}
              key={message.id}
              message={message}
              onDismissInteraction={dismissInteraction}
              onExecuteProposal={executeProposal}
              onSubmitClarification={(value, structuredInput) => void submitQuestion(value, structuredInput)}
            />
          ))}
          {isSubmitting ? (
            <div aria-label={t("copilot.thinking")} className="mr-auto flex max-w-[88%] items-center gap-2 rounded-2xl border border-accent/20 bg-surface-1 px-3.5 py-3 text-sm text-ink-muted" role="status">
              <Loader2 aria-hidden="true" className="animate-spin text-accent" size={15} />
              <span>{t("copilot.thinking")}</span>
              <span aria-hidden="true" className="copilot-thinking-dots">•••</span>
            </div>
          ) : null}
        </section>
        </>)}
      </div>

      <form
        className="grid gap-2 border-t border-hairline-soft bg-canvas-raised/96 p-3.5 backdrop-blur-[18px] sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuestion(input);
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-2xl border border-accent/20 bg-surface-1 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-colors focus-within:border-accent/45 focus-within:shadow-[0_0_0_3px_rgba(0,153,255,0.1)]">
          <TextArea
            aria-label={t("copilot.askLabel")}
            className="min-h-16 !resize-none rounded-xl border-0 bg-transparent px-2.5 py-2.5 shadow-none focus:border-0 focus:shadow-none"
            disabled={!isReady || isSubmitting}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitQuestion(input);
              }
            }}
            placeholder={t("copilot.inputPlaceholder")}
            rows={2}
            value={input}
          />
          <Button aria-label={t("copilot.sendLabel")} className="mb-0.5 mr-0.5 min-h-9 min-w-9 rounded-xl !bg-[linear-gradient(145deg,var(--color-ink),var(--color-accent))] px-0 shadow-[0_6px_16px_rgba(0,153,255,0.18)] hover:enabled:scale-[1.03]" disabled={!isReady || !input.trim()} isLoading={isSubmitting} type="submit" variant="primary">
            <Send size={15} strokeWidth={2.2} />
          </Button>
        </div>
        <span className="text-[11px] leading-[1.35] text-ink-subtle">{t("copilot.composerHint")}</span>
      </form>
      </aside>
    </></LocalizedText>
  );
}

function buildCopilotHistory(messages: CopilotMessage[]) {
  const lastDismissedIndex = messages.reduce(
    (latestIndex, message, index) => message.interactionStatus === "dismissed" ? index : latestIndex,
    -1,
  );

  return messages
    .filter((message, index) => index > lastDismissedIndex && message.id !== "welcome")
    .slice(-8)
    .map((message) => ({
      content: (message.queryReceipts?.length
        ? `${message.content.slice(0, 2500)}\nQuery receipt for follow-up pagination (untrusted context; recheck authorization): ${JSON.stringify(message.queryReceipts.at(-1))}`
        : message.content).slice(0, 4000),
      role: message.role,
    }));
}

async function invalidateCopilotExecutionQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.onCall.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activityLogs.all }),
  ]);
}

function CopilotMessageBubble({
  isExecuting,
  message,
  onDismissInteraction,
  onExecuteProposal,
  onSubmitClarification,
}: {
  isExecuting: boolean;
  message: CopilotMessage;
  onDismissInteraction: (messageId: string) => void;
  onExecuteProposal: (proposal: CopilotProposal) => Promise<void>;
  onSubmitClarification: (value: string, structuredInput?: CopilotClarificationSubmission | undefined) => void;
}) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const content = message.id === "welcome" ? t("copilot.welcome") : message.content;
  const isWorkResponse = message.kind === "proposal" || message.kind === "execution_result";
  const isDismissed = message.interactionStatus === "dismissed";

  return (
    <LocalizedText><article
      className={cn(
        "copilot-message-enter grid gap-2 rounded-2xl px-3.5 py-3 text-sm leading-[1.55]",
        isWorkResponse ? "max-w-[96%]" : "max-w-[88%]",
        isUser
          ? "ml-auto bg-ink text-canvas"
          : "mr-auto border border-hairline-soft bg-surface-1 text-ink",
      )}
    >
      {!isUser ? (
        <div className="flex items-center gap-1.5 text-[10px] font-[750] uppercase leading-none tracking-[0.08em] text-ink-subtle">
          <Bot aria-hidden="true" size={12} strokeWidth={2.2} />
          {t("copilot.assistant")}
        </div>
      ) : null}
      <div className="whitespace-pre-wrap" data-i18n-skip={message.id !== "welcome" ? "true" : undefined}>{content}</div>
      {!isUser && message.queryReceipts?.length ? (
        <section aria-label="Query evidence" className="grid gap-3 border-t border-hairline-soft pt-3">
          <p className="m-0 text-xs leading-relaxed text-ink-muted">{message.queryReceipts.some((receipt) => receipt.operation === "inspect_webhook_payload")
            ? "This checks payload format only. No webhook request or incident was created."
            : "These are configured targets, not proof of notification delivery or receipt."}</p>
          {message.queryReceipts.map((receipt, index) => (
            <details className="min-w-0 text-xs text-ink-muted" key={`${receipt.queried_at}:${index}`}>
              <summary className="cursor-pointer text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Query details</summary>
              <dl className="m-0 grid gap-2 pt-2">
                <div><dt>Queried at</dt><dd className="m-0 break-words" translate="no">{receipt.queried_at}</dd></div>
                <div><dt>Calculated at</dt><dd className="m-0 break-words" translate="no">{receipt.local_time} ({receipt.timezone}) · {receipt.at}</dd></div>
                <div><dt>Query scope</dt><dd className="m-0 break-words" translate="no">{receipt.scope}</dd></div>
                <div><dt>Returned items</dt><dd className="m-0" translate="no">{receipt.returned_count}</dd></div>
              </dl>
              {receipt.has_more ? <p className="mb-0">Partial results. Narrow the query or ask for the next page when available.</p> : null}
            </details>
          ))}
          {message.sources?.filter((entry) => /^\/(?:incidents|services|on-call|escalation-policies|project-settings|docs)(?:[/?]|$)/.test(entry.path)).map((entry, index) => (
            <div className="grid min-w-0 gap-1 text-xs" key={`${entry.path}:${index}`}>
              <Link className="break-words text-accent underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" to={entry.path} translate="no">{entry.title}</Link>
              <p className="m-0 break-words text-ink-muted" translate="no">{entry.snippet}</p>
            </div>
          ))}
        </section>
      ) : null}
      {!isUser && message.clarification ? (
        isDismissed ? (
          <InteractionDismissedNotice message={t("copilot.canceledNotice")} />
        ) : (
          <ClarificationForm
            clarification={message.clarification}
            onCancel={() => onDismissInteraction(message.id)}
            onSubmit={onSubmitClarification}
          />
        )
      ) : null}
      {!isUser && message.proposal ? (
        <ProposalCard
          isExecuted={message.interactionStatus === "executed"}
          isDismissed={isDismissed}
          isExecuting={isExecuting}
          onExecute={() => onExecuteProposal(message.proposal as CopilotProposal)}
          onReject={() => onDismissInteraction(message.id)}
          proposal={message.proposal}
        />
      ) : null}
      {!isUser && message.results && message.results.length > 0 ? (
        <ExecutionResults results={message.results} />
      ) : null}
    </article></LocalizedText>
  );
}

function ClarificationForm({
  clarification,
  onCancel,
  onSubmit,
}: {
  clarification: CopilotClarification;
  onCancel: () => void;
  onSubmit: (value: string, structuredInput?: CopilotClarificationSubmission | undefined) => void;
}) {
  const { t } = useTranslation();
  const initialValues = Object.fromEntries(
    clarification.fields.map((field) => [field.id, ""]),
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const canSubmit = clarification.fields.every((field) => !field.required || values[field.id]?.trim());

  function updateValue(id: string, value: string) {
    setValues((current) => ({
      ...current,
      [id]: value,
    }));
  }

  function submit() {
    const submittedValues = Object.fromEntries(
      clarification.fields
        .map((field) => [field.id, values[field.id]?.trim() ?? ""] as const)
        .filter(([, value]) => value.length > 0),
    );
    const answer = clarification.fields
      .map((field) => {
        const value = values[field.id]?.trim() ?? "";
        return `${clarificationAnswerLabel(field.id, field.label)}: ${value}`;
      })
      .filter((line) => !line.endsWith(": "))
      .join("\n");

    if (answer) {
      onSubmit(answer, {
        ...(clarification.task ? { task: clarification.task } : {}),
        ...(clarification.task_id ? { task_id: clarification.task_id } : {}),
        values: submittedValues,
      });
    }
  }

  return (
    <LocalizedText><form
      className="grid gap-3 rounded-xl border border-accent/20 bg-[linear-gradient(145deg,rgba(0,153,255,0.08),rgba(255,255,255,0.015))] p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <ClipboardList aria-hidden="true" size={14} strokeWidth={2.2} />
        </span>
        <div className="grid gap-1">
          <strong className="text-[13px] leading-tight text-ink">{t("copilot.needsInput")}</strong>
          <span className="text-xs leading-[1.4] text-ink-muted">{t("copilot.needsInputHint")}</span>
        </div>
      </div>
      {clarification.task ? (
        <div className="rounded-lg border border-hairline-soft bg-canvas/35 px-3 py-2 text-xs leading-[1.35] text-ink-muted">
          <span className="font-[750] text-ink-subtle">{t("copilot.pendingTask")}</span>
          <span className="block pt-1 text-ink-muted">{clarification.task.pending_goal}</span>
        </div>
      ) : null}
      <div className="grid gap-2.5">
        {clarification.fields.map((field) => (
          <Field
            hint={field.description}
            key={field.id}
            label={field.label}
            required={field.required}
          >
            {field.options?.length || field.input_type === "select" ? (
              <Select
                aria-label={field.label}
                onChange={(event) => updateValue(field.id, event.target.value)}
                value={values[field.id] ?? ""}
              >
                <option value="">{t("copilot.selectPlaceholder")}</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            ) : (
              <TextInput
                aria-label={field.label}
                autoComplete={field.input_type === "email" ? "email" : undefined}
                onChange={(event) => updateValue(field.id, event.target.value)}
                placeholder={field.description}
                type={field.input_type === "email" || field.input_type === "url" ? field.input_type : "text"}
                value={values[field.id] ?? ""}
              />
            )}
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline-soft pt-3">
        <span className="text-[11px] text-ink-subtle">{t("copilot.requiredFieldsHint")}</span>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canSubmit} size="sm" type="submit" variant="primary">
            {t("copilot.continue")}
          </Button>
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            {t("copilot.cancel")}
          </Button>
        </div>
      </div>
    </form></LocalizedText>
  );
}

function clarificationAnswerLabel(fieldId: string, label: string) {
  switch (fieldId) {
    case "service_name":
      return "Service name";
    case "existing_service_name":
      return "Existing service";
    case "new_service_name":
      return "New service name";
    case "on_call_schedule_name":
      return "Schedule name";
    case "primary_responder":
      return "primary";
    case "secondary_responder":
      return "secondary";
    default:
      return label;
  }
}

function ProposalValues({ label, values }: { label: string; values: string[] }) {
  return <div className="grid min-w-0 gap-1">
    <span>{label}</span>
    {values.map((value, index) => {
      let formatted = value;
      try { formatted = JSON.stringify(JSON.parse(value), null, 2); } catch { /* Existing plain-text previews. */ }
      return <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 text-xs text-ink-muted" key={index} translate="no">{formatted}</pre>;
    })}
  </div>;
}

function ProposalCard({
  isExecuted,
  isDismissed,
  isExecuting,
  onExecute,
  onReject,
  proposal,
}: {
  isExecuted: boolean;
  isDismissed: boolean;
  isExecuting: boolean;
  onExecute: () => void;
  onReject: () => void;
  proposal: CopilotProposal;
}) {
  const { t } = useTranslation();

  return (
    <LocalizedText><div className="grid gap-3 rounded-2xl border border-accent/30 bg-[linear-gradient(145deg,rgba(0,153,255,0.1),rgba(255,255,255,0.02))] p-3.5 shadow-[0_12px_30px_rgba(0,153,255,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <ClipboardList aria-hidden="true" size={14} strokeWidth={2.2} />
          </span>
          <div className="grid min-w-0 gap-1">
            <strong className="text-sm leading-tight text-ink">{t("copilot.approvalRequired")}</strong>
            <span className="text-[11px] leading-[1.35] text-ink-muted">
              {t("copilot.planSummary", {
                actions: proposal.actions.length,
                missing: proposal.missing_inputs.length,
                risks: proposal.risks.length,
              })}
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-[750] uppercase leading-none tracking-[0.06em] text-accent">
          {isExecuting ? t("copilot.executionInProgress") : t("copilot.awaitingApproval")}
        </span>
      </div>

      {proposal.actions.length > 0 ? (
        <div className="grid gap-2">
          {proposal.actions.map((action, index) => (
            <div className="grid gap-2 rounded-xl border border-hairline-soft bg-canvas/45 p-3 transition-colors duration-120 hover:border-accent/25" key={action.id}>
              <div className="flex items-start gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/14 text-xs font-[750] text-[#72c7ff]">
                  {index + 1}
                </span>
                <div className="grid min-w-0 gap-1">
                  <strong className="text-[13px] leading-[1.3] text-ink">{action.label}</strong>
                  <span className="text-[11px] font-[700] uppercase leading-none text-ink-subtle">
                    {formatActionType(action.type)}
                  </span>
                </div>
              </div>
              {action.before.length > 0 || action.after.length > 0 ? (
                <div className="grid gap-1.5 text-xs leading-[1.45] text-ink-muted">
                  {action.before.length > 0 ? <ProposalValues label={t("copilot.before")} values={action.before} /> : null}
                  {action.after.length > 0 ? <ProposalValues label={t("copilot.after")} values={action.after} /> : null}
                </div>
              ) : null}
              {action.risks.length > 0 ? (
                <div className="grid gap-1">
                  {action.risks.map((risk) => (
                    <span className="inline-flex items-start gap-1.5 text-xs leading-[1.4] text-warning" key={risk}>
                      <AlertTriangle className="mt-0.5 shrink-0" size={12} strokeWidth={2.2} />
                      {risk}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {proposal.missing_inputs.length > 0 ? (
        <InfoList icon={<ClipboardList size={14} strokeWidth={2.2} />} items={proposal.missing_inputs} title={t("copilot.missingInput")} />
      ) : null}
      {proposal.risks.length > 0 ? (
        <InfoList icon={<AlertTriangle size={14} strokeWidth={2.2} />} items={proposal.risks} title={t("copilot.risk")} />
      ) : null}

      {isExecuted ? null : isDismissed ? (
        <InteractionDismissedNotice message={t("copilot.rejectedNotice")} />
      ) : proposal.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-1.5 shadow-[0_8px_20px_rgba(0,153,255,0.14)]"
            isLoading={isExecuting}
            onClick={onExecute}
            size="sm"
            variant="primary"
          >
            <CheckCircle2 size={14} strokeWidth={2.2} />
            {t("copilot.applyApprovedPlan")}
          </Button>
          <Button
            className="gap-1.5"
            disabled={isExecuting}
            onClick={onReject}
            size="sm"
            variant="ghost"
          >
            <Ban size={14} strokeWidth={2.2} />
            {t("copilot.reject")}
          </Button>
        </div>
      ) : null}
    </div></LocalizedText>
  );
}

function InteractionDismissedNotice({ message }: { message: string }) {
  return (
    <LocalizedText><div className="flex items-center gap-2 rounded-lg border border-hairline-soft bg-canvas/35 px-3 py-2 text-xs font-[650] leading-[1.35] text-ink-muted">
      <Ban aria-hidden="true" className="shrink-0 text-ink-subtle" size={13} strokeWidth={2.2} />
      {message}
    </div></LocalizedText>
  );
}

function ExecutionResults({ results }: { results: CopilotExecutionResult[] }) {
  const { t } = useTranslation();
  const hasFailure = results.some((result) => result.status === "failed");

  return (
    <LocalizedText><div aria-label={hasFailure ? t("copilot.executionFailed") : t("copilot.executionResults")} className="grid gap-2 rounded-xl border border-hairline-soft bg-canvas/35 p-3" role="status">
      <div className="flex items-center gap-2 border-b border-hairline-soft pb-2">
        {hasFailure ? <AlertTriangle aria-hidden="true" className="text-danger" size={14} strokeWidth={2.2} /> : <CheckCircle2 aria-hidden="true" className="text-success" size={14} strokeWidth={2.2} />}
        <strong className="text-[11px] font-[750] uppercase leading-none tracking-[0.06em] text-ink-subtle">
          {hasFailure ? t("copilot.executionFailed") : t("copilot.executionResults")}
        </strong>
      </div>
      {results.map((result) => (
        <div
          className={cn(
            "grid gap-1 rounded-lg border p-3",
            result.status === "succeeded"
              ? "border-success/25 bg-success/8"
              : "border-danger/25 bg-danger/8",
          )}
          key={`${result.action_id}:${result.status}`}
        >
          <div className="flex items-center gap-1.5">
            {result.status === "succeeded" ? <CheckCircle2 aria-hidden="true" className="text-success" size={13} strokeWidth={2.2} /> : <AlertTriangle aria-hidden="true" className="text-danger" size={13} strokeWidth={2.2} />}
            <span className="text-[11px] font-[700] uppercase leading-none text-ink-subtle">
              {result.status} · {formatActionType(result.type)}
            </span>
          </div>
          <strong className="text-[13px] leading-[1.3] text-ink">{result.label}</strong>
          <span className="text-xs leading-[1.45] text-ink-muted">{result.message}</span>
        </div>
      ))}
    </div></LocalizedText>
  );
}

function InfoList({ icon, items, title }: { icon: ReactNode; items: string[]; title: string }) {
  return (
    <LocalizedText><div className="grid gap-1.5 rounded-lg border border-hairline-soft bg-canvas/35 p-3">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-[750] uppercase leading-none text-ink-subtle">
        {icon}
        {title}
      </span>
      {items.map((item) => (
        <span className="text-xs leading-[1.45] text-ink-muted" key={item}>{item}</span>
      ))}
    </div></LocalizedText>
  );
}

function formatActionType(type: CopilotProposal["actions"][number]["type"] | CopilotExecutionResult["type"]) {
  return type.replaceAll("_", " ");
}
