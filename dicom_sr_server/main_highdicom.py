from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, AliasChoices
from typing import List, Dict, Any, Optional
import re
import urllib.parse
import pydicom
from pydicom.uid import generate_uid
from datetime import datetime
import logging
import os

# highdicom imports
import highdicom as hd
from highdicom.sr.coding import Code
import numpy as np

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DICOM SR Service with highdicom")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터 모델
class MeasurementMetadata(BaseModel):
    referencedImageId: Optional[str] = Field(
        default='',
        validation_alias=AliasChoices('referencedImageId', 'ReferencedImageId'),
    )
    FrameOfReferenceUID: Optional[str] = Field(
        default='',
        validation_alias=AliasChoices('FrameOfReferenceUID', 'frameOfReferenceUID'),
    )
    SOPInstanceUID: Optional[str] = Field(
        default='',
        validation_alias=AliasChoices('SOPInstanceUID', 'sopInstanceUID'),
    )
    SOPClassUID: Optional[str] = Field(
        default='',
        validation_alias=AliasChoices('SOPClassUID', 'sopClassUID'),
    )
    ImageOrientationPatient: Optional[List[float]] = Field(
        default=None,
        validation_alias=AliasChoices('ImageOrientationPatient', 'imageOrientationPatient'),
    )
    ImagePositionPatient: Optional[List[float]] = Field(
        default=None,
        validation_alias=AliasChoices('ImagePositionPatient', 'imagePositionPatient'),
    )
    PixelSpacing: Optional[List[float]] = Field(
        default=None,
        validation_alias=AliasChoices('PixelSpacing', 'pixelSpacing'),
    )
    SliceThickness: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices('SliceThickness', 'sliceThickness'),
    )
    Rows: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices('Rows', 'rows'),
    )
    Columns: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices('Columns', 'columns'),
    )

class MeasurementData(BaseModel):
    uid: str
    toolName: str
    label: Optional[str]
    type: str
    points: List[List[float]]
    data: Optional[Dict[str, Any]] = None  # Allow null for annotation-only tools
    metadata: MeasurementMetadata
    referencedImageId: Optional[str] = None

class AnnotationsRequest(BaseModel):
    studyInstanceUID: str
    seriesInstanceUID: str
    patientID: str
    patientName: str
    patientBirthDate: Optional[str] = ''
    patientSex: Optional[str] = ''
    studyDate: Optional[str] = ''
    studyTime: Optional[str] = ''
    studyID: Optional[str] = ''
    accessionNumber: Optional[str] = ''
    modality: Optional[str] = 'OT'
    measurements: List[MeasurementData]

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"❌ Validation error: {exc.errors()}")
    logger.error(f"Body: {exc.body}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

@app.post("/api/save-annotations")
async def save_annotations(data: AnnotationsRequest):
    """
    Annotation 데이터를 받아 highdicom으로 DICOM SR 생성
    """
    try:
        logger.info(f"Received {len(data.measurements)} annotations for study {data.studyInstanceUID}")

        # Log first measurement for debugging
        if data.measurements:
            logger.info(f"First measurement data: {data.measurements[0].data}")
            logger.info(f"First measurement label: {data.measurements[0].label}")
            logger.info(f"First measurement type: {data.measurements[0].type}")
            logger.info(f"First measurement points: {data.measurements[0].points}")
            logger.info(f"First measurement toolName: {data.measurements[0].toolName}")

        # 데이터 검증
        if not data.measurements:
            raise HTTPException(status_code=400, detail="No measurements provided")

        # highdicom으로 DICOM SR 생성
        sr_dataset = create_dicom_sr_highdicom(data)

        # 파일로 저장
        default_output_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
        output_dir = os.getenv('DICOM_OUTPUT_DIR', default_output_dir)
        os.makedirs(output_dir, exist_ok=True)

        sr_filename = f"SR_{sr_dataset.SOPInstanceUID}.dcm"
        sr_filepath = os.path.join(output_dir, sr_filename)
        sr_dataset.save_as(sr_filepath, write_like_original=False)

        logger.info(f"✅ DICOM SR saved with highdicom: {sr_filepath}")

        return {
            "status": "success",
            "filename": sr_filename,
            "path": sr_filepath,
            "measurement_count": len(data.measurements)
        }

    except Exception as e:
        import traceback
        logger.error(f"❌ Error saving annotations: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

def create_dicom_sr_highdicom(data: AnnotationsRequest):
    """
    Build a TID1500 Measurement Report SR using highdicom templates.
    """
    measurement_groups = []

    for measurement in data.measurements:
        _hydrate_measurement_metadata(measurement, data.modality)
        measurement_value = _extract_measurement_value(measurement)

        graphic_type = _get_graphic_type(measurement)
        if graphic_type is None:
            logger.warning(f"Unsupported tool for SR export: {measurement.toolName}")
            continue

        # Skip CIRCLE and ELLIPSE for now (postponed until later)
        if graphic_type in ('CIRCLE', 'ELLIPSE'):
            logger.warning(f"⏸️  Skipping {graphic_type} ({measurement.toolName}) - postponed")
            continue

        # Always prefer 3D (SCOORD3D) for volume-based measurements
        # SCOORD3D works natively with OHIF's SR loading without needing image plane conversion
        use_3d = _can_encode_3d(measurement, graphic_type)
        use_2d = (not use_3d) and _can_encode_2d(measurement, graphic_type)

        logger.info(f"   Coordinate decision: use_3d={use_3d}, use_2d={use_2d}")
        logger.info(f"   Has FrameOfReferenceUID: {bool(measurement.metadata.FrameOfReferenceUID)}")
        logger.info(f"   Has SOPInstanceUID: {bool(measurement.metadata.SOPInstanceUID)}")
        logger.info(f"   Has ImageOrientationPatient: {bool(measurement.metadata.ImageOrientationPatient)}")
        logger.info(f"   Points are 3D: {any(len(p) >= 3 for p in measurement.points or [])}")

        if not use_2d and not use_3d:
            logger.warning("Skipping measurement with no compatible spatial metadata")
            continue

        graphic_data = _build_graphic_data(measurement, use_3d)
        if graphic_data is None or graphic_data.size == 0:
            logger.warning(f"Skipping measurement with no graphic data: {measurement.toolName}")
            continue

        tracking_id = _tracking_identifier_for_tool(measurement.toolName)
        tracking_identifier = hd.sr.TrackingIdentifier(
            uid=generate_uid(),
            identifier=tracking_id,
        )

        if use_3d:
            logger.info(f"   ✅ Using SCOORD3D (3D world coordinates)")
            referenced_coordinates = hd.sr.CoordinatesForMeasurement3D(
                graphic_type=hd.sr.GraphicTypeValues3D(graphic_type),
                graphic_data=graphic_data,
                frame_of_reference_uid=measurement.metadata.FrameOfReferenceUID,
            )
        else:
            logger.info(f"   ✅ Using SCOORD (2D pixel coordinates)")
            sop_instance_uid = measurement.metadata.SOPInstanceUID
            if not sop_instance_uid:
                logger.warning("Missing SOPInstanceUID for 2D measurement; skipping")
                continue
            sop_class_uid = measurement.metadata.SOPClassUID or _infer_sop_class_uid(data.modality)
            source_image = hd.sr.SourceImageForRegion(
                referenced_sop_class_uid=sop_class_uid,
                referenced_sop_instance_uid=sop_instance_uid,
            )
            referenced_coordinates = hd.sr.CoordinatesForMeasurement(
                graphic_type=hd.sr.GraphicTypeValues(graphic_type),
                graphic_data=graphic_data,
                source_image=source_image,
            )

        # If measurement value exists, create standard Measurement item
        # Otherwise, create annotation Measurement with dummy value to hold coordinates
        if measurement_value is not None:
            value, unit_code, concept_code = measurement_value
            measurement_item = hd.sr.Measurement(
                name=concept_code,
                value=value,
                unit=unit_code,
                referenced_coordinates=[referenced_coordinates],
            )

            group = hd.sr.MeasurementsAndQualitativeEvaluations(
                tracking_identifier=tracking_identifier,
                measurements=[measurement_item],
            )
            logger.info(
                f"Created measurement group: {concept_code.meaning} = {value} {unit_code.meaning}"
            )
        else:
            # For annotation-only tools (ArrowAnnotate), create Measurement with dummy value
            # This is necessary because coordinates can only be attached to Measurement objects
            logger.info(f"   ℹ️  No measurement value - creating annotation with dummy measurement")

            # Use label if provided, otherwise use tool name
            annotation_label = measurement.label or measurement.toolName

            # Use CORNERSTONEFREETEXT as the measurement name with user's text in meaning
            concept_code = Code(
                value='CORNERSTONEFREETEXT',
                scheme_designator='99CST',
                meaning=annotation_label  # Store user's text in meaning (e.g., "nipple")
            )

            # Create measurement with dummy value (1.0 "no units") to hold coordinates
            measurement_item = hd.sr.Measurement(
                name=concept_code,
                value=1.0,
                unit=Code(value='1', scheme_designator='UCUM', meaning='no units'),
                referenced_coordinates=[referenced_coordinates],
            )

            group = hd.sr.MeasurementsAndQualitativeEvaluations(
                tracking_identifier=tracking_identifier,
                measurements=[measurement_item],
            )
            logger.info(
                f"Created annotation group: {annotation_label} (dummy measurement with coordinates)"
            )

        measurement_groups.append(group)

    if not measurement_groups:
        raise ValueError("No valid measurements found for SR creation")

    observation_context = hd.sr.ObservationContext()
    report = hd.sr.MeasurementReport(
        observation_context=observation_context,
        procedure_reported=Code(
            value='429858000',
            scheme_designator='SCT',
            meaning='Imaging Procedure'
        ),
        imaging_measurements=measurement_groups,
    )

    # Create evidence datasets for all referenced SOP instances
    study_instance_uid = data.studyInstanceUID
    series_instance_uid = generate_uid()

    evidence_datasets = []
    evidence_sop_class_default = _infer_sop_class_uid(data.modality)
    study_date = data.studyDate or datetime.now().strftime('%Y%m%d')
    study_time = data.studyTime or datetime.now().strftime('%H%M%S')

    # Collect SOP instances with their metadata
    referenced_sop_map = {}  # sop_uid -> (sop_class_uid, measurement.metadata)
    for measurement in data.measurements:
        sop_uid = measurement.metadata.SOPInstanceUID
        if not sop_uid:
            continue
        sop_class_uid = measurement.metadata.SOPClassUID or evidence_sop_class_default
        # Store first occurrence of each SOP (in case multiple measurements reference same image)
        if sop_uid not in referenced_sop_map:
            referenced_sop_map[sop_uid] = (sop_class_uid, measurement.metadata)

    if not referenced_sop_map:
        logger.warning("No referenced SOP instances found for evidence.")

    for sop_uid, (sop_class_uid, metadata) in referenced_sop_map.items():
        evidence_ds = pydicom.Dataset()
        # Patient Module
        evidence_ds.PatientID = data.patientID or ''
        evidence_ds.PatientName = data.patientName or ''
        evidence_ds.PatientBirthDate = data.patientBirthDate or ''
        evidence_ds.PatientSex = data.patientSex or ''
        # General Study Module
        evidence_ds.StudyInstanceUID = data.studyInstanceUID
        evidence_ds.StudyDate = study_date
        evidence_ds.StudyTime = study_time
        evidence_ds.StudyID = data.studyID or ''
        evidence_ds.AccessionNumber = data.accessionNumber or ''
        evidence_ds.ReferringPhysicianName = ''
        # General Series Module
        evidence_ds.SeriesInstanceUID = data.seriesInstanceUID
        evidence_ds.Modality = data.modality or 'OT'
        evidence_ds.SeriesNumber = 1
        # SOP Common Module
        evidence_ds.SOPClassUID = sop_class_uid
        evidence_ds.SOPInstanceUID = sop_uid

        # Image Plane Module - CRITICAL for SCOORD (2D) coordinate conversion
        # These fields allow OHIF to convert pixel coordinates back to world coordinates
        if metadata.ImageOrientationPatient:
            evidence_ds.ImageOrientationPatient = list(metadata.ImageOrientationPatient)
            logger.info(f"   Added ImageOrientationPatient to evidence: {evidence_ds.ImageOrientationPatient}")
        if metadata.ImagePositionPatient:
            evidence_ds.ImagePositionPatient = list(metadata.ImagePositionPatient)
            logger.info(f"   Added ImagePositionPatient to evidence: {evidence_ds.ImagePositionPatient}")
        if metadata.PixelSpacing:
            evidence_ds.PixelSpacing = list(metadata.PixelSpacing)
            logger.info(f"   Added PixelSpacing to evidence: {evidence_ds.PixelSpacing}")
        if metadata.Rows:
            evidence_ds.Rows = int(metadata.Rows)
        if metadata.Columns:
            evidence_ds.Columns = int(metadata.Columns)
        if metadata.SliceThickness:
            evidence_ds.SliceThickness = float(metadata.SliceThickness)

        evidence_datasets.append(evidence_ds)

    if evidence_datasets:
        logger.info(
            f"Evidence Dataset - Patient: {evidence_datasets[0].PatientName} ({evidence_datasets[0].PatientID}), "
            f"Study: {evidence_datasets[0].StudyDate}, Modality: {evidence_datasets[0].Modality}"
        )

    # Create Comprehensive3DSR with TID1500 Measurement Report content
    sr = hd.sr.Comprehensive3DSR(
        evidence=evidence_datasets,
        content=report[0],
        series_number=3001,
        series_instance_uid=series_instance_uid,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer='OHIF USMPR',
        is_complete=True,
        is_final=True
    )

    # Add patient/study information to the dataset
    # highdicom SR objects inherit from pydicom Dataset - use direct assignment
    # Each assignment wrapped in try-except to handle any attribute access issues
    try:
        sr.PatientName = data.patientName
        logger.info(f"Set PatientName: {data.patientName}")
    except Exception as e:
        logger.warning(f"Could not set PatientName: {e}")

    try:
        sr.PatientID = data.patientID
        logger.info(f"Set PatientID: {data.patientID}")
    except Exception as e:
        logger.warning(f"Could not set PatientID: {e}")

    try:
        sr.StudyInstanceUID = study_instance_uid
        logger.info(f"Set StudyInstanceUID: {study_instance_uid}")
    except Exception as e:
        logger.warning(f"Could not set StudyInstanceUID: {e}")

    try:
        sr.StudyDate = datetime.now().strftime('%Y%m%d')
        sr.StudyTime = datetime.now().strftime('%H%M%S')
        logger.info(f"Set StudyDate/Time")
    except Exception as e:
        logger.warning(f"Could not set StudyDate/Time: {e}")

    try:
        sr.SeriesDescription = 'USMPR Annotations'
        logger.info(f"Set SeriesDescription")
    except Exception as e:
        logger.warning(f"Could not set SeriesDescription: {e}")

    logger.info(f"Created Comprehensive3DSR with {len(measurement_groups)} measurement groups")

    return sr


def _infer_sop_class_uid(modality: str) -> str:
    modality_map = {
        'CT': '1.2.840.10008.5.1.4.1.1.2',
        'MR': '1.2.840.10008.5.1.4.1.1.4',
        'US': '1.2.840.10008.5.1.4.1.1.6.1',
        'PT': '1.2.840.10008.5.1.4.1.1.128',
        'CR': '1.2.840.10008.5.1.4.1.1.1',
        'DX': '1.2.840.10008.5.1.4.1.1.1.1',
        'MG': '1.2.840.10008.5.1.4.1.1.1.2',
        'XA': '1.2.840.10008.5.1.4.1.1.12.1',
        'RF': '1.2.840.10008.5.1.4.1.1.12.2',
    }
    return modality_map.get(modality, '1.2.840.10008.5.1.4.1.1.7')


def _tracking_identifier_for_tool(tool_name: str) -> str:
    return f"Cornerstone3DTools@^0.1.0:{tool_name}"


def _hydrate_measurement_metadata(measurement: MeasurementData, modality: str) -> None:
    metadata = measurement.metadata
    if not metadata.referencedImageId and measurement.referencedImageId:
        metadata.referencedImageId = measurement.referencedImageId
    if not metadata.SOPInstanceUID:
        sop_uid = _extract_sop_instance_uid(metadata.referencedImageId)
        if sop_uid:
            metadata.SOPInstanceUID = sop_uid
    if not metadata.SOPClassUID:
        metadata.SOPClassUID = _infer_sop_class_uid(modality)


def _extract_sop_instance_uid(referenced_image_id: Optional[str]) -> Optional[str]:
    if not referenced_image_id:
        return None

    image_id = referenced_image_id
    if ':' in image_id:
        image_id = image_id.split(':', 1)[1]

    try:
        parsed = urllib.parse.urlparse(image_id)
    except Exception:
        parsed = None

    candidates = []
    if parsed:
        path = parsed.path or ''
        match = re.search(r'/instances/([^/]+)', path, re.IGNORECASE)
        if match:
            candidates.append(match.group(1))

        query = urllib.parse.parse_qs(parsed.query)
        for key in ('SOPInstanceUID', 'sopInstanceUID', 'instanceUID', 'sopuid'):
            if key in query and query[key]:
                candidates.append(query[key][0])

    match = re.search(r'/instances/([^/]+)', image_id, re.IGNORECASE)
    if match:
        candidates.append(match.group(1))

    for candidate in candidates:
        if candidate:
            return candidate
    return None


def _extract_measurement_value(measurement: MeasurementData):
    logger.info(f"📏 Extracting value for tool: {measurement.toolName}")

    # Annotation-only tools: no measurement value, only qualitative evaluation
    annotation_only_tools = ['ArrowAnnotate', 'CircleROI', 'EllipticalROI']
    if measurement.toolName in annotation_only_tools:
        logger.info(f"   ℹ️  {measurement.toolName} is annotation-only, no measurement value")
        return None

    if not measurement.data:
        logger.info("   No data field, trying fallback")
        return _fallback_measurement_value(measurement)

    logger.info(f"   Data keys: {list(measurement.data.keys())}")

    for key, stats in measurement.data.items():
        logger.info(f"   Checking stats for key: {key[:50]}..." if len(key) > 50 else f"   Checking stats: {key}")
        logger.info(f"   Stats type: {type(stats)}")

        if not isinstance(stats, dict):
            logger.warning(f"   Stats is not a dict, skipping")
            continue

        logger.info(f"   Stats keys: {list(stats.keys())}")

        if 'length' in stats:
            value = float(stats['length'])
            unit = stats.get('unit', 'mm')
            logger.info(f"   ✅ Found length: {value} {unit}")
            unit_code = _to_unit_code(unit)
            concept_code = Code(
                value='410668003',
                scheme_designator='SCT',
                meaning='Length'
            )
            return value, unit_code, concept_code
        if 'area' in stats:
            value = float(stats['area'])
            unit = stats.get('unit', 'mm2')
            logger.info(f"   ✅ Found area: {value} {unit}")
            unit_code = _to_unit_code(unit)
            concept_code = Code(
                value='42798000',
                scheme_designator='SCT',
                meaning='Area'
            )
            return value, unit_code, concept_code

    logger.warning(f"   No length or area found in data, trying fallback")
    return _fallback_measurement_value(measurement)


def _to_unit_code(unit: str) -> Code:
    if unit == 'mm2':
        return Code(value='mm2', scheme_designator='UCUM', meaning='square millimeter')
    return Code(value='mm', scheme_designator='UCUM', meaning='millimeter')


def _get_graphic_type(measurement: MeasurementData) -> str | None:
    tool_name = measurement.toolName
    if measurement.type:
        graphic_type = measurement.type.upper()
        if graphic_type in ('POINT', 'MULTIPOINT', 'POLYLINE', 'CIRCLE', 'ELLIPSE'):
            return graphic_type
    if tool_name in ('Length', 'PlanarFreehandROI', 'RectangleROI', 'ArrowAnnotate'):
        return 'POLYLINE'
    if tool_name == 'CircleROI':
        return 'CIRCLE'
    if tool_name == 'EllipticalROI':
        return 'ELLIPSE'
    return None


def _should_use_3d(measurement: MeasurementData, graphic_type: str) -> bool:
    if graphic_type in ('CIRCLE', 'ELLIPSE'):
        return False
    if (
        measurement.metadata.SOPInstanceUID
        and measurement.metadata.ImageOrientationPatient
        and measurement.metadata.ImagePositionPatient
        and measurement.metadata.PixelSpacing
    ):
        return False
    if not measurement.metadata.FrameOfReferenceUID:
        return False
    return any(len(point) >= 3 for point in measurement.points or [])


def _can_encode_2d(measurement: MeasurementData, graphic_type: str) -> bool:
    if graphic_type not in ('POINT', 'MULTIPOINT', 'POLYLINE', 'CIRCLE', 'ELLIPSE'):
        return False
    return bool(
        measurement.metadata.SOPInstanceUID
        and measurement.metadata.ImageOrientationPatient
        and measurement.metadata.ImagePositionPatient
        and measurement.metadata.PixelSpacing
    )


def _can_encode_3d(measurement: MeasurementData, graphic_type: str) -> bool:
    # CIRCLE and ELLIPSE will be converted to POLYGON for SCOORD3D
    # DICOM SCOORD3D spec only supports: POINT, MULTIPOINT, POLYLINE, POLYGON
    # We convert CIRCLE/ELLIPSE to POLYGON (36 points) and preserve tool name in TrackingIdentifier
    if not measurement.metadata.FrameOfReferenceUID:
        return False
    return any(len(point) >= 3 for point in measurement.points or [])


def _convert_to_polygon_3d(measurement: MeasurementData, num_points: int = 36) -> np.ndarray | None:
    """
    Convert CircleROI or EllipticalROI to POLYGON for SCOORD3D.
    Generates num_points evenly distributed around the circle/ellipse perimeter.
    """
    points = measurement.points
    if not points or len(points) < 2:
        return None

    if measurement.toolName == 'CircleROI':
        # CircleROI: points[0] = center, points[1] = point on perimeter
        center = np.array([float(points[0][0]), float(points[0][1]), float(points[0][2])])
        perimeter_point = np.array([float(points[1][0]), float(points[1][1]), float(points[1][2])])
        radius_vec = perimeter_point - center
        radius = np.linalg.norm(radius_vec)

        # Get two perpendicular vectors in the plane of the circle
        # Assume the circle is in a plane perpendicular to one of the axes
        z_diff = abs(points[1][2] - points[0][2])
        if z_diff < 0.001:  # Circle in XY plane
            vec1 = np.array([radius, 0, 0])
            vec2 = np.array([0, radius, 0])
        else:
            # Use the radius vector and compute perpendicular
            vec1 = radius_vec
            # Create perpendicular vector
            if abs(radius_vec[0]) < 0.001 and abs(radius_vec[1]) < 0.001:
                vec2 = np.cross(radius_vec, np.array([1, 0, 0]))
            else:
                vec2 = np.cross(radius_vec, np.array([0, 0, 1]))
            vec2 = vec2 / np.linalg.norm(vec2) * radius

        polygon_points = []
        for i in range(num_points):
            angle = 2 * np.pi * i / num_points
            point = center + vec1 * np.cos(angle) + vec2 * np.sin(angle)
            polygon_points.append(point.tolist())

        # Close the polygon: first point = last point
        # Make explicit copy to ensure exact same values
        polygon_points.append(polygon_points[0].copy())

        result = np.array(polygon_points, dtype=np.float64)
        logger.info(f"   🔍 Polygon shape: {result.shape}")
        logger.info(f"   🔍 First point: {result[0]}")
        logger.info(f"   🔍 Last point: {result[-1]}")
        logger.info(f"   🔍 Points equal: {np.array_equal(result[0], result[-1])}")
        return result

    elif measurement.toolName == 'EllipticalROI':
        # EllipticalROI: 4 points defining major and minor axes
        if len(points) < 4:
            return None

        major_start = np.array([float(points[0][0]), float(points[0][1]), float(points[0][2])])
        major_end = np.array([float(points[1][0]), float(points[1][1]), float(points[1][2])])
        minor_start = np.array([float(points[2][0]), float(points[2][1]), float(points[2][2])])
        minor_end = np.array([float(points[3][0]), float(points[3][1]), float(points[3][2])])

        center = (major_start + major_end) / 2
        major_vec = (major_end - major_start) / 2
        minor_vec = (minor_end - minor_start) / 2

        polygon_points = []
        for i in range(num_points):
            angle = 2 * np.pi * i / num_points
            point = center + major_vec * np.cos(angle) + minor_vec * np.sin(angle)
            polygon_points.append(point.tolist())

        # Close the polygon: first point = last point
        # Make explicit copy to ensure exact same values
        polygon_points.append(polygon_points[0].copy())

        result = np.array(polygon_points, dtype=np.float64)
        logger.info(f"   🔍 Polygon shape: {result.shape}")
        logger.info(f"   🔍 First point: {result[0]}")
        logger.info(f"   🔍 Last point: {result[-1]}")
        logger.info(f"   🔍 Points equal: {np.array_equal(result[0], result[-1])}")
        return result

    return None


def _build_graphic_data(measurement: MeasurementData, use_3d: bool) -> np.ndarray | None:
    if not measurement.points:
        return None

    points = measurement.points
    if use_3d:
        # For SCOORD3D, preserve original points for all tools including CircleROI and EllipticalROI
        # GraphicType will be converted to POLYLINE, but points remain as-is
        # Frontend will render based on TrackingIdentifier tool name
        coords = []
        for point in points:
            if len(point) >= 3:
                coords.append([float(point[0]), float(point[1]), float(point[2])])
            elif len(point) == 2:
                coords.append([float(point[0]), float(point[1]), 0.0])
        return np.array(coords, dtype=np.float64)

    if measurement.toolName == 'EllipticalROI' and len(points) < 4:
        logger.warning('Ellipse requires 4 points for SCOORD. Skipping.')
        return None

    coords_2d = []
    for point in points:
        if len(point) >= 3:
            pixel_point = _world_to_pixel(point, measurement.metadata)
            if pixel_point is None:
                logger.warning('Missing image plane metadata for SCOORD conversion. Skipping.')
                return None
            coords_2d.append(pixel_point)
        elif len(point) == 2:
            coords_2d.append([float(point[0]), float(point[1])])

    if measurement.toolName == 'RectangleROI' and coords_2d:
        coords_2d.append(coords_2d[0])

    return np.array(coords_2d, dtype=np.float64)


def _fallback_measurement_value(measurement: MeasurementData):
    graphic_type = _get_graphic_type(measurement)
    points = measurement.points or []
    if graphic_type in ('POLYLINE',) and len(points) >= 2:
        length = _compute_length(points, measurement.metadata)
        if length is not None:
            unit_code = _to_unit_code('mm')
            concept_code = Code(
                value='410668003',
                scheme_designator='SCT',
                meaning='Length'
            )
            return length, unit_code, concept_code
    if graphic_type in ('CIRCLE', 'ELLIPSE') and len(points) >= 2:
        area = _compute_area(graphic_type, points, measurement.metadata)
        if area is not None:
            unit_code = _to_unit_code('mm2')
            concept_code = Code(
                value='42798000',
                scheme_designator='SCT',
                meaning='Area'
            )
            return area, unit_code, concept_code
    return None


def _compute_length(points: List[List[float]], metadata: MeasurementMetadata) -> float | None:
    if len(points) < 2:
        return None
    total = 0.0
    for i in range(len(points) - 1):
        p0 = points[i]
        p1 = points[i + 1]
        if len(p0) >= 3 and len(p1) >= 3:
            total += float(np.linalg.norm(np.array(p1[:3], dtype=np.float64) - np.array(p0[:3], dtype=np.float64)))
        elif metadata.PixelSpacing:
            dx = float(p1[0]) - float(p0[0])
            dy = float(p1[1]) - float(p0[1])
            total += float(np.linalg.norm(np.array([
                dx * float(metadata.PixelSpacing[1]),
                dy * float(metadata.PixelSpacing[0]),
            ], dtype=np.float64)))
        else:
            dx = float(p1[0]) - float(p0[0])
            dy = float(p1[1]) - float(p0[1])
            total += float(np.hypot(dx, dy))
    return total


def _compute_area(graphic_type: str, points: List[List[float]], metadata: MeasurementMetadata) -> float | None:
    if graphic_type == 'CIRCLE':
        radius = _compute_radius(points, metadata)
        if radius is None:
            return None
        return float(np.pi * radius * radius)
    if graphic_type == 'ELLIPSE' and len(points) >= 4:
        a = _compute_axis(points[0], points[1], metadata)
        b = _compute_axis(points[2], points[3], metadata)
        if a is None or b is None:
            return None
        return float(np.pi * (a / 2.0) * (b / 2.0))
    return None


def _compute_radius(points: List[List[float]], metadata: MeasurementMetadata) -> float | None:
    if len(points) < 2:
        return None
    if len(points) >= 4:
        axis = _compute_axis(points[0], points[1], metadata)
        return axis / 2.0 if axis is not None else None
    return _compute_axis(points[0], points[1], metadata)


def _compute_axis(p0: List[float], p1: List[float], metadata: MeasurementMetadata) -> float | None:
    if len(p0) >= 3 and len(p1) >= 3:
        return float(np.linalg.norm(np.array(p1[:3], dtype=np.float64) - np.array(p0[:3], dtype=np.float64)))
    if metadata.PixelSpacing:
        dx = float(p1[0]) - float(p0[0])
        dy = float(p1[1]) - float(p0[1])
        return float(np.linalg.norm(np.array([
            dx * float(metadata.PixelSpacing[1]),
            dy * float(metadata.PixelSpacing[0]),
        ], dtype=np.float64)))
    dx = float(p1[0]) - float(p0[0])
    dy = float(p1[1]) - float(p0[1])
    return float(np.hypot(dx, dy))


def _world_to_pixel(point, metadata: MeasurementMetadata) -> list[float] | None:
    if not metadata.ImageOrientationPatient or not metadata.ImagePositionPatient:
        return None
    if not metadata.PixelSpacing:
        return None

    row_cosines = np.array(metadata.ImageOrientationPatient[:3], dtype=np.float64)
    col_cosines = np.array(metadata.ImageOrientationPatient[3:], dtype=np.float64)
    image_position = np.array(metadata.ImagePositionPatient, dtype=np.float64)
    spacing_row, spacing_col = metadata.PixelSpacing

    point_vec = np.array([float(point[0]), float(point[1]), float(point[2])]) - image_position
    row = np.dot(point_vec, row_cosines) / float(spacing_row)
    col = np.dot(point_vec, col_cosines) / float(spacing_col)

    return [float(col), float(row)]

@app.get("/health")
async def health_check():
    return {"status": "healthy", "engine": "highdicom"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
