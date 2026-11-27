export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const navWithUAData = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };

  if (typeof navWithUAData.userAgentData?.mobile === 'boolean') {
    return navWithUAData.userAgentData.mobile;
  }

  const ua = navigator.userAgent || '';
  const isHandheldUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return isHandheldUA || isIPadOS;
}