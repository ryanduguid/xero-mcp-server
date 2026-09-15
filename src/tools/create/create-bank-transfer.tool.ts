import { z } from "zod";
import { createXeroBankTransfer } from "../../handlers/create-xero-bank-transfer.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const CreateBankTransferTool = CreateXeroTool(
  "create-bank-transfer",
  `Creates a bank transfer in Xero, moving money between two of the organisation's own bank accounts.
  Both accounts must be bank accounts in the same currency. Use list-accounts to find their account IDs.
  This writes to the ledger and posts a matching transaction in each account.`,
  {
    fromBankAccountId: z
      .string()
      .describe("Xero account ID of the bank account the money leaves."),
    toBankAccountId: z
      .string()
      .describe("Xero account ID of the bank account the money arrives in."),
    amount: z
      .number()
      .positive()
      .describe("Amount to transfer, in the currency of both accounts."),
    date: z
      .string()
      .optional()
      .describe(
        "Transfer date as YYYY-MM-DD. Defaults to today's UTC date, which can differ from the local date.",
      ),
  },
  async ({ fromBankAccountId, toBankAccountId, amount, date }) => {
    const response = await createXeroBankTransfer(
      fromBankAccountId,
      toBankAccountId,
      amount,
      date,
    );

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error creating bank transfer: ${response.error}`,
          },
        ],
      };
    }

    const transfer = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            "Bank transfer created:",
            `ID: ${transfer.bankTransferID}`,
            `Date: ${transfer.date}`,
            `Amount: ${transfer.amount}`,
            `From: ${transfer.fromBankAccount?.name || fromBankAccountId}`,
            `To: ${transfer.toBankAccount?.name || toBankAccountId}`,
            `Transactions: ${transfer.fromBankTransactionID} out, ${transfer.toBankTransactionID} in`,
          ].join("\n"),
        },
      ],
    };
  },
);

export default CreateBankTransferTool;
