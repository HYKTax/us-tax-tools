export type TaxSoftware = "proseries" | "drake";
export type SupportedTaxDocument =
  | "W-2"
  | "1099-INT"
  | "1099-DIV"
  | "1099-NEC"
  | "1099-R";

export type TaxExportSourceField = {
  documentId: string;
  fileName: string;
  documentType: string | null;
  fieldName: string;
  fieldLabel: string;
  value: string;
  confidence: number | null;
};

export type TaxExportRow = {
  software: TaxSoftware;
  sourceDocument: string;
  sourceDocumentType: string;
  canonicalField: string;
  sourceField: string;
  targetArea: string;
  targetField: string;
  value: string;
  confidence: number | null;
  mapped: boolean;
};

type FieldDefinition = {
  label: string;
  box: string;
  aliases?: readonly string[];
};

type FormDefinition = {
  targetLabel: string;
  fields: Record<string, FieldDefinition>;
};

const definitions: Record<SupportedTaxDocument, FormDefinition> = {
  "W-2": {
    targetLabel: "Form W-2",
    fields: {
      employer_name: { label: "Employer name", box: "Employer" },
      employer_ein_last4: {
        label: "Employer EIN (last 4 only)",
        box: "Employer EIN reference",
        aliases: ["employer_identifier_last4", "ein_last4"],
      },
      employee_name: { label: "Employee name", box: "Employee" },
      wages: { label: "Wages, tips, other compensation", box: "Box 1" },
      federal_income_tax_withheld: {
        label: "Federal income tax withheld",
        box: "Box 2",
      },
      social_security_wages: { label: "Social Security wages", box: "Box 3" },
      social_security_tax_withheld: {
        label: "Social Security tax withheld",
        box: "Box 4",
      },
      medicare_wages_and_tips: {
        label: "Medicare wages and tips",
        box: "Box 5",
        aliases: ["medicare_wages"],
      },
      medicare_tax_withheld: { label: "Medicare tax withheld", box: "Box 6" },
      social_security_tips: { label: "Social Security tips", box: "Box 7" },
      allocated_tips: { label: "Allocated tips", box: "Box 8" },
      dependent_care_benefits: { label: "Dependent care benefits", box: "Box 10" },
      nonqualified_plans: { label: "Nonqualified plans", box: "Box 11" },
      state_wages: { label: "State wages, tips, etc.", box: "Box 16" },
      state_income_tax_withheld: {
        label: "State income tax",
        box: "Box 17",
        aliases: ["state_tax_withheld"],
      },
      local_wages: { label: "Local wages, tips, etc.", box: "Box 18" },
      local_income_tax_withheld: {
        label: "Local income tax",
        box: "Box 19",
        aliases: ["local_tax_withheld"],
      },
    },
  },
  "1099-INT": {
    targetLabel: "Form 1099-INT",
    fields: {
      payer_name: { label: "Payer name", box: "Payer" },
      recipient_name: { label: "Recipient name", box: "Recipient" },
      interest_income: { label: "Interest income", box: "Box 1" },
      early_withdrawal_penalty: { label: "Early withdrawal penalty", box: "Box 2" },
      interest_on_us_savings_bonds: {
        label: "Interest on U.S. Savings Bonds and Treasury obligations",
        box: "Box 3",
        aliases: ["us_savings_bond_interest", "treasury_interest"],
      },
      federal_income_tax_withheld: {
        label: "Federal income tax withheld",
        box: "Box 4",
      },
      investment_expenses: { label: "Investment expenses", box: "Box 5" },
      foreign_tax_paid: { label: "Foreign tax paid", box: "Box 6" },
      tax_exempt_interest: { label: "Tax-exempt interest", box: "Box 8" },
      private_activity_bond_interest: {
        label: "Specified private activity bond interest",
        box: "Box 9",
      },
      market_discount: { label: "Market discount", box: "Box 10" },
      bond_premium: { label: "Bond premium", box: "Box 11" },
    },
  },
  "1099-DIV": {
    targetLabel: "Form 1099-DIV",
    fields: {
      payer_name: { label: "Payer name", box: "Payer" },
      recipient_name: { label: "Recipient name", box: "Recipient" },
      ordinary_dividends: { label: "Total ordinary dividends", box: "Box 1a" },
      qualified_dividends: { label: "Qualified dividends", box: "Box 1b" },
      capital_gain_distributions: {
        label: "Total capital gain distributions",
        box: "Box 2a",
      },
      unrecaptured_section_1250_gain: {
        label: "Unrecaptured Section 1250 gain",
        box: "Box 2b",
      },
      section_1202_gain: { label: "Section 1202 gain", box: "Box 2c" },
      collectibles_28_percent_gain: {
        label: "Collectibles (28%) gain",
        box: "Box 2d",
      },
      nondividend_distributions: {
        label: "Nondividend distributions",
        box: "Box 3",
      },
      federal_income_tax_withheld: {
        label: "Federal income tax withheld",
        box: "Box 4",
      },
      section_199a_dividends: { label: "Section 199A dividends", box: "Box 5" },
      investment_expenses: { label: "Investment expenses", box: "Box 6" },
      foreign_tax_paid: { label: "Foreign tax paid", box: "Box 7" },
      exempt_interest_dividends: {
        label: "Exempt-interest dividends",
        box: "Box 12",
        aliases: ["tax_exempt_dividends", "tax_exempt_interest_dividends"],
      },
      private_activity_bond_interest_dividends: {
        label: "Specified private activity bond interest dividends",
        box: "Box 13",
      },
    },
  },
  "1099-NEC": {
    targetLabel: "Form 1099-NEC",
    fields: {
      payer_name: { label: "Payer name", box: "Payer" },
      recipient_name: { label: "Recipient name", box: "Recipient" },
      nonemployee_compensation: {
        label: "Nonemployee compensation",
        box: "Box 1",
        aliases: ["nec_income"],
      },
      federal_income_tax_withheld: {
        label: "Federal income tax withheld",
        box: "Box 4",
      },
      state_tax_withheld: { label: "State tax withheld", box: "Box 5" },
      state_income: { label: "State income", box: "Box 7" },
    },
  },
  "1099-R": {
    targetLabel: "Form 1099-R",
    fields: {
      payer_name: { label: "Payer name", box: "Payer" },
      recipient_name: { label: "Recipient name", box: "Recipient" },
      gross_distribution: { label: "Gross distribution", box: "Box 1" },
      taxable_amount: { label: "Taxable amount", box: "Box 2a" },
      taxable_amount_not_determined: {
        label: "Taxable amount not determined",
        box: "Box 2b",
      },
      total_distribution: { label: "Total distribution", box: "Box 2b" },
      capital_gain: { label: "Capital gain", box: "Box 3" },
      federal_income_tax_withheld: {
        label: "Federal income tax withheld",
        box: "Box 4",
      },
      employee_contributions: {
        label: "Employee contributions / designated Roth contributions / insurance premiums",
        box: "Box 5",
      },
      net_unrealized_appreciation: {
        label: "Net unrealized appreciation in employer's securities",
        box: "Box 6",
      },
      distribution_code: { label: "Distribution code", box: "Box 7" },
      ira_sep_simple: { label: "IRA / SEP / SIMPLE", box: "Box 7 checkbox" },
      state_tax_withheld: { label: "State tax withheld", box: "Box 14" },
      state_distribution: { label: "State distribution", box: "Box 16" },
      local_tax_withheld: { label: "Local tax withheld", box: "Box 17" },
      local_distribution: { label: "Local distribution", box: "Box 19" },
    },
  },
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function normalizeTaxDocumentType(
  value: string | null | undefined
): SupportedTaxDocument | null {
  const normalized = normalize(value ?? "");

  if (
    normalized === "w_2" ||
    normalized === "w2" ||
    normalized.includes("wage_and_tax_statement")
  ) {
    return "W-2";
  }
  if (normalized.includes("1099_int")) return "1099-INT";
  if (normalized.includes("1099_div")) return "1099-DIV";
  if (normalized.includes("1099_nec")) return "1099-NEC";
  if (normalized.includes("1099_r")) return "1099-R";
  return null;
}

function resolveCanonicalField(
  documentType: SupportedTaxDocument,
  sourceName: string
): { name: string; definition: FieldDefinition } | null {
  const source = normalize(sourceName);
  const fields = definitions[documentType].fields;

  for (const [name, definition] of Object.entries(fields)) {
    if (source === name || definition.aliases?.some((alias) => source === alias)) {
      return { name, definition };
    }
  }

  return null;
}

function softwareArea(software: TaxSoftware, documentType: SupportedTaxDocument) {
  const form = definitions[documentType].targetLabel;
  return software === "proseries"
    ? `ProSeries · ${form} input worksheet`
    : `Drake · ${form} input screen`;
}

export function buildTaxSoftwareExport(
  software: TaxSoftware,
  sourceFields: TaxExportSourceField[]
) {
  const rows: TaxExportRow[] = sourceFields.map((field) => {
    const documentType = normalizeTaxDocumentType(field.documentType);
    if (!documentType) {
      return {
        software,
        sourceDocument: field.fileName,
        sourceDocumentType: field.documentType ?? "Unknown",
        canonicalField: "",
        sourceField: field.fieldName,
        targetArea: "",
        targetField: "",
        value: field.value,
        confidence: field.confidence,
        mapped: false,
      };
    }

    const canonical = resolveCanonicalField(documentType, field.fieldName);
    if (!canonical) {
      return {
        software,
        sourceDocument: field.fileName,
        sourceDocumentType: documentType,
        canonicalField: "",
        sourceField: field.fieldName,
        targetArea: softwareArea(software, documentType),
        targetField: "",
        value: field.value,
        confidence: field.confidence,
        mapped: false,
      };
    }

    return {
      software,
      sourceDocument: field.fileName,
      sourceDocumentType: documentType,
      canonicalField: canonical.name,
      sourceField: field.fieldName,
      targetArea: softwareArea(software, documentType),
      targetField: `${canonical.definition.box} · ${canonical.definition.label}`,
      value: field.value,
      confidence: field.confidence,
      mapped: true,
    };
  });

  return {
    rows,
    mappedCount: rows.filter((row) => row.mapped).length,
    unmappedCount: rows.filter((row) => !row.mapped).length,
  };
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function taxSoftwareExportCsv(input: {
  software: TaxSoftware;
  taxYear: number;
  returnType: string;
  clientName: string;
  reviewVersion: number;
  rows: TaxExportRow[];
}) {
  const headers = [
    "software",
    "tax_year",
    "return_type",
    "client",
    "review_version",
    "source_document",
    "source_document_type",
    "canonical_field",
    "source_field",
    "target_area",
    "target_field",
    "value",
    "confidence",
    "mapping_status",
  ];

  const lines = input.rows.map((row) =>
    [
      input.software,
      input.taxYear,
      input.returnType,
      input.clientName,
      input.reviewVersion,
      row.sourceDocument,
      row.sourceDocumentType,
      row.canonicalField,
      row.sourceField,
      row.targetArea,
      row.targetField,
      row.value,
      row.confidence === null ? "" : row.confidence,
      row.mapped ? "mapped" : "needs_manual_mapping",
    ]
      .map(csvCell)
      .join(",")
  );

  return [headers.map(csvCell).join(","), ...lines].join("\r\n");
}

export const canonicalTaxExtractionGuidance = `
Use these exact document_type values when applicable: W-2, 1099-INT, 1099-DIV, 1099-NEC, 1099-R.

For supported forms, prefer these exact normalized field names:
W-2: employer_name, employer_ein_last4, employee_name, wages, federal_income_tax_withheld,
social_security_wages, social_security_tax_withheld, medicare_wages_and_tips,
medicare_tax_withheld, social_security_tips, allocated_tips, dependent_care_benefits,
nonqualified_plans, state_wages, state_income_tax_withheld, local_wages,
local_income_tax_withheld.

1099-INT: payer_name, recipient_name, interest_income, early_withdrawal_penalty,
interest_on_us_savings_bonds, federal_income_tax_withheld, investment_expenses,
foreign_tax_paid, tax_exempt_interest, private_activity_bond_interest,
market_discount, bond_premium.

1099-DIV: payer_name, recipient_name, ordinary_dividends, qualified_dividends,
capital_gain_distributions, unrecaptured_section_1250_gain, section_1202_gain,
collectibles_28_percent_gain, nondividend_distributions, federal_income_tax_withheld,
section_199a_dividends, investment_expenses, foreign_tax_paid,
exempt_interest_dividends, private_activity_bond_interest_dividends.

1099-NEC: payer_name, recipient_name, nonemployee_compensation,
federal_income_tax_withheld, state_tax_withheld, state_income.

1099-R: payer_name, recipient_name, gross_distribution, taxable_amount,
taxable_amount_not_determined, total_distribution, capital_gain,
federal_income_tax_withheld, employee_contributions, net_unrealized_appreciation,
distribution_code, ira_sep_simple, state_tax_withheld, state_distribution,
local_tax_withheld, local_distribution.

Do not force an unsupported source field into a listed name. Keep a concise normalized name and flag it for human review.
`.trim();
