'use server'

// Posting, voting and deleting run here, on Vercel, instead of in the browser.
// Supabase then logs Vercel's IP address for these requests instead of the
// user's, so its logs can't tie a person's IP to a pin, a vote or a deletion.
//
// Rules for this file:
// - Anyone can call these actions directly with any input, not just through
//   our UI. TypeScript types aren't checked at runtime, so every argument is
//   checked here before it reaches the database.
// - Build each database row field by field. Never pass client input straight
//   into a query, or callers could set fields they shouldn't.
// - Never accept a user id from the caller. The database takes the user from
//   the session cookie.
// - Never console.log the input. Vercel keeps runtime logs, and the input holds
//   coordinates and pin ids.
// - Return errors as values. Next.js hides the message of a thrown error in
//   production, and the database's messages are already written for users.
//
// Usage from a client component:
//   const result = await voteOnSighting({ sightingId, vote: 'confirm', myLat, myLng })
//   if (!result.ok) showMessage(result.message)

import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/database.types'

type Sighting = Database['public']['Tables']['sightings']['Row']
type Category = Database['public']['Enums']['sighting_category']
type Vote = Database['public']['Enums']['vote_type']

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string }

export type NewSighting = {
  lat: number
  lng: number
  category: Category
  agentCount?: number | null
  vehicleCount?: number | null
  locationLabel?: string | null
  description?: string | null
}

const CATEGORIES: readonly Category[] = ['patrol', 'vehicle', 'checkpoint', 'raid', 'other']
const VOTES: readonly Vote[] = ['confirm', 'dispute']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRY_AGAIN = 'Something went wrong. Please try again.'

export async function postSighting(input: NewSighting): Promise<ActionResult<Sighting>> {
  const problem = checkNewSighting(input)
  if (problem) return { ok: false, message: problem }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sightings')
    .insert({
      lat: input.lat,
      lng: input.lng,
      category: input.category,
      agent_count: input.agentCount ?? null,
      vehicle_count: input.vehicleCount ?? null,
      location_label: input.locationLabel?.trim() || null,
      description: input.description?.trim() || null,
    })
    .select()
    .single()

  return error ? failure(error) : { ok: true, data }
}

export async function voteOnSighting(input: {
  sightingId: string
  vote: Vote
  myLat: number
  myLng: number
}): Promise<ActionResult<Sighting>> {
  if (!isRecord(input)) return { ok: false, message: TRY_AGAIN }
  if (!isInRange(input.myLat, -90, 90) || !isInRange(input.myLng, -180, 180)) {
    return { ok: false, message: 'Turn on location to confirm or dispute a sighting.' }
  }
  if (!UUID.test(String(input.sightingId)) || !VOTES.includes(input.vote)) {
    return { ok: false, message: TRY_AGAIN }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('vote_on_sighting', {
    target_sighting_id: input.sightingId,
    my_vote: input.vote,
    my_lat: input.myLat,
    my_lng: input.myLng,
  })

  return error ? failure(error) : { ok: true, data }
}

export async function deleteSighting(sightingId: string): Promise<ActionResult<null>> {
  if (!UUID.test(String(sightingId))) return { ok: false, message: TRY_AGAIN }

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_my_sighting', { target_sighting_id: sightingId })

  return error ? failure(error) : { ok: true, data: null }
}

// Server actions are public endpoints, so check the input even though the
// database enforces the same rules.
function checkNewSighting(input: unknown): string | null {
  if (!isRecord(input)) return TRY_AGAIN
  if (!isInRange(input.lat, -90, 90) || !isInRange(input.lng, -180, 180)) {
    return 'Pick a spot on the map first.'
  }
  if (!CATEGORIES.includes(input.category as Category)) return 'Choose what you saw.'
  if (!isCount(input.agentCount) || !isCount(input.vehicleCount)) {
    return 'Counts must be whole numbers from 0 to 99.'
  }
  if (!isOptionalText(input.locationLabel, 120)) return 'Keep the location under 120 characters.'
  if (!isOptionalText(input.description, 280)) return 'Keep the description under 280 characters.'
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value == null || (typeof value === 'string' && value.length <= maxLength)
}

function isInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isCount(value: unknown): boolean {
  return value == null || (Number.isInteger(value) && isInRange(value, 0, 99))
}

function failure(error: PostgrestError): ActionResult<never> {
  // P0001 = a message from ICEPik's own database checks, written for users.
  if (error.code === 'P0001') return { ok: false, message: error.message }
  // 42501 = row-level security refused it, usually an expired session.
  if (error.code === '42501') {
    return { ok: false, message: 'Your session has expired. Reload the page and try again.' }
  }
  return { ok: false, message: TRY_AGAIN }
}
