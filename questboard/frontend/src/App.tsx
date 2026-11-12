import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type Profile = { id: string | number; owner: string; species: string; name: string; color: string; chests: number }
type Item = { id: string | number; name: string; category: 'outfit' | 'accessory' | 'toy' | 'decoration'; rarity: string; emoji: string; owned: boolean; equipped: boolean; placed: boolean }
type Details = { profile: Profile; items: Item[] }
type Tab = 'all' | 'outfit' | 'accessory' | 'toy' | 'decoration'

const colors = ['#e7a5a2', '#b9a2d4', '#91b5a2', '#e7bf79', '#9cbccc', '#d2a582']
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'all', label: 'Everything', icon: '✦' },
  { id: 'outfit', label: 'Outfits', icon: '♧' },
  { id: 'accessory', label: 'Accessories', icon: '♕' },
  { id: 'toy', label: 'Toys', icon: '♡' },
  { id: 'decoration', label: 'Decor', icon: '✿' },
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

function Creature({ profile, small = false }: { profile: Profile; small?: boolean }) {
  const species = profile.species.toLowerCase()
  const elephant = species.includes('elephant')
  const bunny = species.includes('bunny') || species.includes('rabbit')
  const color = profile.color || (elephant ? '#aab4ca' : bunny ? '#e5c4ba' : '#bfa5c9')
  return (
    <svg className={small ? 'creature creature-small' : 'creature'} viewBox="0 0 220 230" role="img" aria-label={`${profile.name}, the ${profile.species}`}>
      <ellipse cx="110" cy="214" rx="70" ry="9" fill="#795d59" opacity=".12" />
      {bunny && <><ellipse cx="72" cy="58" rx="19" ry="58" fill={color} transform="rotate(-16 72 58)" /><ellipse cx="148" cy="58" rx="19" ry="58" fill={color} transform="rotate(16 148 58)" /><ellipse cx="72" cy="54" rx="8" ry="37" fill="#edb8b2" transform="rotate(-16 72 54)" /><ellipse cx="148" cy="54" rx="8" ry="37" fill="#edb8b2" transform="rotate(16 148 54)" /></>}
      {elephant && <><ellipse cx="48" cy="100" rx="37" ry="45" fill={color} /><ellipse cx="172" cy="100" rx="37" ry="45" fill={color} /><ellipse cx="48" cy="100" rx="24" ry="31" fill="#eabcb9" opacity=".65" /><ellipse cx="172" cy="100" rx="24" ry="31" fill="#eabcb9" opacity=".65" /></>}
      {!bunny && !elephant && <><ellipse cx="58" cy="71" rx="18" ry="20" fill={color} /><ellipse cx="162" cy="71" rx="18" ry="20" fill={color} /><ellipse cx="58" cy="71" rx="9" ry="10" fill="#eabcb9" /><ellipse cx="162" cy="71" rx="9" ry="10" fill="#eabcb9" /></>}
      <ellipse cx="110" cy="175" rx="59" ry="40" fill={color} />
      <ellipse cx="63" cy="195" rx="24" ry="16" fill={color} stroke="#ffffff" strokeOpacity=".22" strokeWidth="3" />
      <ellipse cx="157" cy="195" rx="24" ry="16" fill={color} stroke="#ffffff" strokeOpacity=".22" strokeWidth="3" />
      <ellipse cx="110" cy="109" rx="68" ry="61" fill={color} />
      {!bunny && !elephant && <ellipse cx="110" cy="132" rx="48" ry="30" fill="#e2cad5" opacity=".75" />}
      <ellipse cx="82" cy="110" rx="5" ry="6" fill="#493e46" /><ellipse cx="138" cy="110" rx="5" ry="6" fill="#493e46" />
      <circle cx="69" cy="126" r="8" fill="#e9949a" opacity=".45" /><circle cx="151" cy="126" r="8" fill="#e9949a" opacity=".45" />
      {elephant ? <path d="M101 125 Q96 147 106 156 Q117 165 126 151" fill="none" stroke={color} strokeWidth="20" strokeLinecap="round" /> : <><ellipse cx="110" cy="127" rx="6" ry="4" fill="#8d646a" /><path d="M110 132 Q103 141 97 135 M110 132 Q117 141 123 135" fill="none" stroke="#75575c" strokeWidth="2.5" strokeLinecap="round" /></>}
      <path d="M89 175 Q110 187 131 175" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
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
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [reward, setReward] = useState<Item | null>(null)
  const [opening, setOpening] = useState(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

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
  const openChest = async () => {
    if (selected === null || busy || opening) return
    setBusy(true)
    setError('')
    setOpening(true)
    try {
      const result = await request<{ item: Item; profile: Profile }>(`profiles/${encodeURIComponent(selected)}/open-chest`, { method: 'POST' })
      setDetails(current => current ? { profile: result.profile, items: current.items.map(item => item.id === result.item.id ? result.item : item) } : current)
      setProfiles(current => current.map(p => p.id === selected ? result.profile : p))
      try { await refresh(selected) }
      catch { setError('Your treasure was saved, but we could not refresh your collection. Please try again.') }
      await new Promise(resolve => window.setTimeout(resolve, 750))
      setReward(result.item)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the chest.') }
    finally { setOpening(false); setBusy(false) }
  }
  const profile = details?.profile.id === selected ? details.profile : undefined
  const items = profile ? details?.items ?? [] : []
  const visible = items.filter(item => item.owned && (tab === 'all' || item.category === tab))
  const placed = items.filter(item => item.owned && item.placed && (item.category === 'toy' || item.category === 'decoration'))
  const equipped = items.filter(item => item.owned && item.equipped && (item.category === 'outfit' || item.category === 'accessory'))

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><span>Questboard<span className="brand-dot">.</span></span></div>
      <div className="top-note"><span>☀</span> A little world of wonderful</div>
      <div className="top-heart">♡ <span>Made for little dreamers</span></div>
    </header>
    <main>
      <div className="page-heading"><div><div className="eyebrow"><span>✦</span> A LITTLE MAGIC, EVERY DAY</div><h1>Welcome to your <em>happy place.</em></h1><p>Big adventures start with the littlest friends.</p></div><div className="heading-doodle" aria-hidden="true">✳ <span>✧</span></div></div>
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
            <div className="card-title"><div><div className="eyebrow">HOME SWEET HOME</div><h2>{profile.name}’s little corner <span>✳</span></h2><p>A cozy place to just be you.</p></div><button className="text-button" onClick={() => { setName(profile.name); setColor(profile.color); setEditing(true) }}>✎ <span>Make it yours</span></button></div>
            <div className="room">
              <div className="room-sun">✺</div><div className="wall-frame"><span>✿</span></div><div className="wall-stars">✧<br /> ˚</div><div className="bunting">◆ · ◆ · ◆ · ◆ · ◆</div>
              <div className="window"><div className="window-sky">☁ <span>☀</span></div><div className="window-cross" /></div>
              <div className="room-floor" /><div className="rug" /><div className="plant"><span>✿</span><i /></div>
              <div className="room-creature"><Creature profile={profile} />{equipped.length > 0 && <div className="worn-items" title={equipped.map(i => i.name).join(', ')}>{equipped.map(i => <span key={i.id}>{i.emoji}</span>)}</div>}</div>
              <div className="room-items">{placed.map(i => <span key={i.id} title={i.name} aria-label={i.name}>{i.emoji}</span>)}</div>
              <div className="room-label"><span>♥</span> {profile.name} is happy you’re here!</div>
            </div>
            <div className="nursery-footer"><div><span className="sparkle-circle">✦</span><span><strong>Looking lovely!</strong><small>{equipped.length ? `${equipped.length} special ${equipped.length === 1 ? 'thing' : 'things'} worn` : 'Dress up your friend below'}</small></span></div><span className="tiny-heart">♡</span></div>
          </section>
          <aside className="adventure card"><div className="eyebrow">A LITTLE SURPRISE</div><h2>Treasure awaits<span> ✦</span></h2><p>Every little achievement deserves a little magic.</p><div className={`chest-scene ${opening ? 'is-opening' : ''}`}><span className="chest-sparkle one">✧</span><span className="chest-sparkle two">✦</span><span className="chest-sparkle three">✳</span><Chest open={opening} /></div><div className="chest-count"><strong>{profile.chests}</strong> {profile.chests === 1 ? 'chest' : 'chests'} waiting for you</div><button className="primary-button" disabled={busy || profile.chests < 1} onClick={() => void openChest()}>{opening ? 'A little magic…' : '✦  Open a chest'}</button><button className="earn-button" disabled={busy} onClick={() => void mutate(`profiles/${encodeURIComponent(profile.id)}/simulate-reward`)}>＋ Earn a chest <span>(just for fun!)</span></button></aside>
          <section className="inventory card"><div className="inventory-heading"><div><div className="eyebrow">THE GOOD STUFF</div><h2>A collection of happy <span>✿</span></h2><p>Little treasures for even bigger imaginations.</p></div><span className="item-count">{items.filter(i => i.owned).length} {items.filter(i => i.owned).length === 1 ? 'treasure' : 'treasures'}</span></div>
            <div className="tabs" role="group" aria-label="Filter treasures">{tabs.map(t => <button aria-pressed={tab === t.id} key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><span>{t.icon}</span> {t.label}</button>)}</div>
            {visible.length ? <div className="item-grid">{visible.map(item => {
              const wearable = item.category === 'outfit' || item.category === 'accessory'
              const active = wearable ? item.equipped : item.placed
              return <article className="item-card" key={item.id}><div className={`item-picture ${item.category}`}><span className="item-emoji">{item.emoji || '✦'}</span>{active && <span className="active-badge">✓ {wearable ? 'Wearing' : 'Placed'}</span>}</div><div className="item-info"><span className={`rarity rarity-${item.rarity.toLowerCase().replace(/[^a-z]/g, '')}`}>✦ {item.rarity}</span><h3>{item.name}</h3><span className="item-category">{item.category}</span><button disabled={busy} className={active ? 'item-action active-action' : 'item-action'} onClick={() => void mutate(`profiles/${encodeURIComponent(profile.id)}/items/${encodeURIComponent(item.id)}`, wearable ? { equipped: !active } : { placed: !active })}>{active ? (wearable ? 'Take off' : 'Put away') : (wearable ? '♡ Equip' : '＋ Place')}</button></div></article>
            })}</div> : <div className="empty-items"><span>✧</span><strong>A little room for magic</strong><p>No treasures here yet. Open a chest to find a surprise!</p></div>}
          </section>
        </div>}
      </>}
      <footer>Made with <span>♥</span> and a little bit of magic <span>✦</span></footer>
    </main>
    {editing && profile && <div className="modal-backdrop" onClick={() => !busy && setEditing(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" onClick={e => e.stopPropagation()}><button className="close-modal" onClick={() => setEditing(false)} aria-label="Close">×</button><div className="eyebrow">MAKE IT YOURS</div><h2 id="edit-title">A little personal touch <span>✿</span></h2><p>Give your friend a name and a color you love.</p><label htmlFor="friend-name">Your friend’s name</label><input id="friend-name" autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} /><label id="color-label">Pick a color</label><div className="color-options" role="group" aria-labelledby="color-label">{colors.map(c => <button key={c} className={color.toLowerCase() === c ? 'chosen' : ''} style={{ backgroundColor: c }} onClick={() => setColor(c)} aria-label={`Choose color ${c}`} aria-pressed={color.toLowerCase() === c}>{color.toLowerCase() === c ? '✓' : ''}</button>)}</div>{error && <p role="alert" style={{ color: '#a65e59' }}>{error}</p>}<button className="primary-button" disabled={busy || !name.trim()} onClick={async () => { if (await mutate(`profiles/${encodeURIComponent(profile.id)}`, { name: name.trim(), color }, 'PATCH')) setEditing(false) }}>Save changes</button></div></div>}
    {reward && <div className="modal-backdrop" onClick={() => setReward(null)}><div className="modal reward-modal" role="dialog" aria-modal="true" aria-labelledby="reward-title" onClick={e => e.stopPropagation()}><button className="close-modal" onClick={() => setReward(null)} aria-label="Close">×</button><div className="eyebrow">A LITTLE SOMETHING FOR YOU</div><h2 id="reward-title">Oh, what a lovely find!</h2><div className="reward-art"><span>✧</span><div>{reward.emoji || '✦'}</div><span>✦</span></div><div className="rarity">✦ {reward.rarity}</div><h3>{reward.name}</h3><p>Your new treasure is waiting in your collection.</p><button className="primary-button" onClick={() => setReward(null)}>Lovely! ♡</button></div></div>}
  </div>
}

export default App
