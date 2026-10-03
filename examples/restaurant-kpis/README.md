# Example: restaurant KPI home

Example of a restaurant-management assistant ("Mesa Boa"). The product and all data are fictitious.

| File | Contents |
| --- | --- |
| `src/surface.ts` | 19 cards (sales, menu, delivery, dine-in, reviews, customers, market), 5 alerts, 6 assistant suggestions, rubric, fixed zone by archetype |
| `src/signals.ts` | Metrics, navigation, chat and reviews providers. Numbers and dates computed in code |
| `src/fixtures.ts` | 3 restaurants: delivery-first burger place, dine-in bistro, 3-unit pizza chain |

Planned (M1): a Next.js page with the fixed zone, adaptive zone, alert slot, suggestion row
and a debug panel, running on `mockDecider` by default.
