import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'home' | 'search' | 'bell' | 'user' | 'compose' | 'reply'
  | 'repost' | 'heart' | 'chevron' | 'right' | 'back' | 'close'
  | 'refresh' | 'link' | 'logout' | 'check' | 'more' | 'menu'
  | 'image' | 'globe' | 'settings' | 'download';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: number | string;
};

const shapes: Record<IconName, ReactNode> = {
  home: <path fill="currentColor" stroke="none" d="m12 2.7 10 8.7-1.9 2.2-1.6-1.4V21h-4.8v-6.2h-3.4V21H5.5v-8.8l-1.6 1.4L2 11.4 12 2.7Z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.7" /><path d="m15.5 15.5 5 5" strokeWidth="3" /></>,
  bell: <><path d="M18.2 9.6a6.2 6.2 0 0 0-12.4 0c0 7-2.1 7.1-2.1 8.4h16.6c0-1.3-2.1-1.4-2.1-8.4Z" /><path d="M9.5 21h5M12 2V1" /></>,
  user: <><circle cx="12" cy="7.4" r="4.1" fill="currentColor" stroke="none" /><path fill="currentColor" stroke="none" d="M3.5 21v-2.1a8.5 6.6 0 0 1 17 0V21h-17Z" /></>,
  compose: <><path d="M13 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8" /><path d="m9 15 1-4L19.2 1.8a1.3 1.3 0 0 1 1.8 0l1.2 1.2a1.3 1.3 0 0 1 0 1.8L13 14l-4 1Z" fill="currentColor" stroke="none" /></>,
  reply: <path d="m10 4-8 7 8 7v-4.8c5.4-.4 8.2 1.2 11 5.8-.6-8-4.1-11.3-11-11V4Z" fill="currentColor" stroke="none" />,
  repost: <><path d="M3 14V7a2 2 0 0 1 2-2h13m-4-4 4 4-4 4M21 10v7a2 2 0 0 1-2 2H6m4-4-4 4 4 4" /></>,
  heart: <path d="M20.4 5.1a5.3 5.3 0 0 0-7.5 0l-.9.9-.9-.9a5.3 5.3 0 0 0-7.5 7.5L12 21l8.4-8.4a5.3 5.3 0 0 0 0-7.5Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  right: <><path d="M3 12h17m-6-6 6 6-6 6" /></>,
  back: <><path d="M21 12H4m6-6-6 6 6 6" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  refresh: <><path d="M20.4 10A8.5 8.5 0 1 0 20 17M21 3v7h-7" /></>,
  link: <><path d="m10 13 4-4M8.8 15.2l-2 2a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2.4.6 2-2a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" transform="translate(1 0)" /></>,
  logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M10 12h11m-5-5 5 5-5 5" /></>,
  check: <path d="m4 12 5 5L20 6" strokeWidth="2.8" />,
  more: <g fill="currentColor" stroke="none"><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="20" cy="12" r="2" /></g>,
  menu: <path d="M4 5h16M4 12h16M4 19h16" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" strokeWidth="1.4" /></>,
  settings: <><path d="m10 2-.6 2.6-2 .9L5 4.6 2.6 8.8l1.9 1.8v2.8l-1.9 1.8L5 19.4l2.4-.9 2 .9.6 2.6h4l.6-2.6 2-.9 2.4.9 2.4-4.2-1.9-1.8v-2.8l1.9-1.8L19 4.6l-2.4.9-2-.9L14 2h-4Z" /><circle cx="12" cy="12" r="3.3" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
};

/** Small monochrome toolbar glyphs, inheriting their surrounding text color. */
export default function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}
