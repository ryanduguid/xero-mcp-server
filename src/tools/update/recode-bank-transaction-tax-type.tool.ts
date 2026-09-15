import { z } from "zod";
import {
  MAX_TRANSACTIONS_PER_CALL,
  recodeXeroBankTransactionTaxType,
} from "../../handlers/recode-xero-bank-transaction-tax-type.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const RecodeBankTransactionTaxTypeTool = CreateXeroTool(
  "recode-bank-transaction-tax-type",
  `Sets the tax type on every line of the bank transactions you name, for fixing a batch of miscoded spend or receive money transactions.
  This writes to the ledger. It changes the GST on each line, so it changes the next BAS.
  Find the transactions with list-bank-transactions first, show the user the list and the tax type, and only call this once they have agreed to it.
  Name every transaction explicitly: this tool takes no contact or date filter, so nothing is swept up by a query.
  Reconciled, voided and deleted transactions are reported as blocked and left untouched, and lines already on the target tax type are left alone.`,
  {
    bankTransactionIds: z
      .array(z.string())
      .min(1)
      .max(MAX_TRANSACTIONS_PER_CALL)
      .describe(
        `Bank transaction IDs to recode, at most ${MAX_TRANSACTIONS_PER_CALL} per call.`,
      ),
    taxType: z
      .string()
      .describe(
        "Xero tax type code to apply to every line, for example OUTPUT or INPUT. Use list-tax-rates for the codes this organisation has.",
      ),
  },
  async ({ bankTransactionIds, taxType }) => {
    const response = await recodeXeroBankTransactionTaxType(
      bankTransactionIds,
      taxType,
    );

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error recoding bank transactions: ${response.error}`,
          },
        ],
      };
    }

    const summary = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Recoded to ${summary.taxType}:`,
            `${summary.updated} updated`,
            `${summary.alreadyCorrect} already correct`,
            `${summary.blocked} blocked`,
            `${summary.failed} failed`,
          ].join("\n"),
        },
        ...summary.results.map((result) => ({
          type: "text" as const,
          text: [
            `Bank Transaction ID: ${result.bankTransactionId}`,
            result.date ? `Date: ${result.date}` : null,
            result.reference ? `Reference: ${result.reference}` : null,
            result.total !== undefined ? `Total: ${result.total}` : null,
            `Outcome: ${result.outcome}`,
            `Detail: ${result.detail}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default RecodeBankTransactionTaxTypeTool;
