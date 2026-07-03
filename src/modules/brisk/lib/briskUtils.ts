import type { DatasetRow } from "./briskTypes";

export function findField(fields: string[], candidates: string[]): string | undefined {
  return fields.find((field) => candidates.some((candidate) => field.toLowerCase() === candidate)) ??
    fields.find((field) => candidates.some((candidate) => field.toLowerCase().includes(candidate)));
}

export function normalizeMonth(value: DatasetRow[string]): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? "Unknown");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function toNumber(value: DatasetRow[string]): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

export function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function compact<T>(items: Array<T | undefined | null | false>): T[] {
  return items.filter(Boolean) as T[];
}

export function escapeCsv(value: DatasetRow[string]): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
