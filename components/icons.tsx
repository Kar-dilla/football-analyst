import type { ReactNode } from 'react';

type P = { size?: number };

function Svg({ size = 22, children }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function IconPicks(p: P) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Svg>;
}
export function IconAnalyze(p: P) {
  return <Svg {...p}><circle cx="10" cy="10" r="6.5" /><path d="M15 15l5.5 5.5M7.5 12.5v-2M10 12.5v-5M12.5 12.5v-3" /></Svg>;
}
export function IconLive(p: P) {
  return <Svg {...p}><circle cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></Svg>;
}
export function IconLog(p: P) {
  return <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Svg>;
}
export function IconMore(p: P) {
  return <Svg {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></Svg>;
}
export function IconBack(p: P) {
  return <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
}
export function IconCheck(p: P) {
  return <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
}
export function IconPlus(p: P) {
  return <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
}
export function IconClose(p: P) {
  return <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
}
