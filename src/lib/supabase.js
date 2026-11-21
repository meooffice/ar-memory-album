import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const BUCKET = 'album-media'

export function mediaUrl(path) {
  if (!path) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
