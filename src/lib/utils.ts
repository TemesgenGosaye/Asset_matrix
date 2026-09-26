import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compare two asset category names in increasing numerical code order:
 * 1.1, 1.2 ... 2.1, 2.2 ... 3.39, 3.40 ... 3.145 ... 10.1 ... 10.126.
 * Categories with numeric code prefixes appear first in increasing order;
 * uncoded categories follow in alphabetical order.
 */
export function compareAssetCategoryNames(a: string, b: string): number {
  const parseCode = (name: string): [number, number, number] | null => {
    const match = (name || "").trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match) return null;
    return [
      parseInt(match[1], 10),
      match[2] !== undefined ? parseInt(match[2], 10) : 0,
      match[3] !== undefined ? parseInt(match[3], 10) : 0,
    ];
  };

  const codeA = parseCode(a);
  const codeB = parseCode(b);

  if (codeA && codeB) {
    if (codeA[0] !== codeB[0]) return codeA[0] - codeB[0];
    if (codeA[1] !== codeB[1]) return codeA[1] - codeB[1];
    if (codeA[2] !== codeB[2]) return codeA[2] - codeB[2];
    return a.localeCompare(b);
  }

  if (codeA && !codeB) return -1;
  if (!codeA && codeB) return 1;

  return (a || "").localeCompare(b || "");
}

