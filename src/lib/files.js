export const MB = 1024 * 1024
export const ext = (f) => (f.name.split('.').pop() || '').toLowerCase()

export function readAspect(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve(img.naturalHeight / img.naturalWidth); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
}

// Return an error message, or null when the file is fine.
export function checkPhoto(file, t) {
  if (!['jpg', 'jpeg', 'png'].includes(ext(file))) return `${t('wrongType')} ${file.name}`
  if (file.size > 10 * MB) return `${t('fileTooBig')} ${file.name}`
  return null
}
export function checkVideo(file, t) {
  if (ext(file) !== 'mp4') return `${t('wrongType')} ${file.name}`
  if (file.size > 50 * MB) return `${t('fileTooBig')} ${file.name}`
  return null
}
