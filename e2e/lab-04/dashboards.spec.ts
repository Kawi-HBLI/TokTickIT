import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginUser, checkNoHorizontalScroll } from "../lab-03/helpers.js";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function navigateViaMenu(page: Page, label: string) {
  const toggle = page.getByRole("button", { name: "Navigation", exact: true });
  if (await toggle.isVisible()) {
    const isExpanded = await toggle.getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await toggle.click();
    }
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("button", { name: label, exact: true }).click();
  } else {
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("button", { name: label, exact: true }).click();
  }
}

test.describe("Lab 4: Role Dashboards, Interactive Drill-Downs & Accessibility", () => {
  test("TEST-E2E-03: Role dashboard journeys, drill-downs, Back/Forward, and filter hydration", async ({
    page,
  }) => {
    // -------------------------------------------------------------
    // Part 1: IT Staff Dashboard Journey & Interactive Drill-Downs
    // -------------------------------------------------------------
    await loginUser(page, "ethan.brooks@toktickit.local");

    // Navigate to Staff Dashboard
    await page.goto("/staff/dashboard");
    await expect(page.getByRole("heading", { name: "Operational Overview" })).toBeVisible();

    // Verify 4 metric cards are rendered with server-provided metrics
    const openCard = page.locator('[data-testid="metric-open-tickets"]');
    const pendingCard = page.locator('[data-testid="metric-pending-actions"]');
    const completedCard = page.locator('[data-testid="metric-completed-today"]');
    const unassignedCard = page.locator('[data-testid="metric-unassigned-queue"]');

    await expect(openCard).toBeVisible();
    await expect(pendingCard).toBeVisible();
    await expect(completedCard).toBeVisible();
    await expect(unassignedCard).toBeVisible();

    // Verify card labels per ui-spec
    await expect(pendingCard).toContainText("View tickets containing these actions");
    await expect(completedCard).toContainText("(UTC)");
    await expect(completedCard).toContainText("View tickets containing these actions");
    await expect(unassignedCard).toContainText("Claim Work");

    // Drill-Down 1: Unassigned Queue -> /staff/tickets?owner=unassigned&statusGroup=active
    const claimWorkLink = unassignedCard.getByRole("button", { name: /Claim Work/i });
    await claimWorkLink.click();

    await page.waitForURL(/\/staff\/tickets\?/);
    const u1 = new URL(page.url());
    expect(u1.pathname).toBe("/staff/tickets");
    expect(u1.searchParams.get("owner")).toBe("unassigned");
    expect(u1.searchParams.get("statusGroup")).toBe("active");
    await expect(page.getByRole("heading", { name: /Ticket Queue/i })).toBeVisible();

    // Verify active filter badges
    const filterContainer = page.locator(".active-filters-container");
    await expect(filterContainer).toBeVisible();
    await expect(filterContainer).toContainText("Unassigned");
    await expect(filterContainer).toContainText("Active Tickets");

    // Browser Back: returns to Staff Dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/staff\/dashboard/);
    await expect(page.getByRole("heading", { name: "Operational Overview" })).toBeVisible();

    // Browser Forward: returns to filtered Unassigned Queue with filters preserved
    await page.goForward();
    await page.waitForURL(/\/staff\/tickets\?/);
    const uFwd = new URL(page.url());
    expect(uFwd.pathname).toBe("/staff/tickets");
    expect(uFwd.searchParams.get("owner")).toBe("unassigned");
    expect(uFwd.searchParams.get("statusGroup")).toBe("active");
    await expect(page.locator(".active-filters-container")).toBeVisible();

    // Test Clear Filters
    const clearBtn = page.locator(".clear-filters-btn, button:has-text('Clear filters')").first();
    await clearBtn.click();
    await expect(page).toHaveURL(/\/staff\/tickets$/);

    // Drill-Down 2: Pending Actions -> /staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active
    await page.goto("/staff/dashboard");
    const pendingLink = pendingCard.getByRole("button", { name: "View tickets containing these actions" });
    await pendingLink.click();
    await page.waitForURL(/\/staff\/tickets\?/);
    const u2 = new URL(page.url());
    expect(u2.pathname).toBe("/staff/tickets");
    expect(u2.searchParams.get("actionAssignee")).toBe("me");
    expect(u2.searchParams.get("actionStatus")).toBe("PENDING");
    expect(u2.searchParams.get("statusGroup")).toBe("active");
    await expect(page.locator(".active-filters-container")).toContainText("Pending Actions Assigned to Me");

    // Multi-matching actions on single ticket check:
    // Destination lists tickets containing them without duplicating the ticket row
    const ticketRows = page.locator(".staff-queue-table tbody tr");
    const count = await ticketRows.count();
    if (count > 0) {
      const numbers = await ticketRows.locator(".ticket-number-cell strong").allTextContents();
      expect(numbers.length).toBe(new Set(numbers).size);
    }

    // Drill-Down 3: Completed Today -> /staff/tickets?completedBy=me&completedDate=today
    await page.goto("/staff/dashboard");
    const completedLink = completedCard.getByRole("button", { name: "View tickets containing these actions" });
    await completedLink.click();
    await page.waitForURL(/\/staff\/tickets\?/);
    const u3 = new URL(page.url());
    expect(u3.pathname).toBe("/staff/tickets");
    expect(u3.searchParams.get("completedBy")).toBe("me");
    expect(u3.searchParams.get("completedDate")).toBe("today");
    await expect(page.locator(".active-filters-container")).toContainText("Completed Today (UTC)");

    // Log out Staff
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // -------------------------------------------------------------
    // Part 2: Requester Dashboard Journey & Interactive Drill-Downs
    // -------------------------------------------------------------
    await loginUser(page, "diego.santos@toktickit.local");

    // Navigate to Requester Dashboard
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

    // Verify 3 metric cards are rendered
    const reqActiveCard = page.locator('[data-testid="metric-active-tickets"]');
    const reqAwaitingCard = page.locator('[data-testid="metric-awaiting-input"]');
    const reqResolvedCard = page.locator('[data-testid="metric-resolved-closed"]');

    await expect(reqActiveCard).toBeVisible();
    await expect(reqAwaitingCard).toBeVisible();
    await expect(reqResolvedCard).toBeVisible();

    // Drill-Down 1: Awaiting Your Input -> /tickets?status=WAITING_FOR_REQUESTER
    const provideDetailsLink = reqAwaitingCard.getByRole("button", { name: /Provide Details/i });
    await provideDetailsLink.click();

    await page.waitForURL(/\/tickets\?/);
    const r1 = new URL(page.url());
    expect(r1.pathname).toBe("/tickets");
    expect(r1.searchParams.get("status")).toBe("WAITING_FOR_REQUESTER");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await expect(page.locator(".active-filters-container")).toContainText("Awaiting Your Input");

    // Clear Filters
    const reqClearBtn = page.locator(".clear-filters-btn, button:has-text('Clear Filters')").first();
    await reqClearBtn.click();
    await expect(page).toHaveURL(/\/tickets$/);

    // Drill-Down 2: Active Tickets -> /tickets?statusGroup=active
    await page.goto("/dashboard");
    const activeTicketsLink = reqActiveCard.getByRole("button", { name: /View Active Tickets/i });
    await activeTicketsLink.click();
    await page.waitForURL(/\/tickets\?/);
    const r2 = new URL(page.url());
    expect(r2.pathname).toBe("/tickets");
    expect(r2.searchParams.get("statusGroup")).toBe("active");
    await expect(page.locator(".active-filters-container")).toContainText("Active Tickets");

    // Drill-Down 3: Resolved & Closed -> /tickets?statusGroup=resolved_closed
    await page.goto("/dashboard");
    const resolvedLink = reqResolvedCard.getByRole("button", { name: /View History/i });
    await resolvedLink.click();
    await page.waitForURL(/\/tickets\?/);
    const r3 = new URL(page.url());
    expect(r3.pathname).toBe("/tickets");
    expect(r3.searchParams.get("statusGroup")).toBe("resolved_closed");
    await expect(page.locator(".active-filters-container")).toContainText("Resolved & Closed");
  });

  test("TEST-E2E-04: Responsive layout check at 375px, 768px, and 1280px viewports", async ({
    page,
  }) => {
    const viewports = [
      { width: 375, height: 667, name: "mobile" },
      { width: 768, height: 1024, name: "tablet" },
      { width: 1280, height: 800, name: "desktop" },
    ];

    // Check Staff Dashboard
    await loginUser(page, "ethan.brooks@toktickit.local");

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/staff/dashboard");
      await expect(page.getByRole("heading", { name: "Operational Overview" })).toBeVisible();

      // Verify zero horizontal page overflow
      await checkNoHorizontalScroll(page);

      // Verify all 4 metric cards are visible
      await expect(page.locator('[data-testid="metric-open-tickets"]')).toBeVisible();
      await expect(page.locator('[data-testid="metric-pending-actions"]')).toBeVisible();
      await expect(page.locator('[data-testid="metric-completed-today"]')).toBeVisible();
      await expect(page.locator('[data-testid="metric-unassigned-queue"]')).toBeVisible();
    }

    await page.getByRole("button", { name: "Log out" }).click();

    // Check Requester Dashboard
    await loginUser(page, "diego.santos@toktickit.local");

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

      // Verify zero horizontal page overflow
      await checkNoHorizontalScroll(page);

      // Verify 3 metric cards are visible
      await expect(page.locator('[data-testid="metric-active-tickets"]')).toBeVisible();
      await expect(page.locator('[data-testid="metric-awaiting-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="metric-resolved-closed"]')).toBeVisible();
    }
  });

  test("TEST-E2E-05: WCAG 1.4.10 400% Zoom Reflow Check at 320px equivalent width", async ({
    page,
  }) => {
    // 320px equivalent width test
    await page.setViewportSize({ width: 320, height: 640 });

    // Check Staff Dashboard at 320px
    await loginUser(page, "ethan.brooks@toktickit.local");
    await page.goto("/staff/dashboard");
    await expect(page.getByRole("heading", { name: "Operational Overview" })).toBeVisible();

    // Verify zero horizontal overflow at 320px
    await checkNoHorizontalScroll(page);

    // Verify cards are readable and stacked
    const openCard = page.locator('[data-testid="metric-open-tickets"]');
    await expect(openCard).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();

    // Check Requester Dashboard at 320px
    await loginUser(page, "diego.santos@toktickit.local");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

    // Verify zero horizontal overflow at 320px
    await checkNoHorizontalScroll(page);

    const reqActiveCard = page.locator('[data-testid="metric-active-tickets"]');
    await expect(reqActiveCard).toBeVisible();
  });

  test("TEST-E2E-06: Automated axe-core accessibility audit on Dashboards and filtered views", async ({
    page,
  }) => {
    // 1. Staff Dashboard audit
    await loginUser(page, "ethan.brooks@toktickit.local");
    await page.goto("/staff/dashboard");
    await expect(page.getByRole("heading", { name: "Operational Overview" })).toBeVisible();

    const staffAxeResults = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(staffAxeResults.violations).toEqual([]);

    // 2. Filtered Staff Queue audit
    await page.goto("/staff/tickets?owner=unassigned&statusGroup=active");
    await expect(page.getByRole("heading", { name: /Ticket Queue/i })).toBeVisible();

    const queueAxeResults = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(queueAxeResults.violations).toEqual([]);

    await page.getByRole("button", { name: "Log out" }).click();

    // 3. Requester Dashboard audit
    await loginUser(page, "diego.santos@toktickit.local");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

    const requesterAxeResults = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(requesterAxeResults.violations).toEqual([]);
  });
});
