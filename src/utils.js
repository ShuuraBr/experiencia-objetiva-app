import { randomUUID } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildSlug(parts) {
  const base = slugify(parts.filter(Boolean).join(" ")) || "ponto-coleta";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export function toBoolean(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

export function toNullableText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function escapeCsv(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value).replace(/"/g, '""');
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}

export function formatAverage(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value).toFixed(2);
}
