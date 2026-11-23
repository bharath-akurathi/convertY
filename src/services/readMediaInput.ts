import { fetchFile } from '@ffmpeg/util';

import { isSvg } from '../utils/formats';

export async function readMediaInput(file: File): Promise<Uint8Array> {
  if (!isSvg(file)) return fetchFile(file);

  // The browser can render SVG, but the bundled FFmpeg core has no SVG decoder.
  const url = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is not available');
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not rasterize SVG'));
      }, 'image/png');
    });
    return await fetchFile(png);
  } finally {
    URL.revokeObjectURL(url);
  }
}
