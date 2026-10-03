import { describe, expect, it } from "vitest";
import type { TicketStatus } from "@prisma/client";
import {
  ALLOWED_STATUS_TRANSITIONS,
  STATUS_TRANSITIONS_REQUIRING_CONFIRMATION,
  clearsResolutionIndication,
  isValidStatusTransition,
} from "../../src/ticket-workflow.js";

describe("UNIT-WORKFLOW-01: Ticket Status Workflow Transition Matrix", () => {
  const ALL_STATUSES: TicketStatus[] = [
    "NEW",
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_REQUESTER",
    "RESOLVED",
    "CLOSED",
    "REOPENED",
    "CANCELLED",
  ];

  it("permits only documented transitions for NEW", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.NEW).toEqual(["OPEN", "IN_PROGRESS", "CANCELLED"]);
    expect(isValidStatusTransition("NEW", "OPEN")).toBe(true);
    expect(isValidStatusTransition("NEW", "IN_PROGRESS")).toBe(true);
    expect(isValidStatusTransition("NEW", "CANCELLED")).toBe(true);

    // Disallowed
    expect(isValidStatusTransition("NEW", "NEW")).toBe(false);
    expect(isValidStatusTransition("NEW", "WAITING_FOR_REQUESTER")).toBe(false);
    expect(isValidStatusTransition("NEW", "RESOLVED")).toBe(false);
    expect(isValidStatusTransition("NEW", "CLOSED")).toBe(false);
    expect(isValidStatusTransition("NEW", "REOPENED")).toBe(false);
  });

  it("permits only documented transitions for OPEN", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.OPEN).toEqual([
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CANCELLED",
    ]);
    expect(isValidStatusTransition("OPEN", "IN_PROGRESS")).toBe(true);
    expect(isValidStatusTransition("OPEN", "WAITING_FOR_REQUESTER")).toBe(true);
    expect(isValidStatusTransition("OPEN", "RESOLVED")).toBe(true);
    expect(isValidStatusTransition("OPEN", "CANCELLED")).toBe(true);

    // Disallowed
    expect(isValidStatusTransition("OPEN", "OPEN")).toBe(false);
    expect(isValidStatusTransition("OPEN", "NEW")).toBe(false);
    expect(isValidStatusTransition("OPEN", "CLOSED")).toBe(false);
    expect(isValidStatusTransition("OPEN", "REOPENED")).toBe(false);
  });

  it("permits only documented transitions for IN_PROGRESS", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.IN_PROGRESS).toEqual([
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CANCELLED",
    ]);
    expect(isValidStatusTransition("IN_PROGRESS", "WAITING_FOR_REQUESTER")).toBe(true);
    expect(isValidStatusTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(isValidStatusTransition("IN_PROGRESS", "CANCELLED")).toBe(true);

    expect(isValidStatusTransition("IN_PROGRESS", "IN_PROGRESS")).toBe(false);
    expect(isValidStatusTransition("IN_PROGRESS", "NEW")).toBe(false);
    expect(isValidStatusTransition("IN_PROGRESS", "OPEN")).toBe(false);
    expect(isValidStatusTransition("IN_PROGRESS", "CLOSED")).toBe(false);
  });

  it("permits only documented transitions for WAITING_FOR_REQUESTER", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.WAITING_FOR_REQUESTER).toEqual([
      "IN_PROGRESS",
      "RESOLVED",
      "CANCELLED",
    ]);
    expect(isValidStatusTransition("WAITING_FOR_REQUESTER", "IN_PROGRESS")).toBe(true);
    expect(isValidStatusTransition("WAITING_FOR_REQUESTER", "RESOLVED")).toBe(true);
    expect(isValidStatusTransition("WAITING_FOR_REQUESTER", "CANCELLED")).toBe(true);

    expect(isValidStatusTransition("WAITING_FOR_REQUESTER", "WAITING_FOR_REQUESTER")).toBe(false);
    expect(isValidStatusTransition("WAITING_FOR_REQUESTER", "OPEN")).toBe(false);
    expect(isValidStatusTransition("WAITING_FOR_REQUESTER", "NEW")).toBe(false);
  });

  it("permits only documented transitions for RESOLVED", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.RESOLVED).toEqual(["CLOSED", "REOPENED"]);
    expect(isValidStatusTransition("RESOLVED", "CLOSED")).toBe(true);
    expect(isValidStatusTransition("RESOLVED", "REOPENED")).toBe(true);

    expect(isValidStatusTransition("RESOLVED", "RESOLVED")).toBe(false);
    expect(isValidStatusTransition("RESOLVED", "NEW")).toBe(false);
    expect(isValidStatusTransition("RESOLVED", "OPEN")).toBe(false);
    expect(isValidStatusTransition("RESOLVED", "IN_PROGRESS")).toBe(false);
    expect(isValidStatusTransition("RESOLVED", "CANCELLED")).toBe(false);
  });

  it("permits only documented transitions for CLOSED", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.CLOSED).toEqual(["REOPENED"]);
    expect(isValidStatusTransition("CLOSED", "REOPENED")).toBe(true);

    expect(isValidStatusTransition("CLOSED", "CLOSED")).toBe(false);
    expect(isValidStatusTransition("CLOSED", "RESOLVED")).toBe(false);
    expect(isValidStatusTransition("CLOSED", "CANCELLED")).toBe(false);
  });

  it("permits only documented transitions for REOPENED", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.REOPENED).toEqual([
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CANCELLED",
    ]);
    expect(isValidStatusTransition("REOPENED", "IN_PROGRESS")).toBe(true);
    expect(isValidStatusTransition("REOPENED", "WAITING_FOR_REQUESTER")).toBe(true);
    expect(isValidStatusTransition("REOPENED", "RESOLVED")).toBe(true);
    expect(isValidStatusTransition("REOPENED", "CANCELLED")).toBe(true);

    expect(isValidStatusTransition("REOPENED", "REOPENED")).toBe(false);
    expect(isValidStatusTransition("REOPENED", "NEW")).toBe(false);
    expect(isValidStatusTransition("REOPENED", "OPEN")).toBe(false);
    expect(isValidStatusTransition("REOPENED", "CLOSED")).toBe(false);
  });

  it("CANCELLED is a terminal state and permits no transitions", () => {
    expect(ALLOWED_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
    for (const target of ALL_STATUSES) {
      expect(isValidStatusTransition("CANCELLED", target)).toBe(false);
    }
  });

  it("identifies states that require UI confirmation", () => {
    expect(STATUS_TRANSITIONS_REQUIRING_CONFIRMATION.NEW).toContain("CANCELLED");
    expect(STATUS_TRANSITIONS_REQUIRING_CONFIRMATION.OPEN).toContain("RESOLVED");
    expect(STATUS_TRANSITIONS_REQUIRING_CONFIRMATION.OPEN).toContain("CANCELLED");
    expect(STATUS_TRANSITIONS_REQUIRING_CONFIRMATION.RESOLVED).toContain("CLOSED");
    expect(STATUS_TRANSITIONS_REQUIRING_CONFIRMATION.RESOLVED).toContain("REOPENED");
    expect(STATUS_TRANSITIONS_REQUIRING_CONFIRMATION.CLOSED).toContain("REOPENED");
  });

  it("clears resolution indication atomically when transitioning to RESOLVED, CLOSED, CANCELLED, or REOPENED", () => {
    expect(clearsResolutionIndication("RESOLVED")).toBe(true);
    expect(clearsResolutionIndication("CLOSED")).toBe(true);
    expect(clearsResolutionIndication("CANCELLED")).toBe(true);
    expect(clearsResolutionIndication("REOPENED")).toBe(true);

    expect(clearsResolutionIndication("OPEN")).toBe(false);
    expect(clearsResolutionIndication("IN_PROGRESS")).toBe(false);
    expect(clearsResolutionIndication("WAITING_FOR_REQUESTER")).toBe(false);
    expect(clearsResolutionIndication("NEW")).toBe(false);
  });
});
