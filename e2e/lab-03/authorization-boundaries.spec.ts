import { expect, test } from "@playwright/test";
import { loginUser } from "./helpers.js";

test.describe("E2E-SEC-01: Authorization and Security Boundaries", () => {
  test("unauthenticated access is denied on all protected routes and APIs", async ({ page }) => {
    // 1. Direct page navigation without session redirects to /login
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/tickets/new");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/staff/tickets");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login$/);

    // 2. Direct API fetch without session returns 401
    const endpoints = [
      "http://localhost:8000/api/tickets",
      "http://localhost:8000/api/staff/queue",
      "http://localhost:8000/api/admin/users",
      "http://localhost:8000/api/auth/me",
    ];

    for (const url of endpoints) {
      const res = await page.request.get(url);
      expect(res.status()).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
    }
  });

  test("requester role boundaries: denied IT Staff queue, admin users, and other requesters' tickets", async ({
    page,
  }) => {
    // Sign in as Requester (Diego Santos)
    await loginUser(page, "diego.santos@toktickit.local", "ChangeMe-2026!", "Diego-SecPass-2026!");
    await expect(page).toHaveURL(/\/tickets$/);

    // Requester cannot access Staff Queue API
    const queueStatus = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/staff/queue", { credentials: "include" });
      return res.status;
    });
    expect(queueStatus).toBe(403);

    // Requester cannot access Admin Users API
    const adminStatus = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/admin/users", { credentials: "include" });
      return res.status;
    });
    expect(adminStatus).toBe(403);

    // Requester cannot view someone else's ticket (safe 404 shape, identical to non-existent)
    const foreignTicket = await page.request.get("http://localhost:8000/api/tickets/1");
    const missingTicket = await page.request.get("http://localhost:8000/api/tickets/999999");
    expect(foreignTicket.status()).toBe(404);
    expect(missingTicket.status()).toBe(404);
    expect(await foreignTicket.json()).toEqual(await missingTicket.json());
    const privateNotes = await page.request.get("http://localhost:8000/api/staff/tickets/4/internal-notes");
    expect(privateNotes.status()).toBe(403);
    expect(JSON.stringify(await privateNotes.json())).not.toContain("Vendor status page");

    // Log out
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("IT staff role boundaries: cannot access Administrator user management", async ({ page }) => {
    // Sign in as IT Staff (Farah Malik)
    await loginUser(page, "farah.malik@toktickit.local", "ChangeMe-2026!", "Farah-Staff-2026!");
    await expect(page).toHaveURL(/\/staff\/tickets$/);

    // IT Staff navigation does not show User Management link
    await expect(page.getByRole("button", { name: "User Management" })).toBeHidden();

    // IT Staff direct navigation to /admin/users does not expose User Management table
    await page.goto("/admin/users");
    await expect(page.locator(".admin-users-table")).toBeHidden();

    // IT Staff direct API call to /api/admin/users returns 403
    const adminStatus = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/admin/users", { credentials: "include" });
      return res.status;
    });
    expect(adminStatus).toBe(403);

    // Log out
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("CSRF rejection on state-changing requests without valid token", async ({ page }) => {
    // Sign in as Admin
    await loginUser(page, "harper.morgan@toktickit.local", "ChangeMe-2026!", "Harper-Admin-2026!");
    await expect(page).toHaveURL(/\/(admin\/users|staff\/tickets)$/);

    // Post to /api/admin/users without CSRF token
    const resWithoutCsrf = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Attacker User",
          email: "attacker@test.local",
          role: "REQUESTER",
          isActive: true,
          initialPassword: "AttackerPass-2026!",
        }),
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(resWithoutCsrf.status).toBe(403);
    expect(resWithoutCsrf.body.error.code).toBe("CSRF_INVALID");

    // Post with invalid CSRF token
    const resWithBadCsrf = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "bogus-forged-csrf-token",
        },
        body: JSON.stringify({
          name: "Attacker User",
          email: "attacker@test.local",
          role: "REQUESTER",
          isActive: true,
          initialPassword: "AttackerPass-2026!",
        }),
        credentials: "include",
      });
      return { status: res.status, body: await res.json() };
    });

    expect(resWithBadCsrf.status).toBe(403);
    expect(resWithBadCsrf.body.error.code).toBe("CSRF_INVALID");
  });

  test("session revocation upon logout invalidates authenticated requests", async ({ page }) => {
    // 1. Sign in as Requester (Gavin Lee or Chalida)
    await loginUser(page, "gavin.lee@toktickit.local", "ChangeMe-2026!", "Gavin-Staff-2026!");
    await expect(page).toHaveURL(/\/staff\/tickets$/);
    const originalSessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === "toktickit_session");
    expect(originalSessionCookie).toBeDefined();

    // 2. Click Log out
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // 3. Subsequent API call must return 401
    const currentUserStatus = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/auth/me", { credentials: "include" });
      return res.status;
    });
    expect(currentUserStatus).toBe(401);

    // 4. Replaying the cookie that existed before logout must also fail. This
    // proves server-side session deletion, not merely browser cookie removal.
    await page.context().addCookies([originalSessionCookie!]);
    const replayedSessionStatus = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/auth/me", { credentials: "include" });
      return res.status;
    });
    expect(replayedSessionStatus).toBe(401);

    // 5. Browser back cannot restore access
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
  });
});
