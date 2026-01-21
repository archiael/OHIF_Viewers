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
      {/* 테이블 컨테이너 - 좌우 여백 제거하여 전체 너비 사용 */}
      <div className="relative m-auto w-full pr-2">
        {/* Header Row */}
        <table className="w-full text-white">
          <tbody>
            <tr>
              <td className="border-0 p-0">
                <table className="w-full p-4">
                  <tbody>
                    <tr className="border-secondary-light border-2 bg-black">
                      {filtersMeta.map((filter, index) => {
                        // Use gridCol from actual data row instead of filtersMeta
                        const dataGridCol = firstRow[index]?.gridCol || filter.gridCol;
                        return (
                          <td
                            key={filter.name}
                            className={classnames(
                              // 테이블 헤더 셀 간격: pl-4 (왼쪽 16px)로 InputGroup과 동일하게 설정
                              // 간격 조정이 필요한 경우 pl-1(4px), pl-2(8px), pl-3(12px), pl-4(16px) 등으로 변경 가능
                              'border-secondary-light border-2 py-3 pl-4 text-left text-base font-semibold',
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
