import React, { useMemo, useState, useEffect } from 'react';
import { useSystem, hotkeys as hotkeysModule } from '@ohif/core';
import { UserPreferencesModal, FooterAction } from '@ohif/ui-next';
import { useTranslation } from 'react-i18next';
import i18n from '@ohif/i18n';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Label,
  Input,
  Switch,
} from '@ohif/ui-next';

import {
  getMeasurementJumpPreferences,
  saveMeasurementJumpPreferences,
  type MeasurementJumpPreferences,
} from '../../../cornerstone/src/utils/measurementJumpPreferences';

const { availableLanguages, defaultLanguage, currentLanguage: currentLanguageFn } = i18n;

interface HotkeyDefinition {
  keys: string;
  label: string;
}

interface HotkeyDefinitions {
  [key: string]: HotkeyDefinition;
}

function UserPreferencesModalDefault({ hide }: { hide: () => void }) {
  const { hotkeysManager } = useSystem();
  const { t, i18n: i18nextInstance } = useTranslation('UserPreferencesModal');

  const { hotkeyDefinitions = {}, hotkeyDefaults = {} } = hotkeysManager;

  const fallbackHotkeyDefinitions = useMemo(
    () =>
      hotkeysManager.getValidHotkeyDefinitions(
        hotkeysModule.defaults.hotkeyBindings
      ) as HotkeyDefinitions,
    [hotkeysManager]
  );

  useEffect(() => {
    if (!Object.keys(hotkeyDefaults).length) {
      hotkeysManager.setDefaultHotKeys(hotkeysModule.defaults.hotkeyBindings);
    }

    if (!Object.keys(hotkeyDefinitions).length) {
      hotkeysManager.setHotkeys(fallbackHotkeyDefinitions);
    }
  }, [hotkeysManager, hotkeyDefaults, hotkeyDefinitions, fallbackHotkeyDefinitions]);

  const resolvedHotkeyDefaults = Object.keys(hotkeyDefaults).length
    ? (hotkeyDefaults as HotkeyDefinitions)
    : fallbackHotkeyDefinitions;

  const initialHotkeyDefinitions = Object.keys(hotkeyDefinitions).length
    ? (hotkeyDefinitions as HotkeyDefinitions)
    : resolvedHotkeyDefaults;

  const currentLanguage = currentLanguageFn();

  // Load measurement jump preferences
  const initialMeasurementPrefs = getMeasurementJumpPreferences();

  const [state, setState] = useState({
    hotkeyDefinitions: initialHotkeyDefinitions,
    languageValue: currentLanguage.value,
    measurementPrefs: initialMeasurementPrefs,
  });

  const onLanguageChangeHandler = (value: string) => {
    setState(state => ({ ...state, languageValue: value }));
  };

  const onHotkeyChangeHandler = (id: string, newKeys: string) => {
    setState(state => ({
      ...state,
      hotkeyDefinitions: {
        ...state.hotkeyDefinitions,
        [id]: {
          ...state.hotkeyDefinitions[id],
          keys: newKeys,
        },
      },
    }));
  };

  const onMeasurementPrefChange = (key: keyof MeasurementJumpPreferences, value: any) => {
    setState(state => ({
      ...state,
      measurementPrefs: {
        ...state.measurementPrefs,
        [key]: value,
      },
    }));
  };

  const onResetHandler = () => {
    const defaultMeasurementPrefs = getMeasurementJumpPreferences();

    setState(state => ({
      ...state,
      languageValue: defaultLanguage.value,
      hotkeyDefinitions: resolvedHotkeyDefaults,
      measurementPrefs: {
        mprCenteringEnabled: true,
        magnificationSyncMode: 'always',
        magnificationRatio: 6, // 4.0x zoom
      },
    }));

    hotkeysManager.restoreDefaultBindings();
  };

  const displayNames = React.useMemo(() => {
    if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
      return null;
    }

    const locales = [state.languageValue, currentLanguage.value, i18nextInstance.language, 'en'];
    const uniqueLocales = Array.from(new Set(locales.filter(Boolean)));

    try {
      return new Intl.DisplayNames(uniqueLocales, { type: 'language', fallback: 'none' });
    } catch (error) {
      console.warn('Intl.DisplayNames not supported for locales', uniqueLocales, error);
    }

    return null;
  }, [state.languageValue, currentLanguage.value, i18nextInstance.language]);

  const getLanguageLabel = React.useCallback(
    (languageValue: string, fallbackLabel: string) => {
      const translationKey = `LanguageName.${languageValue}`;
      if (i18nextInstance.exists(translationKey, { ns: 'UserPreferencesModal' })) {
        return t(translationKey);
      }

      if (displayNames) {
        try {
          const localized = displayNames.of(languageValue);
          if (localized && localized.toLowerCase() !== languageValue.toLowerCase()) {
            return localized.charAt(0).toUpperCase() + localized.slice(1);
          }
        } catch (error) {
          console.debug(`Unable to resolve display name for ${languageValue}`, error);
        }
      }

      return fallbackLabel;
    },
    [displayNames, i18nextInstance, t]
  );

  return (
    <UserPreferencesModal>
      <UserPreferencesModal.Body>
        {/* Language Section */}
        <div className="mb-3 flex items-center space-x-14">
          <UserPreferencesModal.SubHeading>{t('Language')}</UserPreferencesModal.SubHeading>
          <Select
            defaultValue={state.languageValue}
            onValueChange={onLanguageChangeHandler}
          >
            <SelectTrigger
              className="w-60"
              aria-label="Language"
            >
              <SelectValue placeholder={t('Select language')} />
            </SelectTrigger>
            <SelectContent>
              {availableLanguages.map(lang => (
                <SelectItem
                  key={lang.value}
                  value={lang.value}
                >
                  {getLanguageLabel(lang.value, lang.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Measurement Jump Settings Section */}
        <div className="space-y-4">
          <UserPreferencesModal.SubHeading>
            {t('Measurement Navigation')}
          </UserPreferencesModal.SubHeading>

          {/* MPR Centering Toggle */}
          <div className="flex items-center justify-between space-x-4">
            <Label className="flex-1 text-sm">
              {t('Center MPR viewports on measurement')}
            </Label>
            <Switch
              checked={state.measurementPrefs.mprCenteringEnabled}
              onCheckedChange={checked => onMeasurementPrefChange('mprCenteringEnabled', checked)}
            />
          </div>

          {/* Magnification Sync Mode */}
          <div className="flex items-center space-x-4">
            <Label className="flex-1 whitespace-nowrap text-sm">
              {t('Magnification sync mode')}
            </Label>
            <Select
              value={state.measurementPrefs.magnificationSyncMode}
              onValueChange={value => onMeasurementPrefChange('magnificationSyncMode', value)}
            >
              <SelectTrigger
                className="w-60"
                aria-label="Magnification sync mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('None')}</SelectItem>
                <SelectItem value="onMeasurementClick">
                  {t('On measurement click only')}
                </SelectItem>
                <SelectItem value="always">{t('Always synchronized')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Magnification Ratio */}
          <div className="flex items-center space-x-4">
            <Label className="flex-1 text-sm">{t('Magnification ratio (0-9)')}</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                min="0"
                max="9"
                step="1"
                value={state.measurementPrefs.magnificationRatio}
                onChange={e =>
                  onMeasurementPrefChange(
                    'magnificationRatio',
                    Math.max(0, Math.min(9, parseInt(e.target.value) || 0))
                  )
                }
                className="w-20 text-center"
              />
              <span className="text-muted-foreground text-xs">
                ({(1 + state.measurementPrefs.magnificationRatio * 0.5).toFixed(1)}x zoom)
              </span>
            </div>
          </div>

          <p className="text-muted-foreground text-xs italic">
            {t(
              'These settings control how MPR viewports (axial, sagittal, coronal) respond when clicking measurements in the panel. Stack viewport is not affected.'
            )}
          </p>
        </div>

        <UserPreferencesModal.SubHeading>{t('Hotkeys')}</UserPreferencesModal.SubHeading>
        <UserPreferencesModal.HotkeysGrid>
          {Object.entries(state.hotkeyDefinitions).map(([id, definition]) => (
            <UserPreferencesModal.Hotkey
              key={id}
              label={t(definition.label)}
              value={definition.keys}
              onChange={newKeys => onHotkeyChangeHandler(id, newKeys)}
              placeholder={definition.keys}
              hotkeys={hotkeysModule}
            />
          ))}
        </UserPreferencesModal.HotkeysGrid>
      </UserPreferencesModal.Body>
      <FooterAction>
        <FooterAction.Left>
          <FooterAction.Auxiliary onClick={onResetHandler}>
            {t('Reset to defaults')}
          </FooterAction.Auxiliary>
        </FooterAction.Left>
        <FooterAction.Right>
          <FooterAction.Secondary
            onClick={() => {
              hotkeysModule.stopRecord();
              hotkeysModule.unpause();
              hide();
            }}
          >
            {t('Cancel')}
          </FooterAction.Secondary>
          <FooterAction.Primary
            onClick={() => {
              // Save measurement jump preferences
              saveMeasurementJumpPreferences(state.measurementPrefs);

              if (state.languageValue !== currentLanguage.value) {
                i18n.changeLanguage(state.languageValue);
                // Force page reload after language change to ensure all translations are applied
                window.location.reload();
                return; // Exit early since we're reloading
              }
              hotkeysManager.setHotkeys(state.hotkeyDefinitions);
              hotkeysModule.stopRecord();
              hotkeysModule.unpause();
              hide();
            }}
          >
            {t('Save')}
          </FooterAction.Primary>
        </FooterAction.Right>
      </FooterAction>
    </UserPreferencesModal>
  );
}

export default {
  'ohif.userPreferencesModal': UserPreferencesModalDefault,
};
