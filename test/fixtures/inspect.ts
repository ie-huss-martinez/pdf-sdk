import { PDFCheckBox, PDFDocument, PDFTextField } from "@cantoo/pdf-lib";
import type { PdfRotation } from "../../src/index.js";
import type { InspectedPdf } from "../contracts/pdf-processor.contract.js";

/**
 * Reads a built PDF back with pdf-lib, for the processor's contract tests:
 * its pages' sizes and rotations, and its form values. Rejects an encrypted
 * document without the right password.
 */
export async function inspectPdf(bytes: Uint8Array, password?: string): Promise<InspectedPdf> {
  const document = await PDFDocument.load(bytes, password === undefined ? {} : { password });
  const fields: Record<string, string | boolean> = {};
  for (const field of document.getForm().getFields()) {
    if (field instanceof PDFTextField) fields[field.getName()] = field.getText() ?? "";
    else if (field instanceof PDFCheckBox) fields[field.getName()] = field.isChecked();
  }
  return {
    pages: document.getPages().map((page) => ({
      width: page.getWidth(),
      height: page.getHeight(),
      rotation: (((page.getRotation().angle % 360) + 360) % 360) as PdfRotation,
    })),
    fields,
  };
}
