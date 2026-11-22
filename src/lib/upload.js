import { supabase, BUCKET } from './supabase.js'

/**
 * Uploads a file to Storage and reports progress (0 to 1).
 * supabase-js has no upload progress, so this asks Storage for a signed
 * upload URL (admin-only, same policy as a normal upload) and sends the
 * file with XMLHttpRequest, which does report progress.
 */
export async function uploadWithProgress(path, file, { contentType, onProgress } = {}) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw error

  const { data: sess } = await supabase.auth.getSession()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const token = sess.session?.access_token || anonKey

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', data.signedUrl)
    xhr.setRequestHeader('apikey', anonKey)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve(path)
      } else {
        reject(new Error(`Upload failed (${xhr.status}) ${xhr.responseText}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))

    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', contentType ? new Blob([file], { type: contentType }) : file)
    xhr.send(form)
  })
}
