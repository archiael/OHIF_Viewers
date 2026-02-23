/**
 * Renders a grayscale DICOM image to canvas as a thumbnail.
 *
 * Mammography(MG)/Digital X-ray(DX) 이미지의 경우 DICOM VOI 태그가 실제
 * 픽셀 범위와 불일치할 수 있음 (JPEG Lossless 12-bit 디코딩 문제 등).
 * 이를 해결하기 위해 실제 디코딩된 픽셀 min/max로 auto-windowing 적용.
 *
 * 성능 최적화: thumbW×thumbH(≤256×256) 픽셀만 처리하는 nearest-neighbor
 * 다운샘플링으로 8.5M 픽셀 전체를 순회하는 것 대비 ~130배 빠름.
 *
 * @param {object} cornerstone - @cornerstonejs/core namespace
 * @param {string} imageId
 * @param {HTMLCanvasElement} canvas
 */
async function _renderGrayscaleThumbnail(cornerstone, imageId, canvas) {
  // cornerstone.imageLoader.loadAndCacheImage 사용 (캐시 활용)
  const image = await cornerstone.imageLoader.loadAndCacheImage(imageId);

  if (!image) throw new Error('Image not loaded');
  if (image.color) throw new Error('Color image: use default renderer');

  const pixelData = image.getPixelData?.();
  if (!pixelData || !pixelData.length) throw new Error('No pixel data');

  const imgWidth = image.width || image.columns;
  const imgHeight = image.height || image.rows;
  if (!imgWidth || !imgHeight) throw new Error('No dimensions');

  const minPx = image.minPixelValue ?? 0;
  const maxPx = image.maxPixelValue ?? 255;
  const range = maxPx - minPx;
  if (range === 0) throw new Error('Zero pixel range');

  const isInverted = image.invert === true; // MONOCHROME1
  const scaleFactor = 255 / range;

  // 썸네일 크기 계산 (종횡비 유지, 최대 256px)
  const THUMB_MAX = 256;
  const aspect = imgWidth / imgHeight;
  const thumbW = aspect >= 1 ? THUMB_MAX : Math.max(1, Math.round(THUMB_MAX * aspect));
  const thumbH = aspect < 1 ? THUMB_MAX : Math.max(1, Math.round(THUMB_MAX / aspect));

  // Nearest-neighbor 다운샘플링: thumbW×thumbH 픽셀만 처리
  const imageData = new ImageData(thumbW, thumbH);
  const data = imageData.data;
  const xRatio = imgWidth / thumbW;
  const yRatio = imgHeight / thumbH;

  for (let y = 0; y < thumbH; y++) {
    const srcY = Math.min(Math.round(y * yRatio), imgHeight - 1);
    for (let x = 0; x < thumbW; x++) {
      const srcX = Math.min(Math.round(x * xRatio), imgWidth - 1);
      let gray = Math.round((pixelData[srcY * imgWidth + srcX] - minPx) * scaleFactor);
      gray = Math.max(0, Math.min(255, gray));
      if (isInverted) gray = 255 - gray;
      const dstIdx = (y * thumbW + x) * 4;
      data[dstIdx] = gray;
      data[dstIdx + 1] = gray;
      data[dstIdx + 2] = gray;
      data[dstIdx + 3] = 255;
    }
  }

  canvas.width = thumbW;
  canvas.height = thumbH;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
}

/**
 * @param {object} cornerstone - @cornerstonejs/core namespace
 * @param {string} imageId
 * @returns {Promise<string>} canvas data URL
 */
function getImageSrcFromImageId(cornerstone, imageId) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');

    _renderGrayscaleThumbnail(cornerstone, imageId, canvas)
      .then(() => resolve(canvas.toDataURL()))
      .catch(() => {
        // 색상 이미지, 특수 포맷 등: cornerstone 기본 렌더링으로 폴백
        cornerstone.utilities
          .loadImageToCanvas({ canvas, imageId, thumbnail: true })
          .then(() => resolve(canvas.toDataURL()))
          .catch(reject);
      });
  });
}

export default getImageSrcFromImageId;
