import { z } from "zod";
import { Address, Phone } from "xero-node";
import { getXeroContact } from "../../handlers/get-xero-contact.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const formatAddress = (address: Address): string => {
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].filter(Boolean);

  return `  - ${address.addressType || "Address"}: ${parts.join(", ") || "Empty"}`;
};

const formatPhone = (phone: Phone): string => {
  const number = [phone.phoneCountryCode, phone.phoneAreaCode, phone.phoneNumber]
    .filter(Boolean)
    .join(" ");

  return `  - ${phone.phoneType || "Phone"}: ${number || "Empty"}`;
};

const GetContactTool = CreateXeroTool(
  "get-contact",
  `Gets one contact in Xero in full, by contact ID.
  Use this instead of list-contacts when the detail matters: addresses, phone numbers, tax number, default tax types, payment terms and the outstanding and overdue balances.
  Bank account details are deliberately not returned.`,
  {
    contactId: z.string().describe("Xero contact ID to fetch."),
  },
  async ({ contactId }) => {
    const response = await getXeroContact(contactId);

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error getting contact: ${response.error}`,
          },
        ],
      };
    }

    const contact = response.result;
    const receivable = contact.balances?.accountsReceivable;
    const payable = contact.balances?.accountsPayable;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Contact: ${contact.name || "Unnamed"}`,
            `ID: ${contact.contactID}`,
            `Status: ${contact.contactStatus || "Unknown"}`,
            `Type: ${
              [
                contact.isCustomer ? "Customer" : null,
                contact.isSupplier ? "Supplier" : null,
              ]
                .filter(Boolean)
                .join(", ") || "Unknown"
            }`,
            contact.contactNumber
              ? `Contact Number: ${contact.contactNumber}`
              : null,
            contact.accountNumber
              ? `Account Number: ${contact.accountNumber}`
              : null,
            contact.firstName || contact.lastName
              ? `Primary Person: ${[contact.firstName, contact.lastName].filter(Boolean).join(" ")}`
              : null,
            contact.emailAddress ? `Email: ${contact.emailAddress}` : "No email",
            contact.website ? `Website: ${contact.website}` : null,
            contact.taxNumber
              ? `Tax Number: ${contact.taxNumber}${contact.taxNumberType ? ` (${contact.taxNumberType})` : ""}`
              : null,
            contact.accountsReceivableTaxType
              ? `AR Tax Type: ${contact.accountsReceivableTaxType}`
              : null,
            contact.accountsPayableTaxType
              ? `AP Tax Type: ${contact.accountsPayableTaxType}`
              : null,
            contact.defaultCurrency
              ? `Default Currency: ${contact.defaultCurrency}`
              : null,
            contact.salesDefaultAccountCode
              ? `Sales Default Account: ${contact.salesDefaultAccountCode}`
              : null,
            contact.purchasesDefaultAccountCode
              ? `Purchases Default Account: ${contact.purchasesDefaultAccountCode}`
              : null,
            contact.paymentTerms?.sales
              ? `Sales Terms: ${contact.paymentTerms.sales.day} ${contact.paymentTerms.sales.type}`
              : null,
            contact.paymentTerms?.bills
              ? `Bill Terms: ${contact.paymentTerms.bills.day} ${contact.paymentTerms.bills.type}`
              : null,
            contact.discount !== undefined
              ? `Sales Discount: ${contact.discount}%`
              : null,
            receivable
              ? `Receivable: ${receivable.outstanding ?? 0} outstanding, ${receivable.overdue ?? 0} overdue`
              : null,
            payable
              ? `Payable: ${payable.outstanding ?? 0} outstanding, ${payable.overdue ?? 0} overdue`
              : null,
            contact.contactGroups?.length
              ? `Groups: ${contact.contactGroups.map((group) => group.name).join(", ")}`
              : null,
            contact.addresses?.length
              ? `Addresses:\n${contact.addresses.map(formatAddress).join("\n")}`
              : null,
            contact.phones?.length
              ? `Phones:\n${contact.phones.map(formatPhone).join("\n")}`
              : null,
            contact.updatedDateUTC
              ? `Last Updated: ${contact.updatedDateUTC}`
              : null,
            contact.hasAttachments ? "Has Attachments: Yes" : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default GetContactTool;
