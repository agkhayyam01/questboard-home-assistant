import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FridayBunnyPrototype from '../src/FridayBunnyPrototype'

const requiredAssets = [
  'assets/prototype/friday/IMG_1359.jpeg',
  'assets/prototype/friday/01_original_three_animal_reference.jpg',
  'assets/prototype/friday/Questboard_G2_Bunny_Hopping_Preview.gif',
]

const strokePoints = [
  { start: { x: 18, y: 20 }, end: { x: 48, y: 12 } },
  { start: { x: 38, y: 24 }, end: { x: 74, y: 38 } },
  { start: { x: 52, y: 46 }, end: { x: 36, y: 70 } },
  { start: { x: 40, y: 72 }, end: { x: 52, y: 88 } },
]

const mockAssetFetch = (missing: string[] = []) => {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const path = String(input)
    const matchedAsset = requiredAssets.find(asset => path.endsWith(asset))
    if (matchedAsset) {
      return new Response('', {
        status: missing.includes(matchedAsset) ? 404 : 200,
        headers: missing.includes(matchedAsset) ? { 'Content-Type': 'text/html' } : { 'Content-Type': 'image/jpeg' },
      })
    }
    return new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } })
  }))
}

beforeEach(() => {
  mockAssetFetch()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Friday Bunny prototype', () => {
  it('reports precisely which required source files are missing', async () => {
    mockAssetFetch([
      'assets/prototype/friday/IMG_1359.jpeg',
      'assets/prototype/friday/Questboard_G2_Bunny_Hopping_Preview.gif',
    ])
    render(<FridayBunnyPrototype />)
    const blocker = await screen.findByRole('alert')

    expect(blocker.textContent).toContain('assets/prototype/friday/IMG_1359.jpeg')
    expect(blocker.textContent).toContain('assets/prototype/friday/Questboard_G2_Bunny_Hopping_Preview.gif')
    expect((screen.getByRole('button', { name: 'Begin Friday chapter' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('runs the flow with retry-safe hold and idempotent journal save', async () => {
    render(<FridayBunnyPrototype />)

    await waitFor(() => expect(screen.getByTestId('bunny-master-linework')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Begin Friday chapter' }))

    const canvas = screen.getByRole('group', { name: 'Guided stroke canvas' })
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100,
      toJSON: () => ({}),
    })

    for (const stroke of strokePoints) {
      fireEvent.pointerDown(canvas, { pointerId: 10, clientX: stroke.start.x, clientY: stroke.start.y })
      fireEvent.pointerMove(canvas, { pointerId: 10, clientX: stroke.end.x, clientY: stroke.end.y })
      fireEvent.pointerUp(canvas, { pointerId: 10, clientX: stroke.end.x, clientY: stroke.end.y })
    }

    expect(screen.getByText('Checkpoint resume: 4/4 strokes complete')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal watercolor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reveal finishing details' }))

    const chest = screen.getByRole('button', { name: 'Hold Bunny chest' })
    fireEvent.pointerDown(chest, { pointerId: 1 })
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 450)) })
    fireEvent.pointerUp(chest, { pointerId: 1 })
    expect(screen.getByText(/Hold ended early/)).toBeTruthy()

    fireEvent.pointerDown(chest, { pointerId: 1 })
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 1200)) })
    expect(screen.getByText(/First breath complete/)).toBeTruthy()

    const destination = screen.getByRole('button', { name: 'Follow the faint destination' })
    fireEvent.click(destination)
    expect((destination as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 2100)) })
    expect(screen.getByTestId('bunny-hopping-preview')).toBeTruthy()

    const save = screen.getByRole('button', { name: 'Save Bunny and Wildflower Garden page' })
    fireEvent.click(save)
    expect(screen.getByText('Journal pages saved: 1')).toBeTruthy()
    fireEvent.click(save)
    expect(screen.getByText('Journal pages saved: 1')).toBeTruthy()
    expect(screen.getByLabelText('Journal book icon')).toBeTruthy()
  }, 12000)

  it('supports keyboard-only progression for guided controls and chest hold', async () => {
    render(<FridayBunnyPrototype />)
    await waitFor(() => expect(screen.getByTestId('bunny-master-linework')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Begin Friday chapter' }))
    const completeStroke = screen.getByRole('button', { name: 'Complete guided stroke' })
    fireEvent.click(completeStroke)
    fireEvent.click(completeStroke)
    fireEvent.click(completeStroke)
    fireEvent.click(completeStroke)
    expect(screen.getByText('Checkpoint resume: 4/4 strokes complete')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reveal watercolor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reveal finishing details' }))

    const chest = screen.getByRole('button', { name: 'Hold Bunny chest' })
    fireEvent.keyDown(chest, { key: ' ', code: 'Space' })
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 450)) })
    fireEvent.keyUp(chest, { key: ' ', code: 'Space' })
    expect(screen.getByText(/Hold ended early/)).toBeTruthy()

    fireEvent.keyDown(chest, { key: 'Enter', code: 'Enter' })
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 1200)) })
    fireEvent.keyUp(chest, { key: 'Enter', code: 'Enter' })
    expect(screen.getByText(/First breath complete/)).toBeTruthy()
  }, 10000)

  it('resumes saved checkpoint after refresh', async () => {
    window.localStorage.setItem('questboard.friday_bunny_prototype.v1', JSON.stringify({
      started: true,
      strokesDone: 4,
      watercolorRevealed: true,
      detailRevealed: true,
      awakened: true,
      journeyDone: true,
      journalSaved: true,
      journalCount: 3,
    }))

    render(<FridayBunnyPrototype />)
    await waitFor(() => expect(screen.getByTestId('bunny-master-linework')).toBeTruthy())
    expect(screen.getByText('Checkpoint resume: Journal saved')).toBeTruthy()
    expect(screen.getByText('Journal pages saved: 1')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Begin Friday chapter' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
