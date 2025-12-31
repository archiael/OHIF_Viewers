// Test script to check if stack viewport images have FrameOfReferenceUID
// This can be run in browser console

console.log('=== Checking Stack Viewport FrameOfReferenceUID ===');

// Get the OHIF extension services
const { displaySetService } = window.cornerstoneViewportService?.servicesManager?.services || {};

if (!displaySetService) {
  console.error('Could not get displaySetService');
} else {
  console.log('DisplaySetService found');

  const displaySets = displaySetService.getActiveDisplaySets();
  console.log(`Active displaySets: ${displaySets.length}`);

  displaySets.forEach((ds, i) => {
    console.log(`\nDisplaySet ${i}:`, ds.displaySetInstanceUID);
    console.log('  Modality:', ds.Modality);
    console.log('  frameOfReferenceUID:', ds.frameOfReferenceUID);
    console.log('  FrameOfReferenceUID:', ds.FrameOfReferenceUID);

    if (ds.images && ds.images.length > 0) {
      console.log('  images[0].FrameOfReferenceUID:', ds.images[0].FrameOfReferenceUID);
      console.log('  Total images:', ds.images.length);
    }

    if (ds.instance) {
      console.log('  instance.FrameOfReferenceUID:', ds.instance.FrameOfReferenceUID);
    }
  });
}

console.log('\n=== Checking Current Annotation Metadata ===');

// Get annotation state
if (typeof window.cornerstonejs !== 'undefined') {
  const { annotation } = window.cornerstonejs.tools;
  const annotations = annotation.state.getAllAnnotations();

  console.log(`Total annotations: ${annotations.length}`);

  annotations.forEach((ann, i) => {
    if (ann.metadata) {
      console.log(`\nAnnotation ${i}:`, ann.annotationUID);
      console.log('  toolName:', ann.metadata.toolName);
      console.log('  FrameOfReferenceUID:', ann.metadata.FrameOfReferenceUID);
      console.log('  referencedImageId:', ann.metadata.referencedImageId);
    }
  });
}
