import { vi } from "vitest";

export const mockAccountingApi = {
  getRepeatingInvoices: vi.fn(),
  getRepeatingInvoice: vi.fn(),
  createRepeatingInvoices: vi.fn(),
  updateRepeatingInvoice: vi.fn(),
};

export const mockXeroClient = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  tenantId: "tenant-1",
  accountingApi: mockAccountingApi,
  getShortCode: vi.fn().mockResolvedValue("!abc"),
};

export function resetXeroClientMocks() {
  mockXeroClient.authenticate.mockClear();
  mockXeroClient.getShortCode.mockClear();
  mockXeroClient.getShortCode.mockResolvedValue("!abc");
  mockXeroClient.authenticate.mockResolvedValue(undefined);
  for (const fn of Object.values(mockAccountingApi)) {
    fn.mockReset();
  }
}
