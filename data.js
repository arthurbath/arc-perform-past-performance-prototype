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
    { id: "energy", label: "Energy", route: "#/metric/energy-renewable-energy-use" }
  ],
  metrics: [
    {
      id: "energy-renewable-energy-use",
      category: "energy",
      categoryLabel: "Energy",
      name: "Renewable Energy Use",
      shortLabel: "Renewable Energy Use",
      description: "Share of energy supplied through renewable sources.",
      uomOptions: ["%", "MWh", "kWh"]
    }
  ],
  targetsByMetricId: {
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
    ]
  },
  datapointsByMetricId: {
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
    ]
  }
};
