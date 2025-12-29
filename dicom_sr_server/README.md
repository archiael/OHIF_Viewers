# DICOM SR Service

OHIF USMPR annotation을 DICOM SR로 변환하는 FastAPI 서버

## 설치

```bash
cd dicom_sr_server

# 가상환경 생성 (권장) - 선택사항
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# 의존성 설치
pip install -r requirements.txt
```

**참고**:
- Python 3.8 이상 필요
- pydicom 3.0+ 버전 사용 (이전 버전과 API 차이 있음)

## 실행

```bash
python main.py
```

서버는 `http://localhost:8000`에서 실행됩니다.

## API

### POST /api/save-annotations
Annotation 데이터를 받아 DICOM SR 생성

**Request Body:**
```json
{
  "studyInstanceUID": "1.2.840...",
  "seriesInstanceUID": "1.2.840...",
  "patientID": "12345",
  "patientName": "Patient^Name",
  "measurements": [
    {
      "uid": "annotation-1",
      "toolName": "Length",
      "label": "측정 1",
      "type": "POLYLINE",
      "points": [[0, 0, 0], [10, 10, 0]],
      "data": {"length": 14.14},
      "metadata": {
        "referencedImageId": "image-id",
        "FrameOfReferenceUID": "frame-uid",
        "SOPInstanceUID": "sop-uid"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "srInstanceUID": "1.2.840.xxxx",
  "seriesInstanceUID": "1.2.840.yyyy",
  "filename": "SR_xxx.dcm",
  "filepath": "../testdata/SR_outputs/SR_xxx.dcm",
  "measurementCount": 1
}
```

### GET /health
서버 상태 확인

**Response:**
```json
{
  "status": "healthy"
}
```

## 저장 경로 설정

기본적으로 SR 파일은 `../testdata/SR_outputs` 폴더에 저장됩니다.

**저장 경로 변경**:
```bash
# 환경 변수로 설정
export DICOM_OUTPUT_DIR="/path/to/your/dicom/folder"  # Linux/Mac
set DICOM_OUTPUT_DIR=D:\your\dicom\folder              # Windows

# 서버 실행
python main.py
```

## OHIF에서 로드하기

1. OHIF 브라우저에서 "Local" 데이터 소스 선택
2. `testdata/SR_outputs` 폴더 선택
3. 생성된 SR 파일이 Thumbnail list에 표시됨
4. SR을 클릭하면 annotation이 복원됨

## 테스트

### curl로 테스트
```bash
curl -X POST http://localhost:8000/api/save-annotations \
  -H "Content-Type: application/json" \
  -d '{"studyInstanceUID":"1.2.3.4","seriesInstanceUID":"5.6.7.8","patientID":"TEST001","patientName":"Test^Patient","measurements":[{"uid":"m1","toolName":"Length","label":"Test","type":"POLYLINE","points":[[0,0,0],[10,10,0]],"data":{"length":14.14},"metadata":{"referencedImageId":"img1","FrameOfReferenceUID":"frame1","SOPInstanceUID":"sop1"}}]}'
```

### pydicom으로 검증
```bash
python
>>> import pydicom
>>> ds = pydicom.dcmread('../testdata/SR_outputs/SR_xxxx.dcm')
>>> print(f"Modality: {ds.Modality}")
>>> print(f"Patient: {ds.PatientName}")
>>> print(f"Measurements: {len(ds.ContentSequence)}")
```

## 보안 강화 (향후)

- JWT 토큰 인증 추가
- HTTPS 적용
- Rate limiting
- CORS 정책 강화
- Database 연동 (감사 로그)
