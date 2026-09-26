import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../clients/xero-client.js", () => ({ xeroClient: {} }));

import { CreateTools } from "../create/index.js";
import { DeleteTools } from "../delete/index.js";
import { GetTools } from "../get/index.js";
import { ListTools } from "../list/index.js";
import { ToolFactory } from "../tool-factory.js";
import { UpdateTools } from "../update/index.js";

// Golden inventory in registration order. A new tool must be added here and
// given a category deliberately.
const EXPECTED = {
  delete: ["delete-timesheet"],
  get: ["get-contact", "get-timesheet"],
  create: [
    "create-contact",
    "create-credit-note",
    "create-manual-journal",
    "create-invoice",
    "create-quote",
    "create-payment",
    "create-item",
    "create-bank-transaction",
    "create-bank-transfer",
    "create-timesheet",
    "create-tracking-category",
    "create-tracking-options",
  ],
  list: [
    "list-accounts",
    "list-contacts",
    "list-credit-notes",
    "list-currencies",
    "list-invoices",
    "list-items",
    "list-manual-journals",
    "list-quotes",
    "list-tax-rates",
    "list-trial-balance",
    "list-payments",
    "list-prepayments",
    "list-overpayments",
    "list-profit-and-loss",
    "list-bank-transactions",
    "list-bank-transfers",
    "list-payroll-employees",
    "list-report-balance-sheet",
    "list-organisation-details",
    "list-payroll-employee-leave",
    "list-payroll-leave-periods",
    "list-payroll-employee-leave-types",
    "list-payroll-employee-leave-balances",
    "list-payroll-leave-types",
    "list-aged-receivables-by-contact",
    "list-aged-payables-by-contact",
    "list-timesheets",
    "list-contact-groups",
    "list-tracking-categories",
  ],
  update: [
    "update-contact",
    "update-credit-note",
    "update-invoice",
    "update-manual-journal",
    "update-quote",
    "update-item",
    "update-bank-transaction",
    "recode-bank-transaction-tax-type",
    "approve-timesheet",
    "add-timesheet-line",
    "update-timesheet-line",
    "revert-timesheet",
    "update-tracking-category",
    "update-tracking-options",
  ],
};

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const register = (env: NodeJS.ProcessEnv) => {
  const tool = vi.fn();
  ToolFactory({ tool } as unknown as McpServer, env);
  return tool.mock.calls;
};

describe("ToolFactory", () => {
  it("registers all 58 tools once with their definitions unchanged", () => {
    const calls = register({});
    const names = calls.map(([name]) => name);
    expect(names).toEqual(Object.values(EXPECTED).flat());
    expect(new Set(names).size).toBe(58);

    const definitions = [DeleteTools, GetTools, CreateTools, ListTools, UpdateTools]
      .flat()
      .map((tool) => tool());
    definitions.forEach((definition, index) => {
      const [name, description, schema, , handler] = calls[index];
      expect(name).toBe(definition.name);
      expect(description).toBe(definition.description);
      expect(schema).toBe(definition.schema);
      expect(handler).toBe(definition.handler);
    });
  });

  it("marks reads read-only, creations additive and changes destructive", () => {
    const annotations = new Map(
      register({}).map(([name, , , value]) => [name, value]),
    );
    for (const name of [...EXPECTED.get, ...EXPECTED.list]) {
      expect(annotations.get(name), name).toEqual(READ);
    }
    for (const name of EXPECTED.create) {
      expect(annotations.get(name), name).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    }
    for (const name of [...EXPECTED.update, ...EXPECTED.delete]) {
      expect(annotations.get(name), name).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      });
    }
  });

  it.each(["true", " TRUE "])(
    "registers only get and list tools when XERO_READ_ONLY is %j",
    (value) => {
      const calls = register({ XERO_READ_ONLY: value });
      expect(calls.map(([name]) => name)).toEqual([
        ...EXPECTED.get,
        ...EXPECTED.list,
      ]);
      for (const [, , , annotations] of calls) {
        expect(annotations).toEqual(READ);
      }
    },
  );

  it.each([undefined, "", "false"])(
    "registers every tool when XERO_READ_ONLY is %j",
    (value) => {
      expect(register({ XERO_READ_ONLY: value })).toHaveLength(58);
    },
  );

  it.each(["yes", "1", "ture"])(
    "refuses to register anything when XERO_READ_ONLY is %j",
    (value) => {
      expect(() => register({ XERO_READ_ONLY: value })).toThrow(
        "XERO_READ_ONLY must be true or false.",
      );
    },
  );
});
