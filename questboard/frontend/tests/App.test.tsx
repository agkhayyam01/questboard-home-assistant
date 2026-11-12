import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

type Profile = { id: string; owner: string; species: string; name: string; color: string; chests: number }
type Item = { id: string; name: string; category: 'outfit' | 'toy'; rarity: string; emoji: string; owned: boolean; equipped: boolean; placed: boolean }
type Details = { profile: Profile; items: Item[] }

const initialDetails: Details[] = [
  {
    profile: { id: 'one / ?', owner: 'Avery', species: 'bunny', name: 'Clover', color: '#e7a5a2', chests: 0 },
    items: [
      { id: 'hat / 1', name: 'Cozy Hat', category: 'outfit', rarity: 'Common', emoji: '🎩', owned: true, equipped: false, placed: false },
      { id: 'ball', name: 'Bouncy Ball', category: 'toy', rarity: 'Rare', emoji: '⚽', owned: true, equipped: false, placed: false },
      { id: 'star', name: 'Lucky Star', category: 'toy', rarity: 'Rare', emoji: '⭐', owned: false, equipped: false, placed: false },
    ],
  },
  {
    profile: { id: 'two', owner: 'Blair', species: 'elephant', name: 'Pebble', color: '#91b5a2', chests: 2 },
    items: [{ id: 'kite', name: 'Blue Kite', category: 'toy', rarity: 'Common', emoji: '🪁', owned: true, equipped: false, placed: false }],
  },
]

function createApi() {
  const data = structuredClone(initialDetails)
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
    if (parts.length === 3 && method === 'GET') return Response.json(details)
    if (parts.length === 3 && method === 'PATCH') {
      Object.assign(details.profile, JSON.parse(String(init?.body)))
      return Response.json(details.profile)
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
  it('loads profiles and switches collections while resetting the filter', async () => {
    const { fetchMock } = createApi()
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Clover’s little corner')).toBeTruthy()
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

    await user.click(screen.getByRole('button', { name: /Equip/ }))
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
    expect(screen.getByText(/chests waiting for you/).textContent).toContain('0 chests waiting for you')
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/simulate-reward', { method: 'POST', headers: {} })
    expect(fetchMock).toHaveBeenCalledWith('api/profiles/one%20%2F%20%3F/open-chest', { method: 'POST', headers: {} })
    await user.click(within(dialog).getByRole('button', { name: /Lovely/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Lucky Star')).toBeTruthy()
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
