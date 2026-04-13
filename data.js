window.DEMO_DATA = {
  meta: {
    demoToday: "2026-04-06",
    portfolioName: "Test Portfolio",
    organizationName: "TestOrg101001",
    organizationId: "500032119",
    properties: 5,
    grossFloorArea: "1,000,000 sq ft",
    scope: "Portfolio based on location",
    assetUnderManagement: "$1,000,000 USD"
  },
  categories: [
    { id: "summary", label: "Summary", route: "#/portfolio/summary" },
    { id: "energy", label: "Energy", route: "#/metric/energy-renewable-energy-use" },
    { id: "emissions", label: "Emissions", route: "#/metric/emissions-total-ghg" },
    { id: "water", label: "Water", route: "#/metric/water-use-intensity" },
    { id: "waste", label: "Waste" },
    { id: "health", label: "Health" },
    { id: "resilience", label: "Resilience" },
    { id: "social-impact", label: "Social Impact" },
    { id: "biodiversity", label: "Biodiversity" }
  ],
  metrics: [
    {
      id: "emissions-total-ghg",
      category: "emissions",
      categoryLabel: "Emissions",
      name: "Total GHG Emissions",
      shortLabel: "Total GHG Emissions",
      description: "Portfolio-wide emissions across the reporting year.",
      uomOptions: ["mtCO2e", "kgCO2e"]
    },
    {
      id: "energy-renewable-energy-use",
      category: "energy",
      categoryLabel: "Energy",
      name: "Renewable Energy Use",
      shortLabel: "Renewable Energy Use",
      description: "Share of energy supplied through renewable sources.",
      uomOptions: ["%", "MWh", "kWh"]
    },
    {
      id: "water-use-intensity",
      category: "water",
      categoryLabel: "Water",
      name: "Water Use Intensity",
      shortLabel: "Water Use Intensity",
      description: "Normalized water use per area over the reporting year.",
      uomOptions: ["gal/ft²", "L/m²"]
    }
  ],
  targetsByMetricId: {
    "emissions-total-ghg": [],
    "energy-renewable-energy-use": [
      {
        id: "target-energy-public",
        metricId: "energy-renewable-energy-use",
        name: "Public renewable target",
        value: 80,
        uom: "%",
        endDate: "2030-12-31"
      },
      {
        id: "target-energy-divisional",
        metricId: "energy-renewable-energy-use",
        name: "Divisional procurement target",
        value: 120000,
        uom: "MWh",
        endDate: "2029-12-31"
      }
    ],
    "water-use-intensity": [
      {
        id: "target-water-intensity",
        metricId: "water-use-intensity",
        name: "Reduce WUI by 2030",
        value: 24,
        uom: "gal/ft²",
        endDate: "2030-12-31"
      }
    ]
  },
  datapointsByMetricId: {
    "emissions-total-ghg": [
      {
        id: "dp-ghg-2022",
        metricId: "emissions-total-ghg",
        targetId: null,
        endDate: "2022-12-31",
        value: 480,
        uom: "mtCO2e",
        status: "Draft"
      },
      {
        id: "dp-ghg-2023",
        metricId: "emissions-total-ghg",
        targetId: null,
        endDate: "2023-12-31",
        value: 452,
        uom: "mtCO2e",
        status: "Ready for Review"
      }
    ],
    "energy-renewable-energy-use": [
      {
        id: "dp-energy-2023-headless",
        metricId: "energy-renewable-energy-use",
        targetId: null,
        name: "2023 Renewables",
        endDate: "2023-12-31",
        value: 54,
        uom: "%",
        status: "Draft"
      },
      {
        id: "dp-energy-2024-public",
        metricId: "energy-renewable-energy-use",
        targetId: "target-energy-public",
        endDate: "2024-12-31",
        value: 62,
        uom: "%",
        status: "Ready for Review"
      },
      {
        id: "dp-energy-2025-divisional",
        metricId: "energy-renewable-energy-use",
        targetId: "target-energy-divisional",
        endDate: "2025-12-31",
        value: 118000,
        uom: "MWh",
        status: "Draft"
      },
      {
        id: "dp-energy-2027-public",
        metricId: "energy-renewable-energy-use",
        targetId: "target-energy-public",
        endDate: "2027-12-31",
        value: 70,
        uom: "%",
        status: "Draft"
      },
      {
        id: "dp-energy-2028-divisional",
        metricId: "energy-renewable-energy-use",
        targetId: "target-energy-divisional",
        endDate: "2028-12-31",
        value: 110000,
        uom: "MWh",
        status: "Draft"
      }
    ],
    "water-use-intensity": [
      {
        id: "dp-water-2021",
        metricId: "water-use-intensity",
        targetId: "target-water-intensity",
        endDate: "2021-12-31",
        value: 31,
        uom: "gal/ft²",
        status: "Verified"
      },
      {
        id: "dp-water-2023",
        metricId: "water-use-intensity",
        targetId: "target-water-intensity",
        endDate: "2023-12-31",
        value: 29,
        uom: "gal/ft²",
        status: "Submitted"
      },
      {
        id: "dp-water-2024-headless",
        metricId: "water-use-intensity",
        targetId: null,
        endDate: "2024-12-31",
        value: 8.6,
        uom: "L/m²",
        status: "Draft"
      },
      {
        id: "dp-water-2027",
        metricId: "water-use-intensity",
        targetId: "target-water-intensity",
        endDate: "2027-12-31",
        value: 26,
        uom: "gal/ft²",
        status: "Draft"
      }
    ]
  }
};
