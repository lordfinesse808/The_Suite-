import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" });

export const IconInbox = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></svg>);
export const IconPipeline = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="10" y="4" width="4" height="10" rx="1" /><rect x="17" y="4" width="4" height="6" rx="1" /></svg>);
export const IconHome = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>);
export const IconApprovals = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 6h10M4 12h8M4 18h6" /><path d="M14 17l2.5 2.5L21 15" /></svg>);
export const IconCalendar = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>);
export const IconReports = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 20V10M12 20V4M19 20v-7" /></svg>);
export const IconSettings = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
export const IconSearch = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const IconBack = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M15 18l-6-6 6-6" /></svg>);
export const IconNext = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M9 18l6-6-6-6" /></svg>);
export const IconSend = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconCheck = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const IconPin = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M9 4h6l-1 6 3 3H7l3-3z" /><path d="M12 13v7" /></svg>);
export const IconEyeOff = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 3l18 18" /><path d="M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.8M6.4 6.5A17 17 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4-1" /></svg>);
export const IconPhone = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>);
export const IconLink = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>);
export const IconBell = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>);
export const IconMenu = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const IconMapPin = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>);
export const IconMic = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
        <g fill="#1f5b45">
          <rect x="2" y="17" width="4" height="8" rx="1.2" />
          <rect x="8.5" y="13" width="4" height="12" rx="1.2" />
          <rect x="15" y="8.5" width="4" height="16.5" rx="1.2" />
          <rect x="21.5" y="3" width="4" height="22" rx="1.2" />
        </g>
      </svg>
      <span className="text-[26px] font-bold tracking-tight leading-none">ilé</span>
    </span>
  );
}
