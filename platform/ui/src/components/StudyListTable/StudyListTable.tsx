import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import getGridWidthClass from '../../utils/getGridWidthClass';

import StudyListTableRow from './StudyListTableRow';

const StudyListTable = ({ tableDataSource, querying, filtersMeta }) => {
  // Get column widths from first data row instead of filtersMeta
  const firstRow = tableDataSource[0]?.row || [];

  return (
    <div className="bg-black">
      <div className="relative m-auto w-full px-8">
        {/* Header Row */}
        <table className="w-full text-white">
          <tbody>
            <tr>
              <td className="border-0 p-0">
                <table className="w-full p-4">
                  <tbody>
                    <tr className="bg-black border-secondary-light border-2">
                      {filtersMeta.map((filter, index) => {
                        // Use gridCol from actual data row instead of filtersMeta
                        const dataGridCol = firstRow[index]?.gridCol || filter.gridCol;
                        return (
                          <td
                            key={filter.name}
                            className={classnames(
                              'border-secondary-light border-2 px-4 py-3 text-left text-base font-semibold',
                              getGridWidthClass(dataGridCol)
                            )}
                            style={{
                              maxWidth: 0,
                            }}
                          >
                            <div className="flex">
                              {index === 0 && <div className="mr-8 w-4"></div>}
                              <div className="truncate">{filter.displayName}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Data Rows */}
        <table className="w-full text-white">
          <tbody
            data-cy="study-list-results"
            data-querying={querying}
          >
            {tableDataSource.map((tableData, i) => {
              return (
                <StudyListTableRow
                  tableData={tableData}
                  key={i}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

StudyListTable.propTypes = {
  tableDataSource: PropTypes.arrayOf(
    PropTypes.shape({
      row: PropTypes.array.isRequired,
      expandedContent: PropTypes.node.isRequired,
      querying: PropTypes.bool,
      onClickRow: PropTypes.func.isRequired,
      isExpanded: PropTypes.bool.isRequired,
    })
  ),
  querying: PropTypes.bool,
  filtersMeta: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      displayName: PropTypes.string.isRequired,
      gridCol: PropTypes.number.isRequired,
    })
  ).isRequired,
};

export default StudyListTable;
