import { useRef, useEffect } from 'react'

/**
 * Attach horizontal swipe detection to a container ref.
 * Works on iOS and Android via touch events.
 *
 * @param {string[]} tabs      - Ordered array of tab IDs
 * @param {string}   activeTab - Current active tab ID
 * @param {Function} setTab    - Setter to change the active tab
 * @returns {React.RefObject}  - Attach this ref to the container div
 *
 * Swipe threshold: 60px horizontal, with less than 80px vertical movement.
 * This avoids intercepting vertical scrolling.
 */
export function useSwipeTabs(tabs, activeTab, setTab) {
  const ref = useRef(null)
  const touchStart = useRef(null)
  // Keep a ref to current values so the event handlers are never stale
  const activeTabRef = useRef(activeTab)
  const setTabRef = useRef(setTab)

  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { setTabRef.current = setTab }, [setTab])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onTouchStart(e) {
      const t = e.touches[0]
      touchStart.current = { x: t.clientX, y: t.clientY }
    }

    function onTouchEnd(e) {
      if (!touchStart.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - touchStart.current.x
      const dy = t.clientY - touchStart.current.y
      touchStart.current = null

      // Only trigger on clearly horizontal swipes
      if (Math.abs(dx) < 60 || Math.abs(dy) > 80) return

      const idx = tabs.indexOf(activeTabRef.current)
      if (dx < 0 && idx < tabs.length - 1) {
        // Swipe left → next tab
        setTabRef.current(tabs[idx + 1])
      } else if (dx > 0 && idx > 0) {
        // Swipe right → previous tab
        setTabRef.current(tabs[idx - 1])
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  // Only run once on mount — activeTab/setTab are kept current via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
