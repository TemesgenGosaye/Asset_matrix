// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";

import HouseRequestClient from "../HouseRequestClient";
import type { HouseRequestVerifyResult } from "@/lib/house-requests/types";

/**
 * The House Request page, driven as an officer drives it.
 *
 * The page is one employee moving through search → verify → submit → filed, so the
 * assertions are about what the reader can conclude from what is on screen: was
 * this ID correct, who does it belong to, may they file, and if not, what stops
 * them. The branches that matter are the ones where the wrong answer is a wrong
 * action — offering a submit to somebody who already holds a house, or leaving
 * the previous person's record on screen after the ID has been edited.
 */

const CAPABILITIES = { create: true };

/** A verified employee, as `GET /api/house-requests/verify` returns them. */
function verified(overrides: Partial<HouseRequestVerifyResult> = {}) {
  const employee = {
    id: "emp-1",
    employeeNumber: "EMP-0042",
    firstname: "Aster",
    lastname: "Bekele",
    fullName: "Aster Bekele",
    jobGrade: 14,
    jobTitle: "Machine Operator",
    departmentId: "dep-1",
    departmentName: "Factory Maintenance",
    gender: "female",
    serviceYears: 7,
    hireDate: "2019-03-01T00:00:00.000Z",
    maritalStatus: "married",
    familySize: 4,
    disabilityStatus: false,
    employmentType: "full_time",
    employmentStatus: "active",
    phone: "0911223344",
    nationalIdMasked: "*****7890",
    houseCategory: "B",
  };

  return {
    employee,
    existingRequest: null,
    hasAllocatedHouse: false,
    allocation: null,
    eligibilityLegend: "> 17 → Staff  ·  15 – 17 → A",
    empId: "EMP-0042",
    fullName: "Aster Bekele",
    department: "Factory Maintenance",
    gender: "female",
    hireDate: "2019-03-01T00:00:00.000Z",
    serviceYears: 7,
    maritalStatus: "married",
    disabilityStatus: false,
    photoUrl: null,
    isEligible: true,
    eligibleHouseType: "B",
    eligibilityReason:
      "Eligible for a Type B house under the published job grade rule.",
    alreadyHasActiveAllocation: false,
    hasOpenRequest: false,
    ...overrides,
  } as HouseRequestVerifyResult;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub `fetch` by URL fragment, with an optional handler for the POST. */
function stubFetch(
  routes: Record<string, () => Promise<Response>>,
  onPost?: (body: string) => Promise<Response> | null,
) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && onPost) {
      const response = await onPost(String(init.body ?? ""));
      if (response) return response;
    }
    for (const [fragment, respond] of Object.entries(routes)) {
      if (url.includes(fragment)) return respond();
    }
    throw new TypeError(`Failed to fetch: unstubbed ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** The common case: the Employee ID verifies against the Employees table. */
function stubHappyPath(body: HouseRequestVerifyResult = verified()) {
  return stubFetch({
    "/api/house-requests/verify": async () => jsonResponse(body),
  });
}

/** Type an Employee ID and press Search. */
function submitVerification(id = "EMP-0042") {
  fireEvent.change(screen.getByLabelText("Employee ID"), {
    target: { value: id },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
}

/** Type an Employee ID and press Enter, which must submit the form. */
function searchWithEnter(id = "EMP-0042") {
  fireEvent.change(screen.getByLabelText("Employee ID"), {
    target: { value: id },
  });
  fireEvent.submit(
    screen.getByLabelText("Employee ID").closest("form") as HTMLFormElement,
  );
}

async function fillReason(
  value = "The family has no accommodation of its own.",
) {
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value } });
}

/**
 * Wait for the verified record.
 *
 * Addressed by ROLE rather than by text: the employee's name legitimately appears
 * more than once — as the card's heading and as the "Full name" fact — and a test
 * that pins the page by raw text would break the moment any of those moved.
 */
async function findVerified() {
  return screen.findByRole("heading", { name: "Aster Bekele" });
}

const submitButton = () =>
  screen.getByRole("button", { name: /^Submit a house request for/i });

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Step 1 — search and verify
// ---------------------------------------------------------------------------

describe("House Request — searching by Employee ID", () => {
  it("offers one labelled Employee ID field and nothing else to fill in", () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    expect(screen.getByLabelText("Employee ID")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Search$/ })).toBeTruthy();

    // A submit control must not exist until there is a verified subject.
    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
  });

  it("says plainly that nothing has been verified yet", () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    expect(screen.getByText(/No employee verified yet/i)).toBeTruthy();
  });

  it("shows the loading state while the register is being read", async () => {
    let release: (() => void) | null = null;
    stubFetch({
      "/api/house-requests/verify": async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return jsonResponse(verified());
      },
    });

    render(<HouseRequestClient capabilities={CAPABILITIES} />);
    submitVerification();

    await screen.findByText("Reading the Employee Register…");
    release?.();
    await findVerified();
  });

  it("searches on Enter as well as on the button", async () => {
    const fetchMock = stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    searchWithEnter("EMP-0042");

    await findVerified();
    const call = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api/house-requests/verify"));
    expect(call).toContain("empId=EMP-0042");
  });

  it("says the Employee ID was not found, in those words", async () => {
    stubFetch({
      "/api/house-requests/verify": async () =>
        jsonResponse(
          { error: "Employee ID not found", code: "EMPLOYEE_NOT_FOUND" },
          404,
        ),
    });
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification("EMP-9999");

    await screen.findByText("Employee ID not found");
    expect(
      screen.getByText(/No employee in your organization carries/i),
    ).toBeTruthy();
    // A mistyped ID needs a different ID, not the same call repeated.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Dismiss$/ })).toBeTruthy();
  });

  it("never reveals a form for an ID that did not verify", async () => {
    stubFetch({
      "/api/house-requests/verify": async () =>
        jsonResponse(
          { error: "Employee ID not found", code: "EMPLOYEE_NOT_FOUND" },
          404,
        ),
    });
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification("EMP-9999");
    await screen.findByText("Employee ID not found");

    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
    expect(screen.getByLabelText("Employee ID")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Step 2 — the record
// ---------------------------------------------------------------------------

describe("House Request — the verified record", () => {
  it("shows the employee's information from the Employee table", async () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    const card = screen.getByRole("region", {
      name: "Verified employee record",
    });
    for (const fact of [
      "EMP-0042",
      "Factory Maintenance",
      "14",
      "Female",
      "7 years",
      "Married",
      "4 people",
    ]) {
      expect(card.textContent).toContain(fact);
    }
    expect(card.textContent).toContain("No"); // accommodation need
  });

  it("badges the eligibility and states the reason in full", async () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    expect(screen.getByText("Eligible for Type B")).toBeTruthy();
    expect(
      screen.getByText(
        /Eligible for a Type B house under the published job grade rule/,
      ),
    ).toBeTruthy();
  });

  it("badges a not-eligible grade and still shows the record", async () => {
    stubHappyPath(
      verified({
        employee: { ...verified().employee, jobGrade: null },
        isEligible: false,
        eligibleHouseType: null,
        eligibilityReason:
          "Job grade is not set does not fall inside any published house band, so no house category is available.",
      }),
    );
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    expect(screen.getByText("Not eligible")).toBeTruthy();
    // The record is still shown — the reader needs it to know who is blocked.
    expect(screen.getByRole("heading", { name: "Aster Bekele" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Step 3 — submit
// ---------------------------------------------------------------------------

describe("House Request — submitting the request", () => {
  it("keeps submit disabled until an employee is loaded", async () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    // Loaded but the reason is not written yet.
    expect(submitButton()).toHaveProperty("disabled", true);

    await fillReason();
    expect(submitButton()).toHaveProperty("disabled", false);
  });

  it("keeps submit disabled while the reason is too short, and says why", async () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    await fillReason("short");
    expect(submitButton()).toHaveProperty("disabled", true);
    expect(screen.getByText(/Add \d+ more character/)).toBeTruthy();
  });

  it("files the request and points at the House Queue", async () => {
    const posted: string[] = [];
    stubFetch(
      {
        "/api/house-requests/verify": async () => jsonResponse(verified()),
      },
      async (body) => {
        posted.push(body);
        return jsonResponse(
          {
            requestId: "req-1001",
            employeeId: "emp-1",
            employeeNumber: "EMP-0042",
            fullName: "Aster Bekele",
            remarks: "The family has no accommodation of its own.",
            status: "submitted",
            submittedAt: "2026-02-01T09:00:00.000Z",
            houseCategory: "B",
          },
          201,
        );
      },
    );

    render(<HouseRequestClient capabilities={CAPABILITIES} />);
    submitVerification();
    await findVerified();

    await fillReason();
    fireEvent.click(submitButton());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toContain("EMP-0042");

    // The reference is the only written record, so it has to be on screen.
    expect(await screen.findAllByText("req-1001")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /View in House Queue/i }),
    ).toBeTruthy();
  });

  it("clears the field after filing, so the next request starts empty", async () => {
    stubFetch(
      {
        "/api/house-requests/verify": async () => jsonResponse(verified()),
      },
      async () =>
        jsonResponse(
          {
            requestId: "req-1002",
            employeeId: "emp-1",
            employeeNumber: "EMP-0042",
            fullName: "Aster Bekele",
            remarks: "The family has no accommodation of its own.",
            status: "submitted",
            submittedAt: "2026-02-01T09:00:00.000Z",
            houseCategory: "B",
          },
          201,
        ),
    );

    render(<HouseRequestClient capabilities={CAPABILITIES} />);
    submitVerification();
    await findVerified();
    await fillReason();
    fireEvent.click(submitButton());

    await screen.findAllByText("req-1002");
    fireEvent.click(screen.getByRole("button", { name: /search another/i }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Employee ID") as HTMLInputElement).value,
      ).toBe(""),
    );
    // And the link to the queue is gone with the receipt.
    expect(
      screen.queryByRole("link", { name: /View in House Queue/i }),
    ).toBeNull();
  });

  it("files from the keyboard without leaving the reason box", async () => {
    const posted: string[] = [];
    stubFetch(
      {
        "/api/house-requests/verify": async () => jsonResponse(verified()),
      },
      async (body) => {
        posted.push(body);
        return jsonResponse(
          {
            requestId: "req-1003",
            employeeId: "emp-1",
            employeeNumber: "EMP-0042",
            fullName: "Aster Bekele",
            remarks: "Keyboard submission.",
            status: "submitted",
            submittedAt: "2026-02-01T09:00:00.000Z",
            houseCategory: "B",
          },
          201,
        );
      },
    );

    render(<HouseRequestClient capabilities={CAPABILITIES} />);
    submitVerification();
    await findVerified();

    const box = screen.getByLabelText("Reason");
    fireEvent.change(box, { target: { value: "Keyboard submission." } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(posted).toHaveLength(1), { timeout: 20_000 });
  }, 20_000);

  it("sends only the Employee ID and the reason, never the record", async () => {
    const posted: string[] = [];
    stubFetch(
      {
        "/api/house-requests/verify": async () => jsonResponse(verified()),
      },
      async (body) => {
        posted.push(body);
        return jsonResponse(
          {
            requestId: "req-1004",
            employeeId: "emp-1",
            employeeNumber: "EMP-0042",
            fullName: "Aster Bekele",
            remarks: "The family has no accommodation of its own.",
            status: "submitted",
            submittedAt: "2026-02-01T09:00:00.000Z",
            houseCategory: "B",
          },
          201,
        );
      },
    );

    render(<HouseRequestClient capabilities={CAPABILITIES} />);
    submitVerification();
    await findVerified();
    await fillReason();
    fireEvent.click(submitButton());

    await waitFor(() => expect(posted).toHaveLength(1));
    const sent = JSON.parse(posted[0]) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["employeeNumber", "remarks"]);
  });
});

// ---------------------------------------------------------------------------
// The blocks
// ---------------------------------------------------------------------------

describe("House Request — employees who cannot file", () => {
  it("replaces the submit button with the block when the grade is unmapped", async () => {
    stubHappyPath(
      verified({
        isEligible: false,
        eligibleHouseType: null,
        eligibilityReason:
          "Job grade 0 does not fall inside any published house band, so no house category is available.",
      }),
    );
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
    expect(
      screen.getByText("A request cannot be filed for this employee"),
    ).toBeTruthy();
    expect(screen.getByText(/maps no house band to this record/)).toBeTruthy();
  });

  it("blocks an employee who already holds an allocated house", async () => {
    stubHappyPath(
      verified({
        alreadyHasActiveAllocation: true,
        hasAllocatedHouse: true,
        allocation: {
          allocationId: "alloc-9",
          householdId: "hh-9",
          hid: "H-202",
          houseNumber: "B-202",
          houseType: "B",
          locationName: "Factory main camp",
          houseStatus: "Active",
          occupancyStatus: "Occupied",
          allocatedAt: "2025-06-01T08:00:00.000Z",
          moveCount: 0,
        },
      }),
    );
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
    expect(screen.getByText(/Release the house currently held/i)).toBeTruthy();
  });

  it("blocks an employee who already has an open request", async () => {
    stubHappyPath(
      verified({
        hasOpenRequest: true,
        existingRequest: {
          id: "req-77",
          status: "submitted",
          remarks: "Family of five with no accommodation.",
          submittedAt: "2025-05-02T08:00:00.000Z",
        },
      }),
    );
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
    expect(
      screen.getByText(/already has an open request in the House Queue/i),
    ).toBeTruthy();
  });

  it("explains an inactive employee and points at the register", async () => {
    stubHappyPath(
      verified({
        employee: { ...verified().employee, employmentStatus: "on_leave" },
        eligibilityReason:
          "This employee is not currently active. Only an active employee may file a house request.",
      }),
    );
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();

    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
    // Asserted on the rendered text rather than a single node: the remedy is a
    // sentence broken by an emphasised "Active", and what matters is that the
    // reader is told where to go, not how the sentence is marked up.
    expect(document.body.textContent).toContain("must be set to");
    expect(document.body.textContent).toContain("Employee Register");
  });
});

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

describe("House Request — the record must never be stale", () => {
  it("drops the record the moment the Employee ID is edited", async () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();
    await fillReason();

    fireEvent.change(screen.getByLabelText("Employee ID"), {
      target: { value: "EMP-0099" },
    });

    // The previous person's grade must not still be on screen under a new ID —
    // that is how a request gets filed for the wrong person.
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Aster Bekele" }),
      ).toBeNull(),
    );
    expect(
      screen.queryByRole("button", { name: /submit a house request/i }),
    ).toBeNull();
    expect(screen.getByText(/No employee verified yet/i)).toBeTruthy();
  });

  it("starts a fresh reason when the same ID is searched again", async () => {
    stubHappyPath();
    render(<HouseRequestClient capabilities={CAPABILITIES} />);

    submitVerification();
    await findVerified();
    await fillReason();

    submitVerification("EMP-0042");
    await findVerified();

    // Re-searching re-reads the register, so the box starts empty rather than
    // silently carrying a reason written against the previous reading.
    expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe(
      "",
    );
  });
});
