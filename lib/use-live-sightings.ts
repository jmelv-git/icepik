import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client } from "@/lib/supabase/client";
import { isActive, type Sighting } from "@/lib/sightings";

export type LoadState = "loading" | "ready" | "error";

type Change = (pins: Map<string, Sighting>) => void;

// Active sightings, kept live: Realtime pushes new pins, new counts, later
// expiries and deletions. Pins expire without an event, so the clock is
// checked every 15 seconds, and missed events are covered by reloading when
// the page comes back to the foreground, goes back online or reconnects.
export function useLiveSightings(supabase: Client | null) {
  const [byId, setById] = useState<ReadonlyMap<string, Sighting>>(() => new Map());
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [now, setNow] = useState(() => Date.now());
  // Changes that arrive while a reload is in flight, replayed on top of its
  // result so a slow reload can't undo them.
  const inFlight = useRef(new Set<Change[]>());

  const apply = useCallback((change: Change) => {
    inFlight.current.forEach((queue) => queue.push(change));
    setById((current) => {
      const next = new Map(current);
      change(next);
      return next;
    });
  }, []);

  const upsert = useCallback(
    (sighting: Sighting) => apply((pins) => void pins.set(sighting.id, sighting)),
    [apply],
  );

  const remove = useCallback((id: string) => apply((pins) => void pins.delete(id)), [apply]);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const queue: Change[] = [];
    inFlight.current.add(queue);
    // Only active pins come back: the database hides expired ones.
    const { data, error } = await supabase.from("sightings").select("*");
    inFlight.current.delete(queue);
    if (error) {
      setLoadState((state) => (state === "ready" ? state : "error"));
      return;
    }
    const pins = new Map(data.map((sighting) => [sighting.id, sighting]));
    queue.forEach((change) => change(pins));
    setById(pins);
    setLoadState("ready");
    setNow(Date.now());
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const load = () => void reload();

    const channel = supabase
      .channel("map")
      .on<Sighting>(
        "postgres_changes",
        { event: "*", schema: "public", table: "sightings" },
        (change) => {
          if (change.eventType === "DELETE") {
            if (change.old.id) remove(change.old.id);
          } else {
            // INSERT or UPDATE: a new pin, new counts or a later expiry.
            upsert(change.new);
          }
        },
      )
      .subscribe((status) => {
        // Missed events aren't replayed, so reload after every (re)connect.
        if (status === "SUBSCRIBED") load();
      });

    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
      window.clearInterval(timer);
    };
  }, [supabase, reload, upsert, remove]);

  const sightings = useMemo(
    () =>
      [...byId.values()]
        .filter((sighting) => isActive(sighting, now))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [byId, now],
  );

  return { sightings, loadState, now, upsert, remove, reload };
}
