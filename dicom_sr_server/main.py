from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pydicom
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import generate_uid
from datetime import datetime
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DICOM SR Service")

# CORS 설정 (개발 환경)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # OHIF 개발 서버
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터 모델
class MeasurementData(BaseModel):
    uid: str
    toolName: str
    label: Optional[str]
    type: str
    points: List[List[float]]
    data: Dict[str, Any]
    metadata: Dict[str, str]

class AnnotationsRequest(BaseModel):
    studyInstanceUID: str
    seriesInstanceUID: str
    patientID: str
    patientName: str
    measurements: List[MeasurementData]

@app.post("/api/save-annotations")
async def save_annotations(data: AnnotationsRequest):
    """
    Annotation 데이터를 받아 DICOM SR로 변환 후 저장
    """
    try:
        logger.info(f"Received {len(data.measurements)} annotations for study {data.studyInstanceUID}")

        # Log first measurement for debugging
        if data.measurements:
            logger.info(f"First measurement data: {data.measurements[0].data}")
            logger.info(f"First measurement type: {data.measurements[0].type}")
            logger.info(f"First measurement points: {data.measurements[0].points}")
            logger.info(f"First measurement toolName: {data.measurements[0].toolName}")

        # 1. 감사 로그
        logger.info(f"User saving annotations - Study: {data.studyInstanceUID}, Count: {len(data.measurements)}")

        # 2. 데이터 검증
        if not data.measurements:
            raise HTTPException(status_code=400, detail="No measurements provided")

        # 3. DICOM SR 생성
        sr_dataset = create_dicom_sr(data)

        # 4. 파일로 저장 (로컬 로드 폴더에 저장)
        # OHIF가 로드할 수 있는 폴더에 저장 (예: testdata 폴더)
        import os

        # 저장 경로 설정 (환경 변수 또는 기본값)
        output_dir = os.getenv('DICOM_OUTPUT_DIR', '../testdata/SR_outputs')
        os.makedirs(output_dir, exist_ok=True)

        sr_filename = f"SR_{sr_dataset.SOPInstanceUID}.dcm"
        sr_filepath = os.path.join(output_dir, sr_filename)
        sr_dataset.save_as(sr_filepath, write_like_original=False)

        logger.info(f"✅ DICOM SR saved: {sr_filepath}")

        return {
            "success": True,
            "srInstanceUID": sr_dataset.SOPInstanceUID,
            "seriesInstanceUID": sr_dataset.SeriesInstanceUID,
            "filename": sr_filename,
            "filepath": sr_filepath,
            "measurementCount": len(data.measurements),
        }

    except Exception as e:
        logger.error(f"❌ Error saving annotations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def create_dicom_sr(data: AnnotationsRequest) -> Dataset:
    """
    Annotation 데이터로부터 DICOM SR 생성
    """
    # File Meta Information (pydicom 3.0+ uses Dataset for file_meta)
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.88.11'  # Basic Text SR
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = '1.2.840.10008.1.2.1'  # Explicit VR Little Endian
    file_meta.ImplementationClassUID = generate_uid()

    # SR Dataset
    ds = Dataset()
    ds.file_meta = file_meta

    # Patient Module
    ds.PatientName = data.patientName
    ds.PatientID = data.patientID
    ds.PatientBirthDate = ''
    ds.PatientSex = ''

    # General Study Module
    ds.StudyInstanceUID = data.studyInstanceUID
    ds.StudyDate = datetime.now().strftime('%Y%m%d')
    ds.StudyTime = datetime.now().strftime('%H%M%S')
    ds.ReferringPhysicianName = ''
    ds.StudyID = '1'
    ds.AccessionNumber = ''

    # SR Document Series Module
    ds.Modality = 'SR'
    ds.SeriesInstanceUID = generate_uid()
    ds.SeriesNumber = 3001  # SR 시리즈 번호
    ds.SeriesDescription = 'USMPR Annotations'

    # General Equipment Module
    ds.Manufacturer = 'OHIF USMPR'

    # SR Document General Module
    ds.InstanceNumber = 1
    ds.ContentDate = datetime.now().strftime('%Y%m%d')
    ds.ContentTime = datetime.now().strftime('%H%M%S')
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID

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

    # Collect unique SOP Instance UIDs from measurements
    referenced_sops = set()
    for measurement in data.measurements:
        if measurement.metadata and 'SOPInstanceUID' in measurement.metadata:
            sop_uid = measurement.metadata['SOPInstanceUID']
            if sop_uid and sop_uid not in referenced_sops:
                referenced_sops.add(sop_uid)
                sop_item = Dataset()
                sop_item.ReferencedSOPClassUID = '1.2.840.10008.5.1.4.1.1.6.1'  # Ultrasound Image Storage
                sop_item.ReferencedSOPInstanceUID = sop_uid
                series_item.ReferencedSOPSequence.append(sop_item)

    # SR Document Content Module
    ds.ValueType = 'CONTAINER'
    ds.ConceptNameCodeSequence = [Dataset()]
    ds.ConceptNameCodeSequence[0].CodeValue = '113701'
    ds.ConceptNameCodeSequence[0].CodingSchemeDesignator = 'DCM'
    ds.ConceptNameCodeSequence[0].CodeMeaning = 'Imaging Measurements'

    ds.ContinuityOfContent = 'SEPARATE'

    # Content Sequence - Measurements
    ds.ContentSequence = []

    for idx, measurement in enumerate(data.measurements):
        # Measurement Item
        measurement_item = Dataset()
        measurement_item.RelationshipType = 'CONTAINS'
        measurement_item.ValueType = 'NUM'

        # Concept Name
        measurement_item.ConceptNameCodeSequence = [Dataset()]
        measurement_item.ConceptNameCodeSequence[0].CodeValue = '410668003'  # Length
        measurement_item.ConceptNameCodeSequence[0].CodingSchemeDesignator = 'SCT'
        measurement_item.ConceptNameCodeSequence[0].CodeMeaning = measurement.toolName

        # Referenced SOP Sequence - Link measurement to specific image
        if measurement.metadata and 'SOPInstanceUID' in measurement.metadata:
            sop_uid = measurement.metadata['SOPInstanceUID']
            if sop_uid:
                measurement_item.ReferencedSOPSequence = [Dataset()]
                ref_sop = measurement_item.ReferencedSOPSequence[0]
                ref_sop.ReferencedSOPClassUID = '1.2.840.10008.5.1.4.1.1.6.1'  # Ultrasound Image Storage
                ref_sop.ReferencedSOPInstanceUID = sop_uid

        # Measured Value - extract from data
        value = None
        unit = 'mm'
        code_value = '410668003'

        # OHIF stores calculated values nested under volumeId keys
        # Structure: measurement.data = {'volumeId:...': {'length': 31.38, 'unit': 'mm'}}
        if measurement.data:
            # Get the first volumeId key's value
            for key, stats in measurement.data.items():
                if isinstance(stats, dict):
                    # Length tool
                    if 'length' in stats:
                        value = stats['length']
                        unit = stats.get('unit', 'mm')
                        code_value = '410668003'  # Length
                        break
                    # CircleROI / EllipticalROI - use area
                    elif 'area' in stats:
                        value = stats['area']
                        unit = stats.get('unit', 'mm2')
                        code_value = '42798000'  # Area
                        break

        # Add measured value if found
        if value is not None:
            measurement_item.MeasuredValueSequence = [Dataset()]
            measurement_item.MeasuredValueSequence[0].NumericValue = float(value)
            measurement_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence = [Dataset()]
            measurement_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence[0].CodeValue = unit
            measurement_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence[0].CodingSchemeDesignator = 'UCUM'
            measurement_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence[0].CodeMeaning = 'millimeter' if unit == 'mm' else 'square millimeter'

        ds.ContentSequence.append(measurement_item)

    # Specific Character Set
    ds.SpecificCharacterSet = 'ISO_IR 192'  # UTF-8

    return ds

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
