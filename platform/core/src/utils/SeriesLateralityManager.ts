/**
 * Manages breast series division by laterality (RIGHT/LEFT)
 *
 * This utility helps filter and select series based on breast laterality
 * to ensure only ONE series loads at a time, preventing memory issues
 * from loading both RIGHT and LEFT breast series simultaneously.
 */

export interface LateralityGroups {
  right: any[];
  left: any[];
  unknown: any[];
}

export class SeriesLateralityManager {
  /**
   * Detect laterality from DICOM metadata
   * Priority: Laterality tag → ImageLaterality → BodyPartExamined + SeriesDescription
   *
   * @param metadata - DICOM metadata object
   * @returns 'R' for RIGHT, 'L' for LEFT, null if unknown
   */
  static detectLaterality(metadata: any): 'R' | 'L' | null {
    if (!metadata) {
      return null;
    }

    // Priority 1: Laterality tag (0020,0060) - most reliable
    if (metadata.Laterality) {
      const lat = String(metadata.Laterality).toUpperCase();
      if (lat === 'R' || lat === 'RIGHT') return 'R';
      if (lat === 'L' || lat === 'LEFT') return 'L';
    }

    // Priority 2: ImageLaterality (0020,0062)
    if (metadata.ImageLaterality) {
      const lat = String(metadata.ImageLaterality).toUpperCase();
      if (lat === 'R' || lat === 'RIGHT') return 'R';
      if (lat === 'L' || lat === 'LEFT') return 'L';
    }

    // Priority 3: Check SeriesDescription for RIGHT/LEFT keywords
    const desc = String(metadata.SeriesDescription || '').toUpperCase();
    if (desc.includes('RIGHT') || desc.includes(' RT') || desc.includes('_RT') || desc.includes('RT_')) {
      return 'R';
    }
    if (desc.includes('LEFT') || desc.includes(' LT') || desc.includes('_LT') || desc.includes('LT_')) {
      return 'L';
    }

    // Priority 4: Check BodyPartExamined (0018,0015) for "BREAST"
    const bodyPart = String(metadata.BodyPartExamined || '').toUpperCase();
    if (bodyPart.includes('BREAST')) {
      // Try to extract from SeriesDescription again with different patterns
      if (desc.includes('R_') || desc.endsWith('_R') || desc.startsWith('R ')) return 'R';
      if (desc.includes('L_') || desc.endsWith('_L') || desc.startsWith('L ')) return 'L';
    }

    // Unknown laterality
    return null;
  }

  /**
   * Group displaySets by laterality
   *
   * @param displaySets - Array of displaySet objects
   * @returns Object with right, left, and unknown arrays
   */
  static groupByLaterality(displaySets: any[]): LateralityGroups {
    const groups: LateralityGroups = { right: [], left: [], unknown: [] };

    if (!displaySets || !Array.isArray(displaySets)) {
      console.warn('[Laterality] Invalid displaySets array');
      return groups;
    }

    displaySets.forEach(ds => {
      try {
        const laterality = this.detectLaterality(ds);

        if (laterality === 'R') {
          groups.right.push(ds);
          console.log(`[Laterality] RIGHT series: ${ds.SeriesDescription || ds.SeriesInstanceUID || 'Unknown'}`);
        } else if (laterality === 'L') {
          groups.left.push(ds);
          console.log(`[Laterality] LEFT series: ${ds.SeriesDescription || ds.SeriesInstanceUID || 'Unknown'}`);
        } else {
          groups.unknown.push(ds);
          console.log(`[Laterality] Unknown laterality: ${ds.SeriesDescription || ds.SeriesInstanceUID || 'Unknown'}`);
        }
      } catch (error) {
        console.error('[Laterality] Error detecting laterality:', error);
        groups.unknown.push(ds);
      }
    });

    console.log(`[Laterality] Groups: RIGHT=${groups.right.length}, LEFT=${groups.left.length}, UNKNOWN=${groups.unknown.length}`);
    return groups;
  }

  /**
   * Select preferred series (RIGHT first, or single series)
   *
   * Strategy:
   * 1. Prefer RIGHT breast series if available
   * 2. Fall back to LEFT if no RIGHT
   * 3. Fall back to first unknown series if no laterality detected
   * 4. Return null if no series available
   *
   * @param displaySets - Array of displaySet objects
   * @returns Selected displaySet or null
   */
  static selectPreferredSeries(displaySets: any[]): any | null {
    if (!displaySets || displaySets.length === 0) {
      console.warn('[Laterality] No displaySets to select from');
      return null;
    }

    console.log(`[Laterality] Selecting preferred series from ${displaySets.length} displaySets...`);
    const groups = this.groupByLaterality(displaySets);

    // Prefer RIGHT if it exists
    if (groups.right.length > 0) {
      console.log('✅ [Laterality] Selected RIGHT breast series (preferred)');
      return groups.right[0];
    }

    // Fall back to LEFT
    if (groups.left.length > 0) {
      console.log('✅ [Laterality] Selected LEFT breast series (no RIGHT available)');
      return groups.left[0];
    }

    // Fall back to first unknown series
    if (groups.unknown.length > 0) {
      console.log('⚠️ [Laterality] No laterality detected, using first available series');
      return groups.unknown[0];
    }

    console.error('❌ [Laterality] No series available after filtering');
    return null;
  }

  /**
   * Select specific laterality series
   *
   * @param displaySets - Array of displaySet objects
   * @param preferredLaterality - 'R' or 'L'
   * @returns Selected displaySet or null
   */
  static selectByLaterality(displaySets: any[], preferredLaterality: 'R' | 'L'): any | null {
    if (!displaySets || displaySets.length === 0) {
      return null;
    }

    const groups = this.groupByLaterality(displaySets);
    const targetGroup = preferredLaterality === 'R' ? groups.right : groups.left;

    if (targetGroup.length > 0) {
      console.log(`✅ [Laterality] Selected ${preferredLaterality === 'R' ? 'RIGHT' : 'LEFT'} series`);
      return targetGroup[0];
    }

    console.warn(`⚠️ [Laterality] No ${preferredLaterality === 'R' ? 'RIGHT' : 'LEFT'} series found`);
    return null;
  }

  /**
   * Get all available lateralities in the study
   *
   * @param displaySets - Array of displaySet objects
   * @returns Array of available lateralities ['R', 'L', 'UNKNOWN']
   */
  static getAvailableLateralities(displaySets: any[]): string[] {
    const groups = this.groupByLaterality(displaySets);
    const available: string[] = [];

    if (groups.right.length > 0) available.push('R');
    if (groups.left.length > 0) available.push('L');
    if (groups.unknown.length > 0) available.push('UNKNOWN');

    return available;
  }
}
