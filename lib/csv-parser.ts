import type { CsvRow } from './csv-types';

export const CSV_ROW_LIMIT = 500;
export const CSV_ROW_WARNING = 200;

/**
 * Parses a CSV string into an array of row objects.
 * Handles quoted fields, commas within quotes, and CRLF/LF line endings.
 * Empty rows are skipped.
 */
export function parseCsv(text: string): CsvRow[] {
  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(lines[i]);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j].trim();
      if (header) {
        row[header] = values[j] ?? '';
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Splits a CSV text into logical lines (respecting quoted newlines). */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuote && next === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
        current += ch;
      }
    } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !inQuote) {
      if (ch === '\r') i++;
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Parses one CSV line into an array of field values, stripping outer quotes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuote && next === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Splits a pipe-separated multi-value cell into individual values.
 * Trims each part and filters empties.
 */
export function splitPipeValues(raw: string): string[] {
  return raw.split('|').map((v) => v.trim()).filter(Boolean);
}

/**
 * Generates a template CSV string for a content type.
 * Includes a guide row (prefixed with #) describing each field.
 */
export function generateTemplateCsv(fields: Array<{ id: string; name: string; type: string; required: boolean }>): string {
  const dataColumns = fields.map((f) => f.id);
  const allColumns = ['_id', ...dataColumns];

  const header = allColumns.map(quoteCsvField).join(',');

  const guideValues = allColumns.map((col) => {
    if (col === '_id') return 'Leave empty to create; fill with entry ID to update';
    const field = fields.find((f) => f.id === col);
    if (!field) return '';
    let hint = field.name;
    if (field.type === 'RichText') hint += ' (Markdown supported)';
    if (field.type === 'Array') hint += ' (pipe-separate multiple values: a|b|c)';
    if (field.type === 'Link') hint += ' (entry name or ID)';
    if (field.required) hint += ' [required]';
    return hint;
  });
  const guideRow = guideValues.map(quoteCsvField).join(',');

  const exampleValues = allColumns.map((col) => {
    if (col === '_id') return '';
    const field = fields.find((f) => f.id === col);
    if (!field) return '';
    if (field.type === 'Boolean') return 'true';
    if (field.type === 'Integer' || field.type === 'Number') return '1';
    if (field.type === 'Array') return 'Value 1|Value 2';
    if (field.type === 'Link') return 'Example Entry Name';
    return 'Example value';
  });
  const exampleRow = exampleValues.map(quoteCsvField).join(',');

  return [header, guideRow, exampleRow].join('\n');
}

function quoteCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
