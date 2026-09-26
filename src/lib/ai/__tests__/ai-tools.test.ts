import { describe, it, expect } from "vitest";
import { isGeminiConfigured, getGeminiApiKey } from "../gemini";
import { buildSystemPrompt } from "../prompts";
import { getScopedAiTools } from "../tools";

describe("AI Assistant Suite", () => {
  it("verifies gemini configuration resolution", () => {
    // Should return a boolean without throwing
    const configured = isGeminiConfigured();
    expect(typeof configured).toBe("boolean");
  });

  it("builds domain-aware system prompt with user context", () => {
    const prompt = buildSystemPrompt({
      userId: "u-123",
      name: "Admin User",
      email: "admin@msf.org",
      isAdmin: true,
      organizationId: "org-456",
    });

    expect(prompt).toContain("HAMS Copilot");
    expect(prompt).toContain("Admin User");
    expect(prompt).toContain("admin@msf.org");
    expect(prompt).toContain("org-456");
    expect(prompt).toContain("Housing & Households (HAMS)");
    expect(prompt).toContain("Asset Management");
  });

  it("instantiates all required asset, housing, and ticket tools", () => {
    const tools = getScopedAiTools("test-org-id", "test-user-id");

    // Asset tools
    expect(tools.searchAssets).toBeDefined();
    expect(tools.getExpiringWarranties).toBeDefined();
    expect(tools.getStockAlerts).toBeDefined();
    expect(tools.getAssetDetails).toBeDefined();

    // Housing tools
    expect(tools.getHousingKpis).toBeDefined();
    expect(tools.queryHouseQueue).toBeDefined();
    expect(tools.searchHouseholds).toBeDefined();
    expect(tools.getInspectionSummary).toBeDefined();

    // Ticket tools
    expect(tools.searchTickets).toBeDefined();
    expect(tools.draftMaintenanceTicket).toBeDefined();
  });

  it("correctly drafts a maintenance ticket with human confirmation preview", async () => {
    const tools = getScopedAiTools("test-org-id", "test-user-id");
    const result = await tools.draftMaintenanceTicket.execute(
      {
        title: "Broken AC in House 102",
        description: "Unit is leaking water onto the floor",
        priority: "high",
        referenceType: "house",
        referenceId: "H-102",
      },
      { messages: [], toolCallId: "tc-1" },
    );

    expect(result.draftStatus).toBe("ready_for_confirmation");
    expect(result.action).toBe("create_ticket");
    expect(result.payload.title).toBe("Broken AC in House 102");
    expect(result.payload.priority).toBe("high");
    expect(result.payload.description).toContain("[Ref: HOUSE H-102]");
    expect(result.confirmationMessage).toContain("Broken AC in House 102");
  });
});
