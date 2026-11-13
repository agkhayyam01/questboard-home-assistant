import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

type Profile = { id: string; owner: string; species: string; name: string; color: string; chests: number }
type Item = { id: string; name: string; category: 'outfit' | 'accessory' | 'toy' | 'furniture'; rarity: string; emoji: string; owned: boolean; equipped: boolean; placed: boolean; layout?: { x: number; y: number; size: number; layer: number } | null }
type Details = { profile: Profile; items: Item[] }

const initialDetails: Details[] = [
  {
    profile: { id: 'one / ?', owner: 'Avery', species: 'bunny', name: 'Clover', color: '#e7a5a2', chests: 0 },
    items: [
      { id: 'hat / 1', name: 'Cozy Hat', category: 'outfit', rarity: 'Common', emoji: '🎩', owned: true, equipped: false, placed: false },
      { id: 'glasses', name: 'Star Glasses', category: 'accessory', rarity: 'Uncommon', emoji: '👓', owned: true, equipped: false, placed: false },
      { id: 'ball', name: 'Bouncy Ball', category: 'toy', rarity: 'Rare', emoji: '⚽', owned: true, equipped: false, placed: false },
      { id: 'star', name: 'Lucky Star', category: 'toy', rarity: 'Rare', emoji: '⭐', owned: false, equipped: false, placed: false },
    ],
  },
  {
    profile: { id: 'two', owner: 'Blair', species: 'elephant', name: 'Pebble', color: '#91b5a2', chests: 2 },
    items: [
      { id: 'kite', name: 'Blue Kite', category: 'toy', rarity: 'Common', emoji: '🪁', owned: true, equipped: false, placed: false },
      { id: 'sun-hat', name: 'Sun Hat', category: 'accessory', rarity: 'Common', emoji: '👒', owned: true, equipped: false, placed: false },
      { id: 'raincoat', name: 'Raincoat', category: 'outfit', rarity: 'Common', emoji: '🧥', owned: true, equipped: false, placed: false },
      { id: 'cozy-bed', name: 'Cozy Bed', category: 'furniture', rarity: 'Common', emoji: '🛏️', owned: true, equipped: false, placed: true },
    ],
  },
  {
    profile: { id: 'three', owner: 'Lill', species: 'hippo', name: 'Lill', color: '#b9a3d5', chests: 0 },
    items: [
      { id: 'crown', name: 'Golden Crown', category: 'accessory', rarity: 'Rare', emoji: '👑', owned: true, equipped: false, placed: false },
      { id: 'ballerina-dress', name: 'Ballerina Dress', category: 'outfit', rarity: 'Uncommon', emoji: '🩰', owned: true, equipped: false, placed: false },
    ],
  },
  {
    profile: { id: 'four', owner: 'Gigi', species: 'bunny', name: 'Gigi', color: '#f4b6c8', chests: 0 },
    items: [{ id: 'flower-crown', name: 'Flower Crown', category: 'accessory', rarity: 'Uncommon', emoji: '🌼', owned: true, equipped: false, placed: false }],
  },
]

function createApi() {
  const data = structuredClone(initialDetails)
  const treats = Object.fromEntries(data.map(({ profile }) => [profile.id, {
    treats: [
      { id: 'carrot', name: 'Carrot', rarity: 'common', emoji: '🥕', quantity: 0 },
      { id: 'strawberry', name: 'Strawberry', rarity: 'common', emoji: '🍓', quantity: 0 },
      { id: 'mixed-berries', name: 'Mixed Berries', rarity: 'common', emoji: '🫐', quantity: 0 },
      { id: 'cookie', name: 'Cookie', rarity: 'common', emoji: '🍪', quantity: 0 },
      { id: 'cupcake', name: 'Cupcake', rarity: 'uncommon', emoji: '🧁', quantity: 0 },
      { id: 'moonberry', name: 'Moonberry', rarity: 'rare', emoji: '🌙', quantity: 0 },
    ],
    affection: 0,
    favorite_treat: profile.species === 'bunny' ? 'carrot' : profile.species === 'hippo' ? 'mixed-berries' : 'strawberry',
    special_milestone_claimed: false,
    daily: { claimed: false, quantity: 3, next_available_at: '2025-01-02T00:00:00+00:00', timezone: 'UTC' },
  }]))
  const treatRewards = new Set<string>()
  const failNext = new Map<string, { status: number; body: unknown }>()
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    const key = `${method} ${path}`
    const failure = failNext.get(key)
    if (failure) {
      failNext.delete(key)
      return Response.json(failure.body, { status: failure.status })
    }
    if (path === 'api/profiles' && method === 'GET') return Response.json(data.map(d => d.profile))
    const parts = path.split('/')
    const details = data.find(d => d.profile.id === decodeURIComponent(parts[2] ?? ''))
    if (parts[0] !== 'api' || parts[1] !== 'profiles' || !details) {
      return Response.json({ error: `Unexpected request: ${key}` }, { status: 404 })
    }
    const treatsForProfile = treats[details.profile.id]
    if (parts[3] === 'treats' && parts.length === 4 && method === 'GET') return Response.json(treatsForProfile)
    if (parts[3] === 'treats' && parts[4] === 'claim' && method === 'POST') {
      const claimed = !treatsForProfile.daily.claimed
      if (claimed) {
        treatsForProfile.daily.claimed = true
        treatsForProfile.treats.find(treat => treat.id === treatsForProfile.favorite_treat)!.quantity += 3
      }
      return Response.json({ claimed, ...treatsForProfile })
    }
    if (parts[3] === 'treats' && parts[4] === 'simulate-reward' && method === 'POST') {
      const idempotencyKey = new Headers(init?.headers).get('Idempotency-Key') ?? ''
      if (!treatRewards.has(`${details.profile.id}:${idempotencyKey}`)) {
        treatRewards.add(`${details.profile.id}:${idempotencyKey}`)
        treatsForProfile.treats.find(treat => treat.id === 'moonberry')!.quantity++
        treatsForProfile.special_milestone_claimed = true
      }
      return Response.json(treatsForProfile)
    }
    if (parts[3] === 'treats' && parts[4] === 'feed' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { treat_id: string; request_id: string }
      const treat = treatsForProfile.treats.find(item => item.id === body.treat_id)!
      const favorite = treatsForProfile.favorite_treat === treat.id
      treat.quantity--
      treatsForProfile.affection = Math.min(100, treatsForProfile.affection + (favorite ? 8 : 5))
      return Response.json({ fed: true, favorite, affection: treatsForProfile.affection, quantity: treat.quantity })
    }
    if (parts.length === 3 && method === 'GET') return Response.json(details)
    if (parts.length === 3 && method === 'PATCH') {
      Object.assign(details.profile, JSON.parse(String(init?.body)))
      return Response.json(details.profile)
    }
    if (parts[3] === 'items' && parts[5] === 'layout' && (method === 'PUT' || method === 'DELETE')) {
      const item = details.items.find(i => i.id === decodeURIComponent(parts[4] ?? ''))
      if (!item) return Response.json({ error: 'Item not found' }, { status: 404 })
      if (method === 'PUT') item.layout = JSON.parse(String(init?.body))
      else item.layout = null
      return Response.json(details)
    }
    if (parts[3] === 'items' && method === 'POST') {
      const item = details.items.find(i => i.id === decodeURIComponent(parts[4] ?? ''))
      if (!item) return Response.json({ error: 'Item not found' }, { status: 404 })
      Object.assign(item, JSON.parse(String(init?.body)))
      return Response.json(item)
    }
    if (parts[3] === 'simulate-reward' && method === 'POST') {
      details.profile.chests++
      return Response.json(details.profile)
    }
    if (parts[3] === 'open-chest' && method === 'POST' && details.profile.chests > 0) {
      details.profile.chests--
      const item = details.items.find(i => !i.owned)
      if (!item) return Response.json({ error: 'No unowned items' }, { status: 409 })
      item.owned = true
      return Response.json({ item, profile: details.profile })
    }
    return Response.json({ error: `Unexpected request: ${key}` }, { status: 400 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, failNext }
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/hassio_ingress/abc123/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('Questboard frontend', () => {
  it('shows the running app version and build identifier', async () => {
    render(<App />)
    expect((await screen.findByTestId('build-id')).textContent).toMatch(/^v\d+\.\d+\.\d+ · build \S+/)
  })

  it('loads profiles and switches collections while resetting the filter', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Clover’s little corner')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/[✳✺✿✧✦]/u)
    expect(document.querySelectorAll('.room .decor-icon').length).toBeGreaterThan(0)
    expect(screen.getByText('Cozy Hat')).toBeTruthy()
    expect(screen.queryByText('Lucky Star')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Outfits/ }))
    expect(screen.queryByText('Bouncy Ball')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Blair/ }))
    expect(await screen.findByText('Pebble’s little corner')).toBeTruthy()
    expect(screen.getByText('Blue Kite')).toBeTruthy()
    expect(screen.queryByText('Cozy Hat')).toBeNull()
    expect(screen.getByRole('button', { name: /Blair/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Everything/ }).getAttribute('aria-pressed')).toBe('true')
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/two', expect.anything())
  })

  it('sends ingress-relative, encoded requests and refreshes profile and item changes', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')

    expect(fetchMock.mock.calls[0][0]).toBe('api/profiles')
    expect(new URL(String(fetchMock.mock.calls[0][0]), window.location.href).pathname)
      .toBe('/api/hassio_ingress/abc123/api/profiles')
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F', expect.anything())

    await user.click(screen.getByRole('button', { name: /Make it yours/ }))
    const dialog = screen.getByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Your friend’s name'))
    await user.type(within(dialog).getByLabelText('Your friend’s name'), '  Sunny  ')
    await user.click(within(dialog).getByRole('button', { name: 'Choose color #b9a2d4' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Sunny’s little corner')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F', {
      method: 'PATCH', body: JSON.stringify({ name: 'Sunny', color: '#b9a2d4' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await user.click(within(screen.getByText('Cozy Hat').closest('article')!).getByRole('button', { name: /Equip/ }))
    expect(await screen.findByText('✓ Wearing')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/items/hat%20%2F%201', {
      method: 'POST', body: JSON.stringify({ equipped: true }), headers: { 'Content-Type': 'application/json' },
    })
    await user.click(screen.getByRole('button', { name: /Place/ }))
    expect(await screen.findByText('✓ Placed')).toBeTruthy()
    expect(screen.getByTitle('Bouncy Ball')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/items/ball', {
      method: 'POST', body: JSON.stringify({ placed: true }), headers: { 'Content-Type': 'application/json' },
    })
  })

  it('supports accessible nursery resize, layering, reset, and saves layouts', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    await user.click(screen.getByRole('button', { name: /Place/ }))
    const nurseryObject = await screen.findByRole('group', { name: 'Bouncy Ball in the nursery' })
    await user.click(screen.getByRole('button', { name: 'Decorate' }))
    fireEvent.pointerDown(nurseryObject, { pointerId: 99, pointerType: 'touch', clientX: 100, clientY: 100 })
    expect(nurseryObject.getAttribute('style')).toContain('width: 40px')
    expect(within(nurseryObject).getByRole('button', { name: 'Send Bouncy Ball backward' }).title).toBe('Move behind other decorations')

    const enlarge = within(nurseryObject).getByRole('button', { name: 'Make Bouncy Ball larger' })
    enlarge.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(nurseryObject.getAttribute('style')).toContain('width: 48px'))
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/items/ball/layout', {
      method: 'PUT',
      body: JSON.stringify({ x: 50, y: 86, size: 48, layer: 12 }),
      headers: { 'Content-Type': 'application/json' },
    })

    await user.click(within(nurseryObject).getByRole('button', { name: 'Bring Bouncy Ball forward' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/items/ball/layout', {
      method: 'PUT',
      body: JSON.stringify({ x: 50, y: 86, size: 48, layer: 13 }),
      headers: { 'Content-Type': 'application/json' },
    }))
    await user.click(within(nurseryObject).getByRole('button', { name: 'Reset Bouncy Ball' }))
    await waitFor(() => expect(nurseryObject.getAttribute('style')).toContain('width: 40px'))
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/items/ball/layout', {
      method: 'DELETE', headers: {},
    })
  })

  it('switches between play and decorate, directs the creature, and keeps wearables equipped', async () => {
    createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    const room = screen.getByRole('group', { name: 'Nursery play area' })
    vi.spyOn(room, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300,
      toJSON: () => ({}),
    })
    const creature = screen.getByRole('button', { name: 'Make Clover happy' })
    expect(creature.getAttribute('style')).toContain('top: 82%')
    fireEvent.click(creature)
    expect(creature.classList.contains('creature-happy')).toBe(true)
    fireEvent.click(room.querySelector('.room-floor')!, { clientX: 280, clientY: 250 })
    expect(creature.getAttribute('style')).toContain('left: 70%')
    expect(creature.getAttribute('style')).toContain('top: 83.3333%')
    vi.spyOn(creature, 'getBoundingClientRect').mockReturnValue({
      x: 180, y: 60, left: 180, top: 60, right: 280, bottom: 160, width: 100, height: 100,
      toJSON: () => ({}),
    })
    fireEvent.click(creature)
    expect(creature.getAttribute('style')).toContain('left: 57.5%')
    expect(creature.getAttribute('style')).toContain('top: 74%')
    vi.spyOn(room, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300,
      toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))
    fireEvent.click(room.querySelector('.room-floor')!, { clientX: 0, clientY: 250 })
    expect(creature.getAttribute('style')).toContain('left: 25%')

    await user.click(within(screen.getByText('Star Glasses').closest('article')!).getByRole('button', { name: /Equip/ }))
    expect(screen.getByLabelText('Star Glasses worn by Clover')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Decorate' }))
    expect(screen.getByRole('button', { name: 'Decorate' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: /Place/ }))
    const nurseryObject = await screen.findByRole('group', { name: 'Bouncy Ball in the nursery' })
    expect(within(nurseryObject).queryByRole('button', { name: 'Bring Bouncy Ball forward' })).toBeNull()
    fireEvent.pointerDown(nurseryObject, { pointerId: 99, pointerType: 'touch', clientX: 100, clientY: 100 })
    expect(within(nurseryObject).getByRole('button', { name: 'Bring Bouncy Ball forward' })).toBeTruthy()
    fireEvent.click(document.querySelector('.page-heading')!)
    expect(within(nurseryObject).queryByRole('button', { name: 'Bring Bouncy Ball forward' })).toBeNull()
    expect(screen.getByLabelText('Star Glasses worn by Clover')).toBeTruthy()
  })

  it('animates expressive poses and lets keyboard users invite a creature to play with a toy', async () => {
    createApi()
    render(<App />)
    await screen.findByText('Clover’s little corner')

    const creature = screen.getByRole('button', { name: 'Make Clover happy' })
    fireEvent.click(creature)
    const artwork = document.querySelector('.room-creature .creature')!
    expect(artwork.getAttribute('data-action')).toBe('happy')
    expect(artwork.querySelectorAll('.creature-foot')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /Place/ }))
    const toy = await screen.findByRole('group', { name: 'Bouncy Ball in the nursery' })
    toy.focus()
    fireEvent.keyDown(toy, { key: 'Enter' })
    expect(creature.classList.contains('creature-hopping')).toBe(true)
    expect(creature.getAttribute('style')).toContain('left: 63%')
    expect(artwork.getAttribute('data-action')).toBe('hopping')
    await waitFor(() => expect(toy.classList.contains('object-interacting-toy')).toBe(true), { timeout: 2000 })
  })

  it('lets a child tap furniture to approach and settle onto it', async () => {
    createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    await user.click(screen.getByRole('button', { name: /Blair/ }))
    await screen.findByText('Pebble’s little corner')

    const bed = screen.getByRole('group', { name: 'Cozy Bed in the nursery' })
    fireEvent.click(bed)
    const creature = document.querySelector('.room-creature')
    await waitFor(() => expect(creature?.classList.contains('creature-walking')).toBe(true))
    await waitFor(() => expect(document.querySelector('.room-creature .creature')?.getAttribute('data-action')).toBe('sleeping'), { timeout: 2000 })
    await waitFor(() => expect(bed.classList.contains('object-interacting-furniture')).toBe(true), { timeout: 2000 })
  })

  it('anchors wearables on the right body area for each creature species', async () => {
    createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')

    const outfitCard = screen.getByText('Cozy Hat').closest('article')!
    await user.click(within(outfitCard).getByRole('button', { name: /Equip/ }))
    const bunnyOutfit = screen.getByLabelText('Cozy Hat worn by Clover')
    expect(bunnyOutfit.classList.contains('wearable-outfit')).toBe(true)
    expect(bunnyOutfit.tagName.toLowerCase()).toBe('svg')
    expect(bunnyOutfit.getAttribute('viewBox')).toBe('0 0 220 230')
    const glassesCard = screen.getByText('Star Glasses').closest('article')!
    await user.click(within(glassesCard).getByRole('button', { name: /Equip/ }))
    const bunnyGlasses = screen.getByLabelText('Star Glasses worn by Clover')
    expect(bunnyGlasses.classList.contains('wearable-glasses')).toBe(true)
    expect(bunnyGlasses.tagName.toLowerCase()).toBe('svg')

    await user.click(screen.getByRole('button', { name: /Blair/ }))
    await screen.findByText('Pebble’s little corner')
    const elephantHat = screen.getByText('Sun Hat').closest('article')!
    await user.click(within(elephantHat).getByRole('button', { name: /Equip/ }))
    const elephantWearable = screen.getByLabelText('Sun Hat worn by Pebble')
    expect(elephantWearable.classList.contains('wearer-elephant')).toBe(true)
    expect(elephantWearable.classList.contains('wearable-hat')).toBe(true)
    expect(elephantWearable.tagName.toLowerCase()).toBe('svg')
    const elephantOutfit = screen.getByText('Raincoat').closest('article')!
    await user.click(within(elephantOutfit).getByRole('button', { name: /Equip/ }))
    expect(screen.getByLabelText('Raincoat worn by Pebble').classList.contains('wearable-outfit')).toBe(true)

    await user.click(screen.getByRole('button', { name: /Lill/ }))
    await screen.findByText('Lill’s little corner')
    const hippoCrown = screen.getByText('Golden Crown').closest('article')!
    await user.click(within(hippoCrown).getByRole('button', { name: /Equip/ }))
    const hippoWearable = screen.getByLabelText('Golden Crown worn by Lill')
    expect(hippoWearable.classList.contains('wearer-hippo')).toBe(true)
    expect(hippoWearable.classList.contains('wearable-crown')).toBe(true)
    expect(hippoWearable.tagName.toLowerCase()).toBe('svg')
    const hippoOutfit = screen.getByText('Ballerina Dress').closest('article')!
    await user.click(within(hippoOutfit).getByRole('button', { name: /Equip/ }))
    expect(screen.getByLabelText('Ballerina Dress worn by Lill').classList.contains('wearable-outfit')).toBe(true)

    await user.click(screen.getByRole('button', { name: /Gigi/ }))
    await screen.findByText('Gigi’s little corner')
    const flowerCrown = screen.getByText('Flower Crown').closest('article')!
    await user.click(within(flowerCrown).getByRole('button', { name: /Equip/ }))
    expect(screen.getByLabelText('Flower Crown worn by Gigi').classList.contains('wearable-flower-crown')).toBe(true)
  })

  it('pinch-resizes and repositions nursery objects with touch pointers', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    const room = screen.getByRole('group', { name: 'Nursery play area' })
    vi.spyOn(room, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300,
      toJSON: () => ({}),
    })
    await user.click(screen.getByRole('button', { name: /Place/ }))
    const nurseryObject = await screen.findByRole('group', { name: 'Bouncy Ball in the nursery' })
    await user.click(screen.getByRole('button', { name: 'Decorate' }))
    fireEvent.pointerDown(nurseryObject, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerDown(nurseryObject, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 })
    fireEvent.pointerMove(nurseryObject, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 100 })
    fireEvent.pointerUp(nurseryObject, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 100 })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/items/ball/layout', {
      method: 'PUT',
      body: JSON.stringify({ x: 56.25, y: 86, size: 60, layer: 12 }),
      headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('earns and opens a simulated chest, updates inventory, and dismisses the reward', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    expect((screen.getByRole('button', { name: /Open a chest/ }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: /Earn a chest/ }))
    await waitFor(() => expect(screen.getByText(/chest waiting for you/).textContent).toContain('1 chest waiting for you'))
    await user.click(screen.getByRole('button', { name: /Open a chest/ }))
    expect(screen.getByRole('button', { name: /A little magic/ }).hasAttribute('disabled')).toBe(true)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Lucky Star')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make Clover happy' }).classList.contains('creature-celebrating')).toBe(true)
    expect(screen.getByText(/chests waiting for you/).textContent).toContain('0 chests waiting for you')
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/simulate-reward', { method: 'POST', headers: {} })
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/open-chest', { method: 'POST', headers: {} })
    await user.click(within(dialog).getByRole('button', { name: /Lovely/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Lucky Star')).toBeTruthy()
  })

  it('claims daily treats and shows the distinct eating animation when feeding a favorite', async () => {
    const { fetchMock, failNext } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    const openTreats = await screen.findByRole('button', { name: /Treats and feed/ })
    await waitFor(() => expect((openTreats as HTMLButtonElement).disabled).toBe(false))
    await user.click(openTreats)

    const dialog = screen.getByRole('dialog', { name: /Treats for Clover/ })
    await user.click(within(dialog).getByRole('button', { name: 'Claim 3 free treats' }))
    expect(await within(dialog).findByText(/3\s+available/)).toBeTruthy()
    const carrot = within(dialog).getByText('Carrot').closest('article')!
    failNext.set('POST api/profiles/one%20%2F%20%3F/treats/feed', { status: 503, body: { detail: 'Connection interrupted' } })
    await user.click(within(carrot).getByRole('button', { name: 'Feed Clover' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Connection interrupted')
    const feedRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/treats/feed'))
    const interruptedRequestId = JSON.parse(String(feedRequests()[0][1]?.body)).request_id
    await user.click(within(carrot).getByRole('button', { name: 'Feed Clover' }))

    await waitFor(() => {
      expect(feedRequests()).toHaveLength(2)
      expect(JSON.parse(String(feedRequests()[1][1]?.body)).request_id).toBe(interruptedRequestId)
      expect(JSON.parse(String(feedRequests()[1][1]?.body)).treat_id).toBe('carrot')
    })
    await waitFor(() => expect(document.querySelector('.room-creature .creature')?.getAttribute('data-action')).toBe('eating'), { timeout: 4000 })
    expect(document.querySelectorAll('.room-creature .creature-foot')).toHaveLength(2)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/treats/claim'))).toBe(true)
    expect(screen.getByText('Affection 8%')).toBeTruthy()
  })

  it('awards the pretend milestone treat only once per profile', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    await waitFor(() => expect((screen.getByRole('button', { name: /Treats and feed/ }) as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: /Treats and feed/ }))
    const dialog = screen.getByRole('dialog', { name: /Treats for Clover/ })
    await user.click(within(dialog).getByRole('button', { name: /Try a pretend milestone treat/ }))
    expect(await within(dialog).findByRole('button', { name: /Milestone treat claimed/ })).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/treats/simulate-reward'))).toHaveLength(1)
  })

  it('renders Lill with a broad hippo muzzle and anchors her feet on the nursery floor', async () => {
    createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    await user.click(screen.getByRole('button', { name: /Lill/ }))
    await screen.findByText('Lill’s little corner')

    const creature = screen.getByRole('button', { name: 'Make Lill happy' })
    const artwork = creature.querySelector('.creature-species-hippo')!
    expect(artwork.querySelector('.creature-muzzle')).toBeTruthy()
    expect(artwork.querySelectorAll('.creature-nostril')).toHaveLength(2)
    expect(creature.getAttribute('style')).toContain('top: 82%')
  })

  it('ignores repeated chest taps while a reward is opening', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    await user.click(screen.getByRole('button', { name: /Earn a chest/ }))
    await waitFor(() => expect(screen.getByText(/chest waiting for you/).textContent).toContain('1 chest waiting for you'))
    const openButton = screen.getByRole('button', { name: /Open a chest/ })
    fireEvent.click(openButton)
    fireEvent.click(openButton)
    await screen.findByRole('dialog')
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/open-chest'))).toHaveLength(1)
  })

  it('shows API errors and retries loading profiles', async () => {
    const { failNext, fetchMock } = createApi()
    failNext.set('GET api/profiles', { status: 503, body: { detail: 'Service unavailable' } })
    const user = userEvent.setup()
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toContain('Service unavailable')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Clover’s little corner')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => url === 'api/profiles')).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a failed chest request without granting a reward', async () => {
    const { failNext } = createApi()
    failNext.set('POST api/profiles/two/open-chest', { status: 409, body: { error: 'Chest is locked' } })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Clover’s little corner')
    await user.click(screen.getByRole('button', { name: /Blair/ }))
    await screen.findByText('Pebble’s little corner')
    await user.click(screen.getByRole('button', { name: /Open a chest/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Chest is locked')
    expect(screen.getByText(/chests waiting for you/).textContent).toContain('2 chests waiting for you')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
