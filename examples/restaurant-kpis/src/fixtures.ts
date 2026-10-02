/** Three fictitious restaurants covering the main archetypes. */
import type { RestaurantCtx } from "./surface";

interface Fixture {
  ctx: RestaurantCtx;
  metrics: Array<{ area: string; label: string; value: string; vs28d: number }>;
  navigation: string[];
  navigationCounts: Array<{ area: string; screen: string; count: number }>;
  ownerMessages: string[];
  reviews: Array<{ stars: number; daysAgo: number; text: string }>;
}

export const fixtures: Record<string, Fixture> = {
  // Delivery-first, single unit, late deliveries this week.
  "burger-lab": {
    ctx: { restaurantId: "burger-lab", units: 1, hasDelivery: true, hasDineIn: false, platforms: 2, menuItems: 24, competitorsMapped: true, recentReviews: 41, hasCustomerData: true },
    metrics: [
      { area: "delivery", label: "Total delivery time", value: "52 min", vs28d: 1.6 },
      { area: "delivery", label: "Cancellation rate", value: "4.1%", vs28d: 1.2 },
      { area: "sales", label: "Orders", value: "1,180/week", vs28d: 0.95 },
    ],
    navigation: ["opened Delivery time detail", "opened Reviews", "opened Delivery time detail"],
    navigationCounts: [{ area: "delivery", screen: "Delivery time", count: 5 }],
    ownerMessages: ["why are orders taking so long on Friday?", "is the delay from the kitchen or the couriers?"],
    reviews: [
      { stars: 2, daysAgo: 1, text: "Took over an hour, burger arrived cold." },
      { stars: 3, daysAgo: 2, text: "Good food but delivery was very late." },
      { stars: 5, daysAgo: 3, text: "Best smash burger in the area." },
    ],
  },
  // Dine-in bistro, single unit, priced above the neighborhood.
  "bistro-verde": {
    ctx: { restaurantId: "bistro-verde", units: 1, hasDelivery: false, hasDineIn: true, platforms: 0, menuItems: 32, competitorsMapped: true, recentReviews: 12, hasCustomerData: false },
    metrics: [
      { area: "dine-in", label: "Table turnover", value: "1.4/night", vs28d: 0.8 },
      { area: "market", label: "Average price", value: "R$ 78 (competitors R$ 70)", vs28d: 1.0 },
    ],
    navigation: ["opened Market intelligence", "opened Price position"],
    navigationCounts: [{ area: "market", screen: "Market intelligence", count: 4 }],
    ownerMessages: ["am I too expensive for this neighborhood?"],
    reviews: [{ stars: 4, daysAgo: 5, text: "Lovely place, a bit pricey." }],
  },
  // Three-unit chain, one unit underperforming.
  "pizza-norte": {
    ctx: { restaurantId: "pizza-norte", units: 3, hasDelivery: true, hasDineIn: true, platforms: 2, menuItems: 45, competitorsMapped: true, recentReviews: 88, hasCustomerData: true },
    metrics: [
      { area: "sales", label: "Revenue, unit Centro", value: "R$ 41k/week", vs28d: 0.62 },
      { area: "sales", label: "Revenue, network", value: "R$ 190k/week", vs28d: 0.93 },
    ],
    navigation: ["opened Unit ranking", "filtered unit Centro"],
    navigationCounts: [{ area: "sales", screen: "Unit ranking", count: 3 }],
    ownerMessages: ["what happened with the Centro unit this week?"],
    reviews: [{ stars: 3, daysAgo: 2, text: "Centro unit was understaffed, long wait." }],
  },
};
