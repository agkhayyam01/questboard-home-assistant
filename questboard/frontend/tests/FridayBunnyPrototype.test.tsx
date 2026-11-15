import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FridayBunnyPrototype from '../src/FridayBunnyPrototype'

const strokePoints = [
  { start: { x: 18, y: 20 }, end: { x: 48, y: 12 } },
  { start: { x: 38, y: 24 }, end: { x: 74, y: 38 } },
  { start: { x: 52, y: 46 }, end: { x: 36, y: 70 } },
  { start: { x: 40, y: 72 }, end: { x: 52, y: 88 } },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Friday Bunny prototype', () => {
  it('runs the flow with retry-safe hold and idempotent journal save', async () => {
    render(<FridayBunnyPrototype />)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('IMG_1359.jpeg'))
    fireEvent.click(screen.getByRole('button', { name: 'Begin Friday chapter' }))

    const canvas = screen.getByRole('application', { name: 'Guided stroke canvas' })
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

    const save = screen.getByRole('button', { name: 'Save Bunny and Wildflower Garden page' })
    fireEvent.click(save)
    expect(screen.getByText('Journal pages saved: 1')).toBeTruthy()
    fireEvent.click(save)
    expect(screen.getByText('Journal pages saved: 1')).toBeTruthy()
    expect(screen.getByLabelText('Journal book icon')).toBeTruthy()
  }, 12000)

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
    expect(screen.getByText('Checkpoint resume: Journal saved')).toBeTruthy()
    expect(screen.getByText('Journal pages saved: 1')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Begin Friday chapter' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
