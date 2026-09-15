import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { listXeroBankTransactions } from "../../handlers/list-xero-bank-transactions.handler.js";
import { formatLineItem } from "../../helpers/format-line-item.js";

const ListBankTransactionsTool = CreateXeroTool(
  "list-bank-transactions",
  `List all bank transactions in Xero.
  Ask the user if they want to see bank transactions for a specific bank account,
  or to see all bank transactions before running.
  Ask the user if they want the next page of bank transactions after running this tool if
  10 bank transactions are returned.
  If they do, call this tool again with the next page number and every filter supplied
  in the previous call: the bank account, the contact and both dates. Each call rebuilds
  its filter from its own arguments, so a filter left out widens the next page.
  A contact and a date range are how to find the transactions behind a contact's
  balance or a miscoded period.`,
  {
    page: z.number(),
    bankAccountId: z.string().optional(),
    contactId: z
      .string()
      .optional()
      .describe("Return only transactions for this Xero contact ID."),
    fromDate: z
      .string()
      .optional()
      .describe("Earliest transaction date to include, as YYYY-MM-DD."),
    toDate: z
      .string()
      .optional()
      .describe("Latest transaction date to include, as YYYY-MM-DD."),
  },
  async ({ bankAccountId, page, contactId, fromDate, toDate }) => {
    const response = await listXeroBankTransactions(
      page,
      bankAccountId,
      contactId,
      fromDate,
      toDate,
    );
    if (response.isError) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing bank transactions: ${response.error}`
          }
        ]
      };
    }

    const bankTransactions = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${bankTransactions?.length || 0} bank transactions:`
        },
        ...(bankTransactions?.map((transaction) => ({
          type: "text" as const,
          text: [
            `Bank Transaction ID: ${transaction.bankTransactionID}`,
            `Bank Account: ${transaction.bankAccount.name} (${transaction.bankAccount.accountID})`,
            transaction.contact
              ? `Contact: ${transaction.contact.name} (${transaction.contact.contactID})`
              : null,
            transaction.reference ? `Reference: ${transaction.reference}` : null,
            transaction.date ? `Date: ${transaction.date}` : null,
            transaction.subTotal != null ? `Sub Total: ${transaction.subTotal}` : null,
            transaction.totalTax != null ? `Total Tax: ${transaction.totalTax}` : null,
            transaction.total != null ? `Total: ${transaction.total}` : null,
            transaction.isReconciled !== undefined ? (`${transaction.isReconciled ? "Reconciled" : "Unreconciled"}`) : null,
            transaction.currencyCode ? `Currency Code: ${transaction.currencyCode}` : null,
            `${transaction.status || "Unknown"}`,
            transaction.lineAmountTypes ? `Line Amount Types: ${transaction.lineAmountTypes}` : undefined,
            transaction.hasAttachments !== undefined
              ? (transaction.hasAttachments ? "Has attachments" : "Does not have attachments")
              : null,
            `Line Items: ${transaction.lineItems?.map(formatLineItem)}`,
          ].filter(Boolean).join("\n")
        })) || [])
      ]
    };
  }
);

export default ListBankTransactionsTool;