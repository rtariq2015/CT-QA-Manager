export class PdfReadError extends Error {
  constructor(readonly code: "scanner-unrecognized" | "invalid-report-date", message: string) {
    super(message);
  }
}

export type PdfFailureCode = PdfReadError["code"] | "pdf-password-required" | "invalid-pdf" | "pdf-read-failed";

export function pdfReadErrorCode(error: unknown): PdfFailureCode {
  if (error instanceof PdfReadError) return error.code;
  if (error instanceof Error && error.name === "PasswordException") return "pdf-password-required";
  if (error instanceof Error && error.name === "InvalidPDFException") return "invalid-pdf";
  return "pdf-read-failed";
}
