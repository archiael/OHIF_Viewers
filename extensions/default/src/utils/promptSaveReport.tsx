import { utils } from '@ohif/core';

const { filterAnd, filterMeasurementsByStudyUID, filterMeasurementsBySeriesUID } =
  utils.MeasurementFilters;

async function promptSaveReport({ servicesManager, commandsManager }, ctx, evt) {
  const { measurementService } = servicesManager.services;
  const viewportId = evt.viewportId === undefined ? evt.data.viewportId : evt.viewportId;
  const isBackupSave = evt.isBackupSave === undefined ? evt.data.isBackupSave : evt.isBackupSave;
  const StudyInstanceUID = evt?.data?.StudyInstanceUID || ctx.trackedStudy;
  const SeriesInstanceUID = evt?.data?.SeriesInstanceUID;
  const { displaySetInstanceUID } = evt.data ?? evt;

  const {
    trackedSeries,
    measurementFilter = filterAnd(
      filterMeasurementsByStudyUID(StudyInstanceUID),
      trackedSeries ? filterMeasurementsBySeriesUID(trackedSeries) : () => true
    ),
  } = ctx;

  const allMeasurements = measurementService.getMeasurements(measurementFilter);

  // Filter out SR-loaded measurements (those without valid referencedImageId)
  const measurementData = allMeasurements?.filter(m => m.referencedImageId) || [];

  // Check if there are NEW measurements to export (with valid referencedImageId)
  if (measurementData.length === 0) {
    const errorMsg = allMeasurements && allMeasurements.length > 0
      ? 'No new annotations to save. Only SR-loaded measurements found.'
      : 'No measurements to export';

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
    await commandsManager.runCommand(
      'exportToPythonSRServer',
      {
        measurementData,
      },
      'CORNERSTONE_STRUCTURED_REPORT'
    );

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
