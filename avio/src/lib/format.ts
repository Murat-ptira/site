const DAY_MS = 24 * 60 * 60 * 1000;

export type RecencyGroup = "Today" | "Yesterday" | "Previous 7 days" | "Older";

/** Buckets a timestamp for the conversation list. */
export function recencyGroup(iso: string, now = new Date()): RecencyGroup {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = new Date(iso).getTime();
  if (time >= startOfToday) return "Today";
  if (time >= startOfToday - DAY_MS) return "Yesterday";
  if (time >= startOfToday - 7 * DAY_MS) return "Previous 7 days";
  return "Older";
}

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const plain = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return value >= 10_000 ? compact.format(value) : plain.format(value);
}

// A fixed locale and time zone keep server and client output identical.
const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [words[0]?.[0] ?? "?"];
  return letters.join("").toUpperCase();
}
