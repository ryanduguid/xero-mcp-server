# Xero MCP Server

<div align="center">

**Fork status**

[![Fork code quality](https://app.codacy.com/project/badge/Grade/fb763db469b2487181158cf3e6790bef?branch=main)](https://app.codacy.com/gh/ryanduguid/xero-mcp-server/dashboard)

</div>

ryanduguid/xero-mcp-server is [Ryan Duguid](https://duguid.com.au/)'s distribution fork of [XeroAPI/xero-mcp-server](https://github.com/XeroAPI/xero-mcp-server), adding an opt-in read-only mode, tool annotations, bank transfer and tax-type recoding tools and bearer-token-safe errors for Xero MCP users who build from source.

GitHub Actions is off for this fork, so `ci.yml` does not run on GitHub. Run its steps locally before merging.

This is a Model Context Protocol (MCP) server implementation for Xero. It provides a bridge between the MCP protocol and Xero's API, allowing for standardized access to Xero's accounting and business features.

## Features

- Xero OAuth2 authentication with custom connections
- Contact management
- Chart of Accounts management
- Invoice creation and management
- MCP protocol compliance

## Prerequisites

- Node.js 22 for building and testing this fork, matching CI
- npm or pnpm
- A Xero developer account with API credentials

## Docs and Links

- [Xero Public API Documentation](https://developer.xero.com/documentation/api/)
- [Xero API Explorer](https://api-explorer.xero.com/)
- [Xero OpenAPI Specs](https://github.com/XeroAPI/Xero-OpenAPI)
- [Xero-Node Public API SDK Docs](https://xeroapi.github.io/xero-node/accounting)
- [Developer Documentation](https://developer.xero.com/)

## Setup

### Create a Xero Account

If you don't already have a Xero account and organisation already, can create one by signing up [here](https://www.xero.com/au/signup/) using the free trial.

We recommend using a Demo Company to start with because it comes with some pre-loaded sample data. Once you are logged in, switch to it by using the top left-hand dropdown and selecting "Demo Company". You can reset the data on a Demo Company, or change the country, at any time by using the top left-hand dropdown and navigating to [My Xero](https://my.xero.com).

NOTE: The employee, leave and timesheet payroll tools call the Xero Payroll NZ API, so they need a New Zealand organisation. The Australian pay run, payslip and pay item tools call the Xero Payroll AU API and refuse any organisation that is not Australian. They only read: nothing posts, approves or deletes a pay run. There are no UK payroll handlers in this server.

### Authentication

There are 2 modes of authentication supported in the Xero MCP server:

#### 1. Custom Connections

This is a better choice for testing and development which allows you to specify client id and secrets for a specific organisation.
It is also the recommended approach if you are integrating this into 3rd party MCP clients such as Claude Desktop.

##### Configuring your Xero Developer account

Set up a Custom Connection following these instructions: https://developer.xero.com/documentation/guides/oauth2/custom-connections/

##### Required Scopes

Custom connections require different scopes depending on when they were created. **All scopes in the relevant list must be added to your custom connection:**

| Custom Connection Created | Required Scopes |
|---------------------------|-----------------|
| Before Apr 29, 2026 | [SCOPES_V1](src/clients/xero-client.ts#L117-L125) (bundled permissions) |
| From Apr 29, 2026 | [SCOPES_V2](src/clients/xero-client.ts#L128-L142) (granular permissions) |

> **Note:** The MCP server automatically tries V1 scopes first and falls back to V2 if needed.
> 
> You can override these by setting the `XERO_SCOPES` environment variable to a space-separated list of scopes.

##### Opt-in scopes

Some tools need scopes that the default lists do not grant, so they stay off until you grant them. Add the scope to the Custom Connection and to `XERO_SCOPES` alongside the scopes you already use, or request it with the bearer token. Without it, Xero refuses the call.

| Tools | Scope to add | Already granted by |
|-------|--------------|--------------------|
| `list-payroll-pay-runs`, `list-payroll-payslips` | `payroll.payruns.read` | Neither default list |
| `get-payroll-payslip` | `payroll.payslip.read` | Neither default list |
| `list-budgets`, `get-budget` | `accounting.budgets.read` | Neither default list |
| `list-bank-summary` | `accounting.reports.banksummary.read` | `accounting.reports.read` in SCOPES_V1 |
| `list-executive-summary` | `accounting.reports.executivesummary.read` | `accounting.reports.read` in SCOPES_V1 |

Payslips and pay runs show each employee's wages, tax and super, so grant these scopes only where a model may see that data. The Australian payroll tools also read the organisation's country first, which needs `accounting.settings` or `accounting.settings.read`. `list-payroll-pay-items` uses `payroll.settings`, already in the default lists.

##### Choosing an installation route

[`@xeroapi/xero-mcp-server`](https://www.npmjs.com/package/@xeroapi/xero-mcp-server) on npm is the upstream release (0.0.17, published 26 May 2026). It does not carry the changes in this fork, including the error helper that keeps bearer tokens out of tool responses, the annual leave field correction and the tool error flag. Pick the route that matches what you want:

- Upstream release: keep `npx -y @xeroapi/xero-mcp-server@latest` in the examples below.
- This fork: clone it, run `npm ci && npm run build`, then use `command: "node"` with the absolute path of `dist/index.js`, as in the development example further down.

##### Integrating the MCP server with Claude Desktop

To add the MCP server to Claude go to Settings > Developer > Edit config and add the following to your claude_desktop_config.json file:

```json
{
  "mcpServers": {
    "xero": {
      "command": "npx",
      "args": ["-y", "@xeroapi/xero-mcp-server@latest"],
      "env": {
        "XERO_CLIENT_ID": "your_client_id_here",
        "XERO_CLIENT_SECRET": "your_client_secret_here",
        "XERO_SCOPES": "accounting.invoices accounting.contacts accounting.settings"
      }
    }
  }
}
```

The `XERO_SCOPES` variable is optional. If omitted, the default scopes listed above will be used.

NOTE: If you are using [Node Version Manager](https://github.com/nvm-sh/nvm) `"command": "npx"` section change it to be the full path to the executable, ie: `your_home_directory/.nvm/versions/node/v22.14.0/bin/npx` on Mac / Linux or `"your_home_directory\\.nvm\\versions\\node\\v22.14.0\\bin\\npx"` on Windows

#### 2. Bearer Token

Use this when the MCP client obtains a token itself, through an auth flow such as PKCE, and hands it to the server. The server uses the token as supplied. No tool takes a tenant argument, so each server process works against one organisation: see [Choosing the organisation](#choosing-the-organisation).
In this case, use the following configuration:

```json
{
  "mcpServers": {
    "xero": {
      "command": "npx",
      "args": ["-y", "@xeroapi/xero-mcp-server@latest"],
      "env": {
        "XERO_CLIENT_BEARER_TOKEN": "your_bearer_token"
      }
    }
  }
}
```

NOTE: The `XERO_CLIENT_BEARER_TOKEN` will take precedence over the `XERO_CLIENT_ID` if defined.

##### Required Scopes for Bearer Token

When obtaining a bearer token, you must request the appropriate scopes. The scopes you request should be:

> **Note:** Some scopes are being deprecated in favour of more granular scopes. See the [Xero OAuth 2.0 Scopes documentation](https://developer.xero.com/documentation/guides/oauth2/scopes/) for details on deprecation timelines.

```
accounting.transactions (Deprecated)
accounting.transactions.read (Deprecated)
accounting.invoices
accounting.invoices.read
accounting.payments
accounting.payments.read
accounting.banktransactions
accounting.banktransactions.read
accounting.manualjournals
accounting.manualjournals.read
accounting.reports.read (Deprecated)
accounting.reports.aged.read
accounting.reports.balancesheet.read
accounting.reports.profitandloss.read
accounting.reports.trialbalance.read
accounting.contacts 
accounting.settings 
payroll.settings 
payroll.employees 
payroll.timesheets
```

### Choosing the organisation

A Custom Connection or bearer token can reach more than one Xero organisation. When it reaches only one, the server uses it. When it reaches several, set `XERO_TENANT_ID` in the server's `env` to the tenant ID of the organisation to use; until then every tool call is refused with a message listing the reachable tenant IDs and names, rather than reading whichever organisation Xero lists first. A `XERO_TENANT_ID` the connection cannot reach is refused the same way. Run one server process per organisation.

### Read-only mode and tool annotations

Each xero-mcp-server tool carries MCP annotations describing what it does. `get-` and `list-` tools are marked read-only. `create-` tools are marked additive but not safe to repeat, because a second call creates a second record. Every other tool changes an existing record, by updating, approving, reverting, recoding or deleting it, and is marked destructive. `recode-bank-transaction-tax-type` is also marked safe to repeat, because it writes nothing when every line already has the requested tax type. All of them reach Xero, so all are marked open-world. The MCP client decides what to do with these hints, such as asking before each write; they do not block a call.

To offer only the `get-` and `list-` tools, add `"XERO_READ_ONLY": "true"` to the server's `env`. Leaving it unset or empty keeps every tool. Any other value except `true` or `false`, blank space included, stops the server from starting, so a mistyped setting cannot leave the write tools on.

Read-only mode changes what this server offers, not what the Xero connection permits. To have Xero refuse writes as well, use a connection or token with read scopes only.

### Available MCP Commands

- `list-accounts`: Retrieve a list of accounts
- `list-currencies`: Retrieve the organisation's configured currencies
- `list-contacts`: Retrieve a list of contacts from Xero
- `get-contact`: Retrieve one contact by ID
- `list-credit-notes`: Retrieve a list of credit notes
- `list-invoices`: Retrieve a list of invoices
- `list-items`: Retrieve a list of items
- `list-manual-journals`: Retrieve a list of manual journals
- `list-organisation-details`: Retrieve details about an organisation
- `list-profit-and-loss`: Retrieve a profit and loss report
- `list-bank-summary`: Retrieve the Bank Summary report: opening balance, cash received, cash spent and closing balance for each bank account
- `list-executive-summary`: Retrieve the Executive Summary report as at a date
- `list-budgets`: Retrieve the organisation's budgets and their IDs
- `get-budget`: Retrieve one budget's amounts by account and period, with its tracking options
- `list-quotes`: Retrieve a list of quotes
- `list-tax-rates`: Retrieve a list of tax rates
- `list-payments`: Retrieve a list of payments
- `list-prepayments`: Retrieve a list of prepayments
- `list-overpayments`: Retrieve a list of overpayments
- `list-trial-balance`: Retrieve a trial balance report
- `list-bank-transactions`: Retrieve a list of bank account transactions
- `list-bank-transfers`: Retrieve a list of transfers between bank accounts
- `list-payroll-employees`: Retrieve a list of Payroll Employees
- `list-report-balance-sheet`: Retrieve a balance sheet report
- `list-payroll-employee-leave`: Retrieve a Payroll Employee's leave records
- `list-payroll-employee-leave-balances`: Retrieve a Payroll Employee's leave balances
- `list-payroll-employee-leave-types`: Retrieve a list of Payroll leave types
- `list-payroll-leave-periods`: Retrieve a list of a Payroll Employee's leave periods
- `list-payroll-leave-types`: Retrieve a list of all available leave types in Xero Payroll
- `list-timesheets`: Retrieve a list of Payroll Timesheets
- `list-payroll-pay-runs`: Retrieve Australian Payroll AU pay runs, 100 per page
- `list-payroll-payslips`: Retrieve the payslip summaries on an Australian pay run
- `get-payroll-payslip`: Retrieve one Australian payslip, including earnings and superannuation lines
- `list-payroll-pay-items`: Retrieve Australian earnings rates, deduction, leave and reimbursement types
- `list-aged-receivables-by-contact`: Retrieves aged receivables for a contact
- `list-aged-payables-by-contact`: Retrieves aged payables for a contact
- `list-contact-groups`: Retrieve a list of contact groups
- `list-tracking-categories`: Retrieve a list of tracking categories
- `create-bank-transaction`: Create a new bank transaction
- `create-bank-transfer`: Record a transfer between bank accounts
- `create-contact`: Create a new contact
- `create-credit-note`: Create a new credit note
- `create-invoice`: Create a new invoice
- `create-item`: Create a new item
- `create-manual-journal`: Create a new manual journal
- `create-payment`: Create a new payment
- `create-quote`: Create a new quote
- `create-timesheet`: Create a new Payroll Timesheet
- `create-tracking-category`: Create a new tracking category
- `create-tracking-options`: Create tracking options
- `update-bank-transaction`: Update an existing bank transaction
- `recode-bank-transaction-tax-type`: Change tax types on specified bank transactions
- `update-contact`: Update an existing contact
- `update-invoice`: Update an existing draft invoice
- `update-item`: Update an existing item
- `update-manual-journal`: Update an existing manual journal
- `update-quote`: Update an existing draft quote
- `update-credit-note`: Update an existing draft credit note
- `update-tracking-category`: Update an existing tracking category
- `update-tracking-options`: Update tracking options
- `update-timesheet-line`: Update a line on an existing Payroll Timesheet
- `approve-timesheet`: Approve a Payroll Timesheet
- `revert-timesheet`: Revert an approved Payroll Timesheet
- `add-timesheet-line`: Add new line on an existing Payroll Timesheet
- `delete-timesheet`: Delete an existing Payroll Timesheet
- `get-timesheet`: Retrieve an existing Payroll Timesheet

For detailed API documentation, please refer to the [MCP Protocol Specification](https://modelcontextprotocol.io/).

## For Developers

### Installation

```bash
# Using npm
npm install

# Using pnpm
pnpm install
```

### Run a build

```bash
# Using npm
npm run build

# Using pnpm
pnpm build
```

### Integrating with Claude Desktop

To link your Xero MCP server in development to Claude Desktop go to Settings > Developer > Edit config and add the following to your `claude_desktop_config.json` file:

NOTE: For Windows ensure the `args` path escapes every `\` between folders ie. `"C:\\projects\\xero-mcp-server\\dist\\index.js"`. A single `\` before a folder name, such as `\x`, is an invalid JSON escape and the config will not parse.

```json
{
  "mcpServers": {
    "xero": {
      "command": "node",
      "args": ["insert-your-file-path-here/xero-mcp-server/dist/index.js"],
      "env": {
        "XERO_CLIENT_ID": "your_client_id_here",
        "XERO_CLIENT_SECRET": "your_client_secret_here"
      }
    }
  }
}
```

## License

MIT

## Security

Please do not commit your `.env` file or any sensitive credentials to version control (it is included in `.gitignore` as a safe default.)
