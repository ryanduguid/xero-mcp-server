import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const xero = vi.hoisted(() => ({
  tenantId: "fixture-tenant",
  authenticate: vi.fn(),
  accountingApi: {
    createInvoices: vi.fn(),
    createBankTransfer: vi.fn(),
    updateItem: vi.fn(),
    getPayments: vi.fn(),
    getPrepayments: vi.fn(),
  },
  payrollNZApi: { createTimesheet: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: xero }));

import { ToolFactory } from "../tool-factory.js";

const registered = vi.fn();
ToolFactory({ tool: registered } as unknown as McpServer, {});
const shapes = new Map<string, z.ZodRawShape>(
  registered.mock.calls.map(([name, , shape]) => [name, shape]),
);

function numberFields(schema: z.ZodTypeAny, path: string): { path: string }[] {
  if (schema instanceof z.ZodOptional) {
    return numberFields(schema.unwrap(), path);
  }
  if (schema instanceof z.ZodDefault) {
    return numberFields(schema.removeDefault(), path);
  }
  if (schema instanceof z.ZodArray) {
    return numberFields(schema.element, `${path}[]`);
  }
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([name, field]) =>
      numberFields(field as z.ZodTypeAny, `${path}.${name}`),
    );
  }
  if (schema instanceof z.ZodNumber) return [{ path }];
  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodEnum
  )
    return [];
  throw new Error(`Unsupported schema in numeric inventory: ${path}`);
}

const fields = [...shapes].flatMap(([name, shape]) =>
  numberFields(z.object(shape), name),
);

const line = {
  description: "Fixture",
  quantity: 1,
  unitAmount: 2.5,
  accountCode: "200",
  taxType: "NONE",
};
const lines = {
  contactId: "fixture-contact",
  date: "2026-07-01",
  lineItems: [line, { ...line }],
};
const journal = {
  narration: "Fixture",
  manualJournalLines: [
    { lineAmount: 2.5, accountCode: "200" },
    { lineAmount: -2.5, accountCode: "300" },
  ],
};
const item = {
  code: "fixture-item",
  name: "Fixture",
  purchaseDetails: { unitPrice: 2.5 },
  salesDetails: { unitPrice: 3.5 },
};
const timesheetLine = {
  earningsRateID: "fixture-rate",
  numberOfUnits: 2.5,
  date: "2026-07-01",
};
const fixtures: Record<string, Record<string, unknown>> = {
  "create-invoice": lines,
  "create-credit-note": lines,
  "create-quote": lines,
  "create-bank-transaction": {
    ...lines,
    type: "SPEND",
    bankAccountId: "fixture-bank",
  },
  "update-invoice": { ...lines, invoiceId: "fixture-invoice" },
  "update-credit-note": { ...lines, creditNoteId: "fixture-credit-note" },
  "update-quote": { ...lines, quoteId: "fixture-quote" },
  "update-bank-transaction": {
    ...lines,
    bankTransactionId: "fixture-transaction",
  },
  "create-manual-journal": journal,
  "update-manual-journal": { ...journal, manualJournalID: "fixture-journal" },
  "create-item": item,
  "update-item": { ...item, itemId: "fixture-item" },
  "create-payment": {
    idempotencyKey: "fixture-payment",
    invoiceId: "fixture-invoice",
    accountId: "fixture-bank",
    amount: 2.5,
  },
  "create-bank-transfer": {
    idempotencyKey: "fixture-transfer",
    fromBankAccountId: "fixture-from",
    toBankAccountId: "fixture-to",
    date: "2026-07-01",
    amount: 2.5,
  },
  "create-timesheet": {
    payrollCalendarID: "fixture-calendar",
    employeeID: "fixture-employee",
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    timesheetLines: [timesheetLine, { ...timesheetLine }],
  },
  "add-timesheet-line": { timesheetID: "fixture-timesheet", timesheetLine },
  "update-timesheet-line": {
    timesheetID: "fixture-timesheet",
    timesheetLineID: "fixture-line",
    timesheetLine,
  },
  "list-bank-transactions": { page: 1 },
  "list-contacts": { page: 1 },
  "list-credit-notes": { page: 1 },
  "list-invoices": { page: 1 },
  "list-manual-journals": { page: 1 },
  "list-overpayments": { page: 1 },
  "list-payments": { page: 1 },
  "list-prepayments": { page: 1 },
  "list-profit-and-loss": { periods: 1 },
  "list-quotes": { page: 1 },
  "list-report-balance-sheet": { periods: 1 },
};

function inputCase(path: string, value: unknown) {
  const [name, ...parts] = path.split(".");
  const args = structuredClone(fixtures[name]);
  const location = parts.flatMap<string | number>((part) =>
    part.endsWith("[]") ? [part.slice(0, -2), 1] : [part],
  );
  let parent = args;
  for (const key of location.slice(0, -1)) {
    parent = parent[key] as Record<string, unknown>;
  }
  parent[location[location.length - 1]] = value;
  return { name, args, location, schema: z.object(shapes.get(name)!) };
}

function valueAt(object: unknown, location: (string | number)[]): unknown {
  return location.reduce<unknown>(
    (value, key) => (value as Record<string, unknown>)[key],
    object,
  );
}

describe("numeric tool inputs", () => {
  it("covers every registered numeric argument, including nested fields", () => {
    expect(fields.map(({ path }) => path).sort()).toEqual(
      [
        "add-timesheet-line.timesheetLine.numberOfUnits",
        "create-bank-transaction.lineItems[].quantity",
        "create-bank-transaction.lineItems[].unitAmount",
        "create-bank-transfer.amount",
        "create-credit-note.lineItems[].quantity",
        "create-credit-note.lineItems[].unitAmount",
        "create-invoice.lineItems[].quantity",
        "create-invoice.lineItems[].unitAmount",
        "create-item.purchaseDetails.unitPrice",
        "create-item.salesDetails.unitPrice",
        "create-manual-journal.manualJournalLines[].lineAmount",
        "create-payment.amount",
        "create-quote.lineItems[].quantity",
        "create-quote.lineItems[].unitAmount",
        "create-timesheet.timesheetLines[].numberOfUnits",
        "list-bank-transactions.page",
        "list-contacts.page",
        "list-credit-notes.page",
        "list-invoices.page",
        "list-manual-journals.page",
        "list-overpayments.page",
        "list-payments.page",
        "list-prepayments.page",
        "list-profit-and-loss.periods",
        "list-quotes.page",
        "list-report-balance-sheet.periods",
        "update-bank-transaction.lineItems[].quantity",
        "update-bank-transaction.lineItems[].unitAmount",
        "update-credit-note.lineItems[].quantity",
        "update-credit-note.lineItems[].unitAmount",
        "update-invoice.lineItems[].quantity",
        "update-invoice.lineItems[].unitAmount",
        "update-item.purchaseDetails.unitPrice",
        "update-item.salesDetails.unitPrice",
        "update-manual-journal.manualJournalLines[].lineAmount",
        "update-quote.lineItems[].quantity",
        "update-quote.lineItems[].unitAmount",
        "update-timesheet-line.timesheetLine.numberOfUnits",
      ].sort(),
    );
  });

  it.each(Object.entries(fixtures))(
    "accepts the complete %s fixture",
    (name, args) => {
      expect(z.object(shapes.get(name)!).safeParse(args).success).toBe(true);
    },
  );

  describe.each(fields)("$path", ({ path }) => {
    it.each([NaN, Infinity, -Infinity, null, "2.5"])(
      "rejects %s at the supplied path",
      (value) => {
        const { schema, args, location } = inputCase(path, value);
        const parsed = schema.safeParse(args);
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
          for (const issue of parsed.error.issues)
            expect(issue.path).toEqual(location);
        }
      },
    );

    it("preserves the existing finite-value constraints", () => {
      const positive = ["create-payment.amount", "create-bank-transfer.amount"];
      const positiveInteger = [
        "list-overpayments.page",
        "list-prepayments.page",
      ];
      for (const value of [
        -Number.MAX_VALUE,
        -1,
        -0.5,
        -0,
        0,
        Number.MIN_VALUE,
        0.5,
        1,
        Number.MAX_VALUE,
      ]) {
        const accepted = positive.includes(path)
          ? value > 0
          : positiveInteger.includes(path)
            ? value > 0 && Number.isInteger(value)
            : true;
        const { schema, args, location } = inputCase(path, value);
        const parsed = schema.safeParse(args);
        expect(parsed.success, String(value)).toBe(accepted);
        if (parsed.success) {
          expect(valueAt(parsed.data, location)).toBe(value);
        }
      }
    });
  });

  it("retains optional fields and the payment listing's default page", () => {
    expect(z.object(shapes.get("list-payments")!).parse({})).toEqual({
      page: 1,
    });
    expect(shapes.get("list-payments")!.page.parse(undefined)).toBe(1);
    expect(shapes.get("list-contacts")!.page.parse(undefined)).toBeUndefined();
    expect(
      shapes.get("list-profit-and-loss")!.periods.parse(undefined),
    ).toBeUndefined();
    expect(
      shapes.get("create-item")!.purchaseDetails.parse(undefined),
    ).toBeUndefined();
    expect(shapes.get("update-item")!.purchaseDetails.parse({})).toEqual({});
    expect(
      shapes.get("create-item")!.purchaseDetails.safeParse({}).success,
    ).toBe(false);
    expect(
      shapes.get("create-timesheet")!.timesheetLines.parse(undefined),
    ).toBeUndefined();
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  xero.authenticate.mockResolvedValue(undefined);
  xero.accountingApi.createInvoices.mockResolvedValue({
    body: { invoices: [{ total: 2.5 }] },
  });
  xero.accountingApi.createBankTransfer.mockResolvedValue({
    body: { bankTransfers: [{ amount: 2.5 }] },
  });
  xero.accountingApi.updateItem.mockResolvedValue({
    body: { items: [{ code: "fixture-item" }] },
  });
  xero.accountingApi.getPayments.mockResolvedValue({ body: { payments: [] } });
  xero.accountingApi.getPrepayments.mockResolvedValue({
    body: { prepayments: [] },
  });
  xero.payrollNZApi.createTimesheet.mockResolvedValue({
    body: { timesheet: {} },
  });
});

const apiMethods = [
  ...Object.values(xero.accountingApi),
  ...Object.values(xero.payrollNZApi),
];
const integrationCases = [
  {
    path: "create-invoice.lineItems[].quantity",
    method: xero.accountingApi.createInvoices,
    sent: () =>
      xero.accountingApi.createInvoices.mock.calls[0][1].invoices[0]
        .lineItems[1].quantity,
  },
  {
    path: "create-invoice.lineItems[].unitAmount",
    method: xero.accountingApi.createInvoices,
    sent: () =>
      xero.accountingApi.createInvoices.mock.calls[0][1].invoices[0]
        .lineItems[1].unitAmount,
  },
  {
    path: "create-bank-transfer.amount",
    method: xero.accountingApi.createBankTransfer,
    sent: () =>
      xero.accountingApi.createBankTransfer.mock.calls[0][1].bankTransfers[0]
        .amount,
  },
  {
    path: "update-item.purchaseDetails.unitPrice",
    method: xero.accountingApi.updateItem,
    sent: () =>
      xero.accountingApi.updateItem.mock.calls[0][2].items[0].purchaseDetails
        .unitPrice,
  },
  {
    path: "list-payments.page",
    method: xero.accountingApi.getPayments,
    sent: () => xero.accountingApi.getPayments.mock.calls[0][4],
  },
  {
    path: "list-prepayments.page",
    method: xero.accountingApi.getPrepayments,
    sent: () => xero.accountingApi.getPrepayments.mock.calls[0][4],
  },
  {
    path: "create-timesheet.timesheetLines[].numberOfUnits",
    method: xero.payrollNZApi.createTimesheet,
    sent: () =>
      xero.payrollNZApi.createTimesheet.mock.calls[0][1].timesheetLines[1]
        .numberOfUnits,
  },
];

function expectNoXeroCalls() {
  expect.soft(xero.authenticate).not.toHaveBeenCalled();
  for (const method of apiMethods) expect.soft(method).not.toHaveBeenCalled();
}

function expectInputError(result: unknown, name: string) {
  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: "text",
        text: expect.stringContaining(
          `Input validation error: Invalid arguments for tool ${name}`,
        ),
      },
    ],
  });
}

describe("MCP validation before Xero calls", () => {
  it.each(integrationCases)(
    "validates $path before authentication and preserves finite calls",
    async ({ path, method, sent }) => {
      const server = new McpServer({
        name: "fixture-server",
        version: "1.0.0",
      });
      ToolFactory(server, {});
      const client = new Client({ name: "fixture-client", version: "1.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      try {
        await Promise.all([
          server.connect(serverTransport),
          client.connect(clientTransport),
        ]);
        for (const value of [NaN, Infinity, -Infinity]) {
          const { name, args } = inputCase(path, value);
          const result = await client.callTool({ name, arguments: args });
          expectNoXeroCalls();
          expectInputError(result, name);
        }
        const { name, args } = inputCase(path, 1);
        if (name === "list-payments") delete args.page;
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).not.toBe(true);
        expect(xero.authenticate).toHaveBeenCalledOnce();
        expect(method).toHaveBeenCalledOnce();
        expect(sent()).toBe(1);
        for (const other of apiMethods)
          if (other !== method) expect(other).not.toHaveBeenCalled();
      } finally {
        await client.close();
        await server.close();
      }
    },
  );
});

describe("stdio JSON overflow", () => {
  it.each(
    integrationCases.filter(({ path }) =>
      ["list-payments.page", "create-invoice.lineItems[].unitAmount"].includes(
        path,
      ),
    ),
  )(
    "rejects literal exponent overflow in $path before Xero calls",
    async ({ path, method, sent }) => {
      const input = new PassThrough();
      const output = new PassThrough();
      const lines = createInterface({ input: output });
      const replies = lines[Symbol.asyncIterator]();
      const server = new McpServer({
        name: "fixture-server",
        version: "1.0.0",
      });
      ToolFactory(server, {});
      const exchange = async (request: string) => {
        input.write(request + "\n");
        const reply = await replies.next();
        expect(reply.done).toBe(false);
        return JSON.parse(reply.value!);
      };
      try {
        await server.connect(new StdioServerTransport(input, output));
        const initial = await exchange(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "fixture-client", version: "1.0.0" },
            },
          }),
        );
        expect(initial.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
        input.write(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          }) + "\n",
        );
        for (const [index, numericToken] of ["1e400", "-1e400"].entries()) {
          const { name, args } = inputCase(path, "OVERFLOW");
          const request = JSON.stringify({
            jsonrpc: "2.0",
            id: index + 2,
            method: "tools/call",
            params: { name, arguments: args },
          }).replace('"OVERFLOW"', numericToken);
          const reply = await exchange(request);
          expect(reply.id).toBe(index + 2);
          expect(reply.error).toBeUndefined();
          expectNoXeroCalls();
          expectInputError(reply.result, name);
        }
        const { name, args } = inputCase(path, 1);
        const reply = await exchange(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        );
        expect(reply.id).toBe(4);
        expect(reply.error).toBeUndefined();
        expect(reply.result.isError).not.toBe(true);
        expect(xero.authenticate).toHaveBeenCalledOnce();
        expect(method).toHaveBeenCalledOnce();
        expect(sent()).toBe(1);
      } finally {
        await server.close();
        lines.close();
        input.destroy();
        output.destroy();
      }
    },
  );
});
