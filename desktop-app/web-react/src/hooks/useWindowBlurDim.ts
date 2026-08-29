import { useEffect } from 'react';

/** 窗口失活淡化（对标 CC Switch status-heartbeat）：blur → .win-inactive */
export function useWindowBlurDim(): void {
  useEffect(() => {
    const onBlur = () => document.documentElement.classList.add('win-inactive');
    const onFocus = () => document.documentElement.classList.remove('win-inactive');
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}