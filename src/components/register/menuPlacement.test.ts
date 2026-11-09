import { describe, it, expect } from 'vitest'
import { chooseMenuPlacement, type MenuPlacementInput } from './menuPlacement'

// Container visible area 100–600, menu 200 tall, 4px gap → needs 204px on a side.
const base: MenuPlacementInput = {
  triggerTop: 200,
  triggerBottom: 232,
  menuHeight: 200,
  containerTop: 100,
  containerBottom: 600,
  gap: 4,
}

describe('chooseMenuPlacement (#59)', () => {
  it('opens downward when the menu fits below (unchanged behavior)', () => {
    expect(chooseMenuPlacement(base)).toBe('down')
  })

  it('opens upward on a row near the bottom of the container', () => {
    expect(chooseMenuPlacement({ ...base, triggerTop: 540, triggerBottom: 572 })).toBe('up')
  })

  it('opens downward on an exact fit below', () => {
    // spaceBelow = 600 - 396 = 204 = needed
    expect(chooseMenuPlacement({ ...base, triggerTop: 364, triggerBottom: 396 })).toBe('down')
  })

  it('opens upward when 1px short below and room above', () => {
    expect(chooseMenuPlacement({ ...base, triggerTop: 365, triggerBottom: 397 })).toBe('up')
  })

  it('counts the sticky header: no room above it means the side with more room', () => {
    // Header bottom at 300: above = 340 - 300 = 40, below = 600 - 372 = 228 → fits below
    expect(
      chooseMenuPlacement({ ...base, containerTop: 300, triggerTop: 340, triggerBottom: 372 }),
    ).toBe('down')
    // Short container 300–450: above = 80, below = 38 → neither fits, above has more
    expect(
      chooseMenuPlacement({
        ...base, containerTop: 300, containerBottom: 450, triggerTop: 380, triggerBottom: 412,
      }),
    ).toBe('up')
  })

  it('falls back downward when neither side fits and below has more room', () => {
    expect(
      chooseMenuPlacement({
        ...base, containerTop: 300, containerBottom: 450, triggerTop: 320, triggerBottom: 352,
      }),
    ).toBe('down')
  })
})
