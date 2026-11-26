import { describe, expect, it } from "vitest";
import { partitionImportFiles } from "@/lib/document/fileKinds";
import { IMPORT_ACCEPT, IMPORT_WORD_OR_IMAGE_ACCEPT } from "@/lib/document/import";

describe("partitionImportFiles", () => {
  it("sends images to the image flow and leaves documents on the file flow", () => {
    const photo = { name: "shot.jpg", type: "image/jpeg" };
    const heic = { name: "IMG_0001.HEIC", type: "image/heic" };
    const doc = { name: "notes.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    expect(partitionImportFiles([doc, photo, heic])).toEqual({ images: [photo, heic], rest: [doc] });
  });

  it("lists image formats on the import picker", () => {
    expect(IMPORT_WORD_OR_IMAGE_ACCEPT).toContain("image/*");
    expect(IMPORT_WORD_OR_IMAGE_ACCEPT).toContain(".png");
    expect(IMPORT_WORD_OR_IMAGE_ACCEPT).toContain(".docx");
    expect(IMPORT_ACCEPT).toContain("image/*");
    expect(IMPORT_ACCEPT).toContain(".pdf");
  });

  it("keeps a non-image file even when the name looks like a photo", () => {
    const fake = { name: "readme.png.txt", type: "text/plain" };
    expect(partitionImportFiles([fake])).toEqual({ images: [], rest: [fake] });
  });
});
