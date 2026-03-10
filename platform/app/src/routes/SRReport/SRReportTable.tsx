import React, { useEffect, useCallback, useRef } from 'react';
import {
  Measurement,
  BIRADS_CATEGORIES,
  NATURES,
  ECHO_PATTERNS,
  SHAPES,
  ORIENTATIONS,
  MARGINS,
} from './constants';

interface SRReportTableProps {
  measurements: Measurement[];
  onUpdate: (index: number, field: keyof Measurement, value: string | boolean) => void;
  onAddRow: () => void;
  onDeleteSelected: () => void;
}

const SRReportTable: React.FC<SRReportTableProps> = ({
  measurements,
  onUpdate,
  onAddRow,
  onDeleteSelected,
}) => {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const allEchoChecked = measurements.every(m => m.includeEcho !== false);
  const allShapeChecked = measurements.every(m => m.includeShape !== false);
  const allOrientationChecked = measurements.every(m => m.includeOrientation !== false);
  const allMarginChecked = measurements.every(m => m.includeMargin !== false);

  const toggleSelectAll = useCallback((checked: boolean) => {
    const checkboxes = document.querySelectorAll<HTMLInputElement>('.row-select');
    checkboxes.forEach(cb => (cb.checked = checked));
  }, []);

  const toggleColumnInclude = useCallback(
    (field: 'includeEcho' | 'includeShape' | 'includeOrientation' | 'includeMargin', checked: boolean) => {
      measurements.forEach((_, index) => {
        onUpdate(index, field, checked);
      });
    },
    [measurements, onUpdate]
  );

  const moveToCell = useCallback((row: number, col: number) => {
    const target = document.querySelector<HTMLElement>(
      `.table-input[data-row="${row}"][data-col="${col}"]`
    );
    if (target) {
      target.focus();
      if (target instanceof HTMLInputElement && target.type === 'text') {
        target.select();
      }
    }
  }, []);

  useEffect(() => {
    const tbody = tableRef.current;
    if (!tbody) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('table-input')) return;

      const row = parseInt(target.dataset.row || '0');
      const col = parseInt(target.dataset.col || '0');

      // SELECT elements
      if (target.tagName === 'SELECT') {
        const selectEl = target as HTMLSelectElement;
        if (selectEl.dataset.dropdownOpened === 'true' && e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          e.stopPropagation();

          let foundMatch = false;
          for (let i = 0; i < selectEl.options.length; i++) {
            const optionValue = selectEl.options[i].value;
            const optionText = selectEl.options[i].text;
            if (optionValue.startsWith(e.key) || optionText.startsWith(e.key)) {
              selectEl.selectedIndex = i;
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
              foundMatch = true;
              break;
            }
          }

          if (!foundMatch) {
            const numIndex = parseInt(e.key);
            const nonEmptyOptions: number[] = [];
            for (let i = 0; i < selectEl.options.length; i++) {
              if (selectEl.options[i].value !== '') {
                nonEmptyOptions.push(i);
              }
            }
            if (numIndex >= 1 && numIndex <= nonEmptyOptions.length) {
              selectEl.selectedIndex = nonEmptyOptions[numIndex - 1];
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (numIndex === 0 && selectEl.options.length > 0) {
              selectEl.selectedIndex = 0;
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          return;
        }

        if (selectEl.dataset.dropdownOpened !== 'true') {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            moveToCell(row + 1, col);
            return;
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveToCell(row - 1, col);
            return;
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            moveToCell(row, col - 1);
            return;
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            moveToCell(row, col + 1);
            return;
          }
        }
        return;
      }

      // Checkboxes
      if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          moveToCell(row + 1, col);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveToCell(row - 1, col);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveToCell(row, col - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveToCell(row, col + 1);
        }
        return;
      }

      // Text inputs
      const inputEl = target as HTMLInputElement;
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        moveToCell(row + 1, col);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveToCell(row - 1, col);
      } else if (e.key === 'ArrowLeft' && inputEl.selectionStart === 0) {
        e.preventDefault();
        moveToCell(row, col - 1);
      } else if (e.key === 'ArrowRight' && inputEl.selectionStart === inputEl.value.length) {
        e.preventDefault();
        moveToCell(row, col + 1);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'SELECT' && target.classList.contains('table-input')) {
        (target as HTMLSelectElement).dataset.dropdownOpened = 'true';
      }
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'SELECT' && target.classList.contains('table-input')) {
        (target as HTMLSelectElement).dataset.dropdownOpened = 'false';
      }
    };

    const handleChange = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'SELECT' && target.classList.contains('table-input')) {
        (target as HTMLSelectElement).dataset.dropdownOpened = 'false';
      }
    };

    tbody.addEventListener('keydown', handleKeyDown);
    tbody.addEventListener('mousedown', handleMouseDown, true);
    tbody.addEventListener('blur', handleBlur, true);
    tbody.addEventListener('change', handleChange, true);

    return () => {
      tbody.removeEventListener('keydown', handleKeyDown);
      tbody.removeEventListener('mousedown', handleMouseDown, true);
      tbody.removeEventListener('blur', handleBlur, true);
      tbody.removeEventListener('change', handleChange, true);
    };
  }, [measurements, moveToCell]);

  const renderSelect = (
    index: number,
    field: keyof Measurement,
    options: string[],
    value: string,
    col: number,
    className?: string
  ) => (
    <select
      className={`compact-select table-input ${className || ''}`}
      data-row={index}
      data-col={col}
      value={value}
      onChange={e => onUpdate(index, field, e.target.value)}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>
          {opt || '-'}
        </option>
      ))}
    </select>
  );

  return (
    <div className="sr-section">
      <h2 className="sr-section-title">SR Measurements</h2>
      <div className="sr-button-group">
        <button className="sr-btn" onClick={onAddRow}>
          + Add Row
        </button>
        <button className="sr-btn sr-btn-danger" onClick={onDeleteSelected}>
          Delete Selected
        </button>
      </div>
      <div className="sr-table-wrapper">
        <table className="sr-table">
          <thead>
            <tr>
              <th className="sr-checkbox-cell">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  onChange={e => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="sr-number-cell">#</th>
              <th>Frame</th>
              <th>Position</th>
              <th>Size (W x H x L)</th>
              <th>Max/Surf/Vol</th>
              <th>Nature</th>
              <th>BI-RADS</th>
              <th>Malig% (Max/Avg)</th>
              <th>Echo</th>
              <th className="sr-include-cell">
                <input
                  type="checkbox"
                  checked={allEchoChecked}
                  onChange={e => toggleColumnInclude('includeEcho', e.target.checked)}
                  title="Include all Echo in description"
                />
              </th>
              <th>Shape</th>
              <th className="sr-include-cell">
                <input
                  type="checkbox"
                  checked={allShapeChecked}
                  onChange={e => toggleColumnInclude('includeShape', e.target.checked)}
                  title="Include all Shape in description"
                />
              </th>
              <th>Orient</th>
              <th className="sr-include-cell">
                <input
                  type="checkbox"
                  checked={allOrientationChecked}
                  onChange={e => toggleColumnInclude('includeOrientation', e.target.checked)}
                  title="Include all Orientation in description"
                />
              </th>
              <th>Margin</th>
              <th className="sr-include-cell">
                <input
                  type="checkbox"
                  checked={allMarginChecked}
                  onChange={e => toggleColumnInclude('includeMargin', e.target.checked)}
                  title="Include all Margin in description"
                />
              </th>
            </tr>
          </thead>
          <tbody ref={tableRef}>
            {measurements.length === 0 ? (
              <tr>
                <td colSpan={17} style={{ textAlign: 'center', color: '#999' }}>
                  No measurements loaded. Click &quot;+ Add Row&quot; to add measurements manually.
                </td>
              </tr>
            ) : (
              measurements.map((m, index) => (
                <tr key={m.uid + '_' + index}>
                  <td className="sr-checkbox-cell">
                    <input type="checkbox" className="row-select" data-index={index} />
                  </td>
                  <td className="sr-number-cell">{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      className="frame-input table-input"
                      data-row={index}
                      data-col={2}
                      value={m.frameRange}
                      onChange={e => onUpdate(index, 'frameRange', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="position-input table-input"
                      data-row={index}
                      data-col={3}
                      value={m.position}
                      onChange={e => onUpdate(index, 'position', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="size-input table-input"
                      data-row={index}
                      data-col={4}
                      value={m.size}
                      onChange={e => onUpdate(index, 'size', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="maxsurfvol-input table-input"
                      data-row={index}
                      data-col={5}
                      value={m.maxSurfVol}
                      onChange={e => onUpdate(index, 'maxSurfVol', e.target.value)}
                    />
                  </td>
                  <td>{renderSelect(index, 'nature', NATURES, m.nature, 6)}</td>
                  <td className="sr-birads-cell">
                    <select
                      className="table-input"
                      data-row={index}
                      data-col={7}
                      value={m.biRads}
                      onChange={e => onUpdate(index, 'biRads', e.target.value)}
                    >
                      {BIRADS_CATEGORIES.map(br => (
                        <option key={br.value} value={br.value}>
                          {br.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="malig-input table-input"
                      data-row={index}
                      data-col={8}
                      value={m.maligPercent}
                      onChange={e => onUpdate(index, 'maligPercent', e.target.value)}
                    />
                  </td>
                  <td>{renderSelect(index, 'echo', ECHO_PATTERNS, m.echo, 9)}</td>
                  <td className="sr-include-cell">
                    <input
                      type="checkbox"
                      className="table-input"
                      data-row={index}
                      data-col={10}
                      checked={m.includeEcho !== false}
                      onChange={e => onUpdate(index, 'includeEcho', e.target.checked)}
                    />
                  </td>
                  <td>{renderSelect(index, 'shape', SHAPES, m.shape, 11)}</td>
                  <td className="sr-include-cell">
                    <input
                      type="checkbox"
                      className="table-input"
                      data-row={index}
                      data-col={12}
                      checked={m.includeShape !== false}
                      onChange={e => onUpdate(index, 'includeShape', e.target.checked)}
                    />
                  </td>
                  <td>{renderSelect(index, 'orientation', ORIENTATIONS, m.orientation, 13)}</td>
                  <td className="sr-include-cell">
                    <input
                      type="checkbox"
                      className="table-input"
                      data-row={index}
                      data-col={14}
                      checked={m.includeOrientation !== false}
                      onChange={e => onUpdate(index, 'includeOrientation', e.target.checked)}
                    />
                  </td>
                  <td>{renderSelect(index, 'margin', MARGINS, m.margin, 15)}</td>
                  <td className="sr-include-cell">
                    <input
                      type="checkbox"
                      className="table-input"
                      data-row={index}
                      data-col={16}
                      checked={m.includeMargin !== false}
                      onChange={e => onUpdate(index, 'includeMargin', e.target.checked)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SRReportTable;
