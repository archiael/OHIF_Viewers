/**
 * SR Report Manager - Handles opening the mammography SR report page.
 * Decomposed from the openSRReportPage God Function (~323 lines).
 * Each function is under 50 lines for maintainability.
 *
 * This module is mammography-mode-only (not shared with mammography-compare).
 */

import { DicomMetadataStore, utils } from '@ohif/core';
import { logger } from '@ohif/mode-mammography-shared';

const { formatPN } = utils;

// ─── Metadata mapping helpers ────────────────────────────────────────────

function mapEchoPattern(value: number): string {
  const map = ['anechoic', 'hypoechoic', 'isoechoic', 'hyperechoic', 'complex echoic'];
  return map[value] || '';
}

function mapShape(value: number): string {
  const map = ['round', 'oval', 'irregular'];
  return map[value] || '';
}

function mapOrientation(value: number): string {
  const map = ['parallel', 'non-parallel'];
  return map[value] || '';
}

function mapMargin(value: number): string {
  const map = ['circumscribed', 'indistinct', 'angulated', 'spiculated', 'microlobulated'];
  return map[value] || '';
}

// ─── Metadata extraction ─────────────────────────────────────────────────

/** Extract a field value from measurement metadata, checking multiple locations. */
export function extractFromMetadata(measurement: any, fieldName: string): any {
  function convertValue(value: any): any {
    if (fieldName === 'echo_pattern' && typeof value === 'number') return mapEchoPattern(value);
    if (fieldName === 'shape' && typeof value === 'number') return mapShape(value);
    if (fieldName === 'orientation' && typeof value === 'number') return mapOrientation(value);
    if (fieldName === 'margin' && typeof value === 'number') return mapMargin(value);
    return value;
  }

  if (measurement.metadata?.clinical?.[fieldName] !== undefined) {
    return convertValue(measurement.metadata.clinical[fieldName]);
  }
  if (measurement.metadata?.[fieldName] !== undefined) {
    return convertValue(measurement.metadata[fieldName]);
  }
  if (measurement.finding?.[fieldName] !== undefined) {
    return convertValue(measurement.finding[fieldName]);
  }
  if (measurement.data?.[fieldName] !== undefined) {
    return convertValue(measurement.data[fieldName]);
  }
  if (measurement[fieldName] !== undefined) {
    return convertValue(measurement[fieldName]);
  }
  if (measurement.findingSites && Array.isArray(measurement.findingSites)) {
    for (const site of measurement.findingSites) {
      if (site.type === fieldName && site.text) return site.text;
    }
  }
  return '';
}

// ─── Text parsing helpers ────────────────────────────────────────────────

/** Get display text string from a measurement's various text fields. */
export function getDisplayText(m: any): string {
  if (m.label && typeof m.label === 'string') return m.label;
  if (m.finding?.text) return m.finding.text;
  if (m.displayText) {
    if (typeof m.displayText === 'string') return m.displayText;
    if (typeof m.displayText === 'object') {
      const parts: string[] = [];
      if (Array.isArray(m.displayText.primary)) parts.push(...m.displayText.primary);
      if (Array.isArray(m.displayText.secondary)) parts.push(...m.displayText.secondary);
      return parts.join(', ');
    }
  }
  return '';
}

/** Extract frame range from display text (e.g., "slice 3-5"). */
export function extractFrameRange(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const sliceMatch = text.match(/\(slice\s+(\d+(?:-\d+)?)\)/i) || text.match(/slice\s+(\d+(?:-\d+)?)/i);
  const frameMatch = text.match(/frame\s+(\d+(?:-\d+)?)/i);
  if (sliceMatch) return sliceMatch[1];
  if (frameMatch) return frameMatch[1];
  return '';
}

/** Extract malignancy percentage from display text (e.g., "M: 75%"). */
export function extractMaligPercent(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/M[:\s]*(\d+)%/i);
  return match ? match[1] : '';
}

/** Extract orientation from is_parallel metadata field. */
export function extractOrientationFromParallel(measurement: any): string {
  const isParallel = extractFromMetadata(measurement, 'is_parallel');
  if (isParallel === true || isParallel === 'true' || isParallel === 1) return 'parallel';
  if (isParallel === false || isParallel === 'false' || isParallel === 0) return 'non-parallel';
  return '';
}

/** Extract max diameter / surface area / volume from measurement. */
export function extractMaxSurfVol(measurement: any, text: string): string {
  const parts: string[] = [];

  if (measurement.metadata?.clinical) {
    const c = measurement.metadata.clinical;
    if (c.max_diameter_mm !== undefined) parts.push(`${c.max_diameter_mm.toFixed(1)}`);
    if (c.surface_area_mm2 !== undefined) parts.push(`${c.surface_area_mm2.toFixed(1)}`);
    if (c.volume_mm3 !== undefined) parts.push(`${c.volume_mm3.toFixed(1)}`);
  }

  if (parts.length === 0 && measurement.stats) {
    if (measurement.stats.max !== undefined) parts.push(`${measurement.stats.max.toFixed(1)}`);
    if (measurement.area !== undefined) parts.push(`${measurement.area.toFixed(1)}`);
    if (measurement.volume !== undefined) parts.push(`${measurement.volume.toFixed(1)}`);
  }

  return parts.join('/');
}

/** Extract position (N and D coordinates) from measurement text. */
export function extractPositionFromMeasurement(measurement: any): string {
  const text = String(measurement.label || measurement.finding?.text || measurement.displayText || '');
  const nMatch = text.match(/N[:\s]*\(?([\+\-]?\d+),\s*([\+\-]?\d+)\)?/i);
  const dMatch = text.match(/D[:\s]*(\d+)-(\d+)/i);

  let position = '';
  if (nMatch) position = `N:(${nMatch[1]},${nMatch[2]})`;
  if (dMatch) position += (position ? ', ' : '') + `D:${dMatch[1]}-${dMatch[2]}`;
  return position;
}

/** Extract size from measurement data (clinical metadata, label, or tool stats). */
export function extractSizeFromMeasurement(measurement: any): string {
  if (measurement.metadata?.clinical) {
    const c = measurement.metadata.clinical;
    if (c.size_x_mm !== undefined && c.size_y_mm !== undefined && c.size_z_mm !== undefined) {
      return `${c.size_x_mm.toFixed(1)}x${c.size_y_mm.toFixed(1)}x${c.size_z_mm.toFixed(1)}`;
    }
  }

  if (measurement.label) {
    const match = String(measurement.label).match(/(\d+\.?\d*)\s*mm/);
    if (match) return match[1];
  }

  if (measurement.toolName === 'Length' && measurement.length) {
    return measurement.length.toFixed(1);
  }

  if (measurement.toolName === 'EllipticalROI' || measurement.toolName === 'CircleROI') {
    if (measurement.meanDiameter) return measurement.meanDiameter.toFixed(1);
    if (measurement.area) return (2 * Math.sqrt(measurement.area / Math.PI)).toFixed(1);
    if (measurement.stats?.mean) return `${measurement.stats.mean.toFixed(1)} (mean)`;
  }

  if (measurement.text || measurement.displayText || measurement.finding?.text) {
    const text = String(measurement.text || measurement.finding?.text || measurement.displayText || '');
    const match = text.match(/(\d+\.?\d*)\s*mm/);
    if (match) return match[1];
  }

  return '';
}

// ─── Study metadata ──────────────────────────────────────────────────────

/** Get study and first instance metadata from DicomMetadataStore. */
export function getStudyMetadata(studyInstanceUID: string): { study: any; instance: any } {
  let study = null;
  let instance = null;

  if (studyInstanceUID) {
    study = DicomMetadataStore.getStudy(studyInstanceUID);
    if (study?.series?.[0]?.instances?.[0]) {
      instance = study.series[0].instances[0];
    }
  }

  return { study, instance };
}

/** Create a metadata getter that searches instance, study, and displaySet. */
export function createMetaGetter(instance: any, study: any, firstDS: any) {
  return (key: string, defaultValue = '-'): any => {
    if (instance?.[key]) return instance[key];
    if (study?.[key]) return study[key];
    if (firstDS?.[key]) return firstDS[key];
    if (key === 'PatientID' && (instance?.['MRN'] || study?.['MRN'])) {
      return instance?.['MRN'] || study?.['MRN'];
    }
    return defaultValue;
  };
}

// ─── Measurement mapping ─────────────────────────────────────────────────

/** Map a single measurement to the report data format. */
export function mapMeasurementToReport(m: any): any {
  const displayText = getDisplayText(m);
  const maligMax = extractFromMetadata(m, 'malignancy_max');
  const maligAvg = extractFromMetadata(m, 'malignancy_avg');

  let maligPercent = '';
  if (maligMax && maligAvg && !isNaN(maligMax) && !isNaN(maligAvg)) {
    maligPercent = `${Math.round(maligMax)}/${Math.round(maligAvg)}`;
  } else {
    maligPercent = extractMaligPercent(displayText);
  }

  return {
    uid: m.uid,
    frameRange: extractFrameRange(displayText) || extractFromMetadata(m, 'frame_range'),
    position: extractPositionFromMeasurement(m),
    size: extractSizeFromMeasurement(m),
    maxSurfVol: extractMaxSurfVol(m, displayText),
    nature: extractFromMetadata(m, 'nature') || 'Mass',
    cat: extractFromMetadata(m, 'cat') || '',
    maligPercent,
    echo: extractFromMetadata(m, 'echo_pattern') || '',
    shape: extractFromMetadata(m, 'shape') || '',
    orientation: extractFromMetadata(m, 'orientation') || extractOrientationFromParallel(m),
    margin: extractFromMetadata(m, 'margin') || '',
    includeEcho: true,
    includeShape: true,
    includeOrientation: true,
    includeMargin: true,
    rawDisplayText: displayText,
  };
}

// ─── Main entry point ────────────────────────────────────────────────────

/** Open the mammography SR report page in a new tab. */
export async function openSRReportPage(servicesManager: any): Promise<void> {
  const { measurementService, displaySetService } = servicesManager.services;

  const measurements = Array.from(measurementService.measurements.values());
  const firstDS = displaySetService.activeDisplaySets[0];
  const { study, instance } = getStudyMetadata(firstDS?.StudyInstanceUID);
  const getMeta = createMetaGetter(instance, study, firstDS);

  const reportData = {
    studyInstanceUID: firstDS?.StudyInstanceUID || '',
    seriesInstanceUID: firstDS?.SeriesInstanceUID || '',
    patientID: getMeta('PatientID', getMeta('MRN', '-')),
    patientName: formatPN(getMeta('PatientName', '')) || 'Unknown',
    birthDate: getMeta('PatientBirthDate', '-'),
    studyDate: getMeta('StudyDate', ''),
    sex: getMeta('PatientSex', '-'),
    age: getMeta('PatientAge', '-'),
    studyName: 'Mammography Both.',
    measurements: measurements.map(mapMeasurementToReport),
    timestamp: new Date().toISOString(),
  };

  try {
    localStorage.setItem('ohif_mammography_report_data', JSON.stringify(reportData));
    window.open('/mammography-report.html', '_blank');
  } catch (error) {
    logger.error('Failed to store mammography report data:', error);
    alert('Failed to open mammography report page. Please try again.');
  }
}
