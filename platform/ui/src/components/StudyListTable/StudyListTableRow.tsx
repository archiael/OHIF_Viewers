import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import getGridWidthClass from '../../utils/getGridWidthClass';
import { Icons } from '@ohif/ui-next';

const StudyListTableRow = props => {
  const { tableData } = props;
  const {
    row,
    expandedContent,
    onClickRow,
    onDoubleClickRow,
    onContextMenu,
    isExpanded,
    isSelected,
    dataCY,
    clickableCY,
  } = tableData;
  return (
    <>
      <tr
        className="select-none"
        data-cy={dataCY}
      >
        <td
          className={classnames('border-0 p-0', {
            'border-secondary-light bg-primary-dark border-b': isExpanded,
          })}
        >
          <div
            className={classnames(
              'w-full transition duration-300',
              {
                'border-primary-light hover:border-secondary-light mb-2 overflow-visible rounded border':
                  isExpanded,
              },
              {
                'border-transparent': !isExpanded,
              }
            )}
          >
            <table className={classnames('w-full p-4')}>
              <tbody>
                <tr
                  className={classnames(
                    'hover:bg-secondary-main cursor-pointer transition duration-300',
                    {
                      'bg-primary-dark': !isExpanded && !isSelected,
                    },
                    { 'bg-secondary-dark': isExpanded || isSelected }
                  )}
                  onClick={onClickRow}
                  // onDoubleClick={onDoubleClickRow} // 김현태 : 더블클릭을 막으라는 대표님 지시사항
                  onContextMenu={onContextMenu}
                  data-cy={clickableCY}
                >
                  {row.map((cell, index) => {
                    const { content, title, gridCol } = cell;
                    return (
                      <td
                        key={index}
                        className={classnames(
                          // 테이블 데이터 셀 간격: pl-4 (왼쪽 16px)로 InputGroup과 동일하게 설정
                          // 간격 조정이 필요한 경우 pl-1(4px), pl-2(8px), pl-3(12px), pl-4(16px) 등으로 변경 가능
                          'border-secondary-light truncate pl-4 py-2 text-base',
                          { 'border-b': !isExpanded },
                          { 'border-r': index < row.length - 1 },
                          getGridWidthClass(gridCol) || ''
                        )}
                        style={{
                          maxWidth: 0,
                        }}
                        title={title}
                      >
                        <div className="flex">
                          {index === 0 && <div className="mr-4 w-4"></div>}
                          <div
                            className={classnames({ 'overflow-hidden': true }, { truncate: true })}
                          >
                            {content}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {isExpanded && (
                  <tr className="max-h-0 w-full select-text overflow-hidden bg-black">
                    <td colSpan={row.length}>{expandedContent}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    </>
  );
};

StudyListTableRow.propTypes = {
  tableData: PropTypes.shape({
    /** A table row represented by an array of "cell" objects */
    row: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string.isRequired,
        /** Optional content to render in row's cell */
        content: PropTypes.node,
        /** Title attribute to use for provided content */
        title: PropTypes.string,
        gridCol: PropTypes.number.isRequired,
      })
    ).isRequired,
    expandedContent: PropTypes.node.isRequired,
    onClickRow: PropTypes.func.isRequired,
    //onDoubleClickRow: PropTypes.func,
    onContextMenu: PropTypes.func,
    isExpanded: PropTypes.bool.isRequired,
    isSelected: PropTypes.bool,
    dataCY: PropTypes.string,
    clickableCY: PropTypes.string,
  }),
};

export default StudyListTableRow;
