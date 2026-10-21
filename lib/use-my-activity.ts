import { useCallback, useEffect, useMemo, useState } from "react";
import type { Client } from "@/lib/supabase/client";
import type { VoteType } from "@/lib/sightings";

export type ProfileTotals = { sightings_posted: number; votes_cast: number };

type Activity = {
  userId: string;
  posts: ReadonlySet<string>;
  votes: ReadonlyMap<string, VoteType>;
  profile: ProfileTotals | null;
};

const EMPTY_POSTS: ReadonlySet<string> = new Set();
const EMPTY_VOTES: ReadonlyMap<string, VoteType> = new Map();

// The signed-in user's own rows. The database returns only these, so the
// requests carry no user id: it comes from the session.
export function useMyActivity(supabase: Client | null, userId: string | null) {
  const [activity, setActivity] = useState<Activity | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !userId) return;
    const [posts, votes, profile] = await Promise.all([
      supabase.from("sighting_reporters").select("sighting_id"),
      supabase.from("sighting_votes").select("sighting_id, vote"),
      supabase.from("profiles").select("sightings_posted, votes_cast").maybeSingle(),
    ]);
    setActivity({
      userId,
      posts: new Set(posts.data?.map((row) => row.sighting_id)),
      votes: new Map(votes.data?.map((row) => [row.sighting_id, row.vote])),
      profile: profile.data,
    });
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    const load = () => void reload();
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [userId, reload]);

  // Update right away after an action instead of waiting for a reload.
  const update = useCallback(
    (change: (current: Activity) => Partial<Activity>) =>
      setActivity((current) =>
        current && current.userId === userId ? { ...current, ...change(current) } : current,
      ),
    [userId],
  );

  const addPost = useCallback(
    (id: string) => update((current) => ({ posts: new Set(current.posts).add(id) })),
    [update],
  );

  const removePost = useCallback(
    (id: string) =>
      update((current) => {
        const posts = new Set(current.posts);
        posts.delete(id);
        return { posts };
      }),
    [update],
  );

  const setVote = useCallback(
    (id: string, vote: VoteType) =>
      update((current) => ({ votes: new Map(current.votes).set(id, vote) })),
    [update],
  );

  // Rows loaded for a different account (before logging in or out) don't count.
  const mine = activity && activity.userId === userId ? activity : null;

  return useMemo(
    () => ({
      posts: mine?.posts ?? EMPTY_POSTS,
      votes: mine?.votes ?? EMPTY_VOTES,
      profile: mine?.profile ?? null,
      reload,
      addPost,
      removePost,
      setVote,
    }),
    [mine, reload, addPost, removePost, setVote],
  );
}
