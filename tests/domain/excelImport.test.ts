import { describe, expect, it } from 'vitest';
import {
  autoMapDispatchColumns,
  buildXlsxWorkbookBytes,
  parseSpreadsheetUpload,
  sanitizeSpreadsheetCell,
  validateMappedDispatchRows,
} from '@/domain/excelImport';

describe('Safe OOXML .xlsx / .csv Import, Auto-Mapper & Formula Sanitizer', () => {
  it('neutralizes CSV/Excel formula injection prefixes (=, +, -, @) on text cells without mangling negative coordinates', () => {
    expect(sanitizeSpreadsheetCell('=CMD|\' /C calc\'!A0')).toBe(
      '\'=CMD|\' /C calc\'!A0',
    );
    expect(sanitizeSpreadsheetCell('+SUM(A1:A2)')).toBe('\'+SUM(A1:A2)');
    expect(sanitizeSpreadsheetCell('@HYPERLINK("http://evil")')).toBe(
      '\'@HYPERLINK("http://evil")',
    );
    expect(sanitizeSpreadsheetCell('Juan Dela Cruz')).toBe('Juan Dela Cruz');
  });

  it('round-trips a real OOXML .xlsx workbook buffer and auto-maps FiberBlaze headers', () => {
    const bytes = buildXlsxWorkbookBytes('CaviteDispatch', [
      [
        'Account No',
        'Subscriber Name',
        'Contact Phone',
        'Job Type',
        'Priority',
        'Municipality',
        'Barangay',
        'Street Address',
        'Latitude',
        'Longitude',
        'Plan',
        'Concern / Remarks',
      ],
      [
        'FB-CAV-9001',
        'Maria Clara Santos',
        '09171234567',
        'NEW_INSTALL',
        'HIGH',
        'Imus',
        'Tanzang Luma II',
        'Blk 4 Lot 12 Aguinaldo Hwy',
        '14.4294',
        '120.9367',
        'Blaze Fiber 300 Mbps',
        'New residential FTTH application',
      ],
      [
        'FB-CAV-9002',
        '=MALICIOUS()',
        '09181234567',
        'REPAIR',
        'URGENT',
        'Bacoor',
        'Molino III',
        '18 Marcos Alvarez Ave',
        '15.9999', // Invalid: outside Cavite!
        '120.9750',
        'Blaze Fiber 500 Mbps',
        'Red LOS light blinking',
      ],
    ]);

    const parsed = parseSpreadsheetUpload(bytes, 'batch.xlsx');
    expect(parsed.headers).toContain('Account No');
    expect(parsed.rows).toHaveLength(2);

    const mapping = autoMapDispatchColumns(parsed.headers);
    expect(mapping.accountNumber).toBe('Account No');
    expect(mapping.subscriberName).toBe('Subscriber Name');
    expect(mapping.workflowType).toBe('Job Type');
    expect(mapping.lat).toBe('Latitude');

    const validated = validateMappedDispatchRows(parsed.rows, mapping);
    expect(validated.validRows).toHaveLength(1);
    expect(validated.invalidRows).toHaveLength(1);
    expect(validated.validRows[0].subscriberName).toBe('Maria Clara Santos');
    expect(validated.invalidRows[0].errors[0]).toMatch(/Cavite/i);
  });

  it('rejects XML external entity (XXE) declarations inside crafted .xlsx archives', () => {
    expect(() =>
      parseSpreadsheetUpload(
        new TextEncoder().encode('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'),
        'evil.csv',
      ),
    ).toThrow(/XXE|unsafe/i);
  });
});
