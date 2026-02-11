import dcmjs from 'dcmjs';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import FileLoader from './fileLoader';

// MPEG Transfer Syntax UIDs for video-compressed DICOM files
const MPEG_TRANSFER_SYNTAXES = [
  '1.2.840.10008.1.2.4.100', // MPEG-2 Main Profile @ Main Level
  '1.2.840.10008.1.2.4.101', // MPEG-2 Main Profile @ High Level
  '1.2.840.10008.1.2.4.102', // MPEG-4 AVC/H.264 High Profile
  '1.2.840.10008.1.2.4.103', // MPEG-4 AVC/H.264 BD-compatible High Profile
  '1.2.840.10008.1.2.4.104', // MPEG-4 AVC/H.264 High Profile for 2D Video
  '1.2.840.10008.1.2.4.105', // MPEG-4 AVC/H.264 High Profile for 3D Video
  '1.2.840.10008.1.2.4.106', // MPEG-4 AVC/H.264 Stereo High Profile
];

const DICOMFileLoader = new (class extends FileLoader {
  fileType = 'application/dicom';
  loadFile(file, imageId) {
    return dicomImageLoader.wadouri.loadFileRequest(imageId);
  }

  getDataset(image, imageId) {
    try {
      // First, read just the metadata to check transfer syntax
      const dicomData = dcmjs.data.DicomMessage.readFile(image);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

      dataset.url = imageId;
      dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(dicomData.meta);

      const transferSyntaxUID =
        dataset.AvailableTransferSyntaxUID || dataset._meta.TransferSyntaxUID?.Value?.[0];

      dataset.AvailableTransferSyntaxUID = transferSyntaxUID;

      // Check if this is an MPEG-compressed DICOM file
      const isMPEGCompressed = MPEG_TRANSFER_SYNTAXES.includes(transferSyntaxUID);

      if (isMPEGCompressed) {
        // Mark this as MPEG-compressed for special handling
        dataset._isMPEGCompressed = true;

        // CRITICAL: Store the raw DICOM ArrayBuffer for later MPEG extraction
        // This is needed because MPEGExtractor needs access to the PixelData
        dataset._rawArrayBuffer = image;
        dataset._transferSyntaxUID = transferSyntaxUID; // ALSO store the UID!

        // For MPEG files, we already have the metadata we need
        // PixelData is encapsulated video that will be extracted later in USMPR2 mode
        // No need to try parsing PixelData here - it would fail anyway
      }

      return dataset;
    } catch (error) {
      // Check if this is a character set encoding error (e.g., Korean ISO-IR-149)
      if (error.message && error.message.includes('Unsupported character set')) {
        console.warn('⚠️ Unsupported character set detected:', error.message);
        console.warn('🔄 Removing unsupported character set tag and retrying...');

        try {
          // Create a modified copy of the ArrayBuffer with character set removed
          const modifiedBuffer = this._removeSpecificCharacterSet(image);

          // Retry parsing with modified buffer
          const dicomData = dcmjs.data.DicomMessage.readFile(modifiedBuffer);
          const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

          dataset.url = imageId;
          dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(dicomData.meta);

          const transferSyntaxUID =
            dataset.AvailableTransferSyntaxUID || dataset._meta.TransferSyntaxUID?.Value?.[0];

          dataset.AvailableTransferSyntaxUID = transferSyntaxUID;

          // Check if MPEG
          const isMPEGCompressed = MPEG_TRANSFER_SYNTAXES.includes(transferSyntaxUID);
          if (isMPEGCompressed) {
            dataset._isMPEGCompressed = true;

            // CRITICAL: Store the modified buffer for later MPEG extraction
            dataset._rawArrayBuffer = modifiedBuffer;
            dataset._transferSyntaxUID = transferSyntaxUID; // ALSO store the UID!
          }
          return dataset;
        } catch (retryError) {
          console.error('❌ Failed to parse even after removing character set:', retryError.message);
          throw new Error(`DICOM parsing failed: ${retryError.message}`);
        }
      }

      // For other errors, rethrow
      console.error('❌ Error parsing DICOM file:', error.message);
      console.error('   File may be corrupted or have unsupported encoding');
      throw error;
    }
  }

  // Helper method to remove/replace unsupported SpecificCharacterSet
  _removeSpecificCharacterSet(arrayBuffer) {
    // Create a copy of the ArrayBuffer
    const buffer = arrayBuffer.slice(0);
    const view = new Uint8Array(buffer);

    // Search for common unsupported character set strings and replace with supported one
    const unsupportedCharsets = [
      'ISO_IR 149', // Korean
      'ISO_IR 192', // UTF-8 (sometimes causes issues)
      'ISO 2022 IR 149', // Korean alternative encoding
      'GB18030', // Chinese
      'ISO_IR 13', // Japanese
      'ISO 2022 IR 87', // Japanese
    ];

    const replacementCharset = 'ISO_IR 100'; // Latin-1, widely supported

    // Convert ArrayBuffer to string for searching (only for finding character set strings)
    const decoder = new TextDecoder('latin1');
    const dicomString = decoder.decode(view);

    let modified = false;
    for (const unsupportedCharset of unsupportedCharsets) {
      const index = dicomString.indexOf(unsupportedCharset);
      if (index !== -1) {
        // Replace the unsupported charset string with supported one
        // Pad with spaces if replacement is shorter
        const encoder = new TextEncoder();
        let replacement = replacementCharset;

        // Pad to match original length to avoid breaking DICOM structure
        while (replacement.length < unsupportedCharset.length) {
          replacement += ' ';
        }

        // Truncate if longer (shouldn't happen with ISO_IR 100)
        if (replacement.length > unsupportedCharset.length) {
          replacement = replacement.substring(0, unsupportedCharset.length);
        }

        const replacementBytes = encoder.encode(replacement);

        // Replace bytes in the buffer
        for (let i = 0; i < replacementBytes.length; i++) {
          view[index + i] = replacementBytes[i];
        }

        modified = true;
        break; // Only replace first occurrence
      }
    }

    if (!modified) {
      console.warn('⚠️ Could not find specific character set string to replace');
      console.warn('   Returning original buffer - parsing may still fail');
    }

    return buffer;
  }

  // Helper method to extract values from raw DICOM dictionary
  _extractValue(dict, tag) {
    const element = dict[tag];
    if (!element || !element.Value) {
      return undefined;
    }

    // Handle array values
    if (Array.isArray(element.Value)) {
      return element.Value[0];
    }

    return element.Value;
  }
})();

export default DICOMFileLoader;
