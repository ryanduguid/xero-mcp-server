import { z } from "zod";
import { listXeroOverpayments } from "../../handlers/list-xero-overpayments.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListOverpaymentsTool = CreateXeroTool(
  "list-overpayments",
  `Lists overpayments in Xero, newest first, 10 per page.
  An overpayment is the excess when a contact pays more than the invoice or bill was for, held as credit against that contact.
  Remaining Credit is the part not yet allocated or refunded.`,
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
      .describe("Return only overpayments for this Xero contact ID."),
  },
  async ({ page, contactId }) => {
    const response = await listXeroOverpayments(page, contactId);

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing overpayments: ${response.error}`,
          },
        ],
      };
    }

    const overpayments = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${overpayments?.length || 0} overpayments:`,
        },
        ...(overpayments?.map((overpayment) => ({
          type: "text" as const,
          text: [
            `Overpayment: ${overpayment.overpaymentID || "Unknown ID"}`,
            `Type: ${overpayment.type || "Unknown type"}`,
            `Contact: ${overpayment.contact?.name || "Unknown contact"}`,
            `Date: ${overpayment.date || "Unknown date"}`,
            `Status: ${overpayment.status || "Unknown status"}`,
            `Total: ${overpayment.total ?? "Unknown total"}`,
            `Remaining Credit: ${overpayment.remainingCredit ?? "Unknown"}`,
          ].join("\n"),
        })) || []),
      ],
    };
  },
);

export default ListOverpaymentsTool;
