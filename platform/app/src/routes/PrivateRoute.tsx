import { useUserAuthentication } from '@ohif/ui-next';

export const PrivateRoute = ({ children, handleUnauthenticated }) => {
  // ⚠️ 인증 체크 비활성화: 로그인 없이 모든 페이지 접근 가능
  // const [{ user, enabled }] = useUserAuthentication();
  // if (enabled && !user) {
  //   return handleUnauthenticated();
  // }

  return children;
};

export default PrivateRoute;
