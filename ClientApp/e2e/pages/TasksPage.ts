import { Page, Locator } from '@playwright/test';

export class TasksPage {
  readonly page: Page;
  readonly kanbanView: Locator;
  readonly listView: Locator;
  readonly columnNew: Locator;
  readonly columnInProgress: Locator;
  readonly columnUnderReview: Locator;
  readonly columnCompleted: Locator;

  constructor(page: Page) {
    this.page = page;
    this.kanbanView = page.locator('[data-testid="kanban-board"]');
    this.listView = page.locator('[data-testid="task-list"]');
    this.columnNew = page.locator('[data-testid="column-new"]');
    this.columnInProgress = page.locator('[data-testid="column-in-progress"]');
    this.columnUnderReview = page.locator('[data-testid="column-under-review"]');
    this.columnCompleted = page.locator('[data-testid="column-completed"]');
  }

  async goto() {
    await this.page.goto('/tasks');
    await this.page.waitForLoadState('networkidle');
  }

}
