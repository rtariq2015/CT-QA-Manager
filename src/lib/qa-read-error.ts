export class PdfReadError extends Error {
  constructor(readonly code: "scanner-unrecognized" | "invalid-report-date", message: string) {
    super(message);
  }
}

export function pdfReadErrorCode(error: unknown) {
  if (error instanceof PdfReadError) return error.code;
  if (error instanceof Error && error.name === "PasswordException") return "pdf-password-required";
  if (error instanceof Error && error.name === "InvalidPDFException") return "invalid-pdf";
  return "pdf-read-failed";
}
