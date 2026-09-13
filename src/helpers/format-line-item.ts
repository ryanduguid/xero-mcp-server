import { LineItem } from "xero-node";

const formatItem = (item: LineItem["item"]): string | null => {
  if (!item) return null;
  const parts = [
    item.itemID ? `ID ${item.itemID}` : null,
    item.code ? `Code ${item.code}` : null,
    item.name,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
};

const formatTracking = (tracking: LineItem["tracking"]): string | null => {
  if (!tracking || tracking.length === 0) return null;
  return tracking
    .map(
      (entry) =>
        `${entry.name ?? "Unnamed category"}: ${entry.option ?? "No option"}`
    )
    .join("; ");
};

export const formatLineItem = (lineItem: LineItem): string => {
  return [
    `Item: ${formatItem(lineItem.item) ?? "None"}`,
    `Item Code: ${lineItem.itemCode}`,
    `Description: ${lineItem.description}`,
    `Quantity: ${lineItem.quantity}`,
    `Unit Amount: ${lineItem.unitAmount}`,
    `Account Code: ${lineItem.accountCode}`,
    `Tax Type: ${lineItem.taxType}`,
    `Tracking: ${formatTracking(lineItem.tracking) ?? "None"}`,
    `Line Amount: ${lineItem.lineAmount}`,
  ].join("\n");
};
