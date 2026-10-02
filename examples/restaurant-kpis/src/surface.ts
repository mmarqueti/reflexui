/**
 * Restaurant KPI home. Public, anonymized version of the first production
 * case (Toqan for Restaurants). All data here is fictitious.
 */
import { defineSurface, type SurfaceItem } from "@reflexui/core";
import { chatSignal, metricsSignal, navigationSignal, reviewsSignal } from "./signals";

export interface RestaurantCtx {
  restaurantId: string;
  units: number;
  hasDelivery: boolean;
  hasDineIn: boolean;
  platforms: number;
  menuItems: number;
  competitorsMapped: boolean;
  recentReviews: number; // last 28 days
  hasCustomerData: boolean;
}

const levels = [
  "Nothing changed in this area and the owner showed no recent interest in it.",
  "The owner looked at or asked about this area recently, but the numbers are normal.",
  "Numbers in this area moved out of the normal range, or it keeps coming up in reviews or chat.",
  "There is an active problem in this area that needs the owner's action today.",
] as const;

const r = {
  anomaly: { when: "anomaly", text: "{metric} is {ratio}x the 28-day average" },
  feedback: { when: "feedback", text: "{count} reviews in the last 7 days mention {topic}" },
  chat: { when: "conversation", text: "You asked about {area} {count} times this week" },
  nav: { when: "navigation", text: "You opened {screen} {count} times in the last 14 days" },
} as const;
const reasons = [r.anomaly, r.feedback, r.chat, r.nav];

type Item = SurfaceItem<RestaurantCtx>;

const cards: Item[] = [
  // Sales
  { id: "revenue-by-channel", kind: "card", area: "sales", title: "Revenue by channel", eligible: (c) => c.hasDelivery && c.hasDineIn, reasons },
  { id: "revenue-by-unit", kind: "card", area: "sales", title: "Revenue by unit", eligible: (c) => c.units >= 2, reasons },
  { id: "unit-ranking", kind: "card", area: "sales", title: "Unit ranking", eligible: (c) => c.units >= 3, reasons },
  { id: "peak-hours", kind: "card", area: "sales", title: "Peak hours", reasons },
  // Menu
  { id: "top-dishes", kind: "card", area: "menu", title: "Best-selling dishes", reasons },
  { id: "dead-items", kind: "card", area: "menu", title: "Items with no sales in 14 days", eligible: (c) => c.menuItems >= 20, reasons },
  // Delivery
  { id: "prep-time", kind: "card", area: "delivery", title: "Preparation time", eligible: (c) => c.hasDelivery, reasons },
  { id: "delivery-time", kind: "card", area: "delivery", title: "Total delivery time", eligible: (c) => c.hasDelivery, reasons },
  { id: "cancellation-rate", kind: "card", area: "delivery", title: "Cancellation rate", eligible: (c) => c.hasDelivery, reasons },
  { id: "orders-by-platform", kind: "card", area: "delivery", title: "Orders by platform", eligible: (c) => c.platforms >= 2, reasons },
  // Dine-in
  { id: "table-turnover", kind: "card", area: "dine-in", title: "Table turnover", eligible: (c) => c.hasDineIn, reasons },
  // Reviews
  { id: "rating-trend", kind: "card", area: "reviews", title: "Rating trend", reasons },
  { id: "review-topics", kind: "card", area: "reviews", title: "Review topics", eligible: (c) => c.recentReviews >= 10, reasons },
  // Customers
  { id: "returning-customers", kind: "card", area: "customers", title: "Returning customers", eligible: (c) => c.hasCustomerData, reasons },
  // Market
  { id: "price-position", kind: "card", area: "market", title: "Price position vs competitors", eligible: (c) => c.competitorsMapped, reasons },
  { id: "competition", kind: "card", area: "market", title: "Similar restaurants nearby", reasons },
  { id: "rating-vs-competitors", kind: "card", area: "market", title: "Rating vs competitors", eligible: (c) => c.competitorsMapped, reasons },
  { id: "reviews-vs-competitors", kind: "card", area: "market", title: "Review volume vs competitors", eligible: (c) => c.competitorsMapped, reasons },
  { id: "menu-gaps", kind: "card", area: "market", title: "Menu gaps vs competitors", eligible: (c) => c.competitorsMapped, reasons },
];

const alerts: Item[] = [
  { id: "alert-late-delivery", kind: "alert", area: "delivery", title: "Late-delivery complaints", question: "Do recent reviews point to a late-delivery problem?", eligible: (c) => c.hasDelivery, reasons },
  { id: "alert-food-quality", kind: "alert", area: "reviews", title: "Food-quality complaints", question: "Do recent reviews complain about temperature, taste or wrong orders?", reasons },
  { id: "alert-cancellations", kind: "alert", area: "delivery", title: "Unusual cancellations", question: "Do recent cancellations indicate an operational problem rather than an isolated case?", eligible: (c) => c.hasDelivery, reasons },
  { id: "alert-recurring-concern", kind: "alert", area: "chat", title: "Recurring concern in chat", question: "Has the owner returned to the same problem several times in recent chat?", reasons },
  { id: "alert-sales-drop", kind: "alert", area: "sales", title: "Sales drop", question: "Does the sales drop look abnormal for the period rather than seasonal?", reasons },
];

const suggestions: Item[] = [
  { id: "q-competitors", kind: "suggestion", area: "market", title: "Who is winning in my neighborhood?" },
  { id: "q-price", kind: "suggestion", area: "market", title: "How does my price compare to competitors?" },
  { id: "q-menu-gaps", kind: "suggestion", area: "menu", title: "Which items do competitors have that I don't?" },
  { id: "q-late", kind: "suggestion", area: "delivery", title: "Why are my deliveries late?" },
  { id: "q-reviews", kind: "suggestion", area: "reviews", title: "What are customers complaining about this week?" },
  { id: "q-best-unit", kind: "suggestion", area: "sales", title: "Which unit is performing best, and why?", eligible: (c) => c.units >= 2 },
];

export const restaurantHome = defineSurface<RestaurantCtx>({
  id: "restaurant-home",
  fixed: (c) =>
    c.units >= 2
      ? ["revenue", "orders", "avg-ticket", "revenue-per-unit"]
      : ["revenue", "orders", "avg-ticket", "avg-rating"],
  defaultOrder: (c) =>
    c.hasDelivery
      ? ["delivery-time", "cancellation-rate", "rating-trend", "top-dishes", "price-position", "peak-hours"]
      : ["table-turnover", "rating-trend", "top-dishes", "price-position", "peak-hours", "review-topics"],
  items: [...cards, ...alerts, ...suggestions],
  signals: [metricsSignal, navigationSignal, chatSignal, reviewsSignal],
  relevanceLevels: levels,
  relevancePrompt: 'How important is it for the owner to see "{title}" today?',
  focus: {
    prompt: "Which area has the owner's attention right now?",
    options: { delivery: "Delivery operations", "dine-in": "Dining room", menu: "Menu", reviews: "Reviews and reputation", sales: "Sales", none: null },
  },
});
