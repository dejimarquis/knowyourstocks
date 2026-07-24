import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves the investment thesis in the current browser', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('What do you believe?'), {
      target: { value: 'I prefer durable cash flow and a long time horizon.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save thesis' }))

    const savedThesis = window.localStorage.getItem('knowyourstocks.thesis')

    expect(savedThesis).toContain('durable cash flow')
    expect(screen.getByText(/Saved in this browser at/)).toBeInTheDocument()
  })

  it('does not present sample prices while provider setup is pending', () => {
    render(<App />)

    expect(screen.getByText('Your next search uses this lens.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Research' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('surfaces damaged browser data instead of silently deleting it', () => {
    window.localStorage.setItem('knowyourstocks.thesis', '{bad json')

    render(<App />)

    expect(
      screen.getByText(/Your saved thesis could not be read/),
    ).toBeInTheDocument()
  })

  it('navigates to the manual Discover surface without spending on load', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Discover' }))

    expect(
      screen.getByRole('heading', {
        name: 'Find the next company to research.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Discover is locked.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh ideas' })).toBeDisabled()
  })
})
