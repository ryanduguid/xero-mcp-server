import { LineAmountTypes } from "xero-node";

/**
 * The public tool schemas accept the upper-case names used across the Xero
 * documentation. The SDK enum uses its own spelling, so the values have to be
 * mapped rather than cast.
 */
const LINE_AMOUNT_TYPES: Record<string, LineAmountTypes> = {
  EXCLUSIVE: LineAmountTypes.Exclusive,
  INCLUSIVE: LineAmountTypes.Inclusive,
  NO_TAX: LineAmountTypes.NoTax,
};

export const toLineAmountTypes = (
  value?: string,
): LineAmountTypes | undefined => {
  if (value === undefined) return undefined;
  const mapped = LINE_AMOUNT_TYPES[value];
  if (mapped === undefined) {
    throw new Error(
      `Unsupported line amount type: ${value}. Use EXCLUSIVE, INCLUSIVE or NO_TAX.`,
    );
  }
  return mapped;
};
