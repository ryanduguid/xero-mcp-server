import { vi } from "vitest";

export const mockAccountingApi = {
  getQuote: vi.fn(),
  getQuotes: vi.fn(),
};

export const mockXeroClient = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  tenantId: "tenant-1",
  accountingApi: mockAccountingApi,
  getShortCode: vi.fn().mockResolvedValue("!abc"),
};

export function resetXeroClientMocks() {
  mockXeroClient.authenticate.mockClear();
  mockXeroClient.authenticate.mockResolvedValue(undefined);
  mockXeroClient.getShortCode.mockClear();
  mockXeroClient.getShortCode.mockResolvedValue("!abc");
  for (const fn of Object.values(mockAccountingApi)) {
    fn.mockReset();
  }
}
