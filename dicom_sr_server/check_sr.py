import pydicom
import sys

# Read the SR file
sr_file = '../testdata/SR_outputs/SR_1.2.826.0.1.3680043.8.498.91265696288585651276625095600423260625.dcm'
ds = pydicom.dcmread(sr_file)

print('=== Basic Info ===')
print(f'Modality: {ds.Modality}')
print(f'Study UID: {ds.StudyInstanceUID}')
print(f'Series UID: {ds.SeriesInstanceUID}')
print()

print('=== Image References ===')
if hasattr(ds, 'CurrentRequestedProcedureEvidenceSequence'):
    print('[OK] Has CurrentRequestedProcedureEvidenceSequence')
    ev = ds.CurrentRequestedProcedureEvidenceSequence[0]
    print(f'  Referenced Study UID: {ev.StudyInstanceUID}')

    if hasattr(ev, 'ReferencedSeriesSequence'):
        print('  [OK] Has ReferencedSeriesSequence')
        rs = ev.ReferencedSeriesSequence[0]
        print(f'    Referenced Series UID: {rs.SeriesInstanceUID}')

        if hasattr(rs, 'ReferencedSOPSequence'):
            print(f'    [OK] Has {len(rs.ReferencedSOPSequence)} Referenced SOP(s)')
            for i, sop in enumerate(rs.ReferencedSOPSequence):
                print(f'      SOP {i+1}: {sop.ReferencedSOPInstanceUID}')
        else:
            print('    [MISSING] No ReferencedSOPSequence')
    else:
        print('  [MISSING] No ReferencedSeriesSequence')
else:
    print('[MISSING] No CurrentRequestedProcedureEvidenceSequence')

print()
print('=== Measurements ===')
if hasattr(ds, 'ContentSequence'):
    print(f'Total measurements: {len(ds.ContentSequence)}')
    for i, item in enumerate(ds.ContentSequence):
        print(f'  Measurement {i+1}:')
        if hasattr(item, 'ConceptNameCodeSequence'):
            print(f'    Tool: {item.ConceptNameCodeSequence[0].CodeMeaning}')
        if hasattr(item, 'ReferencedSOPSequence'):
            print(f'    [OK] Has image reference: {item.ReferencedSOPSequence[0].ReferencedSOPInstanceUID}')
        else:
            print(f'    [MISSING] No image reference')
else:
    print('[MISSING] No ContentSequence')
