/**
 * 로컬 라우트 판별 함수
 *
 * 로컬 파일 기반 라우트는 인증 없이 접근 가능해야 한다.
 * PrivateRoute, AuthStateListener 등에서 인증 체크를 건너뛰는 데 사용.
 */
export function isLocalRoute(pathname: string, search: string): boolean {
  const lowerPath = pathname.toLowerCase();
  const lowerSearch = search.toLowerCase();

  // /local, /localbasic → 로컬 파일 업로드 페이지
  if (lowerPath === '/local' || lowerPath === '/localbasic') {
    return true;
  }

  // /:modeId/dicomlocal → 로컬 데이터소스 뷰어
  if (lowerPath.includes('/dicomlocal')) {
    return true;
  }

  // ?datasources=dicomlocal → 로컬 데이터소스 WorkList
  if (lowerSearch.includes('datasources=dicomlocal')) {
    return true;
  }

  return false;
}
