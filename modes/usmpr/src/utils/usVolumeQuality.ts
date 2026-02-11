/**
 * Apply GPU raycast quality settings optimized for US volume rendering
 * @param volumeMapper - The vtkGPUVolumeRayCastMapper
 * @param imageData - The vtkImageData to get spacing from
 */
export function applyGpuRayCastQuality({ volumeMapper, imageData }) {
  // Validate imageData and getSpacing function
  // Silent return if imageData is not ready yet (normal during volume loading)
  if (!imageData || typeof imageData.getSpacing !== 'function') {
    return;
  }

  // Get minimum spacing to calculate sample distance
  const spacing = imageData.getSpacing();
  if (!spacing || spacing.length < 3) {
    console.warn('⚠️ [US Quality] Invalid spacing data');
    return;
  }
  const minSpacing = Math.min(spacing[0], spacing[1], spacing[2]);

  // For US surface rendering, use 0.6 * minSpacing as starting point
  // Smaller values = sharper but slower
  // Larger values = faster but more blocky
  const sampleDistance = 0.6 * minSpacing;

  // Set sample distance if mapper supports it
  if (volumeMapper.setSampleDistance) {
    volumeMapper.setSampleDistance(sampleDistance);
  }

  // Disable auto-adjust for predictable results
  if (volumeMapper.setAutoAdjustSampleDistances) {
    volumeMapper.setAutoAdjustSampleDistances(false);
  }

  // Mark as modified to trigger update
  volumeMapper.modified();
}

/**
 * Adjust sample distance for quality tuning
 * @param volumeMapper - The vtkGPUVolumeRayCastMapper
 * @param factor - Multiplier for sample distance (0.5 = higher quality, 1.5 = lower quality)
 */
export function adjustSampleDistance({ volumeMapper, factor }) {
  if (!volumeMapper.getSampleDistance) {
    console.warn('⚠️ [US Quality] Mapper does not support getSampleDistance');
    return;
  }

  const currentDistance = volumeMapper.getSampleDistance();
  const newDistance = currentDistance * factor;

  volumeMapper.setSampleDistance(newDistance);
  volumeMapper.modified();
}
