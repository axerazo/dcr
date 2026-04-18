// ============================================================
// AutocompleteInput — input field with history-based dropdown.
//
// Keyboard contract:
//   ArrowDown / ArrowUp  — navigate suggestions
//   Enter / Tab (item highlighted) — call onAccept(value); parent
//     fills the field and advances focus as if the user finished typing
//   Escape (dropdown open) — dismiss dropdown, keep typed text
//   All other keys  — pass through to caller's onKeyDown
//
// Dropdown positioning:
//   On each open, measures available space above and below the
//   input, accounting for the sticky footer (48px) and sticky
//   header. Opens upward when below-space < dropdownMaxHeight
//   AND above-space > below-space. Applies maxHeight + internal
//   scroll so suggestions are always reachable.
//
// The ref is forwarded to the underlying <input> element so
// callers can programmatically focus the field.
// ============================================================

import { useState, useRef, useEffect, forwardRef } from 'react'

// Layout constants — must stay in sync with the app shell.
const FOOTER_HEIGHT  = 48   // sticky month-nav tab bar
const DROPDOWN_MAX   = 220  // 5 items × ~44px
const BUFFER         = 8    // gap between field edge and dropdown

interface AutocompleteInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Current suggestion list from useSuggestions hook */
  suggestions: string[]
  /**
   * Called when the user confirms a suggestion (Enter or Tab while an item
   * is highlighted).  The parent is responsible for:
   *   1. Setting the field value to `value`
   *   2. Advancing focus to the next field (same as normal Tab/Enter)
   */
  onAccept: (value: string) => void
  /** Caller's own keyDown handler — invoked when the dropdown does NOT consume the key */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export const AutocompleteInput = forwardRef<HTMLInputElement, AutocompleteInputProps>(
  function AutocompleteInput(
    { suggestions, onAccept, onKeyDown, value, className, ...rest },
    ref,
  ) {
    const [activeIdx, setActiveIdx] = useState(-1)
    const [isOpen,    setIsOpen]    = useState(false)
    const [upward,    setUpward]    = useState(false)
    const [maxH,      setMaxH]      = useState(DROPDOWN_MAX)

    const containerRef = useRef<HTMLDivElement>(null)

    // Open/close and compute direction whenever the suggestion list changes.
    // Runs inside useEffect (post-paint) so getBoundingClientRect is accurate
    // and the dropdown never flickers into the wrong position first.
    useEffect(() => {
      if (suggestions.length === 0) {
        setIsOpen(false)
        setActiveIdx(-1)
        return
      }

      // Measure available space relative to the container (= the input wrapper)
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const spaceBelow = window.innerHeight - FOOTER_HEIGHT - rect.bottom - BUFFER
        const spaceAbove = rect.top - BUFFER

        const shouldOpenUpward = spaceBelow < DROPDOWN_MAX && spaceAbove > spaceBelow
        setUpward(shouldOpenUpward)
        setMaxH(Math.max(
          60, // never collapse so small that nothing is visible
          Math.min(DROPDOWN_MAX, shouldOpenUpward ? spaceAbove : spaceBelow),
        ))
      } else {
        // Container not yet mounted (shouldn't happen) — safe defaults
        setUpward(false)
        setMaxH(DROPDOWN_MAX)
      }

      setIsOpen(true)
      setActiveIdx(-1)
    }, [suggestions])

    // Click outside → close without selecting
    useEffect(() => {
      if (!isOpen) return
      function onOutsideClick(e: MouseEvent) {
        if (!containerRef.current?.contains(e.target as Node)) {
          setIsOpen(false)
          setActiveIdx(-1)
        }
      }
      document.addEventListener('mousedown', onOutsideClick)
      return () => document.removeEventListener('mousedown', onOutsideClick)
    }, [isOpen])

    function accept(val: string) {
      setIsOpen(false)
      setActiveIdx(-1)
      onAccept(val)
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveIdx((i) => Math.max(i - 1, -1))
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setIsOpen(false)
          setActiveIdx(-1)
          return
        }
        // Enter or Tab with a highlighted item — accept the suggestion
        if (activeIdx >= 0 && (e.key === 'Enter' || e.key === 'Tab')) {
          e.preventDefault()
          accept(suggestions[activeIdx])
          return
        }
      }

      // Not consumed by dropdown — delegate to caller
      onKeyDown?.(e)
    }

    // Render the suggestion text with the typed prefix bolded
    function renderText(text: string) {
      const typed   = typeof value === 'string' ? value : ''
      const display = text.length > 50 ? text.slice(0, 50) + '…' : text

      if (typed.length === 0 || !text.toLowerCase().startsWith(typed.toLowerCase())) {
        return <span>{display}</span>
      }
      const bold = display.slice(0, typed.length)
      const tail = display.slice(typed.length)
      return (
        <span>
          <strong className="font-semibold">{bold}</strong>
          {tail}
        </span>
      )
    }

    // Tailwind classes for dropdown direction
    const directionCls = upward
      ? 'bottom-full mb-px'   // opens above the input
      : 'top-full mt-px'      // opens below the input (default)

    return (
      <div ref={containerRef} className="relative w-full">
        <input
          ref={ref}
          value={value}
          onKeyDown={handleKeyDown}
          onBlur={() => { setIsOpen(false); setActiveIdx(-1) }}
          className={className}
          {...rest}
        />

        {isOpen && suggestions.length > 0 && (
          <ul
            role="listbox"
            style={{ maxHeight: maxH, overflowY: 'auto' }}
            className={`absolute left-0 z-50 w-full min-w-[180px] bg-white border border-slate-200 rounded-md shadow-lg py-0.5 text-xs ${directionCls}`}
          >
            {suggestions.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={i === activeIdx}
                // mousedown fires before blur so the dropdown stays open long enough
                onMouseDown={(e) => { e.preventDefault(); accept(s) }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`
                  px-2.5 py-1.5 cursor-pointer truncate select-none
                  ${i === activeIdx
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                  }
                `}
              >
                {renderText(s)}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
)
