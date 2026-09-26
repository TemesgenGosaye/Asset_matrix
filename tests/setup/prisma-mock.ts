import { vi } from "vitest";

export function createMockPrisma() {
  const mockMethods = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({}),
  });

  return {
    user: mockMethods(),
    asset: mockMethods(),
    accessory: mockMethods(),
    licence: mockMethods(),
    consumable: mockMethods(),
    organization: mockMethods(),
    role: mockMethods(),
    audit_logs: mockMethods(),
    webhook: mockMethods(),
    webhookDelivery: mockMethods(),
    verification_tokens: mockMethods(),
    user_preferences: mockMethods(),
    notification_preferences: mockMethods(),
    session_tracking: mockMethods(),
    maintenance_schedule: mockMethods(),
    department: mockMethods(),
    ticket: mockMethods(),
    ticket_comment: mockMethods(),
    approval_request: mockMethods(),
    reservation: mockMethods(),
    custom_field: mockMethods(),
    custom_field_value: mockMethods(),
    workflow: mockMethods(),
    stock_alert: mockMethods(),
    team_invitation: mockMethods(),
    dashboard_widget: mockMethods(),
    asset_checkout: mockMethods(),
    $transaction: vi
      .fn()
      .mockImplementation((fn) =>
        typeof fn === "function" ? fn({}) : Promise.all(fn),
      ),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
