import getWADORSImageId from './getWADORSImageId';

function buildInstanceWadoUrl(config, instance) {
  const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = instance;
  const params = [];

  params.push('requestType=WADO');
  params.push(`studyUID=${StudyInstanceUID}`);
  params.push(`seriesUID=${SeriesInstanceUID}`);
  params.push(`objectUID=${SOPInstanceUID}`);
  params.push('contentType=application/dicom');

  // config.wadoUriTransferSyntaxUID가 있으면 사용, 없으면 모든 전송 구문 허용(*)
  // 예: Mammography JPEG Lossless Extended Resolution Mode 디코딩 문제 우회를 위해
  // 특정 전송 구문을 지정할 수 있음
  const transferSyntax = config.wadoUriTransferSyntaxUID || '*';
  params.push(`transferSyntax=${transferSyntax}`);

  const paramString = params.join('&');

  return `${config.wadoUriRoot}?${paramString}`;
}

/**
 * Obtain an imageId for Cornerstone from an image instance
 *
 * @param instance
 * @param frame
 * @param thumbnail
 * @returns {string} The imageId to be used by Cornerstone
 */
export default function getImageId({ instance, frame, config, thumbnail = false }) {
  if (!instance) {
    return;
  }

  if (instance.imageId && frame === undefined) {
    return instance.imageId;
  }

  if (instance.url) {
    return instance.url;
  }

  const renderingAttr = thumbnail ? 'thumbnailRendering' : 'imageRendering';

  if (!config[renderingAttr] || config[renderingAttr] === 'wadouri') {
    const wadouri = buildInstanceWadoUrl(config, instance);

    let imageId = 'dicomweb:' + wadouri;
    if (frame !== undefined) {
      imageId += '&frame=' + frame;
    }

    return imageId;
  } else {
    return getWADORSImageId(instance, config, frame); // WADO-RS Retrieve Frame
  }
}
