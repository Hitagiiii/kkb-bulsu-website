import { supabase } from './supabase'

/** Private files need short-lived signed links to be displayed. */
export async function signedUrlsFor(
  bucket: string,
  paths: string[],
  seconds = 60 * 60 * 6,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, seconds)
  const out: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  }
  return out
}
