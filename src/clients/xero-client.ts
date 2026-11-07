import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import {
  IXeroClientConfig,
  Organisation,
  TokenSet,
  XeroClient,
} from "xero-node";

import { ensureError } from "../helpers/ensure-error.js";

dotenv.config();

const client_id = process.env.XERO_CLIENT_ID;
const client_secret = process.env.XERO_CLIENT_SECRET;
const bearer_token = process.env.XERO_CLIENT_BEARER_TOKEN;
const chosen_tenant_id = process.env.XERO_TENANT_ID?.trim();
const grant_type = "client_credentials";

if (!bearer_token && (!client_id || !client_secret)) {
  throw Error("Environment Variables not set - please check your .env file");
}

type Connection = { tenantId: string; tenantName?: string };

// The tenant IDs and names go to the server log on stderr (stdout carries the
// MCP protocol), not into the refusal: for a practice token they are client
// names, and the model should not see them.
function logReachable(connections: Connection[]): void {
  const reachable = connections
    .map(({ tenantId, tenantName }) => `${tenantId} (${tenantName ?? "unnamed"})`)
    .join(", ");
  console.error(`Xero organisations this connection reaches: ${reachable}`);
}

// A connection or token can reach several organisations. Taking the first one
// Xero lists would read whichever organisation happens to sort first, so with
// more than one the user must choose it with XERO_TENANT_ID.
function chooseTenantId(connections: Connection[]): string {
  if (connections.length === 0) {
    throw new Error(
      "This connection reaches no Xero organisation. Connect one to the app, then try again.",
    );
  }

  const count =
    connections.length === 1
      ? "1 Xero organisation"
      : `${connections.length} Xero organisations`;

  if (chosen_tenant_id) {
    // Tenant IDs are GUIDs, so letter case carries no meaning.
    const chosen = connections.find(
      ({ tenantId }) => tenantId.toLowerCase() === chosen_tenant_id.toLowerCase(),
    );
    if (!chosen) {
      logReachable(connections);
      throw new Error(
        `XERO_TENANT_ID ${chosen_tenant_id} is not among the ${count} this connection reaches. The server log lists their tenant IDs and names.`,
      );
    }
    return chosen.tenantId;
  }

  if (connections.length > 1) {
    logReachable(connections);
    throw new Error(
      `This connection reaches ${count}. Set XERO_TENANT_ID to the one to use; the server log lists their tenant IDs and names.`,
    );
  }

  return connections[0].tenantId;
}

abstract class MCPXeroClient extends XeroClient {
  public tenantId: string;
  private shortCode: string;

  protected constructor(config?: IXeroClientConfig) {
    super(config);
    this.tenantId = "";
    this.shortCode = "";
  }

  public abstract authenticate(): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async updateTenants(fullOrgDetails?: boolean): Promise<any[]> {
    const tenants = await super.updateTenants(fullOrgDetails);
    this.tenantId = chooseTenantId(tenants);
    return tenants;
  }

  private async getOrganisation(): Promise<Organisation> {
    await this.authenticate();

    const organisationResponse = await this.accountingApi.getOrganisations(
      this.tenantId || "",
    );

    const organisation = organisationResponse.body.organisations?.[0];

    if (!organisation) {
      throw new Error("Failed to retrieve organisation");
    }

    return organisation;
  }

  public async getShortCode(): Promise<string | undefined> {
    if (!this.shortCode) {
      try {
        const organisation = await this.getOrganisation();
        this.shortCode = organisation.shortCode ?? "";
      } catch (error: unknown) {
        const err = ensureError(error);

        throw new Error(
          `Failed to get Organisation short code: ${err.message}`,
        );
      }
    }
    return this.shortCode;
  }
}

class CustomConnectionsXeroClient extends MCPXeroClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  // Client credentials tokens last 30 minutes. Without a cache every tool
  // call pays for a token request and a connections lookup before it reaches
  // the Xero API, so hold the token set until it is close to expiry.
  private static readonly REFRESH_BUFFER_MS = 60_000;
  private cachedToken: TokenSet | null = null;
  private cachedTokenExpiresAt = 0;
  private pendingTokenRequest: Promise<TokenSet> | null = null;

  // Legacy scopes (deprecated but still supported for existing apps)
  private readonly XERO_DEFAULT_AUTH_SCOPES_V1 = [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
    "accounting.reports.read",
    "payroll.settings",
    "payroll.employees",
    "payroll.timesheets",
  ].join(" ");

  // Granular scopes (required for new apps)
  private readonly XERO_DEFAULT_AUTH_SCOPES_V2 = [
    "accounting.invoices",
    "accounting.payments",
    "accounting.banktransactions",
    "accounting.manualjournals",
    "accounting.reports.aged.read",
    "accounting.reports.balancesheet.read",
    "accounting.reports.profitandloss.read",
    "accounting.reports.trialbalance.read",
    "accounting.contacts",
    "accounting.settings",
    "payroll.settings",
    "payroll.employees",
    "payroll.timesheets",
  ].join(" ");

  constructor(config: {
    clientId: string;
    clientSecret: string;
    grantType: string;
  }) {
    super(config);
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  private formatTokenError(error: unknown, context: string): Error {
    const axiosError = error as AxiosError;
    const data = axiosError.response?.data;
    const message =
      typeof data === "object" ? JSON.stringify(data) : data || axiosError.message;
    return new Error(`Failed to get Xero token${context}: ${message}`);
  }

  public async getClientCredentialsToken(): Promise<TokenSet> {
    // If XERO_SCOPES is set, use that
    if (process.env.XERO_SCOPES) {                                                                                                                                                     
      try {
        return await this.requestToken(process.env.XERO_SCOPES);
      } catch (envError) {
        throw this.formatTokenError(envError, " with XERO_SCOPES");
      }
    }

    // Else if XERO_SCOPES is not set, try V1 scopes first (for existing apps), fallback to V2 scopes (for new apps) only on invalid_scope error
    try {
      return await this.requestToken(this.XERO_DEFAULT_AUTH_SCOPES_V1);
    } catch (error) {
      const axiosError = error as AxiosError;
      const isInvalidScope =
        axiosError.response?.status === 400 &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (axiosError.response?.data as any)?.error === "invalid_scope";

      if (!isInvalidScope) {
        throw this.formatTokenError(error, " with V1 scopes");
      }

      try {
        return await this.requestToken(this.XERO_DEFAULT_AUTH_SCOPES_V2);
      } catch (v2Error) {
        throw this.formatTokenError(v2Error, " with V2 scopes");
      }
    }
  }

  private async requestToken(scope: string): Promise<TokenSet> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const response = await axios.post(
      "https://identity.xero.com/connect/token",
      `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
      {
        timeout: 30_000,
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    return response.data;
  }

  private async chooseTenant(token: TokenSet): Promise<void> {
    const connectionsResponse = await axios.get(
      "https://api.xero.com/connections",
      {
        timeout: 30_000,
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/json",
        },
      },
    );

    this.tenantId = chooseTenantId(connectionsResponse.data ?? []);
  }

  private cacheToken(token: TokenSet): void {
    const lifetimeSeconds = token.expires_in;

    // An unknown lifetime is not cacheable: reusing it would keep serving a
    // token that Xero may already have expired.
    if (typeof lifetimeSeconds !== "number" || lifetimeSeconds <= 0) {
      this.cachedToken = null;
      this.cachedTokenExpiresAt = 0;
      return;
    }

    this.cachedToken = token;
    this.cachedTokenExpiresAt = Date.now() + lifetimeSeconds * 1000;
  }

  private async getCachedClientCredentialsToken(): Promise<TokenSet> {
    if (
      this.cachedToken &&
      this.cachedTokenExpiresAt - Date.now() >
        CustomConnectionsXeroClient.REFRESH_BUFFER_MS
    ) {
      return this.cachedToken;
    }

    // Share one request between concurrent tool calls so a cache miss cannot
    // fan out into several token requests against Xero's rate limit.
    // An organisation that cannot be chosen fails the call before the token is
    // cached, so the next call asks again rather than reusing it.
    this.pendingTokenRequest ??= this.getClientCredentialsToken()
      .then(async (token) => {
        await this.chooseTenant(token);
        this.cacheToken(token);
        return token;
      })
      .finally(() => {
        this.pendingTokenRequest = null;
      });

    return this.pendingTokenRequest;
  }

  public async authenticate() {
    const tokenResponse = await this.getCachedClientCredentialsToken();

    this.setTokenSet({
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type,
    });
  }
}

class BearerTokenXeroClient extends MCPXeroClient {
  private readonly bearerToken: string;

  constructor(config: { bearerToken: string }) {
    super();
    this.bearerToken = config.bearerToken;
  }

  async authenticate(): Promise<void> {
    this.setTokenSet({
      access_token: this.bearerToken,
    });

    await this.updateTenants();
  }
}

export const xeroClient = bearer_token
  ? new BearerTokenXeroClient({
      bearerToken: bearer_token,
    })
  : new CustomConnectionsXeroClient({
      clientId: client_id!,
      clientSecret: client_secret!,
      grantType: grant_type,
    });
