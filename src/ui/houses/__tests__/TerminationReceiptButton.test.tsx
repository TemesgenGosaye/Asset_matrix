// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { TerminationReceiptButton } from "../TerminationReceiptButton";
import { canPrintHouseReceipt } from "@/lib/house-queue/receipt-gate";

/**
 * The one receipt entry point in the app, shared by the Inspections worklist and
 * the Terminated Houses archive.
 *
 * What is asserted here is the property that makes sharing safe: both pages reach
 * the same endpoint, keyed by the same inspection, and neither can print before
 * that inspection is resolved and completed. The endpoint re-checks the gate —
 * these assertions are about the button a person sees, not about the server.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const completedInspection = {
  inspectionId: "insp-1",
  allocationId: "alloc-1",
  houseNumber: "B202",
  hid: "H-77",
  vacatedAt: "2026-10-01T09:00:00.000Z",
  employee: {
    firstname: "Aster",
    lastname: "Bekele",
    employeeNumber: "EMP-0042",
    department: { name: "Factory Maintenance", code: "FM" },
  },
};

const openInspection = {
  ...completedInspection,
  inspectionId: "insp-2",
};

/** The receipt row a resolved + completed inspection earns. */
function approvedFetch() {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          receipt: {
            receiptNo: "HTR-202610-ABCD",
            damageLines: [],
            totalDamageCost: "0.00",
            conditionNote: null,
            completedAt: "2026-10-01T09:00:00.000Z",
            printedAt: "2026-10-02T08:00:00.000Z",
            printCount: 1,
            isOriginal: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
}

describe("TerminationReceiptButton — withholding", () => {
  it("withholds the button, and says why, for a termination with no handback inspection", () => {
    // An archive row that never went through the gate still shows the control, so
    // the person scanning the page can see the receipt is owed rather than
    // wondering whether the page simply forgot it.
    const { container } = render(
      <TerminationReceiptButton inspection={null} />,
    );
    const button = container.querySelector("button");
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(button?.getAttribute("title")).toMatch(/no handback inspection/i);
  });

  it("withholds the button when the caller's gate says the inspection is incomplete", () => {
    // The archive evaluates `canPrintHouseReceipt` against its own row and passes
    // the reason down, so the person is told why rather than left to guess.
    const gate = canPrintHouseReceipt({
      variant: "handback",
      inspection: null,
    });
    expect(gate.allowed).toBe(false);

    render(
      <TerminationReceiptButton
        inspection={openInspection}
        blockedReason={gate.message}
      />,
    );
    const button = screen.getByRole("button", { name: gate.message });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("withholds the button when the caller lacks the print permission", () => {
    render(
      <TerminationReceiptButton inspection={completedInspection} disabled />,
    );
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });
});

describe("TerminationReceiptButton — printing", () => {
  it("requests the snapshot from the inspection-scoped endpoint", async () => {
    const fetchMock = approvedFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<TerminationReceiptButton inspection={completedInspection} />);

    fireEvent.click(
      screen.getByRole("button", { name: /termination receipt/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/house-queue/receipts/insp-1");
    expect(init.method).toBe("POST");
  });

  it("surfaces the endpoint's refusal instead of printing something else", async () => {
    // The gate is enforced on the server, so a row that looked printable here can
    // still be refused there. The refusal must reach the reader as prose.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error:
                "The handback inspection for this house is not complete yet.",
              code: "INSPECTION_INCOMPLETE",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    render(<TerminationReceiptButton inspection={completedInspection} />);

    fireEvent.click(
      screen.getByRole("button", { name: /termination receipt/i }),
    );

    expect(
      await screen.findByText(
        "The handback inspection for this house is not complete yet.",
      ),
    ).toBeTruthy();
  });
});
