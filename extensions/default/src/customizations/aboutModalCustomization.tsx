import React from 'react';
import detect from 'browser-detect';
import { useTranslation } from 'react-i18next';

function AboutModalDefault() {
  const { t } = useTranslation('AboutModal');
  const { os, version, name } = detect();
  const browser = `${name[0].toUpperCase()}${name.substring(1)} ${version}`;
  {
    /*const versionNumber = process.env.VERSION_NUMBER || '1.0.0';*/
  }
  const versionNumber = '1.0.0';

  return (
    <div className="flex w-[400px] flex-col items-center space-y-4 p-6 text-center">
      {/* Product Name */}
      <div className="text-2xl font-semibold tracking-wide text-white">M-VIEW-WEB</div>

      {/* Version */}
      <div className="text-xl font-light text-white">{versionNumber}</div>

      {/* Browser & OS Info */}
      <div className="flex flex-col items-center space-y-1 pt-2">
        <div className="text-sm font-semibold text-white">{t('Current Browser & OS')}</div>
        <div className="text-sm text-white">
          {browser}, {os}
        </div>
      </div>

      {/* Company Name */}
      <div className="pt-2">
        <span className="text-base text-white">MedicalPark Co., Ltd.</span>
      </div>
    </div>
  );
}

// Add the required properties for the customization service
AboutModalDefault.title = 'M-VIEW-WEB';
AboutModalDefault.menuTitle = 'About';
AboutModalDefault.containerClassName = 'max-w-md';

export default {
  'ohif.aboutModal': AboutModalDefault,
};
