import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import PrimaryNavigation from "../../src/PrimaryNavigation.js";

const items = [
  { label: "My Tickets", active: true, onNavigate: vi.fn() },
  { label: "Create Ticket", active: false, onNavigate: vi.fn() },
];

it("keeps a normal navigation landmark and controls its mobile disclosure", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<PrimaryNavigation route="/tickets" items={items} />);
  const toggle = screen.getByRole("button", { name: "Navigation" });
  const navigation = screen.getByRole("navigation", { name: "Primary navigation" });

  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveAttribute("aria-controls", navigation.id);
  expect(screen.getByRole("button", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(navigation).toHaveClass("is-open");

  await user.click(screen.getByRole("button", { name: "Create Ticket" }));
  expect(items[1].onNavigate).toHaveBeenCalledOnce();
  expect(toggle).toHaveAttribute("aria-expanded", "true");

  rerender(<PrimaryNavigation route="/tickets/new" items={items} />);
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await user.click(toggle);
  await user.keyboard("{Escape}");
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});
