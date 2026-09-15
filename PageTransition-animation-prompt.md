# Page Transition Animation — Implementation Prompt

A universal, copy-paste-able prompt for adding animated page transitions (fade + slide on
route change) to **any** React + React Router SPA using Framer Motion. Hand this whole file
to an AI coding assistant in another project, or follow it manually — it's stack-agnostic
beyond the two libraries named below.

## Prerequisites

- React Router v6 or v7 (needs a layout route with `<Outlet />`)
- Framer Motion — either the `framer-motion` package or its newer `motion` package
  (`import { motion, AnimatePresence } from 'motion/react'` instead of `'framer-motion'`;
  the API is identical)

If neither is installed:
```bash
npm install motion
# or: npm install framer-motion
```

## The prompt

> Add animated page transitions to this app: each route's content should fade in + slide up
> on enter, and fade out + slide up on exit, when navigating between routes.
>
> 1. Create a `PageTransition` wrapper component that every page renders its own content
>    inside of:
>    ```tsx
>    // components/PageTransition.tsx
>    import { motion } from 'motion/react';
>    import type { ReactNode } from 'react';
>
>    export function PageTransition({ children }: { children: ReactNode }) {
>      return (
>        <motion.div
>          initial={{ opacity: 0, y: 10 }}
>          animate={{ opacity: 1, y: 0 }}
>          exit={{ opacity: 0, y: -10 }}
>          transition={{ duration: 0.3, ease: 'easeOut' }}
>        >
>          {children}
>        </motion.div>
>      );
>    }
>    ```
>    Wrap each page/route component's returned JSX in `<PageTransition>...</PageTransition>`.
>
> 2. **Critical step — do not skip this.** `exit` animations on a `motion.*` component only
>    play if that component is a *descendant of an `<AnimatePresence>`* whose direct child's
>    `key` changes when the route changes. Find the layout component that renders
>    `<Outlet />` (the shared shell around all routed pages — sidebar/navbar/etc.) and wrap
>    the `Outlet` itself, keyed by the current pathname:
>    ```tsx
>    import { Outlet, useLocation } from 'react-router-dom';
>    import { AnimatePresence } from 'motion/react';
>
>    export function AppLayout() {
>      const location = useLocation();
>      return (
>        <div className="layout">
>          {/* sidebar / navbar / etc. */}
>          <main>
>            <AnimatePresence mode="wait">
>              <Outlet key={location.pathname} />
>            </AnimatePresence>
>          </main>
>        </div>
>      );
>    }
>    ```
>    Without this wrapper, React Router unmounts the outgoing page's DOM **immediately** when
>    the route changes, before `AnimatePresence` (which doesn't exist yet) gets a chance to
>    defer that removal — so only the *enter* animation of the new page would ever be visible,
>    and `exit` would silently do nothing. This is the single most common way this feature
>    gets built "successfully" (it compiles, the new page fades in) while the exit half is
>    completely dead — verify it actually plays before considering this done.
>
> 3. Choose an `AnimatePresence` mode deliberately:
>    - `mode="wait"` (recommended default) — the old page's exit finishes fully before the
>      new page starts entering. No overlap; simplest to reason about.
>    - `mode="sync"` (the default if `mode` is omitted) — both animate simultaneously; can
>      look like a brief cross-fade but risks layout overlap if the two pages have very
>      different heights.
>    - `mode="popLayout"` — the exiting element is removed from layout flow immediately (so
>      it can't push other content around) while it still visually animates out; use this if
>      you see a layout jump/flash during the transition with `wait`/`sync`.
>
> 4. If routes are code-split with `React.lazy` + `Suspense`, put the `Suspense` boundary
>    *outside* this `AnimatePresence`/`Outlet` pair (e.g. wrapping the whole `<Routes>` tree),
>    not inside each page. Putting it outside means navigating to an already-loaded route
>    always goes through the exit/enter animation normally; only a route whose JS chunk is
>    still downloading will fall through to the Suspense fallback instead of animating (an
>    acceptable, inherent tradeoff of combining code-splitting with exit animations — don't
>    try to eliminate it by moving Suspense per-route, which just breaks step 2 instead).

## Verification checklist

- [ ] Navigating from page A to page B: page A visibly fades out + slides up for ~0.3s
      before/while page B fades in (depending on chosen `mode`) — not an instant swap.
- [ ] The `key={location.pathname}` is on the same element `AnimatePresence` directly renders
      (typically `<Outlet />` itself, not a wrapper `<div>` around it) — `AnimatePresence`
      only tracks its immediate children's identity.
- [ ] Only one `AnimatePresence` sits between the changing route content and the DOM — a
      second, unrelated `AnimatePresence` elsewhere in the same page (e.g. around a modal)
      is fine and independent, but don't nest one route-level `AnimatePresence` inside another.
- [ ] Rapid back-to-back navigation (double-click a nav link, or click a link mid-transition)
      doesn't leave the UI stuck mid-animation or with two pages visible at once — `mode="wait"`
      handles this correctly by default; test it explicitly if using `"sync"`.
