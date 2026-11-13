import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import './Creature.css'
import Creature from './Creature'

type Profile = { id: string | number; owner: string; species: string; name: string; color: string; chests: number }
type Layout = { x: number; y: number; size: number; layer: number }
declare const __APP_VERSION__: string
declare const __BUILD_ID__: string

type Item = { id: string | number; name: string; category: 'outfit' | 'accessory' | 'toy' | 'furniture' | 'decoration'; rarity: string; emoji: string; owned: boolean; equipped: boolean; placed: boolean; layout?: Layout | null }
type Details = { profile: Profile; items: Item[] }
type Tab = 'all' | 'outfit' | 'accessory' | 'toy' | 'furniture' | 'decoration'
type Point = { x: number; y: number }
type CreatureAction = 'idle' | 'walking' | 'running' | 'hopping' | 'happy' | 'sitting' | 'sleeping' | 'curious' | 'excited' | 'wake' | 'waving' | 'celebrating'
type Travel = { x: number; y: number; fromX: number; fromY: number; duration: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const defaultSlots: Point[] = [
  { x: 14, y: 76 }, { x: 86, y: 76 }, { x: 50, y: 86 }, { x: 86, y: 87 },
  { x: 14, y: 62 }, { x: 86, y: 62 }, { x: 38, y: 73 }, { x: 62, y: 73 },
  { x: 26, y: 60 }, { x: 14, y: 82 }, { x: 40, y: 87 }, { x: 80, y: 63 },
  { x: 50, y: 56 }, { x: 30, y: 70 }, { x: 70, y: 70 }, { x: 62, y: 86 },
]
const defaultLayout = (index: number): Layout => ({
  ...defaultSlots[index % defaultSlots.length],
  size: 40,
  layer: 10 + index,
})
const objectKey = (profileId: string | number, itemId: string | number) => `${profileId}:${itemId}`
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (points: Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
})

function DecorIcon({ kind, className = '' }: { kind: 'sparkle' | 'flower' | 'sun' | 'hat' | 'dress' | 'heart'; className?: string }) {
  return <svg className={`decor-icon ${className}`} viewBox="0 0 32 32" aria-hidden="true">
    {kind === 'sparkle' && <path d="M16 1.5 19.7 12.3 30.5 16l-10.8 3.7L16 30.5l-3.7-10.8L1.5 16l10.8-3.7L16 1.5Z" fill="currentColor" />}
    {kind === 'flower' && <><path d="M16 4c4.2-5 8.6.1 5.3 4.7 6.1-1 8.1 5.5 2 7.3 5.1 3.4 1.4 9.2-4 6.4 1 6.1-5.5 8.1-7.3 2-3.4 5.1-9.2 1.4-6.4-4-6.1 1-8.1-5.5-2-7.3C-1.5 9.7 2.2 3.9 7.6 6.7 6.6.6 13.1-1.4 14.9 4Z" fill="currentColor" /><circle cx="16" cy="16" r="3" fill="#fff5df" /></>}
    {kind === 'sun' && <><circle cx="16" cy="16" r="6" fill="currentColor" /><path d="M16 1v5M16 26v5M1 16h5m20 0h5M5.4 5.4 9 9m14 14 3.6 3.6m0-21.2L23 9M9 23l-3.6 3.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></>}
    {kind === 'hat' && <><path d="M7 17c1.2-6 4.6-10 9-10s7.8 4 9 10H7Z" fill="currentColor" /><path d="M3 19c0-1.4 1.1-2.5 2.5-2.5h21a2.5 2.5 0 0 1 0 5h-21A2.5 2.5 0 0 1 3 19Z" fill="currentColor" /></>}
    {kind === 'dress' && <path d="m12 4 4 3 4-3 3 2 2 6-4 2 3 14H8l3-14-4-2 2-6 3-2Z" fill="currentColor" />}
    {kind === 'heart' && <path d="M16 28 4.5 16.8C-1.1 11.4 6.8 2.1 13 7l3 2.7L19 7c6.2-4.9 14.1 4.4 8.5 9.8L16 28Z" fill="currentColor" />}
  </svg>
}

function WearableArt({ item, species, wearer }: { item: Item; species: string; wearer: string }) {
  const identifier = `${item.id} ${item.name}`.toLowerCase()
  const isBunny = species.toLowerCase().includes('bunny') || species.toLowerCase().includes('rabbit')
  const isElephant = species.toLowerCase().includes('elephant')
  const speciesClass = isBunny ? 'wearer-bunny' : isElephant ? 'wearer-elephant' : 'wearer-hippo'
  const label = `${item.name} worn by ${wearer}`

  if (item.category === 'outfit') {
    const palette = identifier.includes('raincoat') ? ['#e7b14f', '#fff0bd']
      : identifier.includes('stripe') ? ['#719bb6', '#f7e9d8']
        : identifier.includes('pajama') ? ['#9aaf9f', '#eaf2df']
          : identifier.includes('overall') ? ['#5885a8', '#f4d36d']
            : identifier.includes('ballerina') ? ['#e2a0b0', '#fff0f2']
              : identifier.includes('space') ? ['#85aeb7', '#eef7e7']
                : identifier.includes('wizard') ? ['#806697', '#f2d579'] : ['#bd8b83', '#f8eadc']
    return <svg className={`wearable-art wearable-outfit ${speciesClass}`} viewBox="0 0 220 230" role="img" aria-label={label} focusable="false">
      <path d="M66 158Q110 143 154 158l7 31q-51 26-102 0l7-31Z" fill={palette[0]} stroke="#735d65" strokeOpacity=".35" strokeWidth="2" />
      {identifier.includes('stripe') && <path d="M73 160h74m-79 12h83m-80 12h77m-67 11h56" stroke={palette[1]} strokeWidth="5" />}
      {identifier.includes('overall') && <><path d="m78 157 6-13m58 0 6 13" stroke={palette[0]} strokeWidth="9" strokeLinecap="round" /><path d="M101 163v27m18-27v27" stroke={palette[1]} strokeWidth="3" /></>}
      {identifier.includes('ballerina') && <path d="M67 169q43 12 86 0l12 20q-55 27-110 0l12-20Z" fill={palette[0]} stroke="#fff1ed" strokeWidth="3" />}
      {(identifier.includes('pajama') || identifier.includes('space')) && <><circle cx="110" cy="174" r="4" fill={palette[1]} /><circle cx="110" cy="186" r="3" fill={palette[1]} /></>}
    </svg>
  }

  if (identifier.includes('glass')) return <svg className={`wearable-art wearable-glasses ${speciesClass}`} viewBox="0 0 220 230" role="img" aria-label={label} focusable="false">
    <path d="M84 108h52" stroke="#7d5967" strokeWidth="4" strokeLinecap="round" />
    <rect x="64" y="98" width="38" height="25" rx="9" fill="#d8eff0" fillOpacity=".72" stroke="#765c70" strokeWidth="4" />
    <rect x="118" y="98" width="38" height="25" rx="9" fill="#d8eff0" fillOpacity=".72" stroke="#765c70" strokeWidth="4" />
    <path d="m65 104-10-4m100 4 10-4" stroke="#765c70" strokeWidth="3" strokeLinecap="round" />
  </svg>

  if (identifier.includes('scarf')) return <svg className={`wearable-art wearable-scarf ${speciesClass}`} viewBox="0 0 220 230" role="img" aria-label={label} focusable="false">
    <path d="M71 145q39 17 78 0l-4 13q-35 17-70 0l-4-13Z" fill="#cb827e" stroke="#865f69" strokeOpacity=".4" strokeWidth="2" />
    <path d="m139 153 11 4-5 25-11-3Z" fill="#cb827e" stroke="#865f69" strokeOpacity=".4" strokeWidth="2" />
    <path d="M84 151h52" stroke="#f4d7b6" strokeWidth="3" strokeDasharray="5 5" />
  </svg>

  const headKind = identifier.includes('flower') ? 'flower-crown'
    : identifier.includes('crown') ? 'crown'
      : identifier.includes('bow') ? 'bow' : 'hat'
  const hatFill = headKind === 'crown' ? '#e5bd63' : '#d6a772'
  return <svg className={`wearable-art wearable-head wearable-${headKind} ${speciesClass}`} viewBox="0 0 220 230" role="img" aria-label={label} focusable="false">
    {headKind === 'crown' ? <><path d="m78 53 5-23 15 13 12-23 12 23 15-13 5 23Z" fill={hatFill} stroke="#8f7046" strokeWidth="3" strokeLinejoin="round" /><path d="M78 53h64v9H78Z" fill="#f3d87c" stroke="#8f7046" strokeWidth="2" /></>
      : headKind === 'flower-crown' ? <><path d="M79 55q31-13 62 0" fill="none" stroke="#648c68" strokeWidth="6" strokeLinecap="round" /><circle cx="90" cy="46" r="8" fill="#e9b55b" /><circle cx="110" cy="41" r="9" fill="#d78a9e" /><circle cx="130" cy="46" r="8" fill="#e9b55b" /><circle cx="110" cy="41" r="3" fill="#fff0c7" /></>
        : headKind === 'bow' ? <><path d="M109 45Q91 26 84 41q-2 12 24 11m3-7q18-19 25-4 2 12-24 11Z" fill="#d78a9e" stroke="#895f71" strokeWidth="3" /><circle cx="110" cy="46" r="6" fill="#f4d284" stroke="#895f71" strokeWidth="2" /></>
          : <><path d="M79 48q8-30 31-31t31 31Z" fill={hatFill} stroke="#8f7046" strokeWidth="3" /><path d="M70 49q40-10 80 0v9q-40 12-80 0Z" fill="#f1d3a2" stroke="#8f7046" strokeWidth="3" /><path d="M102 19q8 11 16 0" fill="none" stroke="#fff2d6" strokeWidth="3" /></>}
  </svg>
}

function NurseryObject({ item, layout, onChange, onSave, onLayer, onReset, onSelect, selected, disabled }: {
  item: Item
  layout: Layout
  onChange: (layout: Layout) => void
  onSave: (layout: Layout) => void
  onLayer: (direction: 'front' | 'back') => void
  onReset: () => void
  onSelect: () => void
  selected: boolean
  disabled: boolean
}) {
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<{ layout: Layout; center: Point; distance: number } | null>(null)
  const currentLayout = useRef(layout)
  currentLayout.current = layout

  const pointerPoint = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const room = event.currentTarget.parentElement?.getBoundingClientRect()
    return { x: event.clientX - (room?.left ?? 0), y: event.clientY - (room?.top ?? 0) }
  }
  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || (event.target as HTMLElement).closest('button')) return
    onSelect()
    event.preventDefault()
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, pointerPoint(event))
    const points = [...pointers.current.values()]
    gesture.current = {
      layout: currentLayout.current,
      center: midpoint(points),
      distance: points.length > 1 ? distance(points[0], points[1]) : 0,
    }
  }
  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current || disabled) return
    pointers.current.set(event.pointerId, pointerPoint(event))
    const points = [...pointers.current.values()]
    const center = midpoint(points)
    const room = event.currentTarget.parentElement?.getBoundingClientRect()
    const base = gesture.current
    const next = {
      ...base.layout,
      x: clamp(base.layout.x + (center.x - base.center.x) / Math.max(room?.width ?? 0, 1) * 100, 0, 100),
      y: clamp(base.layout.y + (center.y - base.center.y) / Math.max(room?.height ?? 0, 1) * 100, 0, 100),
      size: points.length > 1 && base.distance > 0
        ? clamp(Math.round(base.layout.size * distance(points[0], points[1]) / base.distance), 32, 128)
        : base.layout.size,
    }
    currentLayout.current = next
    onChange(next)
  }
  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.delete(event.pointerId)
    gesture.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    onSave(currentLayout.current)
  }
  const changeSize = (amount: number) => {
    const next = { ...layout, size: clamp(layout.size + amount, 32, 128) }
    currentLayout.current = next
    onChange(next)
    onSave(next)
  }
  const stopPointer = (event: ReactPointerEvent) => event.stopPropagation()

  return <div
    className={`nursery-object ${selected ? 'selected' : ''}`}
    role="group"
    aria-label={`${item.name} in the nursery`}
    style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.size}px`, fontSize: `${layout.size * 0.9}px`, zIndex: layout.layer }}
    onPointerDown={beginGesture}
    onPointerMove={moveGesture}
    onPointerUp={endGesture}
    onPointerCancel={endGesture}
  >
    <span className="nursery-object-art" title={item.name} aria-hidden="true">{item.emoji}</span>
    {selected && <div className="nursery-object-controls" aria-label={`${item.name} controls`}>
      <button type="button" disabled={disabled || layout.size <= 32} onPointerDown={stopPointer} onClick={() => changeSize(-8)} aria-label={`Make ${item.name} smaller`}>−</button>
      <button type="button" disabled={disabled || layout.size >= 128} onPointerDown={stopPointer} onClick={() => changeSize(8)} aria-label={`Make ${item.name} larger`}>+</button>
      <button type="button" disabled={disabled} onPointerDown={stopPointer} onClick={() => onLayer('front')} title="Move in front of other decorations" aria-label={`Bring ${item.name} forward`}>↑</button>
      <button type="button" disabled={disabled} onPointerDown={stopPointer} onClick={() => onLayer('back')} title="Move behind other decorations" aria-label={`Send ${item.name} backward`}>↓</button>
      <button type="button" disabled={disabled} onPointerDown={stopPointer} onClick={onReset} aria-label={`Reset ${item.name}`}>↺</button>
    </div>}
  </div>
}

const colors = ['#e7a5a2', '#b9a2d4', '#91b5a2', '#e7bf79', '#9cbccc', '#d2a582']
const tabs: { id: Tab; label: string; icon: 'sparkle' | 'dress' | 'hat' | 'heart' | 'flower' }[] = [
  { id: 'all', label: 'Everything', icon: 'sparkle' },
  { id: 'outfit', label: 'Outfits', icon: 'dress' },
  { id: 'accessory', label: 'Accessories', icon: 'hat' },
  { id: 'toy', label: 'Toys', icon: 'heart' },
  { id: 'furniture', label: 'Furniture', icon: 'heart' },
  { id: 'decoration', label: 'Decor', icon: 'flower' },
]

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`api/${path}`, {
    ...options,
    headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
  })
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const data = await response.json()
      if (typeof data.error === 'string') message = data.error
      else if (typeof data.message === 'string') message = data.message
      else if (typeof data.detail === 'string') message = data.detail
    } catch { /* The server may return a non-JSON error. */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

function Chest({ open = false }: { open?: boolean }) {
  return <svg className={`chest-art ${open ? 'chest-open' : ''}`} viewBox="0 0 140 120" aria-hidden="true">
    <ellipse cx="70" cy="109" rx="56" ry="7" fill="#72545a" opacity=".14" />
    <g className="chest-lid"><path d="M17 56V46C17 22 39 13 70 13s53 9 53 33v10z" fill="#d78a65" stroke="#8e594d" strokeWidth="4" /><path d="M38 20v35M102 20v35" stroke="#f4cd8a" strokeWidth="10" /><path d="M18 45h104" stroke="#8e594d" strokeWidth="4" /></g>
    <path d="M17 55h106v42q0 8-8 8H25q-8 0-8-8z" fill="#c77758" stroke="#8e594d" strokeWidth="4" />
    <path d="M38 56v48M102 56v48" stroke="#f4cd8a" strokeWidth="10" /><path d="M17 65h106" stroke="#8e594d" strokeWidth="3" opacity=".55" />
    <rect x="57" y="51" width="26" height="27" rx="5" fill="#f5d389" stroke="#a66c50" strokeWidth="3" /><circle cx="70" cy="62" r="3" fill="#a66c50" /><path d="M70 64v5" stroke="#a66c50" strokeWidth="3" />
  </svg>
}

function App() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selected, setSelected] = useState<string | number | null>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [editing, setEditing] = useState(false)
  const [decorating, setDecorating] = useState(false)
  const [selectedObject, setSelectedObject] = useState<string | null>(null)
  const [creaturePosition, setCreaturePosition] = useState<Point>({ x: 50, y: 16 })
  const [creatureAction, setCreatureAction] = useState<CreatureAction>('idle')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [layoutOverrides, setLayoutOverrides] = useState<Record<string, Layout>>({})
  const [reward, setReward] = useState<Item | null>(null)
  const [opening, setOpening] = useState(false)
  const selectedRef = useRef(selected)
  const openingChestRef = useRef(false)
  const creatureActionTimeout = useRef<number | undefined>(undefined)
  const idleBehaviorTimeout = useRef<number | undefined>(undefined)
  selectedRef.current = selected
  const profile = details?.profile.id === selected ? details.profile : undefined

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await request<Profile[]>('profiles')
      setProfiles(data)
      setSelected(current => data.some(p => p.id === current) ? current : data[0]?.id ?? null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your friends.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadProfiles() }, [loadProfiles])
  useEffect(() => {
    if (selected === null) return
    let active = true
    setLoadingDetails(true)
    setDetails(null)
    setError('')
    request<Details>(`profiles/${encodeURIComponent(selected)}`)
      .then(data => { if (active) setDetails(data) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load this friend.') })
      .finally(() => { if (active) setLoadingDetails(false) })
    return () => { active = false }
  }, [selected])
  useEffect(() => {
    if (!editing && !reward) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setEditing(false)
        setReward(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing, reward, busy])
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!preference) return
    const update = () => setReducedMotion(preference.matches)
    update()
    preference.addEventListener?.('change', update)
    return () => preference.removeEventListener?.('change', update)
  }, [])
  useEffect(() => {
    setCreaturePosition({ x: 50, y: 16 })
    setCreatureAction('idle')
    setSelectedObject(null)
    setDecorating(false)
  }, [profile?.id])

  const refresh = async (id: string | number) => {
    const data = await request<Details>(`profiles/${encodeURIComponent(id)}`)
    if (selectedRef.current !== id) return
    setDetails(data)
    setProfiles(current => current.map(p => p.id === id ? data.profile : p))
  }
  const mutate = async (path: string, body?: object, method = 'POST') => {
    if (selected === null || busy) return false
    setBusy(true)
    setError('')
    try {
      await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      try { await refresh(selected) }
      catch { setError('Your change was saved, but we could not refresh your collection. Please try again.') }
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); return false }
    finally { setBusy(false) }
  }
  const animateCreature = useCallback((action: CreatureAction, duration = 1100) => {
    if (creatureActionTimeout.current !== undefined) window.clearTimeout(creatureActionTimeout.current)
    setCreatureAction(action)
    if (action !== 'idle') {
      creatureActionTimeout.current = window.setTimeout(() => setCreatureAction('idle'), duration)
    }
  }, [])
  useEffect(() => () => {
    if (creatureActionTimeout.current !== undefined) window.clearTimeout(creatureActionTimeout.current)
    if (idleBehaviorTimeout.current !== undefined) window.clearTimeout(idleBehaviorTimeout.current)
  }, [])
  useEffect(() => {
    if (!profile || decorating || reducedMotion || busy) return
    const wander = () => {
      setCreaturePosition({ x: 12 + Math.random() * 76, y: 13 + Math.random() * 12 })
      animateCreature('walking', 950)
      if (Math.random() < 0.45) {
        idleBehaviorTimeout.current = window.setTimeout(() => animateCreature(Math.random() < 0.5 ? 'sitting' : 'waving', 1500), 1000)
      }
    }
    const interval = window.setInterval(wander, 10000)
    return () => {
      window.clearInterval(interval)
      if (idleBehaviorTimeout.current !== undefined) window.clearTimeout(idleBehaviorTimeout.current)
    }
  }, [animateCreature, busy, decorating, profile, reducedMotion])
  const directCreature = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (decorating) {
      if (!(event.target as HTMLElement).closest('.nursery-object')) setSelectedObject(null)
      return
    }
    const target = event.target as HTMLElement
    if (target.closest('.nursery-object, .room-creature') || !target.closest('.room-floor, .rug')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    setCreaturePosition({
      x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1) * 100, 12, 88),
      y: clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1) * 100 - 65, 12, 25),
    })
    animateCreature('walking', 950)
  }
  const openChest = async () => {
    if (selected === null || busy || openingChestRef.current) return
    openingChestRef.current = true
    setBusy(true)
    setError('')
    setOpening(true)
    try {
      const result = await request<{ item: Item; profile: Profile }>(`profiles/${encodeURIComponent(selected)}/open-chest`, { method: 'POST' })
      animateCreature('celebrating', 1800)
      setDetails(current => current ? { profile: result.profile, items: current.items.map(item => item.id === result.item.id ? result.item : item) } : current)
      setProfiles(current => current.map(p => p.id === selected ? result.profile : p))
      try { await refresh(selected) }
      catch { setError('Your treasure was saved, but we could not refresh your collection. Please try again.') }
      await new Promise(resolve => window.setTimeout(resolve, 750))
      setReward(result.item)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the chest.') }
    finally { openingChestRef.current = false; setOpening(false); setBusy(false) }
  }
  const items = profile ? details?.items ?? [] : []
  const visible = items.filter(item => item.owned && (tab === 'all' || item.category === tab))
  const placed = items.filter(item => item.owned && item.placed && (item.category === 'toy' || item.category === 'furniture' || item.category === 'decoration'))
  const equipped = items.filter(item => item.owned && item.equipped && (item.category === 'outfit' || item.category === 'accessory'))
  const placedObjects = placed.map(item => {
    const key = objectKey(profile?.id ?? '', item.id)
    const index = items.findIndex(candidate => candidate.id === item.id)
    return { item, layout: layoutOverrides[key] ?? item.layout ?? defaultLayout(index) }
  })
  const persistLayout = (item: Item, layout: Layout) => {
    if (profile) void mutate(`profiles/${encodeURIComponent(profile.id)}/items/${encodeURIComponent(item.id)}/layout`, layout, 'PUT')
  }
  const resetLayout = (item: Item) => {
    if (!profile) return
    const key = objectKey(profile.id, item.id)
    setLayoutOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
    void mutate(`profiles/${encodeURIComponent(profile.id)}/items/${encodeURIComponent(item.id)}/layout`, undefined, 'DELETE')
  }
  const changeLayer = (item: Item, layout: Layout, direction: 'front' | 'back') => {
    const layers = placedObjects.map(object => object.layout.layer)
    const layer = direction === 'front'
      ? clamp(Math.max(...layers, layout.layer) + 1, 1, 1000)
      : clamp(Math.min(...layers, layout.layer) - 1, 1, 1000)
    persistLayout(item, { ...layout, layer })
  }

  return <div className="app-shell" onClick={event => {
    if (decorating && !(event.target as HTMLElement).closest('.nursery-object')) setSelectedObject(null)
  }}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><DecorIcon kind="sparkle" /></span><span>Questboard<span className="brand-dot">.</span></span></div>
      <div className="top-note"><span>☀</span> A little world of wonderful</div>
      <div className="top-heart">♡ <span>Made for little dreamers</span></div>
    </header>
    <main>
      <div className="page-heading"><div><div className="eyebrow"><DecorIcon kind="sparkle" /> A LITTLE MAGIC, EVERY DAY</div><h1>Welcome to your <em>happy place.</em></h1><p>Big adventures start with the littlest friends.</p></div><div className="heading-doodle" aria-hidden="true"><DecorIcon kind="sparkle" /><DecorIcon kind="sparkle" /></div></div>
      {error && <div className="error-banner" role="alert"><span>Something went a little sideways: {error}</span><button disabled={busy || loadingDetails} onClick={() => { if (selected === null) void loadProfiles(); else { const id = selected; setError(''); setLoadingDetails(true); void refresh(id).catch(e => { if (selectedRef.current === id) setError(e instanceof Error ? e.message : 'Could not refresh your friend.') }).finally(() => { if (selectedRef.current === id) setLoadingDetails(false) }) } }}>Try again</button><button className="dismiss" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
      {loading ? <div className="state-card" role="status">Gathering your little friends… ✨</div> : profiles.length === 0 ? <div className="state-card">No friends found just yet. <button onClick={() => void loadProfiles()}>Try again</button></div> : <>
        <section className="friends-section" aria-label="Choose a friend">
          <div className="section-heading"><div><div className="eyebrow">YOUR LITTLE CREW</div><h2>Pick a friend <span>♡</span></h2></div><p>Who are we playing with today?</p></div>
          <div className="friends-list">{profiles.map(p => <button key={p.id} disabled={busy || loadingDetails} className={`friend-card ${selected === p.id ? 'selected' : ''}`} onClick={() => { selectedRef.current = p.id; setSelected(p.id); setTab('all') }} aria-pressed={selected === p.id}>
            <span className={`friend-avatar ${p.species.toLowerCase()}`}><Creature profile={p} small /></span><span className="friend-copy"><strong>{p.owner}</strong><small>{p.name} the {p.species}</small></span><span className="friend-check">{selected === p.id ? '✓' : '→'}</span>
          </button>)}</div>
        </section>
        {loadingDetails ? <div className="state-card" role="status">Getting their cozy corner ready…</div> : profile && <div className="dashboard">
          <section className="nursery card">
            <div className="card-title"><div><div className="eyebrow">HOME SWEET HOME</div><h2>{profile.name}’s little corner <DecorIcon kind="sparkle" /></h2><p>A cozy place to just be you.</p></div><button className="text-button" onClick={() => { setName(profile.name); setColor(profile.color); setEditing(true) }}>✎ <span>Make it yours</span></button></div>
            <div className="room" role="group" aria-label="Nursery play area" aria-describedby="nursery-edit-help" onClick={directCreature}>
              <div className="room-sun"><DecorIcon kind="sun" /></div><div className="wall-frame"><DecorIcon kind="flower" /></div><div className="wall-stars"><DecorIcon kind="sparkle" /><DecorIcon kind="sparkle" /></div><div className="bunting" aria-hidden="true" />
              <div className="window"><div className="window-sky">☁ <span>☀</span></div><div className="window-cross" /></div>
              <div className="room-floor" /><div className="rug" />
              <button type="button" className={`room-creature creature-${creatureAction}`} style={{ left: `${creaturePosition.x}%`, top: `${creaturePosition.y}%` }} aria-label={`Make ${profile.name} happy`} onClick={() => { if (!decorating) animateCreature('happy') }}>
                <span className="creature-body"><Creature profile={profile} />{equipped.map(item => <WearableArt key={item.id} item={item} species={profile.species} wearer={profile.name} />)}</span>
              </button>
              {placedObjects.map(({ item, layout }) => <NurseryObject
                key={item.id}
                item={item}
                layout={layout}
                disabled={busy || !decorating}
                selected={decorating && selectedObject === objectKey(profile.id, item.id)}
                onSelect={() => setSelectedObject(objectKey(profile.id, item.id))}
                onChange={next => setLayoutOverrides(current => ({ ...current, [objectKey(profile.id, item.id)]: next }))}
                onSave={next => persistLayout(item, next)}
                onLayer={direction => changeLayer(item, layout, direction)}
                onReset={() => resetLayout(item)}
              />)}
              <div className="room-label"><span>♥</span> {profile.name} is happy you’re here!</div>
            </div>
            <div className="nursery-mode" role="group" aria-label="Nursery mode">
              <button type="button" aria-pressed={!decorating} onClick={() => { setDecorating(false); setSelectedObject(null) }}>Play</button>
              <button type="button" aria-pressed={decorating} onClick={() => { setDecorating(true); setSelectedObject(null) }}>Decorate</button>
            </div>
            <p className="nursery-edit-help" id="nursery-edit-help">{decorating ? 'Tap a decoration to select it, then drag or use its controls. ↑ moves it in front; ↓ moves it behind. Tap elsewhere to hide the controls.' : 'Tap the floor to guide your friend, or tap them to say hello.'}</p>
            <div className="nursery-footer"><div><span className="sparkle-circle"><DecorIcon kind="sparkle" /></span><span><strong>Looking lovely!</strong><small>{equipped.length ? `${equipped.length} special ${equipped.length === 1 ? 'thing' : 'things'} worn` : 'Dress up your friend below'}</small></span></div><span className="tiny-heart">♡</span></div>
          </section>
          <aside className="adventure card"><div className="eyebrow">A LITTLE SURPRISE</div><h2>Treasure awaits <DecorIcon kind="sparkle" /></h2><p>Every little achievement deserves a little magic.</p><div className={`chest-scene ${opening ? 'is-opening' : ''}`}><span className="chest-sparkle one"><DecorIcon kind="sparkle" /></span><span className="chest-sparkle two"><DecorIcon kind="sparkle" /></span><span className="chest-sparkle three"><DecorIcon kind="sparkle" /></span><Chest open={opening} /></div><div className="chest-count"><strong>{profile.chests}</strong> {profile.chests === 1 ? 'chest' : 'chests'} waiting for you</div><button className="primary-button" disabled={busy || profile.chests < 1} onClick={() => void openChest()}>{opening ? 'A little magic…' : <><DecorIcon kind="sparkle" /> Open a chest</>}</button><button className="earn-button" disabled={busy} onClick={() => void mutate(`profiles/${encodeURIComponent(profile.id)}/simulate-reward`)}>＋ Earn a chest <span>(just for fun!)</span></button></aside>
          <section className="inventory card"><div className="inventory-heading"><div><div className="eyebrow">THE GOOD STUFF</div><h2>A collection of happy <DecorIcon kind="flower" /></h2><p>Little treasures for even bigger imaginations.</p></div><span className="item-count">{items.filter(i => i.owned).length} {items.filter(i => i.owned).length === 1 ? 'treasure' : 'treasures'}</span></div>
          <div className="tabs" role="group" aria-label="Filter treasures">{tabs.map(t => <button aria-pressed={tab === t.id} key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><span><DecorIcon kind={t.icon} /></span> {t.label}</button>)}</div>
            {visible.length ? <div className="item-grid">{visible.map(item => {
              const wearable = item.category === 'outfit' || item.category === 'accessory'
              const active = wearable ? item.equipped : item.placed
              return <article className="item-card" key={item.id}><div className={`item-picture ${item.category}`}><span className="item-emoji">{item.emoji || <DecorIcon kind="sparkle" />}</span>{active && <span className="active-badge">✓ {wearable ? 'Wearing' : 'Placed'}</span>}</div><div className="item-info"><span className={`rarity rarity-${item.rarity.toLowerCase().replace(/[^a-z]/g, '')}`}><DecorIcon kind="sparkle" /> {item.rarity}</span><h3>{item.name}</h3><span className="item-category">{item.category}</span><button disabled={busy} className={active ? 'item-action active-action' : 'item-action'} onClick={() => void mutate(`profiles/${encodeURIComponent(profile.id)}/items/${encodeURIComponent(item.id)}`, wearable ? { equipped: !active } : { placed: !active })}>{active ? (wearable ? 'Take off' : 'Put away') : (wearable ? '♡ Equip' : '＋ Place')}</button></div></article>
            })}</div> : <div className="empty-items"><DecorIcon kind="sparkle" /><strong>A little room for magic</strong><p>No treasures here yet. Open a chest to find a surprise!</p></div>}
          </section>
        </div>}
      </>}
      <footer>Made with <span>♥</span> and a little bit of magic <DecorIcon kind="sparkle" /> <small className="build-id" data-testid="build-id">v{__APP_VERSION__} · build {__BUILD_ID__}</small></footer>
    </main>
    {editing && profile && <div className="modal-backdrop" onClick={() => !busy && setEditing(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" onClick={e => e.stopPropagation()}><button className="close-modal" onClick={() => setEditing(false)} aria-label="Close">×</button><div className="eyebrow">MAKE IT YOURS</div><h2 id="edit-title">A little personal touch <DecorIcon kind="flower" /></h2><p>Give your friend a name and a color you love.</p><label htmlFor="friend-name">Your friend’s name</label><input id="friend-name" autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} /><label id="color-label">Pick a color</label><div className="color-options" role="group" aria-labelledby="color-label">{colors.map(c => <button key={c} className={color.toLowerCase() === c ? 'chosen' : ''} style={{ backgroundColor: c }} onClick={() => setColor(c)} aria-label={`Choose color ${c}`} aria-pressed={color.toLowerCase() === c}>{color.toLowerCase() === c ? '✓' : ''}</button>)}</div>{error && <p role="alert" style={{ color: '#a65e59' }}>{error}</p>}<button className="primary-button" disabled={busy || !name.trim()} onClick={async () => { if (await mutate(`profiles/${encodeURIComponent(profile.id)}`, { name: name.trim(), color }, 'PATCH')) setEditing(false) }}>Save changes</button></div></div>}
    {reward && <div className="modal-backdrop" onClick={() => setReward(null)}><div className="modal reward-modal" role="dialog" aria-modal="true" aria-labelledby="reward-title" onClick={e => e.stopPropagation()}><button className="close-modal" onClick={() => setReward(null)} aria-label="Close">×</button><div className="eyebrow">A LITTLE SOMETHING FOR YOU</div><h2 id="reward-title">Oh, what a lovely find!</h2><div className="reward-art"><DecorIcon kind="sparkle" /><div>{reward.emoji || <DecorIcon kind="sparkle" />}</div><DecorIcon kind="sparkle" /></div><div className="rarity"><DecorIcon kind="sparkle" /> {reward.rarity}</div><h3>{reward.name}</h3><p>Your new treasure is waiting in your collection.</p><button className="primary-button" onClick={() => setReward(null)}>Lovely! ♡</button></div></div>}
  </div>
}

export default App
