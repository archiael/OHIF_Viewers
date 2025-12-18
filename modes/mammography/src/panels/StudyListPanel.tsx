import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSystem, utils } from '@ohif/core';
import { useImageViewer } from '@ohif/ui-next';
import { Icons, Button, ButtonGroup } from '@ohif/ui-next';

const { formatDate } = utils;

/**
 * Custom Study List Panel for Mammography Mode
 * Features:
 * - Shows all studies for current patient
 * - Toggle layout: 2-column / 1-column
 * - Toggle display: thumbnails / text-only
 * - Auto-load most recent prior matching modality + body part
 * - Double-click to switch prior study
 */
function StudyListPanel({ servicesManager, commandsManager, extensionManager }) {
  const { displaySetService, hangingProtocolService } = servicesManager.services;
  const internalImageViewer = useImageViewer();
  const StudyInstanceUIDs = internalImageViewer.StudyInstanceUIDs;

  // UI state
  const [layoutMode, setLayoutMode] = useState<'2-column' | '1-column'>('2-column');
  const [displayMode, setDisplayMode] = useState<'thumbnails' | 'text'>('text');
  const [studyList, setStudyList] = useState([]);
  const [currentStudyUID, setCurrentStudyUID] = useState(null);
  const [selectedPriorUID, setSelectedPriorUID] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchedRef = useRef(false);

  // Get data source from extension manager
  const getDataSource = useCallback(() => {
    const activeDataSource = extensionManager.getActiveDataSource();
    return activeDataSource && activeDataSource[0];
  }, [extensionManager]);

  // Fetch all studies for the patient
  useEffect(() => {
    if (fetchedRef.current || !StudyInstanceUIDs?.length) {
      return;
    }

    fetchedRef.current = true;
    const dataSource = getDataSource();

    if (!dataSource) {
      console.error('No active data source found');
      setIsLoading(false);
      return;
    }

    const fetchStudies = async () => {
      try {
        setIsLoading(true);
        const currentStudyUID = StudyInstanceUIDs[0];
        setCurrentStudyUID(currentStudyUID);

        // Fetch current study to get patient info
        const currentStudyData = await dataSource.query.studies.search({
          studyInstanceUid: currentStudyUID,
        });

        if (!currentStudyData?.length) {
          console.error('Current study not found');
          setIsLoading(false);
          return;
        }

        const currentStudy = currentStudyData[0];
        console.log('Current study:', currentStudy);

        // Fetch all studies for this patient
        let patientStudies = currentStudyData;

        if (currentStudy.PatientID) {
          try {
            const allPatientStudies = await dataSource.query.studies.search({
              patientId: currentStudy.PatientID,
            });
            patientStudies = allPatientStudies || currentStudyData;
          } catch (error) {
            console.warn('Could not fetch all patient studies:', error);
          }
        }

        // Map and sort studies by date (most recent first)
        const mappedStudies = patientStudies
          .map(study => ({
            studyInstanceUID: study.StudyInstanceUID,
            studyDate: study.StudyDate,
            studyTime: study.StudyTime || '',
            studyDescription: study.StudyDescription || 'No Description',
            modalities: study.ModalitiesInStudy || study.Modality || '',
            numInstances: study.NumInstances || 0,
            patientName: study.PatientName || '',
            accessionNumber: study.AccessionNumber || '',
            formattedDate: formatDate(study.StudyDate),
            isCurrent: study.StudyInstanceUID === currentStudyUID,
          }))
          .sort((a, b) => {
            // Sort by date desc, then time desc
            const dateCompare = (b.studyDate || '').localeCompare(a.studyDate || '');
            if (dateCompare !== 0) return dateCompare;
            return (b.studyTime || '').localeCompare(a.studyTime || '');
          });

        console.log(`Found ${mappedStudies.length} studies for patient:`, mappedStudies);
        setStudyList(mappedStudies);

        // Don't auto-load prior study on initial load - wait for user to click Compare button
        // autoSelectPriorStudy(mappedStudies, currentStudy);

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching studies:', error);
        setIsLoading(false);
      }
    };

    fetchStudies();
  }, [StudyInstanceUIDs, getDataSource]);

  /**
   * Auto-select the most recent prior study that matches:
   * - Same modality (e.g., MG)
   * - Same or similar body part (from study description)
   */
  const autoSelectPriorStudy = (studies, currentStudy) => {
    if (studies.length <= 1) {
      console.log('No prior studies available');
      return;
    }

    const currentModality = currentStudy.ModalitiesInStudy || currentStudy.Modality || '';
    const currentDescription = (currentStudy.StudyDescription || '').toLowerCase();

    // Find the first prior study (not current) matching modality
    const priorStudy = studies.find(study => {
      if (study.isCurrent) return false;

      // Check if modality matches
      const modalityMatches = study.modalities.includes(currentModality.split('\\')[0]);

      if (!modalityMatches) return false;

      // Prefer studies with similar body part in description
      // (this is a simple heuristic, can be improved)
      return true;
    });

    if (priorStudy) {
      console.log('Auto-selected prior study:', priorStudy);
      setSelectedPriorUID(priorStudy.studyInstanceUID);

      // Auto-load the compare view with this prior
      loadCompareView(currentStudyUID, priorStudy.studyInstanceUID);
    } else {
      console.log('No matching prior study found');
    }
  };

  /**
   * Load the compare hanging protocol with current and prior studies
   */
  const loadCompareView = (currentUID, priorUID) => {
    console.log('Loading compare view:', { currentUID, priorUID });

    try {
      // Determine which compare protocol to use based on modality
      const currentStudy = studyList.find(s => s.studyInstanceUID === currentUID);
      const isMammography = currentStudy?.modalities?.includes('MG');

      const protocolId = isMammography ? '@ohif/hpCompareMG' : '@ohif/hpCompareVolume';

      // Set the hanging protocol with both studies
      commandsManager.runCommand('setHangingProtocol', {
        protocolId,
        studyInstanceUIDs: [currentUID, priorUID],
        reset: true,
      });

      console.log(`Applied ${protocolId} with studies:`, [currentUID, priorUID]);
    } catch (error) {
      console.error('Error loading compare view:', error);
    }
  };

  /**
   * Handle double-click on a study to switch it as the prior in compare mode
   */
  const handleStudyDoubleClick = (study) => {
    if (study.isCurrent) {
      console.log('Cannot select current study as prior');
      return;
    }

    console.log('Study double-clicked:', study);
    setSelectedPriorUID(study.studyInstanceUID);
    loadCompareView(currentStudyUID, study.studyInstanceUID);
  };

  /**
   * Toggle layout mode
   */
  const handleLayoutToggle = () => {
    const newMode = layoutMode === '2-column' ? '1-column' : '2-column';
    setLayoutMode(newMode);
    console.log('Layout mode changed to:', newMode);

    // Apply layout change via command
    if (newMode === '1-column') {
      commandsManager.runCommand('setViewportGridLayout', {
        numRows: 1,
        numCols: 1,
      });
    } else {
      commandsManager.runCommand('setViewportGridLayout', {
        numRows: 1,
        numCols: 2,
      });
    }
  };

  /**
   * Toggle display mode
   */
  const handleDisplayToggle = () => {
    const newMode = displayMode === 'thumbnails' ? 'text' : 'thumbnails';
    setDisplayMode(newMode);
    console.log('Display mode changed to:', newMode);
  };

  // Render study item based on display mode
  const renderStudyItem = (study, index) => {
    const isSelected = study.studyInstanceUID === selectedPriorUID;
    const isCurrent = study.isCurrent;

    const itemClass = `
      cursor-pointer border-b border-gray-700 transition-colors
      ${isSelected ? 'bg-blue-900 bg-opacity-50' : 'hover:bg-gray-800'}
      ${isCurrent ? 'border-l-4 border-l-blue-500' : ''}
    `.trim();

    if (displayMode === 'text') {
      return (
        <div
          key={study.studyInstanceUID}
          className={itemClass}
          onDoubleClick={() => handleStudyDoubleClick(study)}
          style={{ padding: '12px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 600, color: '#fff' }}>
              {study.formattedDate}
              {isCurrent && <span style={{ marginLeft: '8px', color: '#3b82f6' }}>(Current)</span>}
            </span>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              {study.modalities}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#d1d5db' }}>
            {study.studyDescription}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            {study.numInstances} instances • {study.accessionNumber || 'No Accession'}
          </div>
        </div>
      );
    } else {
      // Thumbnail mode (placeholder for now)
      return (
        <div
          key={study.studyInstanceUID}
          className={itemClass}
          onDoubleClick={() => handleStudyDoubleClick(study)}
          style={{ padding: '12px', display: 'flex', alignItems: 'center' }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              backgroundColor: '#374151',
              borderRadius: '4px',
              marginRight: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '24px',
            }}
          >
            📊
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
              {study.formattedDate}
              {isCurrent && <span style={{ marginLeft: '8px', color: '#3b82f6' }}>(Current)</span>}
            </div>
            <div style={{ fontSize: '12px', color: '#d1d5db' }}>
              {study.studyDescription}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
              {study.modalities} • {study.numInstances} images
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#1f2937' }}>
      {/* Header with toggle controls */}
      <div style={{ padding: '12px', borderBottom: '1px solid #374151', backgroundColor: '#111827' }}>
        <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          Patient Studies
        </h3>

        {/* Toggle buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            onClick={handleLayoutToggle}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#374151'}
          >
            {layoutMode === '2-column' ? '📊 2-Column' : '📄 1-Column'}
          </button>

          <button
            onClick={handleDisplayToggle}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#374151'}
          >
            {displayMode === 'thumbnails' ? '🖼️ Thumbnails' : '📝 Text'}
          </button>
        </div>

        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
          Double-click a study to load as prior
        </div>
      </div>

      {/* Study list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
            Loading studies...
          </div>
        ) : studyList.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
            No studies found
          </div>
        ) : (
          <div>
            {studyList.map((study, index) => renderStudyItem(study, index))}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div style={{ padding: '12px', borderTop: '1px solid #374151', backgroundColor: '#111827' }}>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
          {studyList.length} {studyList.length === 1 ? 'study' : 'studies'} found
          {selectedPriorUID && (
            <span style={{ marginLeft: '8px', color: '#3b82f6' }}>
              • Prior selected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudyListPanel;
