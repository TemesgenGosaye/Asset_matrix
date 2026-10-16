import { describe, it, expect } from "vitest";
import {
  TRANSPORT_FAILURE_CODES,
  describeCancelFailure,
  describeFailureResponse,
  describeNetworkFailure,
  fieldMessages,
  isPolicyFailureCode,
  type HouseRequestFailure,
} from "../failures";
import { LOOKUP_ERROR_CODES } from "../types";

/** Every rendered failure must have something actionable to say. */
function expectActionable(failure: HouseRequestFailure) {
  expect(failure.title.length).toBeGreaterThan(0);
  expect(failure.message.length).toBeGreaterThan(0);
  expect(failure.hint && failure.hint.length).toBeGreaterThan(0);
  expect(
    ["policy", "input", "access", "system"],
    `unexpected severity ${failure.severity}`,
  ).toContain(failure.severity);
}

describe("describeFailureResponse — policy rejections", () => {
  it("maps every policy code to its own failure, never to another cause", () => {
    for (const code of LOOKUP_ERROR_CODES) {
      const failure = describeFailureResponse(400, {
        error: "server wording",
        code,
      });
      expect(failure.code).toBe(code);
      expectActionable(failure);
    }
  });

  it("prefers the server's message for a policy rejection", () => {
    const failure = describeFailureResponse(400, {
      error:
        "Job grade 0 does not qualify for a house under the current allocation policy.",
      code: "NOT_ELIGIBLE",
    });
    expect(failure.message).toContain("Job grade 0");
    expect(failure.code).toBe("NOT_ELIGIBLE");
  });

  it("marks employee-scoped rejections as needing re-verification", () => {
    for (const code of [
      "EMPLOYEE_NOT_FOUND",
      "EMPLOYEE_ARCHIVED",
      "EMPLOYEE_INACTIVE",
      "NOT_ELIGIBLE",
      "REQUEST_ALREADY_EXISTS",
      "ALREADY_ALLOCATED",
    ] as const) {
      const failure = describeFailureResponse(409, { code });
      expect(failure.requiresReverification).toBe(true);
      expect(isPolicyFailureCode(failure.code)).toBe(true);
    }
  });
});

describe("describeFailureResponse — transport failures", () => {
  // These are the cases that used to be mislabelled "Employee ID not found".
  it("never reports an access or system problem as a bad Employee ID", () => {
    const cases: Array<[number, unknown]> = [
      [401, { error: "Unauthorized" }],
      [401, {}],
      [403, { error: "Insufficient permissions" }],
      [403, {}],
      [500, { error: "Failed to submit the house request" }],
      [500, {}],
      [503, {}],
    ];

    for (const [status, body] of cases) {
      const failure = describeFailureResponse(status, body);
      expect(failure.code).not.toBe("EMPLOYEE_NOT_FOUND");
      expect(failure.code).not.toBe("EMPLOYEE_INACTIVE");
      expect(failure.severity).not.toBe("input");
      expectActionable(failure);
    }
  });

  it("distinguishes expired session from missing permission", () => {
    expect(describeFailureResponse(401, {}).title).toMatch(/session/i);
    expect(describeFailureResponse(403, {}).title).toMatch(/permission/i);
  });

  it("maps a 401 to UNAUTHORIZED and a 403 to FORBIDDEN", () => {
    expect(describeFailureResponse(401, {}).code).toBe("UNAUTHORIZED");
    expect(describeFailureResponse(403, {}).code).toBe("FORBIDDEN");
  });

  it("maps any 5xx to SERVER_ERROR and says nothing was saved", () => {
    const failure = describeFailureResponse(500, { error: "boom" });
    expect(failure.code).toBe("SERVER_ERROR");
    expect(failure.message).toContain("boom");
    expect(failure.hint).toMatch(/safe to try again/i);
  });

  it("keeps a transport failure from discarding the user's typed reason", () => {
    // requiresReverification drives whether the form is thrown away, so a
    // validation/auth/server problem must never clear what the user typed.
    //
    // `NOT_FOUND` and `STATE_CONFLICT` are excluded because they are withdraw-
    // path codes: the submit route answers a lost race with `CONFLICT`, and a
    // withdraw rejection really does invalidate the record on screen. They say
    // "verify again", which is the opposite instruction, so they must not be
    // reachable through the submit mapper's invariants by accident.
    const submitPathCodes = TRANSPORT_FAILURE_CODES.filter(
      (c) => !["CONFLICT", "NOT_FOUND", "STATE_CONFLICT"].includes(c),
    );
    for (const code of submitPathCodes) {
      const failure = describeFailureResponse(400, { code });
      expect(failure.requiresReverification).toBe(false);
    }
  });

  it("does not trust an unrecognised code and falls back to the status", () => {
    const failure = describeFailureResponse(403, { code: "SOMETHING_NEW" });
    expect(failure.code).toBe("FORBIDDEN");
  });

  it("survives a null or non-JSON body without rendering an empty banner", () => {
    for (const body of [null, undefined, "gateway timeout", 42]) {
      const failure = describeFailureResponse(500, body);
      expectActionable(failure);
    }
  });
});

describe("describeFailureResponse — validation", () => {
  it("carries the server's field messages through to the form", () => {
    const failure = describeFailureResponse(400, {
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      fields: {
        remarks: ["Remarks / reason must be at least 10 characters"],
      },
    });

    expect(failure.code).toBe("VALIDATION_FAILED");
    expect(fieldMessages(failure, "remarks")).toEqual([
      "Remarks / reason must be at least 10 characters",
    ]);
    expect(fieldMessages(failure, "employeeNumber")).toBeNull();
  });

  it("infers VALIDATION_FAILED from a bare 400 and names the request body", () => {
    const failure = describeFailureResponse(400, {});
    expect(failure.code).toBe("VALIDATION_FAILED");
    expect(failure.message.length).toBeGreaterThan(0);
    // Must not point at a field that is not highlighted.
    expect(failure.fields).toBeUndefined();
  });

  it("ignores an empty field map rather than reporting a phantom error", () => {
    const failure = describeFailureResponse(400, {
      code: "VALIDATION_FAILED",
      fields: {},
    });
    expect(fieldMessages(failure, "remarks")).toBeNull();
  });
});

describe("describeNetworkFailure", () => {
  it("says nothing was submitted, so the typed reason is safe", () => {
    for (const stage of ["lookup", "submit"] as const) {
      const failure = describeNetworkFailure(stage);
      expect(failure.code).toBe("NETWORK_ERROR");
      expect(failure.severity).toBe("system");
      expectActionable(failure);
    }
  });

  it("explains that a lookup never reached the server", () => {
    expect(describeNetworkFailure("lookup").message).toMatch(
      /never left this device/i,
    );
  });
});

describe("fieldMessages", () => {
  it("returns null when there is no failure at all", () => {
    expect(fieldMessages(null, "remarks")).toBeNull();
  });
});

describe("describeCancelFailure", () => {
  it("never tells a user to file a request that already exists", () => {
    // The exact regression this mapper exists to prevent: the withdraw route
    // answers a 409 with a plain `error` string and no code, and routing it
    // through the submit mapper renders "Request already submitted" — an
    // instruction to do the one thing the user just tried to undo.
    const failure = describeCancelFailure(409, {
      error: "This request is already cancelled and cannot be cancelled.",
    });
    expect(failure.code).toBe("STATE_CONFLICT");
    expect(failure.title).toBe("Request is no longer active");
    expect(failure.title).not.toMatch(/submit/i);
    expect(failure.requiresReverification).toBe(true);
    expectActionable(failure);
  });

  it("maps a missing request to a re-verification, not a server fault", () => {
    const failure = describeCancelFailure(404, { error: "not found" });
    expect(failure.code).toBe("NOT_FOUND");
    expect(failure.requiresReverification).toBe(true);
  });

  it("says the request is untouched when the call never left the device", () => {
    // 0 is the sentinel for "fetch rejected", where there is no status at all.
    const failure = describeCancelFailure(0, null);
    expect(failure.code).toBe("NETWORK_ERROR");
    expect(failure.message).toMatch(/never left this device/i);
    expect(failure.hint).toMatch(/nothing has been changed/i);
  });

  it("still refuses access problems in the submit vocabulary", () => {
    const failure = describeCancelFailure(403, { error: "Forbidden" });
    expect(failure.code).toBe("FORBIDDEN");
    expect(failure.severity).toBe("access");
  });

  it("survives a null body without rendering an empty banner", () => {
    for (const body of [null, undefined, "gateway timeout", 42]) {
      expectActionable(describeCancelFailure(500, body));
    }
  });
});
