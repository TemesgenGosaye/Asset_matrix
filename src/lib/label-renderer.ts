/**
 * Render a label template with asset data.
 * Supports {{placeholders}} and simple {{#if field}}...{{/if}} conditionals.
 */
export function renderLabelTemplate(
  template: string,
  data: Record<string, string | number | boolean | null | undefined>,
): string {
  // Replace {{#if field}}content{{/if}} conditionals
  let result = template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, field, content) => {
      return data[field] ? content : "";
    },
  );

  // Replace {{field}} placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    const value = data[field];
    return value != null ? String(value) : "";
  });

  return result;
}

/**
 * Available placeholders for label templates
 */
export const LABEL_PLACEHOLDERS = [
  { key: "assetName", label: "Asset Name" },
  { key: "assetTag", label: "Asset Tag" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "category", label: "Category" },
  { key: "location", label: "Location" },
  { key: "purchaseDate", label: "Purchase Date" },
  { key: "purchasePrice", label: "Purchase Price" },
  { key: "status", label: "Status" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "qrCodeUrl", label: "QR Code URL" },
];
