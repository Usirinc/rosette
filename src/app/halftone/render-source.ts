export function decodeToolcraftHalftoneSourceImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () =>
      reject(new Error("Halftone renderer could not decode the source image.")),
    );
    image.src = dataUrl;
  });
}
