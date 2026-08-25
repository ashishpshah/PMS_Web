import { test, expect, Page, Locator } from '@playwright/test';

/**
 * End-to-end coverage of the full task status machine (Services/TaskService.cs's
 * AllowedEdges), driven entirely through the real UI (Tasks page → task edit modal →
 * "Status & Blocks" tab, which wraps the same <TaskStatusActions> component used by
 * QuickView and the Kanban "•••" popover).
 *
 * Uses the default admin storageState from global-setup.ts (not overridden here) since
 * these flows need a real, permissioned session — unlike register-login.spec.ts, which
 * deliberately runs unauthenticated.
 *
 * Edges exercised (Services/TaskService.cs:426 AllowedEdges):
 *   new → in-progress            (Start Work, hours exempt)
 *   in-progress → paused         (Pause, hours exempt)
 *   paused → in-progress         (Resume, hours required)
 *   in-progress → blocked        (Block, hours + block-reason items required)
 *   blocked → in-progress        (Unblock, hours required)
 *   in-progress → under-review   (Submit for Review, hours required, checklist 100%)
 *   under-review → issues        (QA Failed, hours exempt)
 *   issues → in-progress         (Fix Issues, hours required)
 *   under-review → completed     (Approve & Complete, hours required, checklist 100%)
 *   completed → in-progress      (Reopen — manager-only, hours required)
 */

const EXISTING_TASK_TITLE = 'Identify and Fix Application Bugs';
const RESERCH_PROJECT_ID = 8; // "Reserch Topics"

// ── Shared helpers ──────────────────────────────────────────────────────────────

/**
 * Resets EXISTING_TASK_TITLE to a clean, brand-new 'new'-status task via the API (delete +
 * recreate with the same title/description/checklist), so this test's scripted journey always
 * starts from a known state. This task is real, persistent app data — a previous run of this
 * spec dying partway through the journey (as several debugging iterations did) leaves it
 * sitting mid-journey for the *next* run, and the linear script below has no way to resume
 * correctly from an arbitrary point (e.g. "In Progress" is a valid Change-To target from
 * several different source statuses, each with a different hours requirement, so blindly
 * replaying the next scripted step against unexpected prior state silently does the wrong
 * thing rather than erroring clearly).
 */
async function resetExistingTask(page: Page): Promise<void> {
  const loginRes = await page.request.post('/api/auth/login', {
    data: { usernameOrEmail: 'admin@pms.com', password: 'admin@123' },
  });
  const token = (await loginRes.json())?.data?.token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const listRes = await page.request.get(
    `/api/tasks?page=1&pageSize=10&search=${encodeURIComponent(EXISTING_TASK_TITLE)}`,
    { headers }
  );
  const existing = (await listRes.json())?.data?.find((t: { title: string }) => t.title === EXISTING_TASK_TITLE);
  if (existing) {
    await page.request.delete(`/api/tasks/${existing.id}`, { headers });
  }

  await page.request.post('/api/tasks', {
    headers,
    data: {
      title: EXISTING_TASK_TITLE,
      description: 'Investigate the PMS_Web application (backend and frontend) for defects, identify root causes, and apply fixes with verification.',
      status: 'new',
      priority: 'high',
      projectId: RESERCH_PROJECT_ID,
      assignedToId: 1,
      estimatedHours: 8,
      checklistItems: ['Identify bugs', 'Root-cause each bug', 'Fix and verify'],
    },
  });
}

/** Opens the task edit modal (role="dialog") for the task with this exact title, via the
 *  search box (narrows the board/list to one match) + its pencil "Edit" button. */
async function openTaskForEdit(page: Page, title: string): Promise<Locator> {
  await page.locator('input[placeholder*="Search code"]').fill(title);
  // Debounced search — wait for the board to actually narrow down to one match before
  // clicking, otherwise a stale pre-filter DOM can make the "Edit" click land elsewhere.
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByTitle('Edit').first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  return dialog;
}

/** Marks every checklist item complete: Start Task first (sets startedAt — note this also
 *  flips status to in-progress server-side, see TaskService.StartTaskAsync), then either the
 *  "All Done" bulk button or, if it isn't offered for this task's permission path, each item's
 *  own checkbox individually. Assumes the Checklist tab is already selected. */
async function completeChecklist(dialog: Locator, page: Page) {
  const startBtn = dialog.getByRole('button', { name: 'Start Task' });
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click();
    await expect(startBtn).not.toBeVisible({ timeout: 10_000 });
  }
  const markAll = dialog.getByRole('button', { name: 'All Done' });
  if (await markAll.isVisible().catch(() => false)) {
    await markAll.click();
  } else {
    // Fall back to toggling each item's own checkbox — the checkbox button is the item <li>'s
    // first <button> once canManage is false (drag handle / edit / delete are canManage-gated
    // and won't render), and a completed item's checkbox contains a Check svg, so this only
    // clicks items that aren't already done.
    const items = dialog.locator('ul li');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const checkbox = items.nth(i).locator('button').first();
      const alreadyDone = (await checkbox.locator('svg').count()) > 0;
      if (!alreadyDone) {
        await checkbox.click();
        await page.waitForTimeout(300);
      }
    }
  }
  // Progress header reads "Checklist — N/N" once every item is complete.
  await expect(dialog.getByText(/Checklist — (\d+)\/\1/)).toBeVisible({ timeout: 10_000 });
}

/** Clicks a "Change To" status target inside the currently-open Status & Blocks tab, filling
 *  the HH:MM hours prompt when the transition isn't hours-exempt (new→in-progress and
 *  under-review→issues are the only exempt edges — see AllowedEdges). */
async function changeStatus(dialog: Locator, page: Page, targetLabel: string, hhmm?: string) {
  // Idempotent/resumable: if a previous run already got this task to `targetLabel` (e.g. a
  // prior attempt died partway through and left the task mid-journey — this task is real,
  // shared state across runs, not reset between attempts), there's no "Change To" button for
  // the status you're already in, so skip straight past rather than failing on a missing target.
  const currentBadge = dialog.getByText('Current').locator('..').getByText(targetLabel, { exact: true });
  if (await currentBadge.isVisible().catch(() => false)) return;
  await dialog.getByRole('button', { name: targetLabel, exact: true }).click({ timeout: 15_000 });
  if (hhmm) {
    const hoursInput = dialog.locator('input[inputmode="numeric"]:visible').last();
    await expect(hoursInput).toBeVisible({ timeout: 15_000 });
    const confirmBtn = dialog.getByRole('button', { name: 'Confirm', exact: true });
    // Defensive verify-and-retry: fill, then confirm the masked value actually landed and
    // Confirm is enabled before clicking it — a bare .fill() has occasionally left the
    // TimeInput showing its unfilled placeholder with Confirm still disabled, so re-fill
    // rather than click into a no-op.
    for (let attempt = 0; attempt < 3; attempt++) {
      await hoursInput.fill(hhmm, { timeout: 15_000 });
      if (!(await confirmBtn.isDisabled().catch(() => true))) break;
      await page.waitForTimeout(300);
    }
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click({ timeout: 15_000 });
  }
  await expect(dialog.getByText('Current').locator('..').getByText(targetLabel, { exact: true }))
    .toBeVisible({ timeout: 15_000 });
}

/**
 * Blocks the task: opens the block-reason form, fills one item + hours, confirms — then
 * resolves that same block-checklist item via the "Block Status" panel. TaskService.cs
 * rejects blocked→in-progress with "N block item(s) must be resolved before unblocking" while
 * any are still active, so an unblock step immediately after this one requires the item to
 * already be resolved.
 */
async function blockTask(dialog: Locator, page: Page, hhmm: string) {
  await dialog.getByRole('button', { name: 'Blocked', exact: true }).click({ timeout: 15_000 });
  await dialog.locator('select').first().selectOption({ index: 1 }, { timeout: 15_000 });
  await dialog.getByPlaceholder('Description (required)').fill('E2E-induced blocker for full status-journey coverage.', { timeout: 15_000 });
  const hoursInput = dialog.locator('input[inputmode="numeric"]:visible').last();
  const confirmBlockBtn = dialog.getByRole('button', { name: 'Confirm Block' });
  for (let attempt = 0; attempt < 3; attempt++) {
    await hoursInput.fill(hhmm, { timeout: 15_000 });
    if (!(await confirmBlockBtn.isDisabled().catch(() => true))) break;
    await page.waitForTimeout(300);
  }
  await expect(confirmBlockBtn).toBeEnabled({ timeout: 5_000 });
  await confirmBlockBtn.click({ timeout: 15_000 });
  await expect(dialog.getByText('Current').locator('..').getByText('Blocked', { exact: true }))
    .toBeVisible({ timeout: 15_000 });

  // exact: true matters here — TaskStatusActions' disabled "In Progress" Change-To button
  // carries title="Resolve N block item(s) first" (a substring match for 'Resolve'), which
  // renders earlier in the DOM than TaskBlockPanel's actual title="Resolve" icon button below
  // it, so a loose match's .first() picks the wrong, disabled element.
  await dialog.getByTitle('Resolve', { exact: true }).first().click({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Mark Resolved' }).click({ timeout: 15_000 });
  await expect(dialog.getByTitle('Resolve', { exact: true })).not.toBeVisible({ timeout: 15_000 });
}

async function goToTab(dialog: Locator, label: string) {
  await dialog.getByRole('button', { name: label }).click();
}

// ── Tests ────────────────────────────────────────────────────────────────────────

test.describe('Task lifecycle — full status journey', () => {
  test.describe.configure({ mode: 'serial' });

  // Surfaces the actual cause of a failed status change immediately (any non-2xx /api/
  // response's body, e.g. a validation rejection this test's helpers don't otherwise inspect)
  // instead of just "the status badge never updated" with no indication of why.
  let apiErrors: string[] = [];
  test.beforeEach(({ page }) => {
    apiErrors = [];
    page.on('response', async (res) => {
      if (res.url().includes('/api/') && res.status() >= 400) {
        const body = await res.text().catch(() => '(unreadable)');
        apiErrors.push(`[${res.status()}] ${res.request().method()} ${res.url()}\n  ${body.slice(0, 400)}`);
      }
    });
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && apiErrors.length > 0) {
      console.error(`\n=== API errors during "${testInfo.title}" ===\n${apiErrors.join('\n\n')}\n=== end ===\n`);
    }
  });

  test('drives the existing task through every status, including reopen, to Completed', async ({ page }) => {
    // Default 45s is well short of what ~13 transitions each cost with the config's
    // slowMo: 1500 in play — give this one room instead of racing the clock. Every action
    // inside the helpers now carries its own 15s timeout, so a genuine stall surfaces with a
    // specific error well before this outer budget would ever be needed as a backstop; the
    // 300s here is purely to absorb cumulative real time across the full ~13-step journey
    // (a full clean run has taken up to ~3.1m), not to mask a stuck step.
    test.setTimeout(300_000);
    await resetExistingTask(page);
    await page.goto('/tasks');
    const dialog = await openTaskForEdit(page, EXISTING_TASK_TITLE);

    // Checklist must be 100% before under-review/completed — do this first.
    await goToTab(dialog, 'Checklist');
    await completeChecklist(dialog, page);

    await goToTab(dialog, 'Status & Blocks');

    // new → in-progress (Start Work — hours exempt)
    await changeStatus(dialog, page, 'In Progress');

    // in-progress → paused (hours exempt — "hours are logged cumulatively on resume", per
    // AllowedEdges["in-progress"]["paused"] = true in TaskService.cs) → in-progress (Resume,
    // hours required).
    await changeStatus(dialog, page, 'Paused');
    await changeStatus(dialog, page, 'In Progress', '00:30');

    // in-progress → blocked → in-progress (Block / Unblock)
    await blockTask(dialog, page, '00:15');
    await changeStatus(dialog, page, 'In Progress', '00:45');

    // in-progress → under-review → issues → in-progress (Submit, QA fail, fix)
    await changeStatus(dialog, page, 'Under Review', '02:00');
    await changeStatus(dialog, page, 'Issues'); // exempt — QA fail
    await changeStatus(dialog, page, 'In Progress', '01:00');

    // in-progress → under-review → completed (Submit again, approve)
    await changeStatus(dialog, page, 'Under Review', '00:30');
    await changeStatus(dialog, page, 'Completed', '00:15');

    // completed → in-progress (Reopen — manager-only) → under-review → completed again,
    // to also exercise the one AllowedEdges entry the path above didn't hit.
    await changeStatus(dialog, page, 'In Progress', '00:10');
    await changeStatus(dialog, page, 'Under Review', '00:10');
    await changeStatus(dialog, page, 'Completed', '00:10');
  });

  test('creates a new task and takes it through a fresh new→completed journey', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/tasks');
    // The page-header "Add Task" is the first match; an empty Kanban column (e.g. "New", once
    // this suite's other test has moved its task out of it) shows its own "Add Task" CTA too.
    await page.getByRole('button', { name: 'Add Task' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Project — react-select: click its actual input, type, press Enter to pick the filtered
    // match. Not "Select project" placeholder text: Tasks.tsx defaults modalProjectId to
    // projects[0] when creating a task, so the Project field always starts pre-filled with
    // whichever project happens to be first — its placeholder never renders. react-select's
    // own text input (aria-autocomplete="list") is present regardless, so target that instead;
    // Project is the first such input in the Details tab's DOM order.
    const selectInputs = dialog.locator('input[aria-autocomplete="list"]');
    await selectInputs.first().click({ timeout: 15_000 });
    await page.keyboard.type('Reserch Topics');
    await page.keyboard.press('Enter');

    await dialog.locator('input[name="title"]').fill('E2E Full-Journey Task', { timeout: 15_000 });
    await dialog.locator('textarea[name="description"]').fill('Created by task-lifecycle.spec.ts to verify a freshly-created task can be driven through its full status journey.', { timeout: 15_000 });
    await dialog.locator('input[inputmode="numeric"]:visible').first().fill('03:00', { timeout: 15_000 }); // Est. Hrs

    // Assignee: same aria-autocomplete input approach, not the placeholder text — react-select
    // layers an (empty but pointer-events-active) input-container div directly over its own
    // placeholder text, so a click targeting "Select assignee" gets intercepted by that
    // overlapping div and never actually lands. Assignee is the 4th such input in DOM order:
    // Project, Parent Task, Module, Assignee.
    await selectInputs.nth(3).click({ timeout: 15_000 });
    await page.keyboard.type('System Admin');
    await page.keyboard.press('Enter');

    await goToTab(dialog, 'Checklist');
    const checklistInput = dialog.getByPlaceholder('Add checklist item…');
    for (const item of ['Verify status transitions', 'Confirm completion']) {
      // Verify-and-retry: fill + Enter should always land (its onKeyDown does
      // preventDefault() + pushes into local state), but confirm the item actually rendered
      // before moving on rather than assuming — an unconfirmed add here silently leaves the
      // task with zero checklist items, which the Details form nonetheless accepts on submit,
      // so Create Task appears to succeed while the resulting task can never reach
      // under-review/completed (both require 100% of a non-empty checklist).
      for (let attempt = 0; attempt < 3; attempt++) {
        await checklistInput.fill(item, { timeout: 15_000 });
        await checklistInput.press('Enter', { timeout: 15_000 });
        if (await dialog.getByText(item, { exact: true }).isVisible().catch(() => false)) break;
        await page.waitForTimeout(300);
      }
      await expect(dialog.getByText(item, { exact: true })).toBeVisible({ timeout: 5_000 });
    }

    await dialog.getByRole('button', { name: 'Create Task' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    const editDialog = await openTaskForEdit(page, 'E2E Full-Journey Task');

    await goToTab(editDialog, 'Checklist');
    await completeChecklist(editDialog, page);

    await goToTab(editDialog, 'Status & Blocks');
    await changeStatus(editDialog, page, 'In Progress');
    await changeStatus(editDialog, page, 'Under Review', '01:30');
    await changeStatus(editDialog, page, 'Completed', '00:30');
  });
});
