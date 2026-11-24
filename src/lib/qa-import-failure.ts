import type { PdfFailureCode } from "./qa-read-error";

export interface FailedImport {
  id: string;
  fileName: string;
  code: PdfFailureCode;
  at: string;
  archived: boolean;
  original?: File;
}

export const failureLabels: Record<PdfFailureCode, string> = {
  "empty-pdf": "The PDF is empty",
  "scanner-unrecognized": "Scanner identity could not be matched",
  "invalid-report-date": "Printed report date or time could not be read",
  "pdf-password-required": "The PDF requires a password",
  "invalid-pdf": "The file could not be opened as a PDF",
  "pdf-read-failed": "The PDF could not be read",
};
