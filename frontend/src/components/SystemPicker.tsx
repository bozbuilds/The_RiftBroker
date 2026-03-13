import { useEffect, useMemo, useRef, useState } from 'react'

import type { GalaxySystem } from '../lib/galaxy-data'

// ─── Pure utilities (exported for testing) ──────────────────────────────────

/**
 * Filter galaxy systems by name using case-insensitive substring match.
 * Returns up to `max` results. Empty / whitespace-only query returns [].
 */
export function filterSystems(
  systems: readonly GalaxySystem[],
  query: string,
  max: number,
): GalaxySystem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const results: GalaxySystem[] = []
  for (const s of systems) {
    if (s.name.toLowerCase().includes(q)) {
      results.push(s)
      if (results.length >= max) break
    }
  }
  return results
}

/**
 * Split `text` into three segments: before match, the match itself, after match.
 * Case-insensitive; preserves original casing in output.
 * Returns { before: text, match: '', after: '' } when no match.
 */
export function highlightMatch(
  text: string,
  query: string,
): { before: string; match: string; after: string } {
  const q = query.trim()
  if (!q) return { before: text, match: '', after: '' }

  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return { before: text, match: '', after: '' }

  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length),
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const MAX_RESULTS = 20
const DEBOUNCE_MS = 150

interface SystemPickerProps {
  readonly systems: readonly GalaxySystem[]
  readonly value: bigint | null
  readonly onChange: (id: bigint | null) => void
  readonly label: string
  readonly required?: boolean
}

export function SystemPicker({
  systems,
  value,
  onChange,
  label,
  required,
}: SystemPickerProps) {
  const [inputText, setInputText] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const systemById = useMemo(
    () => new Map(systems.map((s) => [s.id, s])),
    [systems],
  )

  // Sync input text when value is set externally (e.g. form reset)
  useEffect(() => {
    if (value === null) {
      setInputText('')
    } else {
      const sys = systemById.get(value)
      if (sys) setInputText(sys.name)
    }
  }, [value, systemById])

  // Debounce filtering
  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputText), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [inputText])

  // Outside-click closes dropdown
  useEffect(() => {
    function handleMousedown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handleMousedown)
    return () => document.removeEventListener('mousedown', handleMousedown)
  }, [])

  const results = useMemo(
    () => filterSystems(systems, query, MAX_RESULTS),
    [systems, query],
  )

  function selectSystem(sys: GalaxySystem) {
    onChange(sys.id)
    setInputText(sys.name)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputText(e.target.value)
    setOpen(true)
    setActiveIndex(-1)
    // Clear selection when user starts editing
    if (value !== null) onChange(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setInputText('')
      onChange(null)
      e.preventDefault()
      return
    }
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); e.preventDefault() }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((i) => Math.min(i + 1, results.length - 1))
        e.preventDefault()
        break
      case 'ArrowUp':
        setActiveIndex((i) => Math.max(i - 1, 0))
        e.preventDefault()
        break
      case 'Enter':
        if (activeIndex >= 0 && results[activeIndex]) {
          selectSystem(results[activeIndex])
          e.preventDefault()
        }
        break
    }
  }

  // Show dropdown when there's a query with results or explicit no-match
  const showDropdown = open && query.trim().length > 0

  return (
    <div className="form-group system-picker" ref={containerRef}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type="text"
        value={inputText}
        onChange={handleInputChange}
        onFocus={() => { if (query) setOpen(true) }}
        onKeyDown={handleKeyDown}
        placeholder="Search system name..."
        required={required && value === null}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      />

      {showDropdown && (
        <ul
          ref={listRef}
          className="system-picker-results"
          role="listbox"
        >
          {results.length === 0 ? (
            <li className="system-picker-empty">No systems found</li>
          ) : (
            results.map((sys, i) => {
              const { before, match, after } = highlightMatch(sys.name, query)
              return (
                <li
                  key={sys.id.toString()}
                  className={`system-picker-option${i === activeIndex ? ' active' : ''}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault() // Prevent blur before click registers
                    selectSystem(sys)
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className="system-picker-name">
                    {before}
                    {match && <strong>{match}</strong>}
                    {after}
                  </span>
                  <span className="system-picker-region">{sys.region}</span>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
