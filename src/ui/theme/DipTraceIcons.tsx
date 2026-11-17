import React from 'react';

export type DipIconName =
  | 'new'
  | 'open'
  | 'save'
  | 'preview'
  | 'print'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'undo'
  | 'redo'
  | 'zoomAll'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomBox'
  | 'select'
  | 'origin'
  | 'placeComp'
  | 'find'
  | 'wire'
  | 'bus'
  | 'busTap'
  | 'junction'
  | 'noConnect'
  | 'netPort'
  | 'pin'
  | 'shapeLine'
  | 'shapeRect'
  | 'shapeText'
  | 'table'
  | 'hierarchy'
  | 'diffPair'
  | 'toPcb'
  | 'toSch'
  | 'routeManual'
  | 'via'
  | 'pour'
  | 'pourUpdate'
  | 'boardOutline'
  | 'cutout'
  | 'keepout'
  | 'meander'
  | 'measure'
  | 'autoroute'
  | 'autoplace'
  | 'drc'
  | 'erc'
  | 'view3d'
  | 'gerber'
  | 'padSmd'
  | 'padTht'
  | 'hole'
  | 'bom'
  | 'spice'
  | 'renumber'
  | 'managerComp'
  | 'managerNet'
  | 'managerErr'
  | 'launcherSch'
  | 'launcherPcb'
  | 'launcherComp'
  | 'launcherPat'
  | 'launcher3d'
  | 'polyline'
  | 'shapeCircle'
  | 'arc'
  | 'dimension'
  | 'rotate'
  | 'flip'
  | 'delete'
  | 'layers'
  | 'settings'
  | 'padArray'
  | 'wizard'
  | 'specctra';

export const DipIcon: React.FC<{ name: DipIconName; size?: number }> = ({ name, size = 18 }) => {
  const s = size;
  switch (name) {
    case 'new':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.8V8h4.2L13 3.8ZM11 11v2.5H8.5v2H11V18h2v-2.5h2.5v-2H13V11h-2Z" />
        </svg>
      );
    case 'open':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M3 4h6.3l2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 5v10h17V9H3Z" />
        </svg>
      );
    case 'save':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M4 2h13l5 5v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 2v6h10V4H6Zm1 9v7h10v-7H7Zm6-8h2v4h-2V5Z" />
        </svg>
      );
    case 'preview':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M5 2h9l4 4v5h-2V7h-3V4H5v16h7v2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 6h6v1.5H7V8Zm0 3.5h5V13H7v-1.5Zm9.5.5a4.5 4.5 0 1 0 2.6 8.2l2 2 1.4-1.4-2-2a4.5 4.5 0 0 0-4-6.8Zm0 1.8a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z" />
        </svg>
      );
    case 'print':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="1" width="8" height="4" fill="none" stroke="currentColor" />
          <rect x="1" y="5" width="14" height="6" rx="1" fill="none" stroke="currentColor" />
          <rect x="4" y="9" width="8" height="5" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'cut':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="4.5" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="11.5" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="5.5" y1="10" x2="11" y2="2" stroke="currentColor" strokeWidth="1.2" />
          <line x1="10.5" y1="10" x2="5" y2="2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'copy':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M5 2h10a2 2 0 0 1 2 2v1h-2V4H5v12h1v2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 5h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v11h9V9h-9Z" />
        </svg>
      );
    case 'paste':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M9 2h6l1 2h2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h2l1-2Zm0 5v2h6V7H9ZM7 12v2h10v-2H7Zm0 4v2h10v-2H7Z" />
        </svg>
      );
    case 'undo':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M9 3 2 10l7 7v-4h5a5 5 0 0 1 5 5v1h3v-1a8 8 0 0 0-8-8H9V3Z" />
        </svg>
      );
    case 'redo':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M15 3l7 7-7 7v-4h-5a5 5 0 0 0-5 5v1H2v-1a8 8 0 0 1 8-8h5V3Z" />
        </svg>
      );
    case 'zoomAll':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2.5H2.5V6M10 2.5h3.5V6M2.5 10v3.5H6M13.5 10v3.5H10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 6 3 3M10 6l3-3M6 10l-3 3M10 10l3 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case 'zoomIn':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'zoomOut':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'zoomBox':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 6V2.5H6M10 2.5h3.5V6M2.5 10v3.5H6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="9.5" cy="9.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="m11.8 11.8 2.7 2.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case 'select':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M5 2v17l4.6-4.2 3.5 7 2.5-1.2-3.5-7 6.1-.4L5 2Z" />
        </svg>
      );
    case 'origin':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'placeComp':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M6 6h12v12H6V6ZM3 8h3v2H3V8Zm0 6h3v2H3v-2Zm15-6h3v2h-3V8Zm0 6h3v2h-3v-2ZM8 3h2v3H8V3Zm6 0h2v3h-2V3ZM8 18h2v3H8v-3Zm6 0h2v3h-2v-3Z" />
        </svg>
      );
    case 'find':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9.8" y1="9.8" x2="14.2" y2="14.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'wire':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,13 7,13 7,3 14,3" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="1" y="11.5" width="3" height="3" fill="var(--ui-accent)" />
          <rect x="12" y="1.5" width="3" height="3" fill="var(--ui-accent)" />
        </svg>
      );
    case 'bus':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,13 8,13 8,3 14,3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'busTap':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1.2" />
          <polyline points="5,3 8,8 8,14" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'junction':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2.5" fill="var(--ui-accent)" />
        </svg>
      );
    case 'noConnect':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'netPort':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M3 5h12l6 7-6 7H3V5Z" />
        </svg>
      );
    case 'pin':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="2" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="12" cy="8" r="2.5" fill="var(--ui-accent)" />
        </svg>
      );
    case 'shapeLine':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="2" y1="13" x2="14" y2="3" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'shapeRect':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'shapeText':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <text x="2" y="12" fontSize="11" fontWeight="bold" fontFamily="serif" fill="currentColor">Aa</text>
        </svg>
      );
    case 'table':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" />
          <line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" />
          <line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" />
          <line x1="7" y1="3" x2="7" y2="13" stroke="currentColor" />
        </svg>
      );
    case 'hierarchy':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="1" width="6" height="4" fill="none" stroke="currentColor" />
          <rect x="1" y="10" width="5" height="4" fill="none" stroke="currentColor" />
          <rect x="10" y="10" width="5" height="4" fill="none" stroke="currentColor" />
          <path d="M8 5v3H3.5v2M8 8h4.5v2" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'diffPair':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="1,5 6,5 9,10 15,10" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <polyline points="1,10 6,10 9,5 15,5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'toPcb':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" />
          <circle cx="5" cy="5" r="1.4" fill="var(--ui-accent)" />
          <circle cx="11" cy="11" r="1.4" fill="var(--ui-accent)" />
          <polyline points="5,5 8,5 8,11 11,11" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'toSch':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" />
          <rect x="5" y="5" width="6" height="4" fill="none" stroke="currentColor" />
          <line x1="2" y1="7" x2="5" y2="7" stroke="currentColor" />
          <line x1="11" y1="7" x2="14" y2="7" stroke="currentColor" />
        </svg>
      );
    case 'routeManual':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,13 6,13 10,5 14,5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="2" cy="13" r="1.8" fill="var(--ui-accent)" />
          <circle cx="14" cy="5" r="1.8" fill="var(--ui-accent)" />
        </svg>
      );
    case 'via':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2.1" fill="var(--ui-accent)" />
        </svg>
      );
    case 'pour':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="2,3 14,3 14,13 6,13 2,9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="9" cy="8" r="2" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'pourUpdate':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" />
          <path d="M5 8a3 3 0 1 1 1 2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="4,10 6,12 7,9" fill="var(--ui-accent)" />
        </svg>
      );
    case 'boardOutline':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'cutout':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" />
          <rect x="5" y="6" width="6" height="4" fill="none" stroke="currentColor" strokeDasharray="1.5,1" />
        </svg>
      );
    case 'keepout':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="3" y1="12" x2="13" y2="4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'meander':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="1,8 4,8 4,3 7,3 7,13 10,13 10,3 13,3 13,8 15,8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'measure':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 10.5L10.5 2L14 5.5L5.5 14Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="5" y1="7.5" x2="6.6" y2="9.1" stroke="currentColor" strokeWidth="1.2" />
          <line x1="7.2" y1="5.3" x2="9.4" y2="7.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9.4" y1="3.1" x2="11" y2="4.7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'autoroute':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,4 6,4 10,12 14,12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="2,12 6,12 10,4 14,4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="2" cy="4" r="1.4" fill="var(--ui-accent)" />
          <circle cx="2" cy="12" r="1.4" fill="var(--ui-accent)" />
          <circle cx="14" cy="4" r="1.4" fill="var(--ui-accent)" />
          <circle cx="14" cy="12" r="1.4" fill="var(--ui-accent)" />
        </svg>
      );
    case 'autoplace':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" fill="none" stroke="currentColor" />
          <rect x="9" y="2" width="5" height="5" fill="none" stroke="currentColor" />
          <rect x="2" y="9" width="5" height="5" fill="none" stroke="currentColor" />
          <rect x="9" y="9" width="5" height="5" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'drc':
    case 'erc':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
          <polyline points="5,8 7.3,10.5 11.5,5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'view3d':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="8,1.5 14,4.8 8,8 2,4.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="2,4.8 8,8 8,14.5 2,11.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="14,4.8 8,8 8,14.5 14,11.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case 'gerber':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="5" cy="5" r="1.4" fill="var(--ui-accent)" />
          <circle cx="11" cy="5" r="1.4" fill="var(--ui-accent)" />
          <circle cx="11" cy="11" r="1.4" fill="var(--ui-accent)" />
          <polyline points="5,5 8,8 11,11" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'padSmd':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="10" height="6" rx="1" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'padTht':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" />
          <circle cx="8" cy="8" r="2.3" fill="var(--ui-accent)" />
        </svg>
      );
    case 'hole':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'bom':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className="dip-icon dip-icon-filled" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 4v2h2V6H7Zm4 0v2h6V6h-6ZM7 11v2h2v-2H7Zm4 0v2h6v-2h-6ZM7 16v2h2v-2H7Zm4 0v2h6v-2h-6Z" />
        </svg>
      );
    case 'spice':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" fill="none" stroke="currentColor" />
          <polyline points="2,10 4,5 6,12 9,4 11,10 14,7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'renumber':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <text x="1" y="12" fontSize="9" fontWeight="bold" fill="#0055aa">R1</text>
          <path d="M10 11l3-3-3-3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'managerComp':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="10" height="8" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'managerNet':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,12 8,4 14,12" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="4" r="2" fill="var(--ui-accent)" />
        </svg>
      );
    case 'managerErr':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="8,2 14,13 2,13" fill="none" stroke="currentColor" />
          <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="11.8" r="0.8" fill="var(--ui-accent)" />
        </svg>
      );
    case 'launcherSch':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <defs>
            <linearGradient id="dt-grad-sch" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EC5C64" />
              <stop offset="55%" stopColor="#D63640" />
              <stop offset="100%" stopColor="#AD1D26" />
            </linearGradient>
          </defs>
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {/* ГОСТ 2.728 вертикальный резистор + конденсатор в цепи */}
          <path d="M27.5 11.5 V21.2 M27.5 26.8 V36.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M23.5 21.2 H31.5 M23.5 26.8 H31.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M27.5 14 H18.5 V18.5 M18.5 29.5 V34 H27.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="16" y="18.5" width="5" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'launcherPcb':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <defs>
            <linearGradient id="dt-grad-pcb" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#48AA46" />
              <stop offset="55%" stopColor="#2E8A2C" />
              <stop offset="100%" stopColor="#1B5E19" />
            </linearGradient>
          </defs>
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {/* Классические 45° проводники с контактными площадками (как в DipTrace PCB) */}
          <path d="M12.5 24 L20.5 16 V13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20.5" cy="13" r="2.2" fill="var(--ui-accent)" />
          <path d="M16 28.5 L25 19.5 V16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="25" cy="16" r="2.2" fill="var(--ui-accent)" />
          <path d="M20 33 L29.5 23.5 V19" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="29.5" cy="19" r="2.2" fill="var(--ui-accent)" />
          <path d="M25.5 34.5 L34.5 25.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="34.5" cy="25.5" r="2.2" fill="var(--ui-accent)" />
        </svg>
      );
    case 'launcherComp':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <defs>
            <linearGradient id="dt-grad-comp" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5372CF" />
              <stop offset="55%" stopColor="#3B55AD" />
              <stop offset="100%" stopColor="#263B85" />
            </linearGradient>
          </defs>
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {/* ГОСТ 2.743-91 логический элемент прямоугольником с инверсией на выходе */}
          <rect x="17.5" y="15.5" width="12.5" height="17" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <text x="23.8" y="26.5" textAnchor="middle" fontSize="9.5" fontWeight="bold" fontFamily="Segoe UI, Arial" fill="#fff">&amp;</text>
          <line x1="11.5" y1="20" x2="17.5" y2="20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="11.5" y1="28" x2="17.5" y2="28" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="31.9" cy="24" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="33.8" y1="24" x2="37.5" y2="24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'launcherPat':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <defs>
            <linearGradient id="dt-grad-pat" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#94989E" />
              <stop offset="55%" stopColor="#72767C" />
              <stop offset="100%" stopColor="#52555A" />
            </linearGradient>
          </defs>
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {/* Корпус ЭРЭ с контактными площадками (как Pattern Editor в DipTrace) */}
          <rect x="19.5" y="16" width="9" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="19.5" y="16" width="9" height="3.2" fill="var(--ui-accent)" />
          <line x1="24" y1="12.5" x2="24" y2="16" stroke="currentColor" strokeWidth="1.2" />
          <line x1="24" y1="32" x2="24" y2="35.5" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="24" cy="11.5" r="2.0" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="24" cy="36.5" r="2.0" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'launcher3d':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48">
          <defs>
            <linearGradient id="dt-grad-3d" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#35A6A0" />
              <stop offset="55%" stopColor="#1E7D78" />
              <stop offset="100%" stopColor="#115451" />
            </linearGradient>
          </defs>
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="24,13 33.5,18.2 24,23.4 14.5,18.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="14.5,18.2 24,23.4 24,34.2 14.5,29" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="33.5,18.2 24,23.4 24,34.2 33.5,29" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case 'polyline':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,13 6,4 11,11 14,3" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="2" cy="13" r="1.4" fill="var(--ui-accent)" />
          <circle cx="6" cy="4" r="1.4" fill="var(--ui-accent)" />
          <circle cx="11" cy="11" r="1.4" fill="var(--ui-accent)" />
          <circle cx="14" cy="3" r="1.4" fill="var(--ui-accent)" />
        </svg>
      );
    case 'shapeCircle':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="1" fill="var(--ui-accent)" />
        </svg>
      );
    case 'arc':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11A6 6 0 0 1 13 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="3" cy="11" r="1.2" fill="var(--ui-accent)" />
          <circle cx="13" cy="5" r="1.2" fill="var(--ui-accent)" />
        </svg>
      );
    case 'dimension':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="2" y1="3" x2="2" y2="12" stroke="currentColor" strokeWidth="1.2" />
          <line x1="14" y1="3" x2="14" y2="12" stroke="currentColor" strokeWidth="1.2" />
          <line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="2,7 5,5 5,9" fill="var(--ui-accent)" />
          <polygon points="14,7 11,5 11,9" fill="var(--ui-accent)" />
        </svg>
      );
    case 'rotate':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 6A4.5 4.5 0 1 0 11.5 11" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="13,3 14,7 10,6" fill="var(--ui-accent)" />
        </svg>
      );
    case 'flip':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeDasharray="2 1" strokeWidth="1.2" />
          <polygon points="6,4 2,8 6,12" fill="none" stroke="currentColor" />
          <polygon points="10,4 14,8 10,12" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'delete':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'layers':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="8,1.5 14.5,4.5 8,7.5 1.5,4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="8,5.5 14.5,8.5 8,11.5 1.5,8.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="8,9.5 14.5,12.5 8,15.5 1.5,12.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 1.5h2l.5 1.7a5 5 0 0 1 1.4.8l1.6-.6 1 1.7-1.2 1.2a5 5 0 0 1 0 1.5l1.2 1.2-1 1.7-1.6-.6a5 5 0 0 1-1.4.8L9 14.5H7l-.5-1.7a5 5 0 0 1-1.4-.8l-1.6.6-1-1.7 1.2-1.2a5 5 0 0 1 0-1.5L2.5 5.1l1-1.7 1.6.6a5 5 0 0 1 1.4-.8Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'padArray':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="4" height="4" fill="none" stroke="currentColor" />
          <rect x="10" y="2" width="4" height="4" fill="none" stroke="currentColor" />
          <rect x="2" y="10" width="4" height="4" fill="none" stroke="currentColor" />
          <rect x="10" y="10" width="4" height="4" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'wizard':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="4" y="4" width="3" height="2" fill="var(--ui-accent)" />
          <rect x="9" y="4" width="3" height="2" fill="var(--ui-accent)" />
          <rect x="4" y="10" width="3" height="2" fill="var(--ui-accent)" />
          <rect x="9" y="10" width="3" height="2" fill="var(--ui-accent)" />
          <rect x="5.5" y="6.5" width="5" height="3" fill="var(--ui-accent)" />
        </svg>
      );
    case 'specctra':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" fill="none" stroke="currentColor" />
          <polyline points="3,11 6,5 10,11 13,5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    default:
      return <svg width={s} height={s} viewBox="0 0 16 16" className="dip-icon" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" />;
  }
};
