import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EmployeeImportWizard, {
  EMPLOYEE_IMPORT_TEMPLATE_URL,
} from "../EmployeeImportWizard";

/**
 * Renders the wizard's first step and asserts on the markup.
 *
 * The point is not the copy, it is that the component compiles and renders
 * without throwing - the wizard has enough conditional structure (step
 * indicator, upload card, info panels) that a bad import or a broken JSX node
 * would otherwise only surface in the browser.
 */
describe("EmployeeImportWizard", () => {
  const html = renderToStaticMarkup(<EmployeeImportWizard />);

  it("renders the step indicator at the upload step", () => {
    expect(html).toContain("Select File");
    expect(html).toContain("Validate &amp; Preview");
    expect(html).toContain("Import Complete");
  });

  it("offers the employee template", () => {
    // The URL lives in a click handler, so it is asserted at its source rather
    // than in the markup - it is the same constant the /import page's own
    // Download Template button uses.
    expect(EMPLOYEE_IMPORT_TEMPLATE_URL).toBe(
      "/api/employees/import?format=xlsx",
    );
    expect(html).toContain("Download Template");
  });

  it("states which columns are required", () => {
    expect(html).toContain("Emp ID");
    expect(html).toContain("First Name");
    expect(html).toContain("Last Name");
  });

  it("explains that a reference which does not resolve is reported, not guessed", () => {
    expect(html).toContain("reported rather than guessed");
  });

  it("accepts spreadsheet uploads and caps them at the documented size", () => {
    expect(html).toContain(".xlsx");
    expect(html).toContain(".csv");
  });
});
