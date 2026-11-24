/** The subset of libheif-js's untyped API the image processor uses. */
declare module "libheif-js/wasm-bundle.js" {
  interface HeifImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: HeifImageData,
      callback: (result: HeifImageData | null) => void,
    ): void;
  }

  interface HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[];
  }

  const libheif: { HeifDecoder: new () => HeifDecoder };
  export default libheif;
}
