"use client";

import { useEffect, useState } from "react";
import { deleteSighting, voteOnSighting } from "@/app/actions/sightings";
import { VOTE_RADIUS_M, distanceMeters, formatDistance, roundCoord } from "@/lib/geo";
import { runAction } from "@/lib/run-action";
import {
  STATUS_LABEL,
  clockTime,
  sightingSummary,
  sightingTitle,
  statusOf,
  timeAgo,
  voteCounts,
  type Sighting,
  type VoteType,
} from "@/lib/sightings";
import { ChevronIcon, CloseIcon, PinIcon } from "./icons";

// Messages from the database that mean the pin should leave the map.
const GONE = new Set(["This sighting has expired.", "This sighting no longer exists."]);

type Fix = { lat: number; lng: number };
type LocationProblem = "denied" | "unavailable";

// The device's position, used only to check the 1 km rule and sent only with
// a vote. It's kept in memory while this card is open and never stored. It's
// rounded like pins are, which is plenty for a 1 km check.
function currentPosition() {
  return new Promise<Fix>((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 2 });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: roundCoord(position.coords.latitude),
          lng: roundCoord(position.coords.longitude),
        }),
      reject,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
    );
  });
}

type Props = {
  sighting: Sighting;
  now: number;
  isMine: boolean;
  myVote: VoteType | undefined;
  signedIn: boolean;
  onClose: () => void;
  onVoted: (sighting: Sighting, vote: VoteType) => void;
  onGone: (id: string, message: string) => void;
  onDeleted: (id: string) => void;
};

export function SightingCard({
  sighting,
  now,
  isMine,
  myVote,
  signedIn,
  onClose,
  onVoted,
  onGone,
  onDeleted,
}: Props) {
  const status = statusOf(sighting);

  return (
    <section className="detail-card" aria-labelledby="detail-title">
      <header className="detail-head">
        <PinIcon />
        <h2 id="detail-title" title={sightingTitle(sighting)}>
          {sightingTitle(sighting)}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close sighting">
          <CloseIcon />
        </button>
      </header>

      <div className="detail-body">
        <p className="detail-summary">{sightingSummary(sighting)}</p>
        {sighting.description ? <p className="detail-description">{sighting.description}</p> : null}
        <p className="detail-status">
          <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
          <span>{voteCounts(sighting)}</span>
        </p>
        <p className="detail-meta">
          Posted {timeAgo(sighting.created_at, now)} · on the map until{" "}
          {clockTime(sighting.expires_at)}
        </p>
        {myVote ? (
          <p className="detail-meta">
            Your vote: {myVote === "confirm" ? "confirmed" : "disputed"}
          </p>
        ) : null}
      </div>

      <div className="detail-footer">
        {isMine ? (
          <OwnSighting sighting={sighting} onDeleted={onDeleted} />
        ) : signedIn ? (
          <VoteControls sighting={sighting} myVote={myVote} onVoted={onVoted} onGone={onGone} />
        ) : (
          <p className="detail-note">Your account is still being set up.</p>
        )}
      </div>
    </section>
  );
}

function VoteControls({
  sighting,
  myVote,
  onVoted,
  onGone,
}: Pick<Props, "sighting" | "myVote" | "onVoted" | "onGone">) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const [locating, setLocating] = useState(false);
  const [voting, setVoting] = useState<VoteType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    try {
      const here = await currentPosition();
      setFix(here);
      setProblem(null);
      return here;
    } catch (error) {
      setFix(null);
      setProblem((error as { code?: number }).code === 1 ? "denied" : "unavailable");
      return null;
    } finally {
      setLocating(false);
    }
  }

  // If location is already allowed, check the distance right away, so the
  // buttons show only when a vote can succeed.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then(async (permission) => {
        if (cancelled || permission.state !== "granted") return;
        setLocating(true);
        try {
          const here = await currentPosition();
          if (!cancelled) setFix(here);
        } catch {
          if (!cancelled) setProblem("unavailable");
        } finally {
          if (!cancelled) setLocating(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function vote(choice: VoteType) {
    setVoting(choice);
    setMessage(null);
    const here = await locate();
    if (!here || distanceMeters(here.lat, here.lng, sighting.lat, sighting.lng) > VOTE_RADIUS_M) {
      setVoting(null);
      return;
    }
    const result = await runAction(() =>
      voteOnSighting({ sightingId: sighting.id, vote: choice, myLat: here.lat, myLng: here.lng }),
    );
    setVoting(null);
    if (result.ok) onVoted(result.data, choice);
    else if (GONE.has(result.message)) onGone(sighting.id, result.message);
    else setMessage(result.message);
  }

  const distance = fix ? distanceMeters(fix.lat, fix.lng, sighting.lat, sighting.lng) : null;

  let body: React.ReactNode;
  if (problem === "denied") {
    body = (
      <>
        <p className="detail-note">Turn on location to confirm or dispute a sighting.</p>
        <p className="detail-hint">Allow location for this site in your browser&apos;s settings.</p>
      </>
    );
  } else if (problem === "unavailable") {
    body = (
      <>
        <p className="detail-note">We couldn&apos;t get your location.</p>
        <button type="button" className="secondary-button" onClick={locate} disabled={locating}>
          Try again
        </button>
      </>
    );
  } else if (distance === null) {
    body = (
      <>
        <button type="button" className="secondary-button" onClick={locate} disabled={locating}>
          {locating ? "Checking your location…" : "Use my location to confirm or dispute"}
        </button>
        <p className="detail-hint">
          You need to be within 1 km. Your location is checked, not stored.
        </p>
      </>
    );
  } else if (distance > VOTE_RADIUS_M) {
    body = (
      <p className="detail-note">
        You need to be within 1 km of a sighting to confirm or dispute it. You&apos;re about{" "}
        {formatDistance(distance)} away.
      </p>
    );
  } else {
    body = (
      <>
        <p className="vote-question">Are they still there?</p>
        <div className="vote-row">
          <button
            type="button"
            className="vote vote-up"
            aria-pressed={myVote === "confirm"}
            disabled={voting !== null}
            onClick={() => vote("confirm")}
          >
            <ChevronIcon direction="up" />
            {voting === "confirm" ? "Confirming…" : "Yes, confirm"}
          </button>
          <button
            type="button"
            className="vote vote-down"
            aria-pressed={myVote === "dispute"}
            disabled={voting !== null}
            onClick={() => vote("dispute")}
          >
            <ChevronIcon direction="down" />
            {voting === "dispute" ? "Disputing…" : "No, dispute"}
          </button>
        </div>
        {myVote ? <p className="detail-hint">You can switch your vote.</p> : null}
      </>
    );
  }

  return (
    <>
      {body}
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}

function OwnSighting({
  sighting,
  onDeleted,
}: Pick<Props, "sighting" | "onDeleted">) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setMessage(null);
    const result = await runAction(() => deleteSighting(sighting.id));
    setBusy(false);
    if (result.ok) onDeleted(sighting.id);
    else setMessage(result.message);
  }

  return (
    <>
      <p className="detail-note">You posted this sighting, so you can&apos;t confirm or dispute it.</p>
      {confirming ? (
        <div className="confirm-row">
          <span>Delete it for everyone?</span>
          <button type="button" className="danger-button" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>
          Delete this sighting
        </button>
      )}
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}
