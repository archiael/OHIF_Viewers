import FileLoaderService from './fileLoaderService';
import { DicomMetadataStore } from '@ohif/core';

const processFile = async file => {
  try {
    const fileLoaderService = new FileLoaderService(file);
    const imageId = fileLoaderService.addFile(file);
    const image = await fileLoaderService.loadFile(file, imageId);
    const dicomJSONDataset = await fileLoaderService.getDataset(image, imageId);

    DicomMetadataStore.addInstance(dicomJSONDataset);

    // Log successful import with key metadata
    console.log('✅ DICOM file imported successfully:', {
      file: file.name,
      PatientName: dicomJSONDataset.PatientName,
      StudyInstanceUID: dicomJSONDataset.StudyInstanceUID,
      Modality: dicomJSONDataset.Modality,
      TransferSyntax: dicomJSONDataset.AvailableTransferSyntaxUID,
      isMPEG: dicomJSONDataset._isMPEGCompressed || false,
    });
  } catch (error) {
    console.error('❌ Error loading DICOM file:', file.name);
    console.error('   Error type:', error.name);
    console.error('   Error message:', error.message);
    console.error('   This file will not appear in the worklist.');
    console.error('   Common causes:');
    console.error('   - File is corrupted');
    console.error('   - File is not a valid DICOM');
    console.error('   - Unsupported transfer syntax or encoding');
    console.error('   - Missing required DICOM tags (StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID)');
  }
};

export default async function filesToStudies(files) {
  console.log(`📂 Processing ${files.length} file(s)...`);

  const processFilesPromises = files.map(processFile);
  await Promise.all(processFilesPromises);

  const studyUIDs = DicomMetadataStore.getStudyInstanceUIDs();
  console.log(`📊 Total studies loaded: ${studyUIDs.length}`);

  return studyUIDs;
}
