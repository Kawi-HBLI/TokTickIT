import { describe, expect, it } from "vitest";
import { categories, relatedSystems, requesterUsers } from "../../prisma/seed-data.js";
import { seedDatabase } from "../../prisma/seed.js";

type SeedRecord = { name: string; email?: string };

function createUpsertDelegate(key: "name" | "email") {
  const rows = new Map<string, SeedRecord>();

  return {
    rows,
    async upsert({
      where,
      update,
      create,
    }: {
      where: Record<string, string>;
      update: Partial<SeedRecord>;
      create: SeedRecord;
    }) {
      const value = where[key];
      const current = rows.get(value);
      rows.set(value, current ? { ...current, ...update } : { ...create });
      return rows.get(value);
    },
  };
}

describe("Lab 2 seed data", () => {
  it("contains all required active reference data and an inactive requester", () => {
    expect(categories.map(({ name }) => name)).toEqual([
      "Account and Access",
      "Hardware",
      "Software",
      "Network",
    ]);
    expect(relatedSystems.filter(({ isActive }) => isActive)).toHaveLength(7);
    expect(requesterUsers.filter(({ isActive }) => isActive).length).toBeGreaterThanOrEqual(4);
    expect(requesterUsers.some(({ isActive }) => !isActive)).toBe(true);
  });

  it("uses unique natural keys for repeatable upserts", () => {
    expect(new Set(categories.map(({ name }) => name)).size).toBe(categories.length);
    expect(new Set(relatedSystems.map(({ name }) => name)).size).toBe(relatedSystems.length);
    expect(new Set(requesterUsers.map(({ email }) => email)).size).toBe(requesterUsers.length);
  });

  it("can run twice without creating duplicate rows", async () => {
    const category = createUpsertDelegate("name");
    const relatedSystem = createUpsertDelegate("name");
    const requesterUser = createUpsertDelegate("email");
    const fakePrisma = { category, relatedSystem, requesterUser };

    await seedDatabase(fakePrisma as never);
    await seedDatabase(fakePrisma as never);

    expect(category.rows).toHaveLength(categories.length);
    expect(relatedSystem.rows).toHaveLength(relatedSystems.length);
    expect(requesterUser.rows).toHaveLength(requesterUsers.length);
  });
});
