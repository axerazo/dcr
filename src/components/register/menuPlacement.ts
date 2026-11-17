// ============================================================
// menuPlacement — pick whether a dropdown opens below or above its trigger
// #59: the status menu on the last rows overflowed the register's scroll
// container and grew the page. Pure so it can be unit-tested without layout.
// ============================================================

export type MenuPlacement = 'down' | 'up'

export interface MenuPlacementInput {
  /** Trigger's top edge (viewport px). */
  triggerTop: number
  /** Trigger's bottom edge (viewport px). */
  triggerBottom: number
  /** Rendered menu height (px). */
  menuHeight: number
  /** Top of the visible area: the scroll container's top, or the sticky header's bottom if lower. */
  containerTop: number
  /** Bottom of the scroll container's visible area (viewport px). */
  containerBottom: number
  /** Space between trigger and menu (px), e.g. Tailwind mt-1 / mb-1 = 4. */
  gap: number
}

/**
 * Opens downward whenever the menu fits below (today's behavior). Otherwise opens
 * upward if it fits above. If it fits on neither side, uses the side with more room.
 */
export function chooseMenuPlacement({
  triggerTop,
  triggerBottom,
  menuHeight,
  containerTop,
  containerBottom,
  gap,
}: MenuPlacementInput): MenuPlacement {
  const needed = menuHeight + gap
  const spaceBelow = containerBottom - triggerBottom
  const spaceAbove = triggerTop - containerTop

  if (spaceBelow >= needed) return 'down'
  if (spaceAbove >= needed) return 'up'
  return spaceAbove > spaceBelow ? 'up' : 'down'
}
