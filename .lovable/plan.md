

## Problem

The backdrop approach (fixed inset-0 at z-10) is not reliably closing the filter/AI panels when clicking empty areas. The toolbar sits at z-20 above the backdrop, so clicks within the toolbar area (including the empty spacer) bypass the backdrop entirely. The `onMouseDown` on the spacer div may also not fire reliably due to event propagation or the div having no visible content.

## Solution

Replace the backdrop + spacer approach with a single global `mousedown` listener using `useEffect` + `useRef`. The ref wraps **only** the interactive toolbar buttons and the open panels. Any click outside that ref closes both panels.

### Changes in `src/pages/FunisPage.tsx`

1. **Add a `useRef`** on a wrapper `div` that contains only the filter button, AI button, and their respective panels (NOT the toggle or funnel selector — those are unrelated).

2. **Add a `useEffect`** that listens for `mousedown` on `document`. If the click target is outside the ref, call `closePanels()`. Only active when `filtersOpen || aiOpen`.

3. **Remove** the fixed backdrop div (`<div className="fixed inset-0 z-10" ...>`).

4. **Remove** the `onMouseDown={closePanels}` from the `flex-1` spacer div and the `z-10`/`z-20` classes since they're no longer needed.

5. **Add `useRef` import** if not already present.

This is a standard "click outside to close" pattern that works reliably regardless of layout or z-index.

