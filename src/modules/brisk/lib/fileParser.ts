import { readSheet } from "read-excel-file/browser";
import type { DatasetRow } from "./brisk";

export async function parseUploadedFile(file: File): Promise<DatasetRow[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return parseCsvText(await readFileText(file));
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const matrix = (await readSheet(file) as unknown) as unknown[][];
    return sheetDataToRows(matrix);
  }

  throw new Error("Unsupported file type. Upload .xlsx, .xls, or .csv.");
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read uploaded file."));
    reader.readAsText(file);
  });
}

export function parseCsvText(text: string): DatasetRow[] {
  const records = parseCsvRecords(text);

  if (records.length < 2) {
    return [];
  }

  return sheetDataToRows(records);
}

export function sheetDataToRows(input: unknown): DatasetRow[] {
  const matrix = normalizeSheetMatrix(input);
  const [headerRow, ...bodyRows] = matrix;

  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((value, index) => {
    const label = String(value ?? "").trim();
    return label || `Column ${index + 1}`;
  });

  return bodyRows
    .filter((row) => row.some((value) => value !== null && value !== undefined && String(value).trim() !== ""))
    .map((row) =>
      headers.reduce<DatasetRow>((acc, header, index) => {
        acc[header] = normalizeCell(row[index]);
        return acc;
      }, {})
    );
}

function normalizeSheetMatrix(input: unknown): unknown[][] {
  if (Array.isArray(input) && Array.isArray(input[0])) {
    return input as unknown[][];
  }

  if (Array.isArray(input) && input[0] && typeof input[0] === "object" && "data" in input[0]) {
    const firstSheet = input[0] as { data?: unknown };
    return Array.isArray(firstSheet.data) ? normalizeSheetMatrix(firstSheet.data) : [];
  }

  return [];
}

function normalizeCell(value: unknown): DatasetRow[string] {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  const numeric = Number(text.replace(/,/g, ""));
  return text !== "" && Number.isFinite(numeric) ? numeric : text;
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell !== "")) {
    rows.push(row);
  }

  return rows;
}
