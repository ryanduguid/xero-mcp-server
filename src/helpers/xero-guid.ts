const XERO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Render a Xero identifier as the guid literal a where clause expects.
 *
 * The identifier is checked first. Where clauses are built as strings, so an
 * unchecked value can close the guid("...") wrapper and append conditions of
 * its own, which turns a read of one contact into a read of the whole ledger.
 */
export function toGuidFilter(field: string, value: string): string {
  if (!XERO_UUID.test(value)) {
    throw new Error(
      `${field} must be a Xero UUID, received "${value}"`,
    );
  }

  return `guid("${value}")`;
}
