import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaxSoftwareExport,
  normalizeTaxDocumentType,
  taxSoftwareExportCsv,
} from "../src/lib/tax-software-export.ts";

test("tax document types normalize to supported canonical forms", () => {
  assert.equal(normalizeTaxDocumentType("Form W-2 Wage and Tax Statement"), "W-2");
  assert.equal(normalizeTaxDocumentType("1099-INT"), "1099-INT");
  assert.equal(normalizeTaxDocumentType("Form 1099-DIV"), "1099-DIV");
  assert.equal(normalizeTaxDocumentType("1099 NEC"), "1099-NEC");
  assert.equal(normalizeTaxDocumentType("Form 1099-R"), "1099-R");
  assert.equal(normalizeTaxDocumentType("Schedule K-1"), null);
});

test("supported source fields map while unknown fields remain visible", () => {
  const result = buildTaxSoftwareExport("proseries", [
    {
      documentId: "1",
      fileName: "w2.pdf",
      documentType: "W-2",
      fieldName: "wages",
      fieldLabel: "Wages",
      value: "85000.00",
      confidence: 0.99,
    },
    {
      documentId: "1",
      fileName: "w2.pdf",
      documentType: "W-2",
      fieldName: "medicare_wages",
      fieldLabel: "Medicare wages",
      value: "85000.00",
      confidence: 0.98,
    },
    {
      documentId: "1",
      fileName: "w2.pdf",
      documentType: "W-2",
      fieldName: "box_12_code_dd",
      fieldLabel: "Box 12 DD",
      value: "12000.00",
      confidence: 0.96,
    },
  ]);

  assert.equal(result.mappedCount, 2);
  assert.equal(result.unmappedCount, 1);
  assert.equal(result.rows[0].targetField, "Box 1 · Wages, tips, other compensation");
  assert.equal(result.rows[1].canonicalField, "medicare_wages_and_tips");
  assert.equal(result.rows[2].mapped, false);
  assert.equal(result.rows[2].value, "12000.00");
});

test("same normalized field on separate documents remains separate export rows", () => {
  const result = buildTaxSoftwareExport("drake", [
    {
      documentId: "1",
      fileName: "bank-a.pdf",
      documentType: "1099-INT",
      fieldName: "interest_income",
      fieldLabel: "Interest income",
      value: "100.00",
      confidence: 0.99,
    },
    {
      documentId: "2",
      fileName: "bank-b.pdf",
      documentType: "1099-INT",
      fieldName: "interest_income",
      fieldLabel: "Interest income",
      value: "250.00",
      confidence: 0.99,
    },
  ]);

  assert.equal(result.rows.length, 2);
  assert.equal(result.mappedCount, 2);
  assert.deepEqual(
    result.rows.map((row) => row.value),
    ["100.00", "250.00"]
  );
});

test("CSV export preserves approved values and marks unmapped rows", () => {
  const mapped = buildTaxSoftwareExport("proseries", [
    {
      documentId: "1",
      fileName: "1099-int.pdf",
      documentType: "1099-INT",
      fieldName: "interest_income",
      fieldLabel: "Interest income",
      value: "1,234.56",
      confidence: 0.97,
    },
    {
      documentId: "1",
      fileName: "1099-int.pdf",
      documentType: "1099-INT",
      fieldName: "custom_note",
      fieldLabel: "Custom note",
      value: "Review manually",
      confidence: 0.8,
    },
  ]);

  const csv = taxSoftwareExportCsv({
    software: "proseries",
    taxYear: 2025,
    returnType: "1040",
    clientName: "Example Client",
    reviewVersion: 2,
    rows: mapped.rows,
  });

  assert.match(csv, /"Box 1 · Interest income"/);
  assert.match(csv, /"1,234\.56"/);
  assert.match(csv, /"needs_manual_mapping"/);
});
