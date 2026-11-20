import { supabase } from './supabase'
import { compressImage } from './finance'
import { signedUrlsFor } from './storage'

export const MERCH_BUCKET = 'merch-images'
export const MAX_MERCH_PHOTOS = 4

const cache = new Map<string, string>()

/** Signed links for private merch photos, remembered so lists do not re-sign on every render. */
export async function merchPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const missing = paths.filter((p) => !cache.has(p))
  if (missing.length) {
    const fresh = await signedUrlsFor(MERCH_BUCKET, missing)
    for (const [k, v] of Object.entries(fresh)) cache.set(k, v)
  }
  return Object.fromEntries(paths.filter((p) => cache.has(p)).map((p) => [p, cache.get(p)!]))
}

/** Upload photos. If one fails, the ones already uploaded are removed again. */
export async function uploadMerchPhotos(files: File[]): Promise<string[]> {
  const uploaded: string[] = []
  try {
    for (const file of files) {
      const blob = await compressImage(file)
      const path = `${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from(MERCH_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      uploaded.push(path)
    }
    return uploaded
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(MERCH_BUCKET).remove(uploaded)
    throw err
  }
}

export async function removeMerchPhotos(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(MERCH_BUCKET).remove(paths)
}
