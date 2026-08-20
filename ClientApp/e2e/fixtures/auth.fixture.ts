import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { TasksPage } from '../pages/TasksPage';
import { UsersPage } from '../pages/UsersPage';
import { RolesPage } from '../pages/RolesPage';
import { ChatPage } from '../pages/ChatPage';
import { ReportsPage } from '../pages/ReportsPage';

type Fixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  projectsPage: ProjectsPage;
  tasksPage: TasksPage;
  usersPage: UsersPage;
  rolesPage: RolesPage;
  chatPage: ChatPage;
  reportsPage: ReportsPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  projectsPage: async ({ page }, use) => {
    await use(new ProjectsPage(page));
  },
  tasksPage: async ({ page }, use) => {
    await use(new TasksPage(page));
  },
  usersPage: async ({ page }, use) => {
    await use(new UsersPage(page));
  },
  rolesPage: async ({ page }, use) => {
    await use(new RolesPage(page));
  },
  chatPage: async ({ page }, use) => {
    await use(new ChatPage(page));
  },
  reportsPage: async ({ page }, use) => {
    await use(new ReportsPage(page));
  },
});

export { expect } from '@playwright/test';
