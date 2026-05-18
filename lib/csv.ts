export type CsvCellValue = string | number | boolean | Date | null | undefined;

const FORMULA_PREFIX_PATTERN = /^(?:[=+\-@]|\s+[=+\-@])/;

function formatCsvValue(value: CsvCellValue) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? "");
}

function neutralizeFormulaPrefix(text: string) {
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

export function csvCell(value: CsvCellValue) {
  const text = neutralizeFormulaPrefix(formatCsvValue(value));
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: CsvCellValue[][], lineBreak = "\r\n") {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join(lineBreak)}`;
}
