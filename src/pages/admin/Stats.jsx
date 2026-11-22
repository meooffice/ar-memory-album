import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useT } from '../../lib/i18n.jsx'

const dayKey = (d) => d.toLocaleDateString('en-CA') // YYYY-MM-DD in local time

export default function Stats() {
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    supabase.from('scan_history')
      .select('scanned_at,device_type,memory_id,memories(title,albums(title))')
      .order('scanned_at', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => (error ? setFailed(true) : setRows(data || [])))
  }, [])

  const stats = useMemo(() => {
    if (!rows) return null
    const perDay = new Map()
    const perMemory = new Map()
    const devices = { mobile: 0, desktop: 0 }
    const now = new Date()
    const todayKey = dayKey(now)
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0, 0, 0, 0)
    let week = 0, today = 0

    for (const r of rows) {
      const d = new Date(r.scanned_at)
      const k = dayKey(d)
      perDay.set(k, (perDay.get(k) || 0) + 1)
      if (k === todayKey) today += 1
      if (d >= weekAgo) week += 1
      if (r.device_type === 'mobile') devices.mobile += 1; else devices.desktop += 1

      const key = r.memory_id || 'deleted'
      const label = r.memories ? `${r.memories.albums?.title ?? ''} · ${r.memories.title}` : t('deletedMemory')
      const cur = perMemory.get(key) || { label, count: 0 }
      cur.count += 1
      perMemory.set(key, cur)
    }

    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      days.push({ key: dayKey(d), label: d.getDate(), count: perDay.get(dayKey(d)) || 0 })
    }
    const top = [...perMemory.values()].sort((a, b) => b.count - a.count).slice(0, 10)
    return { total: rows.length, week, today, days, top, devices, maxDay: Math.max(1, ...days.map((x) => x.count)) }
  }, [rows, t])

  const card = 'rounded-2xl bg-white p-5 shadow-sm'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/admin" className="text-sm text-rose-deep hover:underline">{t('back')}</Link>
      <h1 className="mt-2 text-3xl font-bold">{t('statsTitle')}</h1>

      {failed && <p className="mt-6">{t('error')}</p>}
      {!failed && !stats && <p className="mt-6">{t('loading')}</p>}
      {stats && stats.total === 0 && <p className="mt-6">{t('noScans')}</p>}

      {stats && stats.total > 0 && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[['totalScans', stats.total], ['last7', stats.week], ['today', stats.today]].map(([k, v]) => (
              <div key={k} className={card}>
                <p className="text-sm text-ink/60">{t(k)}</p>
                <p className="font-display text-3xl font-bold">{v}</p>
              </div>
            ))}
          </div>

          <section className={`${card} mt-6`}>
            <h2 className="text-lg font-bold">{t('scansPerDay')}</h2>
            <div className="mt-4 flex h-36 items-end gap-1" role="img"
              aria-label={stats.days.map((d) => `${d.key}: ${d.count}`).join(', ')}>
              {stats.days.map((d) => (
                <div key={d.key} className="flex h-full flex-1 flex-col justify-end" title={`${d.key}: ${d.count}`}>
                  <div className="w-full rounded-t bg-rose" style={{ height: `${(d.count / stats.maxDay) * 100}%`, minHeight: d.count ? 4 : 2, opacity: d.count ? 1 : 0.25 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-center text-xs text-ink/60" aria-hidden="true">
              {stats.days.map((d) => <span key={d.key} className="flex-1">{d.label}</span>)}
            </div>
          </section>

          <section className={`${card} mt-6`}>
            <h2 className="text-lg font-bold">{t('topMemories')}</h2>
            <ol className="mt-3 space-y-2">
              {stats.top.map((m, i) => (
                <li key={`${m.label}-${i}`} className="flex items-center gap-3">
                  <span className="w-6 text-ink/50">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.label}</p>
                    <div className="mt-1 h-2 rounded-full bg-rose-soft">
                      <div className="h-2 rounded-full bg-rose" style={{ width: `${(m.count / stats.top[0].count) * 100}%` }} />
                    </div>
                  </div>
                  <span className="tabular-nums">{m.count}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className={`${card} mt-6`}>
            <h2 className="text-lg font-bold">{t('devices')}</h2>
            <p className="mt-2">{t('mobile')}: <b>{stats.devices.mobile}</b> &nbsp;·&nbsp; {t('desktop')}: <b>{stats.devices.desktop}</b></p>
          </section>

          <p className="mt-6 text-sm text-ink/60">{t('statsNote')}</p>
        </>
      )}
    </div>
  )
}
