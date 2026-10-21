import type { Database } from "@/database.types";

export type Sighting = Database["public"]["Tables"]["sightings"]["Row"];
export type Category = Database["public"]["Enums"]["sighting_category"];
export type VoteType = Database["public"]["Enums"]["vote_type"];
export type Status = "verified" | "unverified" | "disputed";

// Same order and values as the database's sighting_category type.
export const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: "patrol", label: "Patrol", hint: "Agents walking or driving around" },
  { value: "vehicle", label: "Vehicle", hint: "ICE or unmarked vehicles waiting" },
  { value: "checkpoint", label: "Checkpoint", hint: "Agents stopping or checking people" },
  { value: "raid", label: "Raid", hint: "Agents entering a home or workplace" },
  { value: "other", label: "Other", hint: "Something else" },
];

export const STATUS_LABEL: Record<Status, string> = {
  verified: "Verified",
  unverified: "Unverified",
  disputed: "Disputed",
};

// Limits the database enforces, mirrored in the post form.
export const LIMITS = { label: 120, description: 280, count: 99 } as const;

export function statusOf(sighting: Sighting): Status {
  const status = sighting.verification_status;
  return status === "verified" || status === "disputed" ? status : "unverified";
}

export function categoryLabel(category: Category) {
  return CATEGORIES.find((c) => c.value === category)?.label ?? "Other";
}

export function sightingTitle(sighting: Sighting) {
  return sighting.location_label || `${categoryLabel(sighting.category)} sighting`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// "Vehicle · 2 agents · 1 vehicle". Counts left empty mean "not sure".
export function sightingSummary(sighting: Sighting) {
  const parts = [categoryLabel(sighting.category)];
  if (sighting.agent_count != null) parts.push(plural(sighting.agent_count, "agent"));
  if (sighting.vehicle_count != null) parts.push(plural(sighting.vehicle_count, "vehicle"));
  return parts.join(" · ");
}

export function voteCounts(sighting: Sighting) {
  return `${plural(sighting.confirm_count, "confirmation")} · ${plural(sighting.dispute_count, "dispute")}`;
}

export function isActive(sighting: Sighting, now: number) {
  return Date.parse(sighting.expires_at) > now;
}

export function timeAgo(iso: string, now: number) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return plural(Math.floor(hours / 24), "day") + " ago";
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
