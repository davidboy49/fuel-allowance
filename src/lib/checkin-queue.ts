// Offline-first queue for check-ins. Each check-in has a client-generated id, so a retry
// after a bad connection can never be counted twice. localStorage for the MVP; IndexedDB later.
export interface QueuedCheckin {
  id: string
  type: 'START' | 'VISIT' | 'END'
  customerId?: string | null
  lat: number
  lng: number
  accuracyM?: number | null
  gpsTime: string
  offline?: boolean
}

const KEY = 'fa_checkin_queue'

export function readQueue(): QueuedCheckin[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedCheckin[]
  } catch {
    return []
  }
}

function write(q: QueuedCheckin[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* storage unavailable: the check-in is still sent now if online */
  }
}

export function enqueue(c: QueuedCheckin) {
  write([...readQueue(), c])
}

/** Sends queued check-ins in order; stops at the first network failure. */
export async function flushQueue(send: (c: QueuedCheckin) => Promise<unknown>): Promise<number> {
  const q = readQueue()
  let sent = 0
  for (const c of q) {
    try {
      await send({ ...c, offline: true })
    } catch (e) {
      if (isNetworkError(e)) break
      // Rejected by the server (e.g. validation): drop it rather than block the queue.
    }
    write(readQueue().filter((x) => x.id !== c.id))
    sent++
  }
  return sent
}

export function isNetworkError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e)
  return /fetch|network|failed to load|offline/i.test(m)
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
