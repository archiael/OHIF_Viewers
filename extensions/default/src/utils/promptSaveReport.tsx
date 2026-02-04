import { utils } from '@ohif/core';

const { filterAnd, filterMeasurementsByStudyUID, filterMeasurementsBySeriesUID } =
  utils.MeasurementFilters;

async function promptSaveReport({ servicesManager, commandsManager }, ctx, evt) {
  console.log('🚀 [Python SR Export] promptSaveReport called');
  console.log('   evt:', evt);
  console.log('   ctx:', ctx);

  const { measurementService } = servicesManager.services;
  const viewportId = evt.viewportId === undefined ? evt.data.viewportId : evt.viewportId;
  const isBackupSave = evt.isBackupSave === undefined ? evt.data.isBackupSave : evt.isBackupSave;
  const StudyInstanceUID = evt?.data?.StudyInstanceUID || ctx.trackedStudy;
  const SeriesInstanceUID = evt?.data?.SeriesInstanceUID;
  const { displaySetInstanceUID } = evt.data ?? evt;

  console.log('📊 [Python SR Export] StudyInstanceUID:', StudyInstanceUID);
  console.log('📊 [Python SR Export] SeriesInstanceUID:', SeriesInstanceUID);

  const {
    trackedSeries,
    measurementFilter = filterAnd(
      filterMeasurementsByStudyUID(StudyInstanceUID),
      trackedSeries ? filterMeasurementsBySeriesUID(trackedSeries) : () => true
    ),
  } = ctx;

  console.log('🔍 [Python SR Export] Getting measurements with filter...');
  const allMeasurements = measurementService.getMeasurements(measurementFilter);
  console.log('📏 [Python SR Export] Total measurements found:', allMeasurements?.length || 0);

  // Filter out SR-loaded measurements (those without valid referencedImageId)
  const measurementData = allMeasurements?.filter(m => m.referencedImageId) || [];
  console.log('📏 [Python SR Export] Measurements with valid imageId:', measurementData.length);

  // Debug: Check first measurement structure
  if (allMeasurements && allMeasurements.length > 0) {
    const first = allMeasurements[0];
    console.log('🔍 [Python SR Export] First measurement sample:');
    console.log('   - uid:', first.uid);
    console.log('   - referencedImageId:', first.referencedImageId);
  }

  // Check if there are NEW measurements to export (with valid referencedImageId)
  if (measurementData.length === 0) {
    const errorMsg = allMeasurements && allMeasurements.length > 0
      ? 'No new annotations to save. Only SR-loaded measurements found.'
      : 'No measurements to export';
    console.warn('⚠️ [Python SR Export]', errorMsg);

    // Show user notification
    const { uiNotificationService } = servicesManager.services;
    uiNotificationService.show({
      title: 'Export Failed',
      message: errorMsg,
      type: 'error',
    });

    return {
      userResponse: 'NO_NEW_MEASUREMENTS',
      StudyInstanceUID,
      SeriesInstanceUID,
      viewportId,
      isBackupSave,
      displaySetInstanceUID,
    };
  }

  try {
    // Send measurements to Python SR server instead of creating SR in client
    // Python server will create DICOM SR using highdicom library
    console.log(`✅ [Python SR Export] Exporting ${measurementData.length} measurement(s) to Python server`);
    console.log('📦 [Python SR Export] Measurement data:', measurementData);

    console.log('🔄 [Python SR Export] Calling exportToPythonSRServer command...');
    await commandsManager.runCommand(
      'exportToPythonSRServer',
      {
        measurementData,
      },
      'CORNERSTONE_STRUCTURED_REPORT'
    );

    console.log('✅ [Python SR Export] Export completed successfully');
    return {
      userResponse: 'PYTHON_SR_EXPORT_SUCCESS',
      StudyInstanceUID,
      SeriesInstanceUID,
      viewportId,
      isBackupSave,
      displaySetInstanceUID,
    };
  } catch (error) {
    console.error('❌ [Python SR Export] Failed to export to Python SR server:', error);
    console.error('❌ [Python SR Export] Error stack:', error?.stack);
    return {
      userResponse: 'PYTHON_SR_EXPORT_FAILED',
      error: error.message,
      StudyInstanceUID,
      SeriesInstanceUID,
      viewportId,
      isBackupSave,
      displaySetInstanceUID,
    };
  }
}

export function findPredecessorImageId(annotations) {
  let predecessorImageId;
  for (const annotation of annotations) {
    if (
      predecessorImageId &&
      annotation.predecessorImageId &&
      annotation.predecessorImageId !== predecessorImageId
    ) {
      console.warn('Found multiple source predecessors, not defaulting to same series');
      return;
    }
    predecessorImageId ||= annotation.predecessorImageId;
  }
  return predecessorImageId;
}

export default promptSaveReport;
