# PMS Web — Design System & Theme Specification

This document is the canonical reference for the PMS frontend design language. It covers the theme mechanism, color palette, typography, reusable UI components, layout shell, and helper utilities — all derived from the living source of truth in `ClientApp/`.

> **Source of truth:** `ClientApp/src/` — in particular `index.css` (tokens + global styles), `context/ThemeContext.tsx` (theme engine), `components/ui/`, `components/forms/`, `components/Layout/`, and `lib/utils.ts`.

---

## 1. Stack & Tooling

- **Framework:** React 19 + TypeScript ~5.8, Vite 6.
- **Styling:** TailwindCSS v4 (CSS-first config — **there is no `tailwind.config.js/ts`**). Dark mode is class-based, enabled with a custom variant in `index.css`.
- **Animation:** `motion` (framer-motion successor) for cards, modals, page transitions, skeletons.
- **Icons:** `lucide-react`.
- **Toasts:** `sonner`.
- **Selects:** `react-select` (wrapped in `VSelect`).
- **Path alias:** `@/*` → `ClientApp/` root. Use it instead of relative imports across directories.

---

## 2. Theme Mechanism (Dark / Light)

**Engine:** `ClientApp/src/context/ThemeContext.tsx`

- **Modes:** `'light' | 'dark' | 'system'` (default **`system`**).
- **Persistence:** `localStorage` key `pms-theme`.
- **Resolution:** a `.dark` class is toggled on `document.documentElement` whenever the resolved theme is dark. `resolvedTheme` follows the OS when mode is `system` (via `matchMedia('(prefers-color-scheme: dark)')`).
- **API:** `useTheme()` exposes `{ theme, setTheme, resolvedTheme, systemPrefersDark, toggleTheme }`.
- **Tailwind integration:** `index.css` defines `@custom-variant dark (&:where(.dark, .dark *));` so every component uses plain `dark:` utilities. **Never write a custom `[data-theme]` selector; always use `dark:` prefix.**
- **Transition:** `body` carries `transition-colors duration-300` for a smooth theme fade.

**Rules of engagement**
- Every surface that has a light value must supply a `dark:` equivalent (gray-50 surfaces → `dark:bg-gray-950`, white cards → `dark:bg-gray-950`, borders gray-100 → `dark:border-gray-900`, text gray-900 → `dark:text-white`).
- Forms/inputs: `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300`.

---

## 3. Color Palette & Theme Strategy

There are **no custom color tokens**. The palette is the **default Tailwind v4 scale** with **indigo as the brand/primary** and a fixed semantic vocabulary for task states. Two one-off near-black overrides exist for the app shell and chat.

### 3.1 Brand — Indigo
| Token | Usage |
|---|---|
| `indigo-600` | Primary buttons, links, focus rings, brand mark (`bg-indigo-600`) |
| `indigo-700` | Primary button hover |
| `indigo-50` / `indigo-950/40` | Info chips / code-labels (`text-indigo-600 dark:text-indigo-300`) |
| `indigo-500` | Focus ring (`focus:ring-2 ring-indigo-500`), active state dot |
| `#6366f1` | react-select primary (VSelect focus border, selected option) |

### 3.2 Task-status vocabulary (consistent everywhere)
| Status | Dot | Active chip | Idle chip |
|---|---|---|---|
| `new` | `gray` | gray | gray |
| `in-progress` | `indigo` | indigo | indigo |
| `paused` | `amber` | amber | amber |
| `blocked` | `red` | red | red |
| `under-review` | `purple` | purple | purple |
| `issues` | `orange` | orange | orange |
| `completed` | `emerald` | emerald | emerald |

Canonical source: `components/ui/TaskStatusActions.tsx` → `STATUS_STYLE` (dot / active / idle per status).

### 3.3 Surfaces & neutrals
| Surface | Light | Dark |
|---|---|---|
| App body | `bg-gray-50/50` (base), `bg-gray-50` (auth) | `bg-gray-950`; shell/Chat override `dark:bg-[#0d0d12]` |
| Cards | `bg-white`, border `gray-100` | `bg-gray-950`, border `gray-900` |
| Navbar | `bg-white/70 backdrop-blur-md` | `dark:bg-gray-950/70 backdrop-blur-md` |
| Sidebar | `bg-gray-50` | `dark:bg-gray-900` |
| Inputs | `bg-gray-50`, border `gray-200` | `dark:bg-gray-800`, border `dark:border-gray-700` |
| Muted text | `text-gray-500` | `text-gray-400` |
| Modal | `bg-white` | `dark:bg-gray-900` |

### 3.4 Semantic helpers
- Success **emerald**, warning **amber**, danger **rose/red**, info **sky/blue**, plus **purple** and **orange** accents for status dots, progress bars, and effort-time breakdowns (Reports/Diary).
- Danger (destructive actions) is `red-600`/`rose-*`; the danger Badge variant is `rose`.

### 3.5 Status-code to Badge mapping (`components/ui/Badge.tsx`)
`default` (gray) · `success` (emerald) · `warning` (amber) · `danger` (rose) · `info` (sky). Each is a bordered pill with a tinted `-50` bg and a translucent dark variant (`dark:bg-{c}-900/30 dark:text-{c}-400`).

---

## 4. Typography Stack

Fonts are loaded via Google Fonts `@import` in `index.css` and declared as Tailwind v4 `@theme` tokens:

```css
@theme {
  --font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;   /* body / UI */
  --font-display: "Outfit", sans-serif;                             /* headings */
  --font-mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace; /* codes, stats */
}
```

**Base styles (from `index.css` body rule):**
```
text-[13px] leading-tight text-gray-900 bg-gray-50/50 antialiased font-sans transition-colors duration-300
```

### 4.1 Type scale & usage patterns
The system is **micro-type heavy** — most text is `8–13px`.

| Size | Role |
|---|---|
| `text-[8px]` | timestamp/detail accents, disable-reason hints |
| `text-[9px]` | **micro-labels, badges, uppercase chips** (with `font-black tracking-widest`) |
| `text-[10px]` | status pills, chip labels, stat accents |
| `text-[11px]` | table metadata, field labels (`font-black uppercase tracking-widest`) |
| `text-[12px]` | default buttons (`font-bold uppercase tracking-tight`) |
| `text-[13px]` | **body base**, select text |
| `text-sm` / `text-lg` / `text-xl` | paragraphs, modal titles |
| `text-3xl` | page headers |

### 4.2 Weight strategy
House style is **aggressively bold** — `font-black` dominates headings, stats, badges and labels (`font-black` ≫ `font-bold` > `font-semibold` > `font-medium`). Headings additionally use `uppercase` and, for hero/page-header contexts, `italic`.

- **Micro-label / chip formula:** `text-[9px] font-black uppercase tracking-widest` (add `font-mono` for codes).
- **Buttons:** `font-bold uppercase tracking-tight`.
- **Stat numerals:** `font-mono font-black` (Dashboard stat cards, progress percentages).
- **Page header (PageHeader):** `text-3xl font-extrabold uppercase italic tracking-tight`.
- **Modal/QuickView headers:** `text-[18px] font-black uppercase tracking-tighter italic font-display leading-tight`.

### 4.3 Letter spacing
`tracking-widest` (labels/chips), `tracking-tight`/`tracking-tighter` (headings), and rare custom `tracking-[0.1em]` (QuickView) / `tracking-[0.2em]`/`tracking-[0.3em]` (Auth branding).

### 4.4 Radius & elevation
- **Radius:** `rounded-md`/`rounded-lg` for cards and controls; `rounded-xl` for QuickView/Chat panels; `rounded-2xl` for modals; `rounded-full` for pills, avatars, status dots.
- **Elevation:** mostly **flat, border-separated surfaces**. `shadow-sm` on cards/buttons, `shadow-2xl` on modals; `backdrop-blur-sm`/`backdrop-blur-md` on overlays/navbar.

### 4.5 Date / time / number formatting
- Display dates: `DD-MM-YYYY`; display datetime: `DD-MM-YYYY hh:mm AM/PM` (`lib/utils.ts`).
- Input dates: `YYYY-MM-DD` (`toInputDate`); masked inputs use `DD-MM-YYYY` (`DateInput`) and `HH:MM` (`TimeInput`).
- Hours: `toHHMM` decimal→`"hh:mm"` (2.5 → `"02:30"`), `fromHHMM` reverse; `formatSeconds` for durations (`45m`, `2h 05m`).

---

## 5. UI Components

Location: `ClientApp/src/components/ui/` (generic), `components/forms/` (inputs), `components/Layout/`, plus feature-specific panels.

### 5.1 Button — `ui/Button.tsx`
`forwardRef` component.
```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}
```
- **primary:** `bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm`
- **secondary:** `bg-white … border-gray-200` (dark: `dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700`)
- **outline:** transparent, `border-indigo-600 text-indigo-600 hover:bg-indigo-50`
- **ghost:** transparent gray, `hover:bg-gray-100`
- **danger:** `bg-red-600 text-white hover:bg-red-700`
- Sizes: `sm` `text-[11px]`, `md` `text-[12px] rounded-md`, `lg` `text-sm rounded-lg`, `icon` `p-1.5`.
- Shared: `border`, `transition-all`, `active:scale-95`, `focus:ring-2 focus:ring-indigo-500`, `disabled:opacity-50`, loading spinner (`Loader2`).
- Text is always `uppercase` + `font-bold` + `tracking-tight`.

### 5.2 Badge — `ui/Badge.tsx`
```ts
{ variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'; className?: string; } & SpanHTMLAttributes
```
Style: `px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest`. See §3.5 for the palette.

### 5.3 Card — `ui/Card.tsx`
`Card` (+ `CardHeader`, `CardContent`, `CardFooter`). Base: `bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-900 rounded-lg overflow-hidden shadow-sm transition-all`. The `animate` prop (default `true`) wraps content in a motion `opacity: 0 → 1, y: 10 → 0` entrance.
- `CardHeader`: `px-4 py-3 border-b border-gray-50 dark:border-gray-900`
- `CardContent`: `p-4`
- `CardFooter`: `px-4 py-2.5 border-t … bg-gray-50/30 dark:bg-gray-900/30`

### 5.4 Modal / Dialog — `ui/Modal.tsx`
```ts
{ isOpen: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }
```
- Backdrop: `fixed inset-0 bg-black/50 backdrop-blur-sm z-50`, closes on backdrop click.
- Panel: `max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60]`, entrance `scale .95 / y 20 → 1/0` via `AnimatePresence`; content `p-6 max-h-[80vh] overflow-y-auto`.
- **Accessibility:** ESC to close, close-button auto-focus on open, `role="dialog"` + `aria-modal` + `aria-labelledby`. Header: `text-xl font-bold`.

> There is no `ConfirmDialog` primitive — confirmation flows use **SweetAlert** (`SweetAlertContext`) or bespoke dialogs such as `ReassignModal` and `BlockIssueDialog` (amber-themed, session-once via `sessionStorage pms_blockissue_dialog_shown`).

### 5.5 Inputs & Form Controls — `components/forms/`
| Component | Notes |
|---|---|
| **VTextField** | Uncontrolled only. `{ label, placeholder, type, name, id, required, disabled }`. Label: `text-sm font-medium text-gray-700 dark:text-gray-300`, required star via `after:` pseudo. Input: `rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-700` |
| **VSelect** | `react-select` wrapper. `SelectOption {value, label}`; discriminated `single | multi`; `{ options, value, onChange, label, placeholder, disabled, isClearable, isSearchable, isMulti, className, size: 'sm'|'md' }`. **Dark-mode via hardcoded hexes** (menu `#111827`, control `#1f2937`, border `#374151`, text `#e5e7eb`, focus `#6366f1`, multi-tag indigo-tinted). Renders label as `text-[11px] font-black uppercase tracking-widest text-gray-400`. `menuPortalTarget={document.body}` + `menuPosition="fixed"` (z-index 9999) |
| **DateInput** | `{ name, value, defaultValue, onChange, className, required, placeholder, disabledDate, minDate }`; custom calendar rendered in a portal; masked `DD-MM-YYYY ⇄ YYYY-MM-DD` |
| **TimeInput** | masked `HH:MM` input |

**Note:** there are **no dedicated Textarea / Checkbox / Radio / Switch primitives** in `components/forms/`. These are implemented inline with native elements + Tailwind utilities where needed. When adding new ones, follow the VTextField label/input pattern and the shared focus state (`focus:border-indigo-500 focus:ring-indigo-500`, dark `dark:bg-gray-800 dark:border-gray-700`).

### 5.6 Feedback & States
| Component | Purpose |
|---|---|
| **GlobalLoader** (`ui/GlobalLoader.tsx`) | Full-screen overlay spinner; 250 ms delay; driven by `loadingBus` request counter |
| **LoadingSpinner** (`ui/LoadingSpinner.tsx`) | `size: 'sm'|'md'|'lg'` inline spinner |
| **EmptyState** (`ui/EmptyState.tsx`) | `{ icon, title, description, actionLabel, onAction }`; dashed-border `rounded-3xl` placeholder |
| **Skeletons/** | `DashboardSkeleton`, `SkeletonCard`, `SkeletonTaskItem`, `SkeletonText` — pulse animation |
| **Toaster** (`lib/toast.ts`) | `showSuccess/showError/showWarning/showInfo` over sonner `<Toaster/>` (top-right, ~4 s) |

### 5.7 Navigation & Interaction
| Component | Purpose |
|---|---|
| **PageHeader** (`ui/PageHeader.tsx`) | `{ title, description, children }`; actions slot on the right; `text-3xl font-extrabold uppercase italic tracking-tight` |
| **InteractiveLink** (`ui/InteractiveLink.tsx`) | `{ type: 'project'|'task'|'user', id }`; opens the QuickView overlay |
| **ProgressBar** (`ui/ProgressBar.tsx`) | `{ value, showLabel, variant: 'indigo'|'emerald'|'amber', size: 'sm'|'md' }` |
| **FileUploader** (`ui/FileUploader.tsx`) | `{ attachments, onAdd, onRemove, label, maxSizeMB }` |

### 5.8 Task-domain panels (`ui/`)
| Component | Props (abridged) |
|---|---|
| **TaskStatusActions** | Exports `ALLOWED_EDGES` (status machine), `HOURS_EXEMPT` (`new/paused/blocked/issues`), `STATUS_STYLE`. Renders current-status chip + enabled target buttons + hours prompt (indigo) + block-reason form (red). |
| **ChecklistPanel** | `{ taskId, items, currentUserId, isAssignee, canManage, isStarted, onStartTask, onItem* handlers, onMarkAllComplete }` |
| **ReviewChecklistPanel** | `{ taskId, items, taskStatus, isManager, isQa, isAssignee, onRefresh }` |
| **TaskAttachmentsPanel** | `{ taskId, attachments, onChange, disabled }` |
| **TaskBlockPanel** | `{ taskId, isBlocked, blockEntries, blockChecklistItems, currentUserId, isAssignee, isAdmin, canUnblock, onBlock/onUnblock/onResolveItem/onRemoveItem/onItemUpdated }` |
| **TaskEffortPanel** | `{ effort, loading }`; status → colored duration bars |
| **ReasonTagSelector** | `{ value, onChange, required, label, tags }`; wraps `VSelect` |
| **ReassignModal** | `{ isOpen, onClose, title, currentAssigneeId, availableUsers, reasonTags, onConfirm }` |

### 5.9 Feature components
- **Chat/** — `ChatSidebar`, `MessageBubble`, `MessageInput`, `MessageList`, `TypingIndicator`, `FilePreviewModal`.
- **QuickView/** — `QuickViewContainer`, `CommentSection` (overlay detail view, `rounded-xl`, `tracking-[0.1em]` header).
- **NotificationPopup**, **BlockIssueDialog**.

---

## 6. Layout & Application Shell

**Provider stack** (`src/App.tsx`, outermost → innermost): `ErrorBoundary` → `ThemeProvider` → `SweetAlertProvider` → `AuthProvider` → `DataProvider` → `QuickViewProvider` → `BrowserRouter` → `ChatProvider` → `<Toaster/>` → `<NotificationPopup/>` → `<Suspense>` (lazy pages) → `<Routes>`.

**Shell** — all authed routes render inside `<DashboardLayout>` (via `ProtectedRoute`):
- **DashboardLayout** (`Layout/DashboardLayout.tsx`): `min-h-screen bg-gray-50 dark:bg-[#0d0d12]`; collapsible sidebar (collapsed `lg:pl-16`, expanded `lg:pl-56`); mobile overlay backdrop; `<main className="flex-1 pt-16 p-4 lg:p-6 custom-scrollbar">`. Renders `QuickViewContainer` globally.
- **Navbar** (`Layout/Navbar.tsx`): `fixed top-0 h-14`, `backdrop-blur-md`, offset syncs with sidebar; contains theme toggle (Sun/Moon), notification dropdown (`NotificationDropdown.tsx`), user menu.
- **Sidebar** (`Layout/Sidebar.tsx`): permission-filtered nav (Dashboard, Projects, Tasks, Reports, Users, Roles, Chat, Work Diary); brand `PMS.` = `font-display italic font-bold text-indigo-600 tracking-tight`.
- **PageTransition** (`Layout/PageTransition.tsx`): motion opacity + y fade (0.3 s easeOut) on route change.
- **ImpersonationBanner** (`DashboardLayout.tsx`): `fixed top-0 z-[100] bg-amber-400 dark:bg-amber-500`, shifts content with `pt-9`.
- **Auth page:** full-screen split-panel `min-h-screen bg-gray-50 dark:bg-gray-950` with heavy `tracking-[0.2em]`/`[0.3em]` branding.

---

## 7. Helpers & Design Utilities

### 7.1 `lib/utils.ts` (de-facto styling utilities)
- `cn(...inputs)` — **clsx + tailwind-merge**; the standard className combiner. Use it whenever composing conditional class strings.
- `formatDate` (→ `DD-MM-YYYY`), `formatDateTime` (→ `DD-MM-YYYY hh:mm AM/PM`), `toInputDate` (→ `YYYY-MM-DD`).
- `copyToClipboard`, `formatSeconds`, `toHHMM`, `fromHHMM`.

### 7.2 Other lib helpers
| Module | Purpose |
|---|---|
| `lib/toast.ts` | `showSuccess/showError/showWarning/showInfo` (sonner) |
| `lib/loadingBus.ts` | counter-based in-flight request tracker → `GlobalLoader` |
| `lib/api.ts` | `apiRequest<T>()` — attaches JWT (`localStorage.pms_token`), unwraps `ApiResponse<T>`, refresh rotation, 403 toasts, feeds `loadingBus` |
| `lib/dateRanges.ts` | `PeriodKey` / `PERIOD_OPTIONS` / `resolvePeriod` for diary ranges |
| `lib/diaryDateUtils.ts` | work-week rules (Sundays + 2nd/4th Saturdays off) mirroring backend |
| `lib/validation.ts` | `validateRequired/validateName/validateUsername/validateEmail/validateContact` |
| `lib/importExport.ts` | CSV export/import (projects, tasks, samples) |

### 7.3 Hooks (`src/hooks/`)
`useDebounce`, `useThrottle`, `useLocalStorage`, `useSessionStorage`, `usePreferredDark`, `useWindowSize`, `usePermissions` (view/create/update/delete bitmap), `useAvailability`, `usePushNotifications`.

### 7.4 Global CSS utilities (`index.css`)
- `.scrollbar-hide` — hide scrollbars (WebKit/IE/Firefox).
- `.custom-scrollbar` — 4 px scrollbar, thumb `bg-gray-200 dark:bg-gray-800`, hover `dark:bg-gray-700`.
- `@custom-variant dark` — class-based dark mode (do not remove).

---

## 8. Conventions Checklist

1. **Compose classes with `cn()`** from `lib/utils`; never concatenate raw strings for conditional styles.
2. **Always provide `dark:` variants** for every surface/text/border you introduce.
3. **Use the indigo primary** for primary actions; reserve red/rose for destructive, emerald for success, amber for warnings/paused/impersonation, purple for review, orange for issues.
4. **Match the micro-type voice:** `font-black uppercase tracking-widest` for labels/chips, `font-bold uppercase tracking-tight` for buttons, `font-mono font-black` for numeric stats, `font-display italic uppercase` for hero headings.
5. **Prefer existing primitives** (`Button`, `Badge`, `Card`, `Modal`, `PageHeader`, `VTextField`, `VSelect`, `EmptyState`, `Skeleton*`, `ProgressBar`) over bespoke markup.
6. **No Tailwind config file exists** — do not create one. Tokens live in `@theme` in `index.css`; color tokens must come from the default palette.
7. **Don't hardcode theme colors** — always via Tailwind utilities so both themes stay consistent. (Known exception: `VSelect`'s react-select hex map, and the two `dark:bg-[#0d0d12]` shell overrides.)
8. **Date display** uses `DD-MM-YYYY`; inputs use `YYYY-MM-DD`; hours use `HH:MM` — reuse the `lib/utils.ts` helpers.
9. **Motion:** entrance animations follow the established pattern (opacity + small y, easeOut, ~0.3 s); modals scale `.95 → 1`.

---

## 9. Known Idiosyncrasies & Technical Notes

- **No design token layer** — colors/radii are raw Tailwind utilities. Only fonts are declared as `@theme` tokens.
- **react-select dark mode** is a hardcoded hex map in `VSelect.buildStyles/buildTheme` — the only place theme colors are duplicated.
- **One-off dark override** `dark:bg-[#0d0d12]` appears in `DashboardLayout.tsx` and `Chat.tsx` (near-black, slightly cooler than `gray-950`).
- **Buttons are always uppercase** — even in dialogs; avoid lowercase CTA copy.
- **Micro-text at `8–10px`** is intentional and pervasive (badges, timestamps, stats, codes); don't "fix" it to larger sizes without a deliberate design decision.
- The app is **mobile-aware** (`lg:` breakpoints, mobile menu overlay, `sm:`/`lg:` content padding) but is primarily a desktop-first, dense "pro dashboard" UI.
