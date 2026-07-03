import { describe, expect, it } from "vitest";
import { parseCsvText, sheetDataToRows } from "./fileParser";

describe("file parser", () => {
  it("parses CSV text into typed business rows", () => {
    const rows = parseCsvText(
      "Order Date,Region,Sales Amount,Gross Profit,Orders\n2026-01-01,North,120000,42000,420\n2026-02-01,South,98000,26000,360"
    );

    expect(rows).toEqual([
      {
        "Order Date": "2026-01-01",
        Region: "North",
        "Sales Amount": 120000,
        "Gross Profit": 42000,
        Orders: 420
      },
      {
        "Order Date": "2026-02-01",
        Region: "South",
        "Sales Amount": 98000,
        "Gross Profit": 26000,
        Orders: 360
      }
    ]);
  });

  it("handles quoted CSV values with commas", () => {
    const rows = parseCsvText('Customer,Region,Sales Amount\n"Acme, Inc.",North,1200');

    expect(rows[0].Customer).toBe("Acme, Inc.");
    expect(rows[0]["Sales Amount"]).toBe(1200);
  });

  it("normalizes workbook sheet objects returned by read-excel-file default export", () => {
    const rows = sheetDataToRows([
      {
        sheet: "Sheet1",
        data: [
          ["Region", "Revenue"],
          ["North", 10]
        ]
      }
    ]);

    expect(rows).toEqual([{ Region: "North", Revenue: 10 }]);
  });
});
