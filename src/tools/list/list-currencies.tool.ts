import { listXeroCurrencies } from "../../handlers/list-xero-currencies.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListCurrenciesTool = CreateXeroTool(
  "list-currencies",
  `Lists the currencies the Xero organisation has added.
  Xero rejects an invoice, payment or bank transfer in a currency that is not on this list, so check it before quoting a foreign amount.`,
  {},
  async () => {
    const response = await listXeroCurrencies();

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing currencies: ${response.error}`,
          },
        ],
      };
    }

    const currencies = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${currencies?.length || 0} currencies:`,
        },
        ...(currencies?.map((currency) => ({
          type: "text" as const,
          text: `${currency.code || "Unknown code"}: ${currency.description || "No description"}`,
        })) || []),
      ],
    };
  },
);

export default ListCurrenciesTool;
