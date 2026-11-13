import { degrees, PDFDocument, PDFString, StandardFonts } from "@cantoo/pdf-lib";

/**
 * Test documents, generated in code: never real documents (CONTRIBUTING.md).
 */

/** Links a hostile document might have; only the first three are safe (ADR 0012). */
export const LINKS = [
  "https://example.com/report",
  "http://example.org/",
  "mailto:team@example.com",
  "javascript:alert(document.cookie)",
  "ftp://example.com/file",
  "tel:+15551234567",
  "relative/path.html",
  "https://bank.example@evil.example/",
];
export const SAFE_LINKS = LINKS.slice(0, 3);

/**
 * Two pages: US Letter with text, a form and every link in {@link LINKS},
 * and A4 landscape with /Rotate 90.
 */
export async function reportPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([612, 792]);
  first.drawText("Quarterly report", { x: 72, y: 700, size: 24, font });
  const form = document.getForm();
  form.createTextField("name").addToPage(first, { x: 72, y: 600, width: 240, height: 24 });
  form.createCheckBox("agree").addToPage(first, { x: 72, y: 560, width: 18, height: 18 });
  LINKS.forEach((url, index) => {
    const y = 500 - index * 30;
    const link = document.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [72, y, 300, y + 20],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    first.node.addAnnot(document.context.register(link));
  });
  const second = document.addPage([842, 595]);
  second.setRotation(degrees(90));
  return document.save();
}

/** One page per size, unrotated. */
export async function pagesPdf(sizes: readonly { width: number; height: number }[]) {
  const document = await PDFDocument.create();
  for (const { width, height } of sizes) document.addPage([width, height]);
  return document.save();
}

/** A one-page document with an empty text field `name` and an unchecked checkbox `agree`. */
export async function formPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  form.createTextField("name").addToPage(page, { x: 72, y: 600, width: 240, height: 24 });
  form.createCheckBox("agree").addToPage(page, { x: 72, y: 560, width: 18, height: 18 });
  return document.save();
}

/** A one-page document encrypted with AES-256 and the user password `secret`. */
export async function encryptedPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.encrypt({ userPassword: "secret", ownerPassword: "owner-secret" });
  return document.save();
}

/**
 * Builds a PDF from raw object bodies, byte for byte, for documents pdf-lib
 * won't write, such as ones with broken or exotic streams. Object 1 must be
 * the catalog.
 */
export function rawPdf(objects: readonly (string | Uint8Array)[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const head = encoder.encode(`${index + 1} 0 obj\n`);
    const content = typeof body === "string" ? encoder.encode(body) : body;
    const tail = encoder.encode("\nendobj\n");
    parts.push(head, content, tail);
    length += head.length + content.length + tail.length;
  });
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
  ].join("");
  parts.push(encoder.encode(xref));
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** A stream object with the given dictionary entries and bytes. */
function stream(dictionary: string, bytes: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const head = encoder.encode(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`);
  const tail = encoder.encode("\nendstream");
  const output = new Uint8Array(head.length + bytes.length + tail.length);
  output.set(head);
  output.set(bytes, head.length);
  output.set(tail, head.length + bytes.length);
  return output;
}

/**
 * A page that makes pdf.js want every kind of external data: a CJK font that
 * isn't embedded and needs a predefined CMap, a standard font that isn't
 * embedded, and JBIG2 and JPX images, which need WebAssembly decoders.
 */
export function assetHungryPdf(): Uint8Array {
  const content = new TextEncoder().encode(
    [
      "BT /F1 24 Tf 72 700 Td <30423044> Tj ET",
      "BT /F2 18 Tf 72 650 Td (Standard font) Tj ET",
      "0 0 0 1 k 72 600 100 20 re f",
      "q 100 0 0 100 72 400 cm /Im1 Do Q",
      "q 100 0 0 100 300 400 cm /Im2 Do Q",
    ].join("\n"),
  );
  const junk = new Uint8Array(64).map((_, index) => (index * 37) & 0xff);
  return rawPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /XObject << /Im1 9 0 R /Im2 10 0 R >> >> >>",
    stream("", content),
    "<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPro-Regular /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPro-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /FontDescriptor 7 0 R >>",
    "<< /Type /FontDescriptor /FontName /KozMinPro-Regular /Flags 4 /FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream(
      "/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /JBIG2Decode",
      junk,
    ),
    stream(
      "/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode",
      junk,
    ),
  ]);
}

/**
 * A 16 by 16 JPEG 2000 codestream in four 8 by 8 quadrants: red top left,
 * green top right, blue bottom left and yellow bottom right. Lossless, so it
 * decodes to exactly these colours. Made with OpenJPEG through ffmpeg:
 *
 * ```sh
 * # quad.rgb: the 768 bytes of RGB pixels above, row by row
 * ffmpeg -f rawvideo -pix_fmt rgb24 -s 16x16 -i quad.rgb -frames:v 1 \
 *   -c:v libopenjpeg -format j2k -numresolution 3 -compression_level 0 quad.j2k
 * ```
 *
 * SHA-256 b6152751858b287e542cc3a5d27d907acd17dfeb8f2e7d9d836a6dbbe6bf2eca.
 */
const JPX_QUADRANTS =
  "/0//UQAvAAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEAAgQEAAH/XAAKQEBISFBISFD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjD/kAAKAAAAAADvAAH/k9+AoA7JGZR4dE2+pDnwOU8wHgUB56lP34CQEU+FIduqXv637FZRs4yJbXV/34CQEMxN55ARFRuKhFo4nV2/xfEHz8AufgFx+AQAF7EfSUyFSFDCH38PFBHZtXUWY9X7fxawbJAFMMBfz8AkFyyoiTomFletz8AifgEw+0HAGeUKg7v0kqUMZt9Ovna8NiAWBGqQBTDLz8AyfgGR+AKAIhkFUB9TZC78NAgPA3rbEeP3ooxWEeF/JCxO/3/H2ggAIW4H+s/AHn4BUH1AgEnN2y7IEp8k3OPPNQ/SzDVfJNyvf//Z";

/** The colours of {@link jpxPdf}'s image, by quadrant, as RGB. */
export const JPX_COLOURS = {
  topLeft: [255, 0, 0],
  topRight: [0, 255, 0],
  bottomLeft: [0, 0, 255],
  bottomRight: [255, 255, 0],
} as const;

/**
 * Where {@link jpxPdf} draws its image: a square on a US Letter page, as
 * fractions of the page's width and height from its top-left corner.
 */
export const JPX_IMAGE = { x: 72 / 612, y: 92 / 792, width: 400 / 612, height: 400 / 792 } as const;

/**
 * One US Letter page with a real JPEG 2000 image, which pdf.js decodes with
 * OpenJPEG's WebAssembly: the decoder the SDK serves itself, inline or
 * self-hosted, never from a CDN. Unlike {@link assetHungryPdf}'s, this
 * image is valid, so the decoder really loads and runs.
 */
export function jpxPdf(): Uint8Array {
  const image = Uint8Array.from(atob(JPX_QUADRANTS), (char) => char.charCodeAt(0));
  const content = new TextEncoder().encode(
    ["BT /F1 18 Tf 72 720 Td (JPEG 2000) Tj ET", "q 400 0 0 400 72 300 cm /Im1 Do Q"].join("\n"),
  );
  return rawPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>",
    stream("", content),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream("/Type /XObject /Subtype /Image /Width 16 /Height 16 /Filter /JPXDecode", image),
  ]);
}
