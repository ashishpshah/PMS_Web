# Task Status Change Form Redesign - Implementation Plan

## 🎯 Goal
Replace the dropdown-based status selector with visual action cards, add workflow timeline, smart hours input with presets, and improve block reason UX — all while maintaining backward compatibility with existing prop interfaces.

---

## 📦 Phase 1: Foundation & Shared Utilities (Low Risk)

### 1.1 Add Frontend `deriveActionName` Mirror (`src/lib/statusActions.ts`)
- **New file**: Pure functions mirroring backend's `DeriveActionName`
- **Exports**: `getActionName(from, to)`, `getActionDescription(from, to)`
- **Purpose**: Consistent action labels ("Start Work", "Submit for Review") without backend round-trip

### 1.2 Extract Shared `BlockReasonForm` Component (`src/components/ui/BlockReasonForm.tsx`)
- **Extract from**: `TaskStatusActions.tsx` (lines 236-321) + `Tasks.tsx` `BlockItemsModal` (lines 2952-3064)
- **Props**: `items`, `hoursInput`, `onChange`, `onConfirm`, `onCancel`, `saving`, `maxHours`
- **Replaces**: Duplicate logic in 2 places

### 1.3 Add Workflow Order Constant (`src/types/index.ts`)
```ts
export const WORKFLOW_ORDER: Status[] = ['new', 'in-progress', 'paused', 'blocked', 'under-review', 'issues', 'completed'];
```

---

## 📦 Phase 2: Core Component Redesign (Main Work)

### 2.1 Create `StatusActionCard` Component (`src/components/ui/StatusActionCard.tsx`)
- **Props**: `status`, `actionName`, `requiresHours`, `disabled`, `disableReason`, `selected`, `onClick`, `icon`
- **Visual**: Colored border matching status, icon, action label, hours badge, disabled overlay with tooltip
- **Accessibility**: `role="radio"`, `aria-checked`, `aria-describedby` for disable reason

### 2.2 Create `WorkflowTimeline` Component (`src/components/ui/WorkflowTimeline.tsx`)
- **Props**: `currentStatus`, `allowedNextStatuses[]`
- **Visual**: Horizontal connected dots, current highlighted with pulse, allowed next with subtle glow
- **Responsive**: Collapses to vertical on mobile (< 640px)

### 2.3 Create `SmartTimeInput` Wrapper (`src/components/ui/SmartTimeInput.tsx`)
- **Wraps**: Existing `TimeInput` + preset buttons (1h, 2h, 4h, 8h)
- **Props**: `value`, `onChange`, `maxHours`, `required`, `presets?`
- **Features**: Real-time validation message, preset click fills input

### 2.4 Refactor `TaskStatusActions.tsx` (Main Component)

**New Structure:**
```tsx
export function TaskStatusActions(props) {
  // State (same)
  // Computed (same)
  
  return (
    <div className="space-y-4">
      {/* 1. Current Status Badge + Workflow Timeline */}
      <WorkflowTimeline currentStatus={currentStatus} allowedNext={targets} />
      
      {/* 2. Action Cards Grid */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {targets.map(to => (
          <StatusActionCard
            key={to}
            status={to}
            actionName={getActionName(currentStatus, to)}
            requiresHours={requiresHours}
            disabled={!!disableReason}
            disableReason={disableReason}
            selected={selectedNextStatus === to}
            onClick={() => handleStatusSelect(to)}
          />
        ))}
      </div>
      
      {/* 3. Hours Input (conditional) */}
      {selectedNextStatus && requiresHours && (
        <SmartTimeInput
          value={hoursInput}
          onChange={setHoursInput}
          required
          maxHours={MAX_HOURS_PER_ENTRY}
        />
      )}
      
      {/* 4. Block Form (if blocked selected) */}
      {selectedNextStatus === 'blocked' && blockOpen && (
        <BlockReasonForm ... />
      )}
      
      {/* 5. Confirm/Cancel Actions */}
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" onClick={handleClear}>Cancel</Button>
        <Button onClick={handleConfirm} disabled={saving || !canConfirm}>
          {saving ? '...' : 'Confirm'}
        </Button>
      </div>
    </div>
  )
}
```

---

## 📦 Phase 3: Modal Integration (Consumers)

### 3.1 Update `TaskStatusMenuModal` (`Tasks.tsx` lines 3141-3175)
- **Change**: Pass through new props, ensure modal width accommodates card grid (`max-w-lg` → `max-w-2xl`)
- **No logic changes** — wraps same `TaskStatusActions`

### 3.2 Update `QuickViewContainer.tsx` (line 561)
- **Verify**: Works in side-panel context (may need responsive grid: `grid-cols-1 sm:grid-cols-2`)

### 3.3 Replace `BlockItemsModal` & `HoursPromptModal` (`Tasks.tsx`)
- **BlockItemsModal** → Use `BlockReasonForm` in a modal wrapper
- **HoursPromptModal** → Use `SmartTimeInput` in a modal wrapper
- **Result**: ~150 lines removed, consistent UX

---

## 📦 Phase 4: Polish & Edge Cases

### 4.1 Keyboard Navigation
- Arrow keys between action cards
- `Enter` to select, `Escape` to clear
- Number keys 1-5 for quick select (max 5 visible)

### 4.2 Loading States
- Per-card skeleton while fetching transitions (though cached)
- Button spinner on confirm

### 4.3 Mobile Bottom Sheet (Optional)
- Replace centered modal with `fixed bottom-0` sheet on `< 640px`
- Use `framer-motion` for slide-up animation

### 4.4 Tooltip System
- Reuse or add lightweight tooltip for disable reasons on hover/focus
- Position: top-center, offset 8px

---

## 📁 Files to Create/Modify

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/lib/statusActions.ts` | **CREATE** | ~50 |
| `src/components/ui/BlockReasonForm.tsx` | **CREATE** | ~120 |
| `src/components/ui/StatusActionCard.tsx` | **CREATE** | ~80 |
| `src/components/ui/WorkflowTimeline.tsx` | **CREATE** | ~60 |
| `src/components/ui/SmartTimeInput.tsx` | **CREATE** | ~60 |
| `src/components/ui/TaskStatusActions.tsx` | **REFACTOR** | ~322 → ~180 |
| `src/pages/Tasks.tsx` | **MODIFY** | -150 (remove duplicate modals) |
| `src/components/QuickView/QuickViewContainer.tsx` | **VERIFY** | ~0 |
| `src/types/index.ts` | **ADD** | +5 |

**Net change**: ~+250 lines created, -150 removed = **~+100 lines total**

---

## 🔧 Technical Decisions Needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **Design system** | Keep custom Tailwind vs. add shadcn/ui | Keep custom — consistent with codebase |
| **Animation** | CSS transitions vs. Framer Motion | CSS only for Phase 2; FM for Phase 4 mobile sheet |
| **Tooltip lib** | Custom vs. `floating-ui` vs. `tippy.js` | Custom CSS tooltip (lightweight, matches style) |
| **Grid columns** | Fixed 3-col vs. responsive | Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |

---

## ✅ Acceptance Criteria

1. **Visual**: Action cards show action name ("Start Work"), status color, hours badge
2. **Workflow**: Timeline shows current position + allowed next states
3. **Hours**: Preset buttons (1h/2h/4h/8h) + manual entry, real-time validation
4. **Block**: Shared `BlockReasonForm` used in all 3 places
5. **A11y**: Keyboard navigable, ARIA labels, screen-reader announcements
6. **Mobile**: Cards stack single-column, modal → bottom sheet (Phase 4)
7. **No regressions**: All existing props/callbacks work identically

---

## ❓ Clarifying Questions

1. **Phase 4 mobile bottom sheet** — Include in initial scope or defer?
2. **Tooltip library** — Custom CSS OK, or prefer `floating-ui` for positioning robustness?
3. **Animation budget** — CSS transitions only, or add Framer Motion for card select/confirm?
4. **Presets** — Fixed `[1,2,4,8]` hours or configurable per project/role?
5. **Backward compat** — Must `TaskStatusActions` props stay exactly same? (Yes assumed)

---

## 📋 Next Steps

Once confirmed, implementation will proceed in order:
1. Phase 1 files (utilities, shared components)
2. Phase 2 core components (`StatusActionCard`, `WorkflowTimeline`, `SmartTimeInput`)
3. Refactor `TaskStatusActions` to use new components
4. Update consumers (`Tasks.tsx`, `QuickViewContainer.tsx`)
5. Phase 4 polish (keyboard, mobile, tooltips)

**Estimated effort**: 3-4 focused sessions