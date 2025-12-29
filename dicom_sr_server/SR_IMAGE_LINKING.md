# DICOM SR Image Linking - Technical Details

## Problem
Initially, the generated SR files were standalone with Modality=SR but didn't reference the original images. This prevented OHIF from:
- Displaying the SR together with the source images
- Overlaying annotations on the correct images
- Linking the SR to the study

## Solution
Added proper DICOM references to link the SR to the original image series.

## DICOM Structure Added

### 1. Study-Level Reference
```
CurrentRequestedProcedureEvidenceSequence (0040,A375)
└── StudyInstanceUID: References the parent study
```

### 2. Series-Level Reference
```
CurrentRequestedProcedureEvidenceSequence (0040,A375)
└── ReferencedSeriesSequence (0008,1115)
    └── SeriesInstanceUID: References the original image series
```

### 3. Instance-Level References (Image References)
```
CurrentRequestedProcedureEvidenceSequence (0040,A375)
└── ReferencedSeriesSequence (0008,1115)
    └── ReferencedSOPSequence (0008,1199)
        ├── ReferencedSOPClassUID: Image SOP Class (e.g., US Image Storage)
        └── ReferencedSOPInstanceUID: Specific image instance
```

### 4. Per-Measurement Image Links
```
ContentSequence > Item > ReferencedSOPSequence (0008,1199)
├── ReferencedSOPClassUID: 1.2.840.10008.5.1.4.1.1.6.1 (US Image Storage)
└── ReferencedSOPInstanceUID: Image where measurement was made
```

## Code Changes

### File: `dicom_sr_server/main.py`

**Lines 133-156**: Added study/series/instance references
```python
# Current Requested Procedure Evidence Sequence - Link SR to original images
ds.CurrentRequestedProcedureEvidenceSequence = [Dataset()]
evidence_item = ds.CurrentRequestedProcedureEvidenceSequence[0]
evidence_item.StudyInstanceUID = data.studyInstanceUID

# Referenced Series Sequence - Reference the original series
evidence_item.ReferencedSeriesSequence = [Dataset()]
series_item = evidence_item.ReferencedSeriesSequence[0]
series_item.SeriesInstanceUID = data.seriesInstanceUID

# Referenced SOP Sequence - Reference individual images
series_item.ReferencedSOPSequence = []
# ... collects unique SOPInstanceUIDs from measurements
```

**Lines 182-189**: Added per-measurement image references
```python
# Referenced SOP Sequence - Link measurement to specific image
if measurement.metadata and 'SOPInstanceUID' in measurement.metadata:
    sop_uid = measurement.metadata['SOPInstanceUID']
    if sop_uid:
        measurement_item.ReferencedSOPSequence = [Dataset()]
        ref_sop = measurement_item.ReferencedSOPSequence[0]
        ref_sop.ReferencedSOPClassUID = '1.2.840.10008.5.1.4.1.1.6.1'
        ref_sop.ReferencedSOPInstanceUID = sop_uid
```

## Verification

Run the check script to verify SR structure:
```bash
cd dicom_sr_server
python check_sr.py
```

Expected output:
```
=== Image References ===
[OK] Has CurrentRequestedProcedureEvidenceSequence
  Referenced Study UID: 1.2.840.113619...
  [OK] Has ReferencedSeriesSequence
    Referenced Series UID: 1.2.840.113619...
    [OK] Has N Referenced SOP(s)

=== Measurements ===
Total measurements: N
  Measurement 1:
    [OK] Has image reference: 1.2.840.113619...
```

## OHIF Integration

With these references, OHIF can now:

1. **Load SR with Study**: SR appears in the same study as the original images
2. **Display Together**: SR series shown in thumbnail list alongside image series
3. **Overlay Annotations**: When viewing the SR, annotations overlay on the referenced images
4. **Navigate**: Clicking measurements navigates to the correct image slice

## Testing

1. Create annotations in OHIF
2. Click "Save" button
3. SR file generated with proper references
4. Reload OHIF with "Local" data source
5. Select folder containing both original images AND the SR file
6. SR should appear in thumbnail list (Modality: SR)
7. Click SR to view annotations overlaid on images

## Notes

- **SOP Class UID**: Currently hardcoded to Ultrasound Image Storage (`1.2.840.10008.5.1.4.1.1.6.1`)
  - For multi-modality support, this should be dynamically determined from the source images
- **Frame of Reference**: Could be enhanced with `FrameOfReferenceUID` for spatial consistency
- **Coordinate Data**: Currently stores numeric measurements, could be extended to store spatial coordinates (SCOORD)

## References

- DICOM Part 3: Information Object Definitions
  - Section C.17.3: SR Document Series Module
  - Section C.17.2: SR Document General Module
- DICOM Part 16: Content Mapping Resource
  - TID 1500: Measurement Report
