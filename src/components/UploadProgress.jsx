import { Loader2 } from 'lucide-react'

export default function UploadProgress({ percent, label }) {
  const value = Math.max(0, Math.min(100, percent || 0))
  return (
    <div role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 size={18} className="animate-spin text-rose" aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-rose-soft"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="h-full rounded-full bg-rose transition-[width] duration-200" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
