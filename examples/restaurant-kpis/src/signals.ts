/**
 * Signal providers for the restaurant example. They read fictitious fixtures;
 * a real integration replaces `fixtures` with its own data access.
 * Rule of thumb: compute numbers and dates here, send the model short text.
 */
import type { SignalProvider } from "@reflexui-jev/core";
import { fixtures } from "./fixtures";
import type { RestaurantCtx } from "./surface";

export const metricsSignal: SignalProvider<RestaurantCtx> = {
  id: "metrics",
  feeds: ["relevance", "alerts"],
  maxTokens: 1500,
  async collect(ctx) {
    const f = fixtures[ctx.restaurantId];
    return {
      key: "metrics",
      value: f?.metrics.map((m) => `${m.label}: ${m.value} (${m.vs28d}x the 28-day average)`) ?? [],
      facts: f?.metrics
        .filter((m) => m.vs28d >= 1.5 || m.vs28d <= 0.67)
        .map((m) => ({ area: m.area, kind: "anomaly", values: { metric: m.label, ratio: m.vs28d } })),
    };
  },
};

export const navigationSignal: SignalProvider<RestaurantCtx> = {
  id: "navigation",
  feeds: ["relevance"],
  maxTokens: 500,
  async collect(ctx) {
    const f = fixtures[ctx.restaurantId];
    return {
      key: "navigation",
      value: f?.navigation ?? [],
      facts: f?.navigationCounts.map((n) => ({ area: n.area, kind: "navigation", values: { screen: n.screen, count: n.count } })),
    };
  },
};

export const chatSignal: SignalProvider<RestaurantCtx> = {
  id: "chat",
  feeds: ["relevance", "alerts"],
  maxTokens: 2000,
  async collect(ctx) {
    const f = fixtures[ctx.restaurantId];
    // Owner messages only, last 14 days, PII already removed upstream.
    return { key: "chat", value: f?.ownerMessages ?? [] };
  },
};

export const reviewsSignal: SignalProvider<RestaurantCtx> = {
  id: "reviews",
  feeds: ["alerts"],
  maxTokens: 2500,
  async collect(ctx) {
    const f = fixtures[ctx.restaurantId];
    return {
      key: "reviews",
      value: f?.reviews.map((rv) => `${rv.stars}★ (${rv.daysAgo} days ago): ${rv.text}`) ?? [],
    };
  },
};
