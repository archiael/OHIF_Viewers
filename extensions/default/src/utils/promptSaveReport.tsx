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
      filterMeasurementsBySeriesUID(trackedSeries)
    ),
  } = ctx;

  const measurementData = measurementService.getMeasurements(measurementFilter);

  // Check if there are measurements to export
  if (!measurementData || measurementData.length === 0) {
    console.warn('[Python SR Export] No measurements to export');
    return {
      userResponse: 'NO_MEASUREMENTS',
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
    console.log(`[Python SR Export] Exporting ${measurementData.length} measurement(s) to Python server`);

    await commandsManager.runCommand(
      'exportToPythonSRServer',
      {
        measurementData,
        serverUrl: 'http://localhost:8000',
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
    console.error('[Python SR Export] Failed to export to Python SR server:', error);
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
