import type { OnCallShift } from "@im/contracts";
import { CalendarClock } from "lucide-react";
import { useState } from "react";

import { Badge, Button, ErrorState, LoadingState, Panel, TextInput } from "../../../shared/components";
import { LocalizedText, useStaticText } from "../../../shared/i18n";
import { formatDateTime, formatRelativeTime } from "../../../shared/utils";
import {
  useCalendarFeed,
  useDisableCalendarFeedMutation,
  useMyOnCallShifts,
  useRotateCalendarFeedMutation,
} from "../queries";

// The responder's own upcoming coverage plus an ICS subscription whose events carry a pre-shift reminder.
export function MyShiftsPanel() {
  const t = useStaticText();
  const shiftsQuery = useMyOnCallShifts();
  const feedQuery = useCalendarFeed();
  const rotateFeedMutation = useRotateCalendarFeedMutation();
  const disableFeedMutation = useDisableCalendarFeedMutation();
  const [copied, setCopied] = useState(false);
  const shifts = shiftsQuery.data ?? [];
  const now = Date.now();
  const currentShift = shifts.find((shift) => Date.parse(shift.starts_at) <= now && Date.parse(shift.ends_at) > now);
  const feedUrl = rotateFeedMutation.data?.url ?? null;
  const isFeedEnabled = feedQuery.data?.enabled ?? false;

  async function copyFeedUrl() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
  }

  return (
    <LocalizedText><Panel className="grid gap-4 rounded-[20px] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <h2 className="m-0 flex items-center gap-2 text-ink text-[17px] font-semibold leading-tight">
            <CalendarClock aria-hidden="true" size={17} />
            My shifts
          </h2>
          <p className="m-0 text-ink-muted text-xs leading-[1.45]">
            Your primary and secondary coverage for the next 14 days, including overrides.
          </p>
        </div>
        {currentShift ? <Badge tone="green">On call now</Badge> : null}
      </div>

      {shiftsQuery.isLoading ? <LoadingState message="Loading your shifts..." /> : null}
      {shiftsQuery.error ? <ErrorState error={shiftsQuery.error} onRetry={() => void shiftsQuery.refetch()} title="Could not load your shifts" /> : null}
      {!shiftsQuery.isLoading && !shiftsQuery.error ? (
        shifts.length === 0 ? (
          <p className="m-0 text-ink-subtle text-sm">You have no on-call shifts in the next 14 days.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {shifts.map((shift) => <ShiftRow key={`${shift.schedule_id}-${shift.layer}-${shift.starts_at}`} shift={shift} />)}
          </ul>
        )
      ) : null}

      <div className="grid gap-2.5 border-t border-hairline-soft pt-3.5">
        <div className="grid gap-1">
          <span className="text-ink text-sm font-semibold">Calendar subscription</span>
          <p className="m-0 text-ink-muted text-xs leading-[1.45]">
            Subscribe in Google Calendar, Apple Calendar, or Outlook. Each shift includes a reminder 15 minutes before it starts. Anyone with the link can see your shifts.
          </p>
        </div>
        {feedUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-72">
              <TextInput aria-label={t("Calendar subscription URL")} onFocus={(event) => event.currentTarget.select()} readOnly value={feedUrl} />
            </div>
            <Button onClick={() => void copyFeedUrl()} size="sm" variant="secondary">{copied ? "Copied" : "Copy link"}</Button>
          </div>
        ) : isFeedEnabled ? (
          <p className="m-0 text-ink-subtle text-xs">
            A subscription link is active. For security the link is shown only once; create a new link if you lost it.
          </p>
        ) : null}
        {feedUrl ? <p className="m-0 text-ink-subtle text-xs">Copy this link now. It will not be shown again.</p> : null}
        {rotateFeedMutation.error ?? disableFeedMutation.error ? (
          <ErrorState error={rotateFeedMutation.error ?? disableFeedMutation.error} title="Could not update the calendar link" />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disableFeedMutation.isPending}
            isLoading={rotateFeedMutation.isPending}
            onClick={() => {
              setCopied(false);
              disableFeedMutation.reset();
              rotateFeedMutation.mutate();
            }}
            size="sm"
            variant={isFeedEnabled ? "ghost" : "secondary"}
          >
            {isFeedEnabled ? "Create new link" : "Create calendar link"}
          </Button>
          {isFeedEnabled ? (
            <Button
              disabled={rotateFeedMutation.isPending}
              isLoading={disableFeedMutation.isPending}
              onClick={() => {
                rotateFeedMutation.reset();
                disableFeedMutation.mutate();
              }}
              size="sm"
              variant="ghost"
            >
              Turn off link
            </Button>
          ) : null}
        </div>
      </div>
    </Panel></LocalizedText>
  );
}

function ShiftRow({ shift }: { shift: OnCallShift }) {
  return (
    <li className="grid gap-1 rounded-lg border border-hairline-soft bg-surface-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <span className="flex min-w-0 items-center gap-2">
        <Badge tone={shift.layer === "primary" ? "blue" : "neutral"}>{shift.layer === "primary" ? "Primary" : "Secondary"}</Badge>
        <strong className="min-w-0 truncate text-ink text-sm font-[650]">{shift.schedule_name}</strong>
      </span>
      <span className="text-ink-muted text-xs">
        <time dateTime={shift.starts_at} title={formatRelativeTime(shift.starts_at)}>{formatDateTime(shift.starts_at)}</time>
        {" – "}
        <time dateTime={shift.ends_at}>{formatDateTime(shift.ends_at)}</time>
      </span>
    </li>
  );
}
