/* Reusable SVG icon components for Migancore */
const Icon = ({ children, size = 24, className = '', stroke = 'currentColor', fill = 'none', ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke={stroke}
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
    className={className} {...rest}>{children}</svg>
);

const IconStar = (p) => (<Icon {...p}><path d="M12 2l2.6 6.4L21 9l-5 4.4L17.5 21 12 17.4 6.5 21 8 13.4 3 9l6.4-.6z"/></Icon>);
const IconAtom = (p) => (<Icon {...p}><circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/></Icon>);
const IconCube = (p) => (<Icon {...p}><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/></Icon>);
const IconHeart = (p) => (<Icon {...p}><path d="M3 11h4l2-3 3 6 2-4 2 1h5"/><path d="M20.84 4.6a5.5 5.5 0 0 0-7.78 0L12 5.7l-1.06-1.1a5.5 5.5 0 1 0-7.78 7.8l1.06 1.1L12 21l7.78-7.5 1.06-1.1a5.5 5.5 0 0 0 0-7.8z" opacity="0.3"/></Icon>);
const IconRocket = (p) => (<Icon {...p}><path d="M14 14l-4-4M9 11s-3 1-5 0c-1 2 1 4 3 4l-1 3 3-1c0 2 2 4 4 3-1-2 0-5 0-5"/><path d="M19 5s-7 0-11 4l3 3 3 3c4-4 4-11 4-11l-1 1z"/><circle cx="15" cy="9" r="1"/></Icon>);
const IconTelescope = (p) => (<Icon {...p}><path d="M3 17l6-2 8-12 4 2-8 12z"/><path d="M9 15l3 6"/><path d="M6 21h6"/><circle cx="9" cy="15" r="1.2"/></Icon>);
const IconBrain = (p) => (<Icon {...p}><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V4a3 3 0 0 0-3 0z"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0"/><path d="M9 10h2M13 10h2M9 14h2M13 14h2"/></Icon>);
const IconBlocks = (p) => (<Icon {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></Icon>);
const IconExpand = (p) => (<Icon {...p}><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/><circle cx="12" cy="12" r="3"/></Icon>);
const IconInfinity = (p) => (<Icon {...p}><path d="M5 12c0-2.5 2-4.5 4.5-4.5S12 9.5 12 12s2 4.5 4.5 4.5S21 14.5 21 12s-2-4.5-4.5-4.5S12 9.5 12 12s-2 4.5-4.5 4.5S3 14.5 3 12z"/></Icon>);

const IconArrowRight = (p) => (<Icon {...p}><path d="M5 12h14M13 5l7 7-7 7"/></Icon>);
const IconLightning = (p) => (<Icon {...p}><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></Icon>);
const IconShield = (p) => (<Icon {...p}><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/></Icon>);
const IconCircuit = (p) => (<Icon {...p}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 8v8a2 2 0 0 0 2 2h8M8 6h8M18 8v8"/></Icon>);
const IconNetwork = (p) => (<Icon {...p}><circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><path d="M6 7l4 4M18 7l-4 4M6 17l4-3M18 17l-4-3"/></Icon>);

const IconTwitter = (p) => (<Icon {...p}><path d="M18 4l-6 8 6 8h-3l-4.5-6L5 20H3l6.5-8L3 4h3l4 5.5L15 4z"/></Icon>);
const IconLinkedIn = (p) => (<Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 11v6"/></Icon>);
const IconYouTube = (p) => (<Icon {...p}><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></Icon>);
const IconDiscord = (p) => (<Icon {...p}><path d="M5 6c2-1 5-2 7-2s5 1 7 2c1 3 2 7 1 11-2 1-4 2-5 2l-1-2M5 6c-1 3-2 7-1 11 2 1 4 2 5 2l1-2"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></Icon>);

Object.assign(window, {
  Icon, IconStar, IconAtom, IconCube, IconHeart, IconRocket,
  IconTelescope, IconBrain, IconBlocks, IconExpand, IconInfinity,
  IconArrowRight, IconLightning, IconShield, IconCircuit, IconNetwork,
  IconTwitter, IconLinkedIn, IconYouTube, IconDiscord,
});
