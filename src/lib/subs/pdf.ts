import "server-only";

/**
 * Plain text of a PDF (bills and receipts), or "" when it can't be read, for
 * example a bill locked with the payer's ID number.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return "";
  }
}
