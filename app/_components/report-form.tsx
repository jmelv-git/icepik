"use client";

import { useEffect, useState } from "react";
import { postSighting } from "@/app/actions/sightings";
import { NEARBY_RADIUS_M, distanceMeters, formatDistance } from "@/lib/geo";
import { runAction } from "@/lib/run-action";
import {
  CATEGORIES,
  LIMITS,
  STATUS_LABEL,
  sightingTitle,
  statusOf,
  timeAgo,
  type Category,
  type Sighting,
} from "@/lib/sightings";
import { StatusIcon } from "./icons";
import type { Point } from "./sightings-map";

type Props = {
  point: Point;
  sightings: Sighting[];
  myPosts: ReadonlySet<string>;
  now: number;
  onMoveSpot: () => void;
  onCancel: () => void;
  onPosted: (sighting: Sighting) => void;
  onShowSighting: (id: string) => void;
};

// "" means "not sure". Anything else must be a whole number from 0 to 99.
function parseCount(value: string): number | null | undefined {
  if (value.trim() === "") return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= LIMITS.count ? count : undefined;
}

export function ReportForm({
  point,
  sightings,
  myPosts,
  now,
  onMoveSpot,
  onCancel,
  onPosted,
  onShowSighting,
}: Props) {
  const [category, setCategory] = useState<Category | null>(null);
  const [agents, setAgents] = useState("");
  const [vehicles, setVehicles] = useState("");
  // The suggested label fills the field until the person edits it.
  const [suggested, setSuggested] = useState<{ key: string; label: string } | null>(null);
  const [typedLabel, setTypedLabel] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pointKey = `${point.lat},${point.lng}`;
  const label = typedLabel ?? (suggested?.key === pointKey ? suggested.label : "");

  // Suggest street names for the rounded spot. The point goes in the request
  // body, and the server asks the geocoder, so it never sees this device.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: point.lat, lng: point.lng }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { label?: string } | null) => {
        if (!cancelled && data?.label) {
          setSuggested({ key: `${point.lat},${point.lng}`, label: data.label.slice(0, LIMITS.label) });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [point.lat, point.lng]);

  const nearby = sightings
    .map((sighting) => ({
      sighting,
      distance: distanceMeters(point.lat, point.lng, sighting.lat, sighting.lng),
    }))
    .filter(({ distance }) => distance <= NEARBY_RADIUS_M)
    .sort((a, b) => a.distance - b.distance);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const agentCount = parseCount(agents);
    const vehicleCount = parseCount(vehicles);

    if (!category) return setMessage("Choose what you saw.");
    if (agentCount === undefined || vehicleCount === undefined) {
      return setMessage("Counts must be whole numbers from 0 to 99.");
    }

    setBusy(true);
    setMessage(null);
    const result = await runAction(() =>
      postSighting({
        lat: point.lat,
        lng: point.lng,
        category,
        agentCount,
        vehicleCount,
        locationLabel: label.trim() || null,
        description: description.trim() || null,
      }),
    );
    setBusy(false);

    // On failure everything the person typed stays in the form.
    if (result.ok) onPosted(result.data);
    else setMessage(result.message);
  }

  return (
    <form className="report-form" onSubmit={submit} noValidate>
      <div className="spot-row">
        <span>Pin placed on the map. Its location is rounded to about 100 m.</span>
        <button type="button" className="text-button" onClick={onMoveSpot}>
          Move pin
        </button>
      </div>

      {nearby.length ? (
        <section className="nearby" aria-labelledby="nearby-title">
          <h3 id="nearby-title">Already reported nearby?</h3>
          <p>Confirm an existing sighting instead of posting it again.</p>
          <ul>
            {nearby.map(({ sighting, distance }) => (
              <li key={sighting.id}>
                <button type="button" className="nearby-row" onClick={() => onShowSighting(sighting.id)}>
                  <span className={`row-icon status-${statusOf(sighting)}`}>
                    <StatusIcon status={statusOf(sighting)} />
                  </span>
                  <span className="row-text">
                    <span className="row-address">{sightingTitle(sighting)}</span>
                    <span className="row-meta">
                      {STATUS_LABEL[statusOf(sighting)]} · {timeAgo(sighting.created_at, now)} ·{" "}
                      {formatDistance(distance)} away
                      {myPosts.has(sighting.id) ? " · your post" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <fieldset className="choice-group">
        <legend>What did you see?</legend>
        <div className="choices">
          {CATEGORIES.map((option) => (
            <label key={option.value} className="choice">
              <input
                type="radio"
                name="category"
                value={option.value}
                checked={category === option.value}
                onChange={() => setCategory(option.value)}
              />
              <span className="choice-label">{option.label}</span>
              <span className="choice-hint">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="count-row">
        <label>
          Agents
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={LIMITS.count}
            step={1}
            placeholder="Not sure"
            value={agents}
            onChange={(event) => setAgents(event.target.value)}
          />
        </label>
        <label>
          Vehicles
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={LIMITS.count}
            step={1}
            placeholder="Not sure"
            value={vehicles}
            onChange={(event) => setVehicles(event.target.value)}
          />
        </label>
      </div>

      <label>
        Location
        <input
          value={label}
          maxLength={LIMITS.label}
          placeholder="Street names, like Broad St & Girard Ave"
          onChange={(event) => setTypedLabel(event.target.value)}
        />
        <small>Street names or a block, never a house number.</small>
      </label>

      <label>
        Details (optional)
        <textarea
          rows={3}
          value={description}
          maxLength={LIMITS.description}
          placeholder="What did you see?"
          onChange={(event) => setDescription(event.target.value)}
        />
        <small>
          Public, and nobody checks it first. Don&apos;t include names or home addresses.{" "}
          <span className="counter">
            {description.length}/{LIMITS.description}
          </span>
        </small>
      </label>

      <p className="form-tip">
        For your safety, you can post after you&apos;ve left the area. A new pin shows roughly where
        it was posted from.
      </p>

      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary-button report-submit" disabled={busy}>
          {busy ? "Posting…" : "Post sighting"}
        </button>
      </div>
    </form>
  );
}
