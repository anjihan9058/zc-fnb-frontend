import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useToast } from '../shared/ui';

export function NavigationGuard() {
  const toast = useToast();
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}` &&
    !!document.querySelector('[data-unsaved="true"], [data-pending="true"]'));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (document.querySelector('[data-pending="true"]')) {
      blocker.reset(); toast('저장·전송이 끝난 뒤 이동해 주세요.');
    } else if (window.confirm('저장·전송하지 않은 내용이 있습니다. 내용을 버리고 이동할까요?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, toast]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (document.querySelector('[data-unsaved="true"], [data-pending="true"]')) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);
  return null;
}
