import { z } from "zod";
import { listXeroBankTransfers } from "../../handlers/list-xero-bank-transfers.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListBankTransfersTool = CreateXeroTool(
  "list-bank-transfers",
  `Lists bank transfers in Xero, newest first.
  A bank transfer moves money between two of the organisation's own bank accounts, so it is not a payment to a contact.
  Xero returns every transfer in one response, so narrow a long history with fromDate and toDate.`,
  {
    fromDate: z
      .string()
      .optional()
      .describe("Earliest transfer date to include, as YYYY-MM-DD."),
    toDate: z
      .string()
      .optional()
      .describe("Latest transfer date to include, as YYYY-MM-DD."),
  },
  async ({ fromDate, toDate }) => {
    const response = await listXeroBankTransfers(fromDate, toDate);

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing bank transfers: ${response.error}`,
          },
        ],
      };
    }

    const bankTransfers = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${bankTransfers?.length || 0} bank transfers:`,
        },
        ...(bankTransfers?.map((transfer) => ({
          type: "text" as const,
          text: [
            `Bank Transfer: ${transfer.bankTransferID || "Unknown ID"}`,
            `Date: ${transfer.date || "Unknown date"}`,
            `Amount: ${transfer.amount ?? "Unknown amount"}`,
            `From: ${transfer.fromBankAccount?.name || transfer.fromBankAccount?.accountID || "Unknown account"}`,
            `To: ${transfer.toBankAccount?.name || transfer.toBankAccount?.accountID || "Unknown account"}`,
            transfer.reference ? `Reference: ${transfer.reference}` : null,
            transfer.currencyRate !== undefined
              ? `Currency Rate: ${transfer.currencyRate}`
              : null,
            `Reconciled: from ${transfer.fromIsReconciled ? "yes" : "no"}, to ${transfer.toIsReconciled ? "yes" : "no"}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })) || []),
      ],
    };
  },
);

export default ListBankTransfersTool;
