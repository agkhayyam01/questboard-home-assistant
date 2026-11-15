import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './FridayBunnyPrototype.css'

type JourneyPhase = 'idle' | 'crouch' | 'spring' | 'float' | 'landing' | 'settle'

type PrototypeState = {
  started: boolean
  strokesDone: number
  watercolorRevealed: boolean
  detailRevealed: boolean
  awakened: boolean
  journeyDone: boolean
  journalSaved: boolean
  journalCount: number
}

type StrokeGuide = {
  id: string
  start: { x: number; y: number }
  end: { x: number; y: number }
}

type PointerStroke = {
  pointerId: number
  target: { x: number; y: number }
  traveled: number
  reachedTarget: boolean
  last: { x: number; y: number }
}

type RequiredAsset = {
  path: string
  purpose: string
}

const STORAGE_KEY = 'questboard.friday_bunny_prototype.v1'
const BUNNY_MASTER_ASSET = 'assets/prototype/friday/IMG_1359.jpeg'
const BUNNY_STYLE_REFERENCE = 'assets/prototype/friday/01_original_three_animal_reference.jpg'
const BUNNY_HOPPING_PREVIEW = 'assets/prototype/friday/Questboard_G2_Bunny_Hopping_Preview.gif'
const ACCEPTANCE_JOURNAL_TITLE = 'Bunny and Wildflower Garden'
const REQUIRED_ASSETS: RequiredAsset[] = [
  { path: BUNNY_MASTER_ASSET, purpose: 'Approved Friday Bunny master artwork' },
  { path: BUNNY_STYLE_REFERENCE, purpose: 'Original three-animal style reference' },
  { path: BUNNY_HOPPING_PREVIEW, purpose: 'Exploratory Bunny hopping preview frames' },
]
const defaultState: PrototypeState = {
  started: false,
  strokesDone: 0,
  watercolorRevealed: false,
  detailRevealed: false,
  awakened: false,
  journeyDone: false,
  journalSaved: false,
  journalCount: 0,
}

const guides: StrokeGuide[] = [
  { id: 'ear-sweep', start: { x: 18, y: 20 }, end: { x: 48, y: 12 } },
  { id: 'back-curve', start: { x: 38, y: 24 }, end: { x: 74, y: 38 } },
  { id: 'chest-line', start: { x: 52, y: 46 }, end: { x: 36, y: 70 } },
  { id: 'front-paw', start: { x: 40, y: 72 }, end: { x: 52, y: 88 } },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const safeCapture = (element: Element, pointerId: number) => {
  try { (element as HTMLElement).setPointerCapture?.(pointerId) } catch { /* no-op */ }
}
const safeRelease = (element: Element, pointerId: number) => {
  try {
    const target = element as HTMLElement
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture?.(pointerId)
  } catch { /* no-op */ }
}
const isImageResponse = (response: Response) => {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  return response.ok && contentType.startsWith('image/')
}
const prototypeRootPath = () => {
  const marker = '/prototype/friday-bunny'
  const lowerPath = window.location.pathname.toLowerCase()
  const markerIndex = lowerPath.indexOf(marker)
  if (markerIndex >= 0) return window.location.pathname.slice(0, markerIndex + 1)
  return window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`
}
const assetUrl = (assetPath: string) => new URL(assetPath, `${window.location.origin}${prototypeRootPath()}`).toString()

function loadState(): PrototypeState {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return defaultState
    const parsed = JSON.parse(saved) as Partial<PrototypeState>
    return {
      started: parsed.started === true,
      strokesDone: clamp(Number(parsed.strokesDone) || 0, 0, guides.length),
      watercolorRevealed: parsed.watercolorRevealed === true,
      detailRevealed: parsed.detailRevealed === true,
      awakened: parsed.awakened === true,
      journeyDone: parsed.journeyDone === true,
      journalSaved: parsed.journalSaved === true,
      journalCount: parsed.journalSaved ? 1 : 0,
    }
  } catch {
    return defaultState
  }
}

const freshAssetChecks = () => Object.fromEntries(REQUIRED_ASSETS.map(asset => [asset.path, null])) as Record<string, boolean | null>

export default function FridayBunnyPrototype() {
  const [state, setState] = useState<PrototypeState>(() => loadState())
  const [assetChecks, setAssetChecks] = useState<Record<string, boolean | null>>(() => freshAssetChecks())
  const [statusMessage, setStatusMessage] = useState('Friday is unlocked for prototype testing. Start when ready.')
  const [chestHolding, setChestHolding] = useState(false)
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>('idle')
  const [journeyInFlight, setJourneyInFlight] = useState(false)
  const [journeyOffset, setJourneyOffset] = useState(0)
  const journeyTimers = useRef<number[]>([])
  const holdTimer = useRef<number | null>(null)
  const activeStroke = useRef<PointerStroke | null>(null)
  const bunnyMasterSrc = useMemo(() => assetUrl(BUNNY_MASTER_ASSET), [])
  const bunnyHoppingSrc = useMemo(() => assetUrl(BUNNY_HOPPING_PREVIEW), [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    let active = true
    const checkAssets = async () => {
      const checks = await Promise.all(REQUIRED_ASSETS.map(async asset => {
        try {
          const response = await fetch(assetUrl(asset.path), { method: 'HEAD' })
          return [asset.path, isImageResponse(response)] as const
        } catch {
          return [asset.path, false] as const
        }
      }))
      if (!active) return
      setAssetChecks(Object.fromEntries(checks))
    }
    void checkAssets()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => () => {
    journeyTimers.current.forEach(timer => window.clearTimeout(timer))
    journeyTimers.current = []
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
  }, [])

  const assetsChecking = REQUIRED_ASSETS.some(asset => assetChecks[asset.path] === null)
  const missingAssets = REQUIRED_ASSETS.filter(asset => assetChecks[asset.path] === false)
  const hasMaster = assetChecks[BUNNY_MASTER_ASSET] === true
  const hasHoppingFrames = assetChecks[BUNNY_HOPPING_PREVIEW] === true
  const canRenderBunny = hasMaster
  const canRunJourney = hasMaster && hasHoppingFrames

  const lineworkReveal = state.strokesDone / guides.length
  const watercolorReveal = state.watercolorRevealed ? 1 : 0
  const detailReveal = state.detailRevealed ? 1 : 0
  const chestActive = chestHolding || state.awakened
  const companionQuiet = state.journalSaved

  const hint = useMemo(() => {
    if (assetsChecking) return 'Checking required Bunny source assets.'
    if (!canRenderBunny) return 'Approved Bunny source art is required before this prototype can render the character.'
    if (!state.started) return 'Tap begin to start the Friday chapter.'
    if (state.strokesDone < guides.length) return `Guide stroke ${state.strokesDone + 1} of ${guides.length}. Incomplete strokes can be retried.`
    if (!state.watercolorRevealed) return 'Tap once to reveal watercolor.'
    if (!state.detailRevealed) return 'Tap once more to reveal finishing details.'
    if (!state.awakened) return 'Hold Bunny\'s chest until the breath arrives. Releasing early lets you retry.'
    if (!canRunJourney) return 'Exploratory hopping frames are required before the destination journey can run.'
    if (!state.journeyDone) return 'Tap the faint destination to begin one guided journey.'
    if (!state.journalSaved) return 'Save the journal page once Bunny reaches the wildflower garden.'
    return 'Quiet companionship resumed. Replay does not duplicate journal progress.'
  }, [assetsChecking, canRenderBunny, canRunJourney, state])

  const updateState = (changes: Partial<PrototypeState>) => {
    setState(current => {
      const next = { ...current, ...changes }
      if (next.journalSaved) next.journalCount = 1
      if (next.strokesDone > guides.length) next.strokesDone = guides.length
      return next
    })
  }

  const beginChapter = () => {
    updateState({ started: true })
    setStatusMessage('Friday chapter started. Follow the glowing stroke guides.')
  }

  const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 100,
      y: ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 100,
    }
  }

  const beginStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!state.started || state.strokesDone >= guides.length || !canRenderBunny) return
    const guide = guides[state.strokesDone]
    const point = pointFromEvent(event)
    const startDistance = distance(point, guide.start)
    const endDistance = distance(point, guide.end)
    if (startDistance > 16 && endDistance > 16) {
      setStatusMessage('Start near one glowing endpoint, then sweep across the guide line.')
      return
    }
    const target = startDistance <= endDistance ? guide.end : guide.start
    safeCapture(event.currentTarget, event.pointerId)
    activeStroke.current = {
      pointerId: event.pointerId,
      target,
      traveled: 0,
      reachedTarget: false,
      last: point,
    }
    setStatusMessage('Keep moving along the guide. Release near the opposite endpoint.')
  }

  const moveStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = activeStroke.current
    if (!active || active.pointerId !== event.pointerId) return
    const point = pointFromEvent(event)
    active.traveled += distance(point, active.last)
    active.last = point
    if (!active.reachedTarget && distance(point, active.target) <= 15) active.reachedTarget = true
  }

  const finishStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = activeStroke.current
    if (!active || active.pointerId !== event.pointerId) return
    safeRelease(event.currentTarget, event.pointerId)
    const successful = active.reachedTarget && active.traveled >= 14
    activeStroke.current = null
    if (!successful) {
      setStatusMessage('Nice try. Incomplete stroke detected, please retry this guide.')
      return
    }
    const done = state.strokesDone + 1
    updateState({ strokesDone: done })
    setStatusMessage(done < guides.length
      ? `Great. Stroke ${done} completed.`
      : 'Linework revealed. Now tap to reveal watercolor and details.')
  }

  const completeCurrentStroke = () => {
    if (!state.started || state.strokesDone >= guides.length || !canRenderBunny) return
    const done = state.strokesDone + 1
    updateState({ strokesDone: done })
    setStatusMessage(done < guides.length
      ? `Guide stroke ${done} completed from controls.`
      : 'Linework revealed. Now tap to reveal watercolor and details.')
  }

  const revealWatercolor = () => {
    if (!state.started || state.strokesDone < guides.length || state.watercolorRevealed || !canRenderBunny) return
    updateState({ watercolorRevealed: true })
    setStatusMessage('Watercolor revealed. Tap again to add finishing details.')
  }

  const revealDetails = () => {
    if (!state.watercolorRevealed || state.detailRevealed || !canRenderBunny) return
    updateState({ detailRevealed: true })
    setStatusMessage('Finishing details revealed. Press and hold Bunny\'s chest for first breath.')
  }

  const clearHoldTimer = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  const startChestHold = () => {
    if (!state.detailRevealed || state.awakened || !canRenderBunny || chestHolding) return
    clearHoldTimer()
    setChestHolding(true)
    setStatusMessage('Keep holding... Bunny is warming and preparing a first breath.')
    holdTimer.current = window.setTimeout(() => {
      updateState({ awakened: true })
      setChestHolding(false)
      setStatusMessage('First breath complete. Bunny softly acknowledges you with a tiny nod.')
      holdTimer.current = null
    }, 1100)
  }

  const endChestHold = () => {
    if (state.awakened) {
      setChestHolding(false)
      clearHoldTimer()
      return
    }
    if (!chestHolding) return
    clearHoldTimer()
    setChestHolding(false)
    setStatusMessage('Hold ended early. You can retry the chest touch anytime.')
  }

  const holdChestPointerStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    safeCapture(event.currentTarget, event.pointerId)
    startChestHold()
  }

  const holdChestPointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    safeRelease(event.currentTarget, event.pointerId)
    endChestHold()
  }

  const holdChestKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return
    event.preventDefault()
    startChestHold()
  }

  const holdChestKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    endChestHold()
  }

  const queuePhase = (phase: JourneyPhase, delay: number, callback?: () => void) => {
    const timer = window.setTimeout(() => {
      setJourneyPhase(phase)
      callback?.()
    }, delay)
    journeyTimers.current.push(timer)
  }

  const startJourney = () => {
    if (!state.awakened || journeyInFlight || !canRunJourney) return
    journeyTimers.current.forEach(timer => window.clearTimeout(timer))
    journeyTimers.current = []
    setJourneyInFlight(true)
    setStatusMessage('Journey started. Crouch, spring, float, landing, then settle.')
    setJourneyPhase('crouch')
    setJourneyOffset(0)
    queuePhase('spring', 350, () => setJourneyOffset(56))
    queuePhase('float', 700, () => setJourneyOffset(140))
    queuePhase('landing', 1130, () => setJourneyOffset(182))
    queuePhase('settle', 1500, () => setJourneyOffset(168))
    const complete = window.setTimeout(() => {
      setJourneyPhase('idle')
      setJourneyInFlight(false)
      updateState({ journeyDone: true })
      setStatusMessage('Bunny settled at the destination. Save one journal page to finish Friday.')
    }, 1900)
    journeyTimers.current.push(complete)
  }

  const saveJournal = () => {
    if (!state.journeyDone) return
    if (state.journalSaved) {
      setStatusMessage('Journal page already saved. Replay is available without duplication.')
      return
    }
    updateState({ journalSaved: true })
    setStatusMessage('Journal saved. Book icon revealed. Returning to quiet companionship.')
  }

  const replayJourney = () => {
    if (!state.journeyDone || journeyInFlight || !canRunJourney) return
    setStatusMessage('Replay started. Existing progress remains saved.')
    startJourney()
  }

  return <main className="friday-prototype" aria-label="Friday Bunny prototype">
    <header className="prototype-header">
      <p className="prototype-tag">Prototype only</p>
      <h1>Friday Bunny Story Prototype</h1>
      <p className="prototype-subtitle">Isolated browser-only scene. No profile, save, Skylight, or Home Assistant data is used.</p>
      <p className="prototype-status" id="prototype-hint" role="status">{hint}</p>
      <p className="prototype-message" role="status">{statusMessage}</p>
      <p className="sr-only" id="friday-gesture-help">
        Guided strokes can be completed by dragging on the canvas or by using the complete guided stroke control button.
        The chest hold can be done with press-and-hold pointer input or with keyboard by holding Space or Enter on the Hold chest button.
      </p>
      {!assetsChecking && missingAssets.length > 0 && <div className="prototype-blocker" role="alert">
        <p>Source blocker: required approved assets are missing from this repository. Provide authorized handoff for:</p>
        <ul>
          {missingAssets.map(asset => <li key={asset.path}><code>{asset.path}</code> ({asset.purpose})</li>)}
        </ul>
      </div>}
    </header>

    <section className="prototype-scene" aria-label="Friday flow workspace">
      <div className={`bunny-stage ${companionQuiet ? 'quiet' : ''}`}>
        <div
          className={`bunny-canvas phase-${journeyPhase} ${chestActive ? 'chest-active' : ''}`}
          style={{ '--linework': `${lineworkReveal}`, '--water': `${watercolorReveal}`, '--details': `${detailReveal}`, '--journey-x': `${journeyOffset}px` } as CSSProperties}
          onPointerDown={beginStroke}
          onPointerMove={moveStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          role="group"
          aria-label="Guided stroke canvas"
          aria-describedby="prototype-hint friday-gesture-help"
        >
          <div className="bunny-guide" aria-hidden="true">
            {guides.map((guide, index) => {
              const dx = guide.end.x - guide.start.x
              const dy = guide.end.y - guide.start.y
              const angle = Math.atan2(dy, dx) * 180 / Math.PI
              const length = Math.hypot(dx, dy)
              return <div
                key={guide.id}
                className={`guide-line ${index < state.strokesDone ? 'done' : ''} ${index === state.strokesDone ? 'active' : ''}`}
                style={{ '--x1': `${guide.start.x}%`, '--y1': `${guide.start.y}%`, '--len': `${length}%`, '--angle': `${angle}deg` } as CSSProperties}
              />
            })}
          </div>
          <div className="bunny-figure">
            {canRenderBunny
              ? <>
                <img src={bunnyMasterSrc} alt="Approved Friday Bunny artwork" className="bunny-image bunny-linework" data-testid="bunny-master-linework" draggable={false} />
                <img src={bunnyMasterSrc} alt="" aria-hidden="true" className="bunny-image bunny-watercolor" data-testid="bunny-master-watercolor" draggable={false} />
                <img src={bunnyMasterSrc} alt="" aria-hidden="true" className="bunny-image bunny-details" data-testid="bunny-master-details" draggable={false} />
              </>
              : <p className="missing-artwork">Waiting for approved Bunny master artwork handoff.</p>}

            {(canRunJourney && (journeyInFlight || state.journeyDone)) && <img
              src={bunnyHoppingSrc}
              alt="Exploratory Bunny hopping preview"
              className="hopping-preview"
              data-testid="bunny-hopping-preview"
              draggable={false}
            />}

            <button
              type="button"
              className="chest-touch"
              aria-label="Hold Bunny chest"
              disabled={!canRenderBunny || !state.detailRevealed || state.awakened}
              onPointerDown={holdChestPointerStart}
              onPointerUp={holdChestPointerEnd}
              onPointerCancel={holdChestPointerEnd}
              onPointerLeave={holdChestPointerEnd}
              onKeyDown={holdChestKeyDown}
              onKeyUp={holdChestKeyUp}
              onBlur={endChestHold}
              aria-describedby="prototype-hint friday-gesture-help"
            >
              Hold chest
            </button>
            <button
              type="button"
              className="destination"
              onClick={startJourney}
              disabled={!state.awakened || journeyInFlight || !canRunJourney}
              aria-label="Follow the faint destination"
            >
              Faint destination
            </button>
            {state.journalSaved && <span className="journal-book" aria-label="Journal book icon" title="Journal saved">book</span>}
          </div>
        </div>
      </div>

      <aside className="prototype-controls" aria-label="Friday controls">
        <button type="button" onClick={beginChapter} disabled={state.started || !canRenderBunny}>Begin Friday chapter</button>
        <button type="button" onClick={completeCurrentStroke} disabled={!state.started || state.strokesDone >= guides.length || !canRenderBunny}>
          Complete guided stroke
        </button>
        <button type="button" onClick={revealWatercolor} disabled={!state.started || state.strokesDone < guides.length || state.watercolorRevealed || !canRenderBunny}>Reveal watercolor</button>
        <button type="button" onClick={revealDetails} disabled={!state.watercolorRevealed || state.detailRevealed || !canRenderBunny}>Reveal finishing details</button>
        <button type="button" onClick={saveJournal} disabled={!state.journeyDone}>Save {ACCEPTANCE_JOURNAL_TITLE} page</button>
        <button type="button" onClick={replayJourney} disabled={!state.journeyDone || journeyInFlight || !canRunJourney}>Replay journey</button>
        <p>Checkpoint resume: {state.journalSaved ? 'Journal saved' : `${state.strokesDone}/${guides.length} strokes complete`}</p>
        <p>Journal pages saved: {state.journalCount}</p>
      </aside>
    </section>
  </main>
}
