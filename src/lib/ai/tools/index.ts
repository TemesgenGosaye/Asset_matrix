import { createAssetTools } from "./asset-tools";
import { createHousingTools } from "./housing-tools";
import { createTicketTools } from "./ticket-tools";

export function getScopedAiTools(organizationId: string, userId: string) {
  return {
    ...createAssetTools(organizationId),
    ...createHousingTools(organizationId),
    ...createTicketTools(organizationId, userId),
  };
}
