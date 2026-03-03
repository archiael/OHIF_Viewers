import React, { useMemo, useState } from 'react';

export type ViewerVersion = 'localHigh' | 'localLow' | 'pacsHigh' | 'pacsLow' | 'miniFile';

//
export const viewerUrls: Record<ViewerVersion, string> = {
  localHigh: 'https://mpr-advanced.m-view.net/local', // actual domain for high-resolution cloud server
  localLow: 'https://mpr-only.m-view.net/local', // actual domain for low-resolution cloud server
  // pacsHigh: 'https://mpr-advanced.m-view.net?vp',
  // pacsLow: 'https://mpr-only.m-view.net?vp',
  // localHigh: 'https://mpr-advanced.m-view.net/local',
  // localLow: 'https://localhost:3000/local',
  // TODO: '/' 라우트로 이동하므로, 버전 피커 페이지가 다시 보일 수 있음. 이를 방지하려면 쿼리스트링/쿠키/로컬스토리지 저장필요
  //pacsHigh: 'http://192.168.0.48:3000',
  pacsHigh: `${window.location.origin}/worklist`,
  pacsLow: `${window.location.origin}/worklist`,
  miniFile: 'https://minifile.m-view.net',
};

/**
 * 첫 화면 진입 시, 클라이언트의 사양에 따라 수동 선택하여 분기하는 페이지
 * '/' 경로에서 라우트로 렌더링되며, 같은 호스트일 경우 '/worklist'로 이동
 * @constructor
 */
export default function VersionPicker() {
  const [debugIsLocal, setDebugIsLocal] = useState<boolean>(false); // local/Pacs 를 수동전환 하는 디버깅 state
  const isLocal = useMemo(() => {
    // TODO: 디버그 스위치 제거
    return debugIsLocal;
    // return window.location.hostname === new URL(viewerUrls.localHigh).hostname ||
    //   window.location.hostname === new URL(viewerUrls.localLow).hostname;
  }, [debugIsLocal]);

  const categoryCardStyle = `flex flex-col items-center justify-center gap-12 p-16 bg-gray-900/50 backdrop-blur-sm rounded-2xl border-2 border-blue-700/30 hover:border-blue-500/50 transition-all text-center`;

  const buttonCommonStyle = `w-full px-12 py-8 text-2xl font-semibold rounded-xl transition-all hover:scale-105`;
  const buttonHighStyle = `${buttonCommonStyle} bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-500/50`;
  const buttonLowStyle = `${buttonCommonStyle} border-2 border-blue-600 hover:border-blue-400 text-blue-300 hover:text-white hover:bg-blue-600/20`;
  const buttonExtraStyle = `${buttonCommonStyle} border-2 border-orange-500 hover:border-orange-400 text-orange-300 hover:text-white hover:bg-orange-600/20 hover:shadow-orange-500/30`;

  const resolveVersion = (viewerVersion: ViewerVersion) => {
    // PACS 해상도 모드를 localStorage에 저장 (cornerstone extension의 onModeEnter에서 읽어 HTJ2K config 적용)
    if (viewerVersion === 'pacsHigh') {
      localStorage.setItem('mview-stack-resolution', 'high');
    } else if (viewerVersion === 'pacsLow') {
      localStorage.setItem('mview-stack-resolution', 'low');
    }
    const url = viewerUrls[viewerVersion];
    window.location.href = url;
  };

  return (
    <div className="bg-gray-950 fixed inset-0 flex flex-col items-center justify-center p-8">
      <div className={`t-20 l-20 bg-red-200`}>
        <label>
          <span>Switch</span>
          <input
            type={'checkbox'}
            checked={debugIsLocal}
            onChange={() => setDebugIsLocal((p: boolean) => !p)}
          />
        </label>
      </div>

      {/*<h1 className={`text-3xl text-white`}>Portal for Local loader</h1>*/}

      <div className="flex justify-center p-8">
        <div className="flex w-full max-w-7xl justify-center gap-16">
          {isLocal ? (
            /* Media (Patients) Section */
            <div className={categoryCardStyle}>
              <div>
                <h1 className="text-4xl font-bold text-white">Media</h1>
                <span className="block text-xl font-normal text-blue-400">(Patients)</span>
              </div>
              <div className="flex w-full max-w-md flex-col gap-6">
                <button
                  className={buttonHighStyle}
                  onClick={() => resolveVersion('localHigh')}
                >
                  High Resolution
                </button>
                <button
                  className={buttonLowStyle}
                  onClick={() => resolveVersion('localLow')}
                >
                  Low Resolution
                </button>
                <button
                  className={buttonExtraStyle}
                  onClick={() => resolveVersion('miniFile')}
                >
                  JPEG2000 Conversion
                </button>
              </div>
            </div>
          ) : (
            /* PACS (Doctors) Section */
            <div className={categoryCardStyle}>
              <div>
                <h1 className="text-4xl font-bold text-white">PACS</h1>
                <span className="block text-xl font-normal text-blue-400">(Doctors)</span>
              </div>
              <div className="flex w-full max-w-md flex-col gap-6">
                <button
                  className={buttonHighStyle}
                  onClick={() => resolveVersion('pacsHigh')}
                >
                  High Resolution
                </button>
                <button
                  onClick={() => resolveVersion('pacsLow')}
                  className={buttonLowStyle}
                >
                  Low Resolution
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
