import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUserAuthentication } from '@ohif/ui-next';
import { isLocalRoute } from '../utils/isLocalRoute';

export const PrivateRoute = ({ children }) => {
  const [{ user, enabled }] = useUserAuthentication();
  const location = useLocation();
  const navigate = useNavigate();

  const isLocal = isLocalRoute(location.pathname, location.search);
  const needsAuth = enabled && !user && !isLocal;

  // useEffect로 리다이렉트 수행
  // 렌더 중 navigate() 호출은 브라우저 뒤로가기(POP) 이벤트와 충돌하여
  // replace: true가 무시되고 히스토리 스택에 보호된 경로가 남는 버그 발생
  useEffect(() => {
    if (needsAuth) {
      const { pathname, search } = location;
      if (pathname !== '/login') {
        sessionStorage.setItem('ohif-redirect-to', JSON.stringify({ pathname, search }));
      }
      navigate('/login', { replace: true });
    }
  }, [needsAuth, location.pathname, location.search, navigate]);

  // 로컬 라우트는 인증 없이 접근 가능
  if (isLocal) {
    return children;
  }

  // 인증 필요 시 즉시 null 반환 (children 렌더링 방지)
  if (needsAuth) {
    return null;
  }

  return children;
};

export default PrivateRoute;
