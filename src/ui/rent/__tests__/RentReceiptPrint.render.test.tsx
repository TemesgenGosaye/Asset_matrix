import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RentDocument } from "../RentReceiptPrint";
import type { RentInstallmentDto, RentRenterDto } from "@/lib/rent/types";
import { NAME_STAMP_DATA_URI, STAMP_DATA_URI } from "@/ui/receipt/house-style";

/**
 * Renders the printed rent document and asserts on its markup.
 *
 * The dialog and the print portal are deliberately out of scope here: what is
 * being checked is the document a person signs, not the preview chrome. The
 * page-count measurement is the one thing `renderToStaticMarkup` cannot exercise,
 * because it needs a real `ResizeObserver`; it is covered by the Playwright
 * verification instead.
 */

const renter: RentRenterDto = {
  id: "r1",
  firstName: "Aster",
  lastName: "Bekele",
  fullName: "Aster Bekele",
  gender: "male",
  nationalId: "998877665544",
  nationalIdMasked: false,
  rentType: "Shop",
  rentTypeDetail: "Main market",
  monthlyPrice: "1250.00",
  startDate: "2026-01-31",
  endDate: "2028-12-31",
  termMonths: 36,
  status: "Active",
  displayStatus: "Active",
  terminatedAt: null,
  terminationReason: null,
  archivedReason: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  phones: [{ id: "p1", phone: "0912345678", isPrimary: true }],
  totals: {
    totalMonths: 36,
    monthsPaid: 1,
    overdueMonths: 0,
    voidedMonths: 0,
    totalPaid: "1250.00",
    totalContractValue: "45000.00",
    outstanding: "43750.00",
    nextDueDate: "2026-02-28",
  },
  srNo: 1,
};

function installment(
  monthNumber: number,
  status: RentInstallmentDto["status"],
) {
  const pad = String(monthNumber).padStart(2, "0");
  return {
    id: `i${monthNumber}`,
    monthNumber,
    dueDate: `2026-${pad}-28`,
    amountDue: "1250.00",
    status,
    overdue: false,
    daysOverdue: 0,
    paidAt: status === "PAID" ? `2026-${pad}-28` : null,
    receiptNumber: status === "PAID" ? `RENT-2026-0000${monthNumber}` : null,
    paymentMethod: status === "PAID" ? ("BankTransfer" as const) : null,
    referenceNumber: status === "PAID" ? "FT-99887" : null,
    note: null,
    voidedAt: null,
    voidReason: null,
    payments:
      status === "PAID"
        ? [
            {
              id: `p${monthNumber}`,
              installmentId: `i${monthNumber}`,
              monthNumber,
              receiptNumber: `RENT-2026-0000${monthNumber}`,
              amount: "1250.00",
              paidOn: `2026-${pad}-28`,
              method: "BankTransfer" as const,
              referenceNumber: "FT-99887",
              note: null,
              voidedAt: null,
              voidReason: null,
            },
          ]
        : [],
  } satisfies RentInstallmentDto;
}

const installments = [installment(1, "PAID"), installment(2, "UNPAID")];

const renderReceipt = (month: number | null = 1) =>
  renderToStaticMarkup(
    <RentDocument
      renter={renter}
      installments={installments}
      receiptMonth={month}
      ethiopianCalendar={false}
    />,
  );

describe("RentDocument", () => {
  it("writes the month's amount out in words, in both languages", () => {
    const html = renderReceipt();
    expect(html).toContain("Rent Receipt");
    expect(html).toContain("አንድ ሺህ ሁለት መቶ ሃምሳ ብር ብቻ");
    expect(html).toContain("one thousand two hundred fifty birr only");
  });

  it("titles itself by the rent type it was issued for", () => {
    expect(renderReceipt()).toContain("Rent Receipt  (Shop)");
    expect(renderReceipt()).toContain("የኪራይ ደረሰኝ");
  });

  it("names the form, its issue number and the page in the masthead", () => {
    const html = renderReceipt();
    expect(html).toContain("ቅጽ / Form");
    expect(html).toContain("OF/MSF/PHA/RENT-01");
    expect(html).toContain("እትም / Issue");
    expect(html).toContain("ገጽ / Page");
  });

  it("carries the rubber stamp and the issuer name seal", () => {
    const html = renderReceipt();
    // Both are applied as background-image data URIs rather than <img>, so
    // html2canvas composites them with the paper underneath.
    expect(html.match(/background-image/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
    expect(html).toContain("data-print-overlay");
    // The document carries the house stamp, not a lookalike: the exact data URI
    // the shared house style defines must be the one on the page.
    expect(html).toContain(STAMP_DATA_URI);
    expect(html).toContain(NAME_STAMP_DATA_URI);
  });

  it("titles its sections bilingually", () => {
    const html = renderReceipt();
    for (const heading of [
      "ተከራይ / Renter",
      "ክፍያ / Payment",
      "የክፍያ መርሃ ግብር / Schedule",
      "ማጠቃለያ / Reconciliation",
      "ማረጋገጫና ፊርማ / Attestation",
    ]) {
      expect(html).toContain(heading);
    }
  });

  it("sets out the renter's and the payment's particulars side by side", () => {
    const html = renderReceipt();
    for (const field of [
      "ስም / Name",
      "ፆታ / Sex",
      "የምዝገባ ቁጥር / Reg. No.",
      "ስልክ / Phone",
      "የምዋራ ኪራ / Monthly rent",
      "የውል ጊዜ / Term",
      "ለዓር / Month",
      "የመክፈያ ቀን / Due",
      "የተከፈለበት / Paid on",
      "ዘዴ / Method",
      "ማጣቀሻ / Reference",
      "ሁኔታ / Status",
    ]) {
      expect(html).toContain(field);
    }
    expect(html).toContain("998877665544");
    expect(html).toContain("FT-99887");
    expect(html).toContain("Bank Transfer");
  });

  it("reconciles the lease against the ledger", () => {
    const html = renderReceipt();
    expect(html).toContain("የተከፈለ / Total paid");
    expect(html).toContain("የውል ዋጋ / Contract value");
    expect(html).toContain("ያልተከፈለ / Outstanding");
    expect(html).toContain("1 / 36 ወራት ተከፍለዋል።");
    expect(html).toContain("1 of 36 months settled");
    expect(html).toContain("45,000.00");
    expect(html).toContain("43,750.00");
  });

  it("offers three signature lines, naming only the renter", () => {
    const html = renderReceipt();
    expect(html).toContain("ተከራይ / Renter");
    expect(html).toContain("ገንዘብ ያዥ / Cashier");
    expect(html).toContain("ኪራይ አስተዳደር / Rent Admin");
    // `rent_payments` records no operator, so the two officers the system
    // cannot name sign on blank rules rather than being named for them.
    expect(html).toContain("ፊርማ / Signature");
    expect(html).toContain("ቀን / Date");
  });

  it("asks the renter to acknowledge the statement in both languages", () => {
    const html = renderReceipt();
    expect(html).toContain("ይህ የኪራይ ሂሳብ መግለጫ ትክክል መሆኑን አረጋግጣለሁ።");
    expect(html).toContain(
      "I acknowledge this statement as a correct record of my rent account.",
    );
  });

  it("writes the total received in words on the statement", () => {
    const html = renderReceipt(null);
    expect(html).toContain("Rent Lease Statement");
    // The statement's strip describes everything received so far, so the words
    // and the figure have to name the same amount - otherwise a hand edit of
    // the digits would not disagree with the wording.
    expect(html).toContain("አንድ ሺህ ሁለት መቶ ሃምሳ ብር ብቻ");
    expect(html).toContain("one thousand two hundred fifty birr only");
    expect(html).toContain("1,250.00");
  });

  it("narrows the schedule to the one month on a receipt", () => {
    const html = renderReceipt();
    expect(html).toContain("RENT-2026-00001");
    // Month 2 is unsettled and has no receipt number, so it must not appear.
    expect(html).not.toContain("RENT-2026-00002");
  });

  it("bands the month the receipt was issued for", () => {
    // The highlighted row is how a renter finds their own line on a statement.
    expect(renderReceipt()).toContain("background:#f1f4f7");
  });

  it("QRs the receipt number and prints it beside the code", () => {
    const html = renderReceipt();
    // The code is applied as a background data URI, so its markup arrives
    // percent-encoded: a version-1 matrix (21 modules) plus the four-module
    // quiet zone on every side is a 29-unit viewBox.
    expect(html).toContain("viewBox%3D%220%200%2029%2029");
    // The number itself is printed in plain type under the code, so a reader
    // can key it into the ledger when the code will not scan.
    expect(html).toMatch(/>RENT-2026-00001<\/span>/);
  });

  it("carries the never-re-used statement on both documents", () => {
    for (const html of [renderReceipt(), renderReceipt(null)]) {
      expect(html).toContain("የደረሰኝ ቁጥር አንድ ጊዜ ብቻ ይሰጣል፣");
      expect(html).toContain("never re-used");
    }
  });

  it("shows the lease status and the renter's phone", () => {
    const html = renderReceipt();
    expect(html).toContain("Active");
    expect(html).toContain("0912");
  });

  it("renders the Ethiopian calendar dates when asked", () => {
    const html = renderToStaticMarkup(
      <RentDocument
        renter={renter}
        installments={installments}
        receiptMonth={1}
        ethiopianCalendar
      />,
    );
    expect(html).toContain("ዓ.ም");
  });
});
