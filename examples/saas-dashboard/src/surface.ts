/**
 * Second domain, kept small on purpose: proves the core carries no
 * restaurant concepts. A B2B SaaS admin dashboard.
 */
import { defineSurface } from "@reflexui/core";

export interface WorkspaceCtx {
  workspaceId: string;
  seats: number;
  hasSso: boolean;
  plan: "free" | "team" | "enterprise";
}

export const adminHome = defineSurface<WorkspaceCtx>({
  id: "saas-admin-home",
  fixed: () => ["active-users", "seats-used", "open-tickets", "uptime"],
  defaultOrder: () => ["usage-trend", "feature-adoption", "billing", "security-events"],
  items: [
    { id: "usage-trend", kind: "card", area: "usage", title: "Usage trend" },
    { id: "feature-adoption", kind: "card", area: "usage", title: "Feature adoption" },
    { id: "billing", kind: "card", area: "billing", title: "Billing and invoices", eligible: (c) => c.plan !== "free" },
    { id: "security-events", kind: "card", area: "security", title: "Security events", eligible: (c) => c.hasSso },
    { id: "seat-growth", kind: "card", area: "billing", title: "Seat growth", eligible: (c) => c.seats >= 10 },
    { id: "alert-churn-risk", kind: "alert", area: "usage", title: "Churn risk", question: "Do recent usage and tickets suggest this workspace may churn?" },
  ],
  signals: [],
  relevanceLevels: [
    "Nothing changed in this area and the admin showed no interest in it.",
    "The admin looked at this area recently; numbers are normal.",
    "Numbers moved out of range or the area shows up in tickets.",
    "An active problem here needs the admin's action today.",
  ],
  relevancePrompt: 'How important is it for the admin to see "{title}" today?',
});
