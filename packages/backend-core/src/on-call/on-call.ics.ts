import type { OnCallShift } from "@im/contracts";

export const onCallIcsReminderMinutes = 15;

// RFC 5545 calendar of on-call shifts. Each shift carries a display alarm, so the subscriber's calendar app
// delivers the "shift starts soon" reminder without a server-side job.
export function buildOnCallIcs(shifts: OnCallShift[], now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PagerWho//On-call shifts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:PagerWho on-call",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const shift of shifts) {
    const layer = shift.layer === "primary" ? "Primary" : "Secondary";
    const summary = `On-call (${layer}): ${shift.schedule_name}`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${shift.schedule_id}-${shift.layer}-${formatIcsDate(new Date(shift.starts_at))}@pagerwho`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART:${formatIcsDate(new Date(shift.starts_at))}`,
      `DTEND:${formatIcsDate(new Date(shift.ends_at))}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(`${layer} on-call for ${shift.schedule_name} (${shift.timezone})`)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`${summary} starts in ${onCallIcsReminderMinutes} minutes`)}`,
      `TRIGGER:-PT${onCallIcsReminderMinutes}M`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function formatIcsDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets continue on the next line after a single space (RFC 5545 §3.1).
function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts.join("\r\n ");
}
