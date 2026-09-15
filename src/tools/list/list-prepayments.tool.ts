import { z } from "zod";
import { listXeroPrepayments } from "../../handlers/list-xero-prepayments.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListPrepaymentsTool = CreateXeroTool(
  "list-prepayments",
  `Lists prepayments in Xero, newest first, 10 per page.
  A prepayment is money banked before an invoice or bill exists to apply it to, so it sits as credit against the contact.
  Remaining Credit is the part not yet allocated, which is what a month-end review looks for.`,
  {
    page: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Page of results to return, starting at 1."),
    contactId: z
      .string()
      .optional()
      .describe("Return only prepayments for this Xero contact ID."),
  },
  async ({ page, contactId }) => {
    const response = await listXeroPrepayments(page, contactId);

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing prepayments: ${response.error}`,
          },
        ],
      };
    }

    const prepayments = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${prepayments?.length || 0} prepayments:`,
        },
        ...(prepayments?.map((prepayment) => ({
          type: "text" as const,
          text: [
            `Prepayment: ${prepayment.prepaymentID || "Unknown ID"}`,
            `Type: ${prepayment.type || "Unknown type"}`,
            `Contact: ${prepayment.contact?.name || "Unknown contact"}`,
            `Date: ${prepayment.date || "Unknown date"}`,
            `Status: ${prepayment.status || "Unknown status"}`,
            `Total: ${prepayment.total ?? "Unknown total"}`,
            `Remaining Credit: ${prepayment.remainingCredit ?? "Unknown"}`,
            prepayment.reference ? `Reference: ${prepayment.reference}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })) || []),
      ],
    };
  },
);

export default ListPrepaymentsTool;
