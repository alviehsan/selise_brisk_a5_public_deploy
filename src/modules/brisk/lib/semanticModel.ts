import type {
  DatasetColumnProfile,
  DatasetProfile,
  DatasetRow,
  EvidenceReference,
  SchemaGraph,
  SemanticAlias,
  SemanticFieldOverride,
  SemanticFormula,
  SemanticModel,
  SemanticQualityWarning
} from "./briskTypes";

export function buildSemanticModel(
  profile: DatasetProfile,
  rows: DatasetRow[],
  overrides: SemanticFieldOverride[] = []
): SemanticModel {
  const overrideFields = new Set(overrides.map((override) => override.fieldName));
  const aliases = profile.columns
    .map((column) => createAlias(column, profile, overrideFields))
    .filter((alias): alias is SemanticAlias => Boolean(alias));
  const evidenceReferences = aliases.map((alias): EvidenceReference => ({
    fieldName: alias.fieldName,
    reason: alias.source === "user"
      ? `User selected ${alias.fieldName} as ${alias.role}.`
      : `${alias.fieldName} was mapped to ${alias.alias} because ${alias.reason}`,
    source: alias.source === "user" ? "user-override" : alias.confidence >= 85 ? "name-match" : "type-inference"
  }));
  const formulas = buildFormulas(profile, aliases);
  const warnings = buildWarnings(profile, rows, aliases, formulas);
  const schemaGraph = buildSchemaGraph(aliases, formulas);

  return {
    aliases,
    formulas,
    schemaGraph,
    warnings,
    evidenceReferences
  };
}

function createAlias(
  column: DatasetColumnProfile,
  profile: DatasetProfile,
  overrideFields: Set<string>
): SemanticAlias | null {
  const source = overrideFields.has(column.name) ? "user" : "system";
  const alias = inferAlias(column, profile);

  if (!alias && source !== "user") return null;

  return {
    fieldName: column.name,
    alias: alias ?? humanizeFieldName(column.name),
    role: column.role,
    confidence: source === "user" ? 100 : confidenceForAlias(column, alias),
    reason: source === "user" ? "the role was corrected by the user." : reasonForAlias(column, alias),
    source
  };
}

function inferAlias(column: DatasetColumnProfile, profile: DatasetProfile): string | undefined {
  const normalized = normalize(column.name);

  if (column.name === profile.revenueField || /(sales amount|revenue|net sales|sales$)/.test(normalized)) return "Revenue";
  if (column.name === profile.profitField || /(gross profit|profit)/.test(normalized)) return "Profit";
  if (column.name === profile.targetField || /(sales target|target|quota|goal|budget)/.test(normalized)) return "Target";
  if (column.name === profile.benchmarkField || /(benchmark|baseline|prior|last year|plan)/.test(normalized)) return "Benchmark";
  if (column.name === profile.dateField || column.role === "date") return "Date";
  if (/(region|market|country|geography|territory)/.test(normalized)) return "Geography";
  if (/(product|category|sku|item)/.test(normalized)) return "Product";
  if (/(customer|account|client)/.test(normalized)) return "Customer";
  if (column.name === profile.orderField || /(orders|order count|quantity|units)/.test(normalized)) return "Orders";

  if (column.role === "dimension") return humanizeFieldName(column.name);
  if (column.role === "metric") return humanizeFieldName(column.name);
  return undefined;
}

function confidenceForAlias(column: DatasetColumnProfile, alias?: string): number {
  if (!alias) return 55;
  const normalized = normalize(column.name);
  if (normalize(alias) === normalized) return 95;
  if (normalized.includes(normalize(alias)) || normalize(alias).includes(normalized)) return 90;
  if (["Revenue", "Profit", "Target", "Geography", "Product", "Customer"].includes(alias)) return 88;
  return 72;
}

function reasonForAlias(column: DatasetColumnProfile, alias?: string): string {
  if (!alias) return `${column.name} has ${column.type} values and a ${column.role} role.`;
  return `${column.name} has ${column.type} values, a ${column.role} role, and matches the ${alias} business concept.`;
}

function buildFormulas(profile: DatasetProfile, aliases: SemanticAlias[]): SemanticFormula[] {
  return [
    {
      id: "margin",
      label: "Margin",
      expression: "Profit / Revenue",
      requiredAliases: ["Profit", "Revenue"],
      ...formulaState(aliases, ["Profit", "Revenue"], "Calculates profitability as a share of revenue.")
    },
    {
      id: "growth-rate",
      label: "Growth Rate",
      expression: "(Current Revenue - Previous Revenue) / Previous Revenue",
      requiredAliases: ["Revenue", "Date"],
      ...formulaState(aliases, ["Revenue", "Date"], "Uses the detected date field to compare revenue period over period.")
    },
    {
      id: "variance",
      label: "Variance",
      expression: "Revenue - Target",
      requiredAliases: ["Revenue", "Target"],
      ...formulaState(aliases, ["Revenue", "Target"], "Compares actual performance against a target or benchmark.")
    },
    {
      id: "contribution-share",
      label: "Contribution Share",
      expression: "Segment Revenue / Total Revenue",
      requiredAliases: ["Revenue", "Dimension"],
      ...formulaState(
        aliases,
        ["Revenue"],
        profile.primaryDimension
          ? `Uses ${profile.primaryDimension} to calculate each segment's share of total revenue.`
          : "Needs a dimension field to calculate segment contribution.",
        Boolean(profile.primaryDimension),
        profile.primaryDimension ? [profile.primaryDimension] : []
      )
    }
  ];
}

function formulaState(
  aliases: SemanticAlias[],
  requiredAliases: string[],
  availableReason: string,
  extraAvailable = true,
  extraFields: string[] = []
): Pick<SemanticFormula, "available" | "reason" | "evidenceFields"> {
  const matchedFields = aliases
    .filter((alias) => requiredAliases.includes(alias.alias))
    .map((alias) => alias.fieldName);
  const available = requiredAliases.every((requiredAlias) => aliases.some((alias) => alias.alias === requiredAlias)) && extraAvailable;
  return {
    available,
    reason: available ? availableReason : `Missing ${requiredAliases.filter((requiredAlias) => !aliases.some((alias) => alias.alias === requiredAlias)).join(", ")}.`,
    evidenceFields: [...matchedFields, ...extraFields]
  };
}

function buildWarnings(
  profile: DatasetProfile,
  rows: DatasetRow[],
  aliases: SemanticAlias[],
  formulas: SemanticFormula[]
): SemanticQualityWarning[] {
  const warnings: SemanticQualityWarning[] = [];

  if (!profile.primaryDimension) {
    warnings.push({
      id: "missing-dimension",
      severity: "medium",
      message: "No strong dimension was detected, so driver and contribution analysis will be limited.",
      evidenceFields: []
    });
  }

  if (!aliases.some((alias) => alias.alias === "Target" || alias.alias === "Benchmark")) {
    warnings.push({
      id: "missing-target",
      severity: "low",
      message: "No target or benchmark field was detected, so variance analysis is unavailable.",
      evidenceFields: []
    });
  }

  for (const column of profile.columns) {
    if (column.missingCount > 0) {
      warnings.push({
        id: `missing-values-${column.name}`,
        severity: column.missingCount / Math.max(rows.length, 1) > 0.2 ? "high" : "medium",
        message: `${column.name} has ${column.missingCount} missing value${column.missingCount === 1 ? "" : "s"}.`,
        evidenceFields: [column.name]
      });
    }
  }

  for (const formula of formulas.filter((item) => !item.available)) {
    warnings.push({
      id: `formula-unavailable-${formula.id}`,
      severity: formula.id === "variance" ? "low" : "medium",
      message: `${formula.label} formula is unavailable. ${formula.reason}`,
      evidenceFields: formula.evidenceFields
    });
  }

  return warnings;
}

function buildSchemaGraph(aliases: SemanticAlias[], formulas: SemanticFormula[]): SchemaGraph {
  const nodes = new Map<string, SchemaGraph["nodes"][number]>();
  const edges: SchemaGraph["edges"] = [];

  for (const alias of aliases) {
    const fieldNode = `field:${alias.fieldName}`;
    const aliasNode = `alias:${alias.alias}`;
    nodes.set(fieldNode, { id: fieldNode, label: alias.fieldName, kind: "field", role: alias.role });
    nodes.set(aliasNode, { id: aliasNode, label: alias.alias, kind: "alias", role: alias.role });
    edges.push({ source: fieldNode, target: aliasNode, label: "maps to" });
  }

  for (const formula of formulas) {
    const formulaNode = `formula:${formula.id}`;
    nodes.set(formulaNode, { id: formulaNode, label: formula.label, kind: "formula" });
    for (const requiredAlias of formula.requiredAliases) {
      if (requiredAlias === "Dimension") continue;
      edges.push({ source: `alias:${requiredAlias}`, target: formulaNode, label: "feeds formula" });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function humanizeFieldName(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
