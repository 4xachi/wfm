import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { isInsideCavite } from './gpsIntegrity';
import type { WorkOrderPriority, WorkflowType } from './types';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB zip-bomb ceiling
const MAX_UNZIPPED_BYTES = 12 * 1024 * 1024;

export function sanitizeSpreadsheetCell(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Keep valid decimal numbers (including negative measurements/dBm) intact
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
    return trimmed;
  }
  // Formula execution attack vectors in CSV/XLSX: =, +, -, @, \t, \r
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

function assertSafeXml(xmlText: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) {
    throw new Error('Unsafe XML declaration (XXE attempt) rejected.');
  }
}

function escapeXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(val: string): string {
  return val
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function colIndexToLetters(idx: number): string {
  let n = idx + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function colLettersToIndex(ref: string): number {
  const match = ref.match(/^[A-Z]+/i);
  if (!match) return 0;
  const letters = match[0].toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

export function buildXlsxWorkbookBytes(
  sheetName: string,
  matrix: string[][],
): Uint8Array {
  const safeSheet = escapeXml(sheetName.slice(0, 31) || 'Dispatch');
  const rowsXml = matrix
    .map((row, rIdx) => {
      const cellsXml = row
        .map((cellVal, cIdx) => {
          const ref = `${colIndexToLetters(cIdx)}${rIdx + 1}`;
          const sanitized =
            rIdx === 0 ? cellVal.trim() : sanitizeSpreadsheetCell(String(cellVal ?? ''));
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(sanitized)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rIdx + 1}">${cellsXml}</row>`;
    })
    .join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rowsXml}</sheetData>` +
        `</worksheet>`,
    ),
  };

  return zipSync(files, { level: 6 });
}

function parseCsvText(csvText: string): string[][] {
  assertSafeXml(csvText);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      if (ch === '\r') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else if (ch !== '\r') {
      currentCell += ch;
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function parseXlsxBytes(bytes: Uint8Array): string[][] {
  const archive = unzipSync(bytes, {
    filter(file) {
      if (file.originalSize > MAX_UNZIPPED_BYTES) {
        throw new Error('Archive entry exceeds safe unzipped size ceiling.');
      }
      return (
        file.name === 'xl/sharedStrings.xml' ||
        file.name === 'xl/worksheets/sheet1.xml'
      );
    },
  });

  const sheetBytes = archive['xl/worksheets/sheet1.xml'];
  if (!sheetBytes) {
    throw new Error('Invalid .xlsx workbook: missing xl/worksheets/sheet1.xml.');
  }

  const sharedStrings: string[] = [];
  if (archive['xl/sharedStrings.xml']) {
    const ssXml = strFromU8(archive['xl/sharedStrings.xml']);
    assertSafeXml(ssXml);
    const siMatches = ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
    for (const si of siMatches) {
      const texts = Array.from(
        si[1].matchAll(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g),
      ).map((t) => decodeXmlEntities(t[1]));
      sharedStrings.push(texts.join(''));
    }
  }

  const sheetXml = strFromU8(sheetBytes);
  assertSafeXml(sheetXml);

  const matrix: string[][] = [];
  const rowMatches = sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g);
  for (const rMatch of rowMatches) {
    const rowArr: string[] = [];
    const cellMatches = rMatch[1].matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
    );
    let fallbackCol = 0;
    for (const cMatch of cellMatches) {
      const attrs = cMatch[1];
      const inner = cMatch[2];
      const refMatch = attrs.match(/\br="([A-Z]+\d+)"/i);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : fallbackCol;
      fallbackCol = colIdx + 1;
      if (colIdx < 0 || colIdx > 128) continue; // Prevent sparse-allocation attack

      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      let val = '';
      if (cellType === 'inlineStr') {
        const tMatch = inner.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/);
        val = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          const sIdx = Number.parseInt(rawV, 10);
          val = sharedStrings[sIdx] ?? '';
        } else {
          val = rawV;
        }
      }
      rowArr[colIdx] = val.trim();
    }
    for (let i = 0; i < rowArr.length; i++) {
      if (rowArr[i] === undefined) rowArr[i] = '';
    }
    if (rowArr.some((c) => c.length > 0)) {
      matrix.push(rowArr);
      if (matrix.length >= 2000) break; // Maximum 2,000 rows ceiling per upload
    }
  }

  return matrix;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseSpreadsheetUpload(
  bytes: Uint8Array,
  fileName: string,
): ParsedSpreadsheet {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Upload exceeds 5 MB safety limit.');
  }

  const isZipPk =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    fileName.toLowerCase().endsWith('.xlsx');

  const matrix = isZipPk
    ? parseXlsxBytes(bytes)
    : parseCsvText(strFromU8(bytes));

  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = matrix[0].map((h, i) => h.trim() || `Column_${i + 1}`);
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

export interface DispatchColumnMapping {
  accountNumber: string;
  subscriberName: string;
  phone: string;
  workflowType: string;
  priority: string;
  municipality: string;
  barangay: string;
  streetAddress: string;
  lat: string;
  lng: string;
  planName: string;
  issueDescription: string;
}

const COLUMN_SYNONYMS: Record<keyof DispatchColumnMapping, RegExp> = {
  accountNumber: /account|acct|sub.*id|subscriber.*no/i,
  subscriberName: /subscriber.*name|customer|client|full.*name|^name$/i,
  phone: /phone|mobile|contact|cell/i,
  workflowType: /job.*type|workflow|order.*type|service.*type|^type$/i,
  priority: /priority|urgency|sla/i,
  municipality: /municipality|city|town/i,
  barangay: /barangay|brgy|district/i,
  streetAddress: /street|address|location|house/i,
  lat: /latitude|^lat$/i,
  lng: /longitude|^lng$|^lon$/i,
  planName: /plan|package|bandwidth|tier/i,
  issueDescription: /concern|remark|issue|description|notes/i,
};

export function autoMapDispatchColumns(
  headers: string[],
): DispatchColumnMapping {
  const result = {} as DispatchColumnMapping;
  (Object.keys(COLUMN_SYNONYMS) as Array<keyof DispatchColumnMapping>).forEach(
    (field) => {
      const matched = headers.find((h) => COLUMN_SYNONYMS[field].test(h));
      result[field] = matched ?? '';
    },
  );
  return result;
}

export interface ValidatedDispatchRow {
  rowIndex: number;
  accountNumber: string;
  subscriberName: string;
  phone: string;
  workflowType: WorkflowType;
  priority: WorkOrderPriority;
  municipality: string;
  barangay: string;
  streetAddress: string;
  lat: number;
  lng: number;
  planName: string;
  issueDescription: string;
}

export interface InvalidDispatchRow {
  rowIndex: number;
  raw: Record<string, string>;
  errors: string[];
}

function normalizeWorkflowType(raw: string): WorkflowType | null {
  const v = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (v === 'REPAIR' || v === 'TROUBLESHOOT') return 'REPAIR';
  if (v === 'NEW_INSTALL' || v === 'INSTALLATION' || v === 'INSTALL')
    return 'NEW_INSTALL';
  if (v === 'TRANSFER' || v === 'RELOCATION' || v === 'ADDRESS_CHANGE')
    return 'TRANSFER';
  return null;
}

function normalizePriority(raw: string): WorkOrderPriority {
  const v = raw.trim().toUpperCase();
  if (v === 'URGENT' || v === 'CRITICAL') return 'URGENT';
  if (v === 'HIGH') return 'HIGH';
  return 'NORMAL';
}

export function validateMappedDispatchRows(
  rows: Record<string, string>[],
  mapping: DispatchColumnMapping,
): {
  validRows: ValidatedDispatchRow[];
  invalidRows: InvalidDispatchRow[];
} {
  const validRows: ValidatedDispatchRow[] = [];
  const invalidRows: InvalidDispatchRow[] = [];

  rows.forEach((raw, idx) => {
    const errors: string[] = [];
    const get = (field: keyof DispatchColumnMapping) =>
      mapping[field] ? (raw[mapping[field]] ?? '').trim() : '';

    const accountNumber = sanitizeSpreadsheetCell(get('accountNumber'));
    const subscriberName = sanitizeSpreadsheetCell(get('subscriberName'));
    const phone = sanitizeSpreadsheetCell(get('phone') || '09170000000');
    const wf = normalizeWorkflowType(get('workflowType'));
    const priority = normalizePriority(get('priority'));
    const municipality = sanitizeSpreadsheetCell(get('municipality'));
    const barangay = sanitizeSpreadsheetCell(get('barangay'));
    const streetAddress = sanitizeSpreadsheetCell(get('streetAddress'));
    const lat = Number.parseFloat(get('lat'));
    const lng = Number.parseFloat(get('lng'));
    const planName = sanitizeSpreadsheetCell(
      get('planName') || 'Blaze Fiber 200 Mbps',
    );
    const issueDescription = sanitizeSpreadsheetCell(
      get('issueDescription') || 'Scheduled field dispatch',
    );

    if (!accountNumber) errors.push('Missing Account Number.');
    if (!subscriberName) errors.push('Missing Subscriber Name.');
    if (!wf) {
      errors.push(
        `Unsupported Job Type "${get('workflowType')}" (expected REPAIR, NEW_INSTALL, or TRANSFER).`,
      );
    }
    if (!municipality || !barangay || !streetAddress) {
      errors.push('Incomplete Municipality, Barangay, or Street Address.');
    }
    if (!isInsideCavite(lat, lng)) {
      errors.push(
        `Coordinates (${get('lat')}, ${get('lng')}) fall outside Cavite operational bounds (14.05–14.50 N, 120.58–121.08 E).`,
      );
    }

    if (errors.length > 0 || !wf) {
      invalidRows.push({ rowIndex: idx + 2, raw, errors });
    } else {
      validRows.push({
        rowIndex: idx + 2,
        accountNumber,
        subscriberName,
        phone,
        workflowType: wf,
        priority,
        municipality,
        barangay,
        streetAddress,
        lat,
        lng,
        planName,
        issueDescription,
      });
    }
  });

  return { validRows, invalidRows };
}
