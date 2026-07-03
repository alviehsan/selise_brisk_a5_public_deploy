import type { DashboardRecommendation, DatasetProfile } from "./briskTypes";

const RECOMMENDATIONS: DashboardRecommendation[] = [
  {
    name: "Executive Sales Performance Dashboard",
    confidence: 94,
    audience: "CEO, CRO, Head of Sales",
    kpis: ["Revenue", "Gross Profit", "Orders"],
    limitations: ["Sales Target not found"]
  },
  {
    name: "Regional Sales Overview",
    confidence: 89,
    audience: "Sales Ops, Regional Managers",
    kpis: ["Revenue by Region", "Orders", "Gross Profit"],
    limitations: ["No target comparison available"]
  },
  {
    name: "Product Mix Tracker",
    confidence: 86,
    audience: "Product, Sales Leadership",
    kpis: ["Revenue by Product", "Order Count", "Margin"],
    limitations: ["Customer segmentation not available"]
  },
  {
    name: "Customer Performance Summary",
    confidence: 82,
    audience: "Account Managers, Sales Leadership",
    kpis: ["Revenue by Customer", "Order Frequency", "Gross Profit"],
    limitations: ["Target and pipeline data missing"]
  }
];

export function createDashboardRecommendations(
  profile: DatasetProfile
): DashboardRecommendation[] {
  if (profile.domain.name.includes("Sales") || profile.revenueField) {
    return RECOMMENDATIONS.map((recommendation) => ({
      ...recommendation,
      limitations: recommendation.limitations.filter((item, index, items) => items.indexOf(item) === index)
    }));
  }

  return [];
}
