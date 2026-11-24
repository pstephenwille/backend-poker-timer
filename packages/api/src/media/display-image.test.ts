import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import {
  MAX_DISPLAY_DIMENSION,
  toDisplayWebp,
  UnreadableImageError,
} from "./display-image.ts";

const HEIC_FIXTURE = readFileSync(
  new URL("../../test-fixtures/landscape.heic", import.meta.url),
);
const GPS_IFD_POINTER_TAG = 0x8825;
const EXIF_HEADER_BYTES = 6;
const IFD_ENTRY_BYTES = 12;
const CAMERA_MAKE = "TestCam";
const ROTATE_90_CLOCKWISE = 6;

function blankImage(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: "#2a7d4f" },
  });
}

async function jpegWithGps(width = 3000, height = 2000): Promise<Buffer> {
  return blankImage(width, height)
    .jpeg()
    .withExif({
      IFD0: { Make: CAMERA_MAKE, Model: "Fixture" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .toBuffer();
}

/** Reads the first EXIF directory and reports whether it points to a GPS directory. */
function hasGpsDirectory(exif: Buffer | undefined): boolean {
  if (!exif) {
    return false;
  }
  const tiff = exif.subarray(EXIF_HEADER_BYTES);
  const littleEndian = tiff.toString("latin1", 0, 2) === "II";
  const readShort = (offset: number) =>
    littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const readLong = (offset: number) =>
    littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  const directory = readLong(4);
  const entries = readShort(directory);
  for (let index = 0; index < entries; index++) {
    if (
      readShort(directory + 2 + index * IFD_ENTRY_BYTES) === GPS_IFD_POINTER_TAG
    ) {
      return true;
    }
  }
  return false;
}

async function describeImage(image: Buffer) {
  const { format, width, height, exif, xmp, iptc } =
    await sharp(image).metadata();
  return { format, width, height, exif, xmp, iptc };
}

describe("toDisplayWebp", () => {
  test("strips GPS and all other metadata from a JPEG", async () => {
    const original = await jpegWithGps();
    expect(hasGpsDirectory((await sharp(original).metadata()).exif)).toBe(true);
    expect(original.includes(Buffer.from(CAMERA_MAKE))).toBe(true);

    const display = await toDisplayWebp(original, "image/jpeg");
    const described = await describeImage(display);

    expect(described.format).toBe("webp");
    expect(described.exif).toBeUndefined();
    expect(described.xmp).toBeUndefined();
    expect(described.iptc).toBeUndefined();
    expect(hasGpsDirectory(described.exif)).toBe(false);
    expect(display.includes(Buffer.from(CAMERA_MAKE))).toBe(false);
  });

  test("fits the longest side within 1600 px, keeping the aspect ratio", async () => {
    const display = await toDisplayWebp(
      await jpegWithGps(3000, 2000),
      "image/jpeg",
    );

    expect(await describeImage(display)).toMatchObject({
      width: MAX_DISPLAY_DIMENSION,
      height: 1067,
    });
  });

  test("turns a sideways phone photo upright before dropping its orientation tag", async () => {
    const sideways = await blankImage(3000, 2000)
      .jpeg()
      .withMetadata({ orientation: ROTATE_90_CLOCKWISE })
      .toBuffer();

    const display = await toDisplayWebp(sideways, "image/jpeg");

    expect(await describeImage(display)).toMatchObject({
      width: 1067,
      height: MAX_DISPLAY_DIMENSION,
      exif: undefined,
    });
  });

  test("does not enlarge a small image", async () => {
    const small = await blankImage(800, 600).png().toBuffer();

    const display = await toDisplayWebp(small, "image/png");

    expect(await describeImage(display)).toMatchObject({
      format: "webp",
      width: 800,
      height: 600,
    });
  });

  test("accepts WebP input", async () => {
    const webp = await blankImage(2000, 2000).webp().toBuffer();

    const display = await toDisplayWebp(webp, "image/webp");

    expect(await describeImage(display)).toMatchObject({
      width: MAX_DISPLAY_DIMENSION,
      height: MAX_DISPLAY_DIMENSION,
    });
  });

  test("decodes a HEIC photo and resizes it", async () => {
    const display = await toDisplayWebp(HEIC_FIXTURE, "image/heic");

    expect(await describeImage(display)).toMatchObject({
      format: "webp",
      width: MAX_DISPLAY_DIMENSION,
      height: 1200,
      exif: undefined,
    });
  });

  test("rejects bytes that are not an image", async () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n");

    await expect(toDisplayWebp(pdf, "image/jpeg")).rejects.toBeInstanceOf(
      UnreadableImageError,
    );
  });

  test("rejects a file claiming to be HEIC that is not", async () => {
    await expect(
      toDisplayWebp(await jpegWithGps(), "image/heic"),
    ).rejects.toBeInstanceOf(UnreadableImageError);
  });
});
