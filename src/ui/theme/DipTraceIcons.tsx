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

export const DipIcon: React.FC<{ name: DipIconName; size?: number }> = ({ name, size = 16 }) => {
  const s = size;
  switch (name) {
    case 'new':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M3 1h7l3 3v11H3z" fill="#fff" stroke="#444" strokeWidth="1" />
          <path d="M10 1v3h3" fill="#ddd" stroke="#444" strokeWidth="1" />
        </svg>
      );
    case 'open':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M1 3h5l1.5 2H14v8H1z" fill="#f7c844" stroke="#8c6d1f" strokeWidth="1" />
          <path d="M1 6h13l-1.5 7H1z" fill="#ffe17d" stroke="#8c6d1f" strokeWidth="1" />
        </svg>
      );
    case 'save':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="#2b6cb0" stroke="#1a365d" strokeWidth="1" />
          <rect x="4" y="2" width="7" height="5" fill="#e2e8f0" stroke="#4a5568" strokeWidth="0.8" />
          <rect x="5" y="9" width="6" height="5" fill="#fff" stroke="#4a5568" strokeWidth="0.8" />
        </svg>
      );
    case 'preview':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="1" width="9" height="12" fill="#fff" stroke="#555" />
          <circle cx="10.5" cy="10.5" r="3" fill="#cce8ff" stroke="#0066cc" strokeWidth="1.2" />
          <line x1="12.6" y1="12.6" x2="15" y2="15" stroke="#333" strokeWidth="1.6" />
        </svg>
      );
    case 'print':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="4" y="1" width="8" height="4" fill="#fff" stroke="#555" />
          <rect x="1" y="5" width="14" height="6" rx="1" fill="#8fa0b5" stroke="#333" />
          <rect x="4" y="9" width="8" height="5" fill="#fff" stroke="#555" />
        </svg>
      );
    case 'cut':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="4.5" cy="12" r="2.2" fill="none" stroke="#1b4f72" strokeWidth="1.3" />
          <circle cx="11.5" cy="12" r="2.2" fill="none" stroke="#1b4f72" strokeWidth="1.3" />
          <line x1="5.5" y1="10" x2="11" y2="2" stroke="#444" strokeWidth="1.4" />
          <line x1="10.5" y1="10" x2="5" y2="2" stroke="#444" strokeWidth="1.4" />
        </svg>
      );
    case 'copy':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="8" height="10" fill="#fff" stroke="#4a6fa5" />
          <rect x="6" y="5" width="8" height="10" fill="#fff" stroke="#1f4e79" />
          <line x1="8" y1="8" x2="12" y2="8" stroke="#666" />
          <line x1="8" y1="11" x2="12" y2="11" stroke="#666" />
        </svg>
      );
    case 'paste':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="10" height="11" fill="#d49a52" stroke="#6e471b" />
          <rect x="5" y="1" width="4" height="3" fill="#a0a0a0" stroke="#444" />
          <rect x="6" y="6" width="8" height="9" fill="#fff" stroke="#2c5282" />
        </svg>
      );
    case 'undo':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M6 4L2 7.5L6 11V8.5C9.5 8.5 12 9.5 13.5 12C13 8 10 6.5 6 6.5Z" fill="#2b7de9" stroke="#1a4e96" strokeWidth="0.8" />
        </svg>
      );
    case 'redo':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M10 4L14 7.5L10 11V8.5C6.5 8.5 4 9.5 2.5 12C3 8 6 6.5 10 6.5Z" fill="#2b7de9" stroke="#1a4e96" strokeWidth="0.8" />
        </svg>
      );
    case 'zoomAll':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="#1f618d" strokeWidth="1.2" strokeDasharray="3 2" />
          <path d="M4 7V4h3M9 4h3v3M4 9v3h3M12 9v3H9" fill="none" stroke="#0066cc" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'zoomIn':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="6.5" cy="6.5" r="4.5" fill="#fff" stroke="#333" strokeWidth="1.2" />
          <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="#008000" strokeWidth="1.5" />
          <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" stroke="#008000" strokeWidth="1.5" />
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="#444" strokeWidth="2" />
        </svg>
      );
    case 'zoomOut':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="6.5" cy="6.5" r="4.5" fill="#fff" stroke="#333" strokeWidth="1.2" />
          <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="#cc0000" strokeWidth="1.5" />
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="#444" strokeWidth="2" />
        </svg>
      );
    case 'zoomBox':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="8" height="8" fill="none" stroke="#0066cc" strokeDasharray="2,1" strokeWidth="1.2" />
          <circle cx="9.5" cy="9.5" r="3" fill="#fff" stroke="#333" />
          <line x1="12" y1="12" x2="15" y2="15" stroke="#333" strokeWidth="1.8" />
        </svg>
      );
    case 'select':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polygon points="4,2 4,13 7,10 9.5,14.5 11,13.7 8.5,9.3 12.5,9.3" fill="#2b579a" stroke="#111" strokeWidth="0.7" />
        </svg>
      );
    case 'origin':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="8" y1="2" x2="8" y2="14" stroke="#0066cc" strokeWidth="1.5" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="#0066cc" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.2" fill="none" stroke="#cc3300" strokeWidth="1.1" />
        </svg>
      );
    case 'placeComp':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="4" y="4" width="8" height="8" fill="#4a90e2" stroke="#1c3d6e" />
          <line x1="1" y1="6" x2="4" y2="6" stroke="#333" strokeWidth="1.3" />
          <line x1="1" y1="10" x2="4" y2="10" stroke="#333" strokeWidth="1.3" />
          <line x1="12" y1="6" x2="15" y2="6" stroke="#333" strokeWidth="1.3" />
          <line x1="12" y1="10" x2="15" y2="10" stroke="#333" strokeWidth="1.3" />
        </svg>
      );
    case 'find':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="6.5" cy="6.5" r="4.5" fill="#e6f2ff" stroke="#2c3e50" strokeWidth="1.3" />
          <line x1="9.8" y1="9.8" x2="14.2" y2="14.2" stroke="#5d4037" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case 'wire':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="2,13 7,13 7,3 14,3" fill="none" stroke="#1e8449" strokeWidth="1.6" />
          <rect x="1" y="11.5" width="3" height="3" fill="#e67e22" />
          <rect x="12" y="1.5" width="3" height="3" fill="#e67e22" />
        </svg>
      );
    case 'bus':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="2,13 8,13 8,3 14,3" fill="none" stroke="#0066cc" strokeWidth="2.8" />
        </svg>
      );
    case 'busTap':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="2" y1="3" x2="14" y2="3" stroke="#0066cc" strokeWidth="2.6" />
          <polyline points="5,3 8,8 8,14" fill="none" stroke="#1e8449" strokeWidth="1.5" />
        </svg>
      );
    case 'netPort':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polygon points="2,4 10,4 14,8 10,12 2,12" fill="#e74c3c" stroke="#922b21" strokeWidth="1" />
        </svg>
      );
    case 'pin':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="2" y1="8" x2="12" y2="8" stroke="#333" strokeWidth="1.8" />
          <circle cx="12" cy="8" r="2.5" fill="#ff3333" />
        </svg>
      );
    case 'shapeLine':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="2" y1="13" x2="14" y2="3" stroke="#008080" strokeWidth="1.8" />
        </svg>
      );
    case 'shapeRect':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" fill="#d6eaf8" stroke="#1f618d" strokeWidth="1.4" />
        </svg>
      );
    case 'shapeText':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <text x="3" y="13" fontSize="12" fontWeight="bold" fontFamily="serif" fill="#222">Abc</text>
        </svg>
      );
    case 'table':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" fill="#fff" stroke="#333" />
          <line x1="2" y1="7" x2="14" y2="7" stroke="#333" />
          <line x1="2" y1="10" x2="14" y2="10" stroke="#999" />
          <line x1="7" y1="3" x2="7" y2="13" stroke="#333" />
        </svg>
      );
    case 'hierarchy':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="5" y="1" width="6" height="4" fill="#5dade2" stroke="#1b4f72" />
          <rect x="1" y="10" width="5" height="4" fill="#58d68d" stroke="#186a3b" />
          <rect x="10" y="10" width="5" height="4" fill="#58d68d" stroke="#186a3b" />
          <path d="M8 5v3H3.5v2M8 8h4.5v2" fill="none" stroke="#333" />
        </svg>
      );
    case 'diffPair':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="1,5 6,5 9,10 15,10" fill="none" stroke="#cc0000" strokeWidth="1.5" />
          <polyline points="1,10 6,10 9,5 15,5" fill="none" stroke="#0066cc" strokeWidth="1.5" />
        </svg>
      );
    case 'toPcb':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="#1e8449" stroke="#0e4d29" />
          <circle cx="5" cy="5" r="1.4" fill="#f1c40f" />
          <circle cx="11" cy="11" r="1.4" fill="#f1c40f" />
          <polyline points="5,5 8,5 8,11 11,11" fill="none" stroke="#f1c40f" strokeWidth="1.3" />
        </svg>
      );
    case 'toSch':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="#333" />
          <rect x="5" y="5" width="6" height="4" fill="none" stroke="#000" />
          <line x1="2" y1="7" x2="5" y2="7" stroke="#000" />
          <line x1="11" y1="7" x2="14" y2="7" stroke="#000" />
        </svg>
      );
    case 'routeManual':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="2,13 6,13 10,5 14,5" fill="none" stroke="#e53935" strokeWidth="2" />
          <circle cx="2" cy="13" r="1.8" fill="#2e7d32" />
          <circle cx="14" cy="5" r="1.8" fill="#2e7d32" />
        </svg>
      );
    case 'via':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5" fill="#27ae60" stroke="#145a32" strokeWidth="1" />
          <circle cx="8" cy="8" r="2.1" fill="#000" />
        </svg>
      );
    case 'pour':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polygon points="2,3 14,3 14,13 6,13 2,9" fill="#e57373" stroke="#b71c1c" strokeWidth="1.2" />
          <circle cx="9" cy="8" r="2" fill="#f0f0f0" stroke="#b71c1c" />
        </svg>
      );
    case 'pourUpdate':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" fill="#ef9a9a" stroke="#c62828" />
          <path d="M5 8a3 3 0 1 1 1 2.2" fill="none" stroke="#1b4f72" strokeWidth="1.6" />
          <polygon points="4,10 6,12 7,9" fill="#1b4f72" />
        </svg>
      );
    case 'boardOutline':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" fill="none" stroke="#9b59b6" strokeWidth="1.8" />
        </svg>
      );
    case 'cutout':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" fill="#d5f5e3" stroke="#1e8449" />
          <rect x="5" y="6" width="6" height="4" fill="#fff" stroke="#9b59b6" strokeDasharray="1.5,1" />
        </svg>
      );
    case 'keepout':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" fill="#fadbd8" stroke="#c0392b" strokeWidth="1.2" />
          <line x1="3" y1="12" x2="13" y2="4" stroke="#c0392b" strokeWidth="1.2" />
        </svg>
      );
    case 'meander':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="1,8 4,8 4,3 7,3 7,13 10,13 10,3 13,3 13,8 15,8" fill="none" stroke="#d32f2f" strokeWidth="1.4" />
        </svg>
      );
    case 'measure':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M2 10.5L10.5 2L14 5.5L5.5 14Z" fill="#f5d76e" stroke="#7d6608" strokeWidth="1" />
          <line x1="5" y1="7.5" x2="6.6" y2="9.1" stroke="#4a3b00" strokeWidth="1" />
          <line x1="7.2" y1="5.3" x2="9.4" y2="7.5" stroke="#4a3b00" strokeWidth="1" />
          <line x1="9.4" y1="3.1" x2="11" y2="4.7" stroke="#4a3b00" strokeWidth="1" />
        </svg>
      );
    case 'autoroute':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="2,4 6,4 10,12 14,12" fill="none" stroke="#c0392b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="2,12 6,12 10,4 14,4" fill="none" stroke="#1565c0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="2" cy="4" r="1.4" fill="#2e7d32" />
          <circle cx="2" cy="12" r="1.4" fill="#2e7d32" />
          <circle cx="14" cy="4" r="1.4" fill="#2e7d32" />
          <circle cx="14" cy="12" r="1.4" fill="#2e7d32" />
        </svg>
      );
    case 'autoplace':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="5" height="5" fill="#5dade2" stroke="#1b4f72" />
          <rect x="9" y="2" width="5" height="5" fill="#5dade2" stroke="#1b4f72" />
          <rect x="2" y="9" width="5" height="5" fill="#58d68d" stroke="#186a3b" />
          <rect x="9" y="9" width="5" height="5" fill="#58d68d" stroke="#186a3b" />
        </svg>
      );
    case 'drc':
    case 'erc':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="#27ae60" stroke="#145a32" />
          <polyline points="5,8 7.3,10.5 11.5,5.5" fill="none" stroke="#fff" strokeWidth="1.8" />
        </svg>
      );
    case 'view3d':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polygon points="8,1.5 14,4.8 8,8 2,4.8" fill="#5dade2" stroke="#1b4f72" strokeWidth="0.9" strokeLinejoin="round" />
          <polygon points="2,4.8 8,8 8,14.5 2,11.2" fill="#2e86c1" stroke="#1b4f72" strokeWidth="0.9" strokeLinejoin="round" />
          <polygon points="14,4.8 8,8 8,14.5 14,11.2" fill="#1f618d" stroke="#1b4f72" strokeWidth="0.9" strokeLinejoin="round" />
        </svg>
      );
    case 'gerber':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="#1d6f42" stroke="#0d3b21" strokeWidth="1" />
          <circle cx="5" cy="5" r="1.4" fill="#f4d03f" />
          <circle cx="11" cy="5" r="1.4" fill="#f4d03f" />
          <circle cx="11" cy="11" r="1.4" fill="#f4d03f" />
          <polyline points="5,5 8,8 11,11" fill="none" stroke="#f4d03f" strokeWidth="1.4" />
        </svg>
      );
    case 'padSmd':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="3" y="5" width="10" height="6" rx="1" fill="#e53935" stroke="#7f1d1d" />
        </svg>
      );
    case 'padTht':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5.5" fill="#2ecc71" stroke="#145a32" />
          <circle cx="8" cy="8" r="2.3" fill="#000" />
        </svg>
      );
    case 'hole':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="4.5" fill="#fff" stroke="#333" strokeWidth="1.5" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="#888" strokeWidth="0.8" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="#888" strokeWidth="0.8" />
        </svg>
      );
    case 'bom':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="#333" />
          <line x1="2" y1="5" x2="14" y2="5" stroke="#0066cc" strokeWidth="1.5" />
          <line x1="4" y1="8" x2="12" y2="8" stroke="#666" />
          <line x1="4" y1="11" x2="12" y2="11" stroke="#666" />
        </svg>
      );
    case 'spice':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="1" y="2" width="14" height="12" fill="#111" stroke="#555" />
          <polyline points="2,10 4,5 6,12 9,4 11,10 14,7" fill="none" stroke="#00ff66" strokeWidth="1.3" />
        </svg>
      );
    case 'renumber':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <text x="1" y="12" fontSize="9" fontWeight="bold" fill="#0055aa">R1</text>
          <path d="M10 11l3-3-3-3" fill="none" stroke="#c0392b" strokeWidth="1.5" />
        </svg>
      );
    case 'managerComp':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="3" y="4" width="10" height="8" fill="#5dade2" stroke="#1b4f72" />
        </svg>
      );
    case 'managerNet':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="2,12 8,4 14,12" fill="none" stroke="#e67e22" strokeWidth="1.6" />
          <circle cx="8" cy="4" r="2" fill="#2ecc71" />
        </svg>
      );
    case 'managerErr':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polygon points="8,2 14,13 2,13" fill="#f1c40f" stroke="#7d6608" />
          <line x1="8" y1="6" x2="8" y2="10" stroke="#000" strokeWidth="1.4" />
          <circle cx="8" cy="11.8" r="0.8" fill="#000" />
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
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="url(#dt-grad-sch)" stroke="#92171F" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
          {/* ГОСТ 2.728 вертикальный резистор + конденсатор в цепи */}
          <path d="M27.5 11.5 V21.2 M27.5 26.8 V36.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M23.5 21.2 H31.5 M23.5 26.8 H31.5" stroke="#fff" strokeWidth="2.0" strokeLinecap="round" />
          <path d="M27.5 14 H18.5 V18.5 M18.5 29.5 V34 H27.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="16" y="18.5" width="5" height="11" fill="none" stroke="#fff" strokeWidth="1.7" />
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
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="url(#dt-grad-pcb)" stroke="#134612" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
          {/* Классические 45° проводники с контактными площадками (как в DipTrace PCB) */}
          <path d="M12.5 24 L20.5 16 V13" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20.5" cy="13" r="2.2" fill="#fff" />
          <path d="M16 28.5 L25 19.5 V16" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="25" cy="16" r="2.2" fill="#fff" />
          <path d="M20 33 L29.5 23.5 V19" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="29.5" cy="19" r="2.2" fill="#fff" />
          <path d="M25.5 34.5 L34.5 25.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="34.5" cy="25.5" r="2.2" fill="#fff" />
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
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="url(#dt-grad-comp)" stroke="#1B2B66" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
          {/* ГОСТ 2.743-91 логический элемент прямоугольником с инверсией на выходе */}
          <rect x="17.5" y="15.5" width="12.5" height="17" fill="none" stroke="#fff" strokeWidth="1.8" />
          <text x="23.8" y="26.5" textAnchor="middle" fontSize="9.5" fontWeight="bold" fontFamily="Segoe UI, Arial" fill="#fff">&amp;</text>
          <line x1="11.5" y1="20" x2="17.5" y2="20" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="11.5" y1="28" x2="17.5" y2="28" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="31.9" cy="24" r="1.9" fill="#324B9C" stroke="#fff" strokeWidth="1.7" />
          <line x1="33.8" y1="24" x2="37.5" y2="24" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
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
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="url(#dt-grad-pat)" stroke="#3B3E42" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
          {/* Корпус ЭРЭ с контактными площадками (как Pattern Editor в DipTrace) */}
          <rect x="19.5" y="16" width="9" height="16" fill="none" stroke="#fff" strokeWidth="1.8" />
          <rect x="19.5" y="16" width="9" height="3.2" fill="rgba(255,255,255,0.85)" />
          <line x1="24" y1="12.5" x2="24" y2="16" stroke="#fff" strokeWidth="1.8" />
          <line x1="24" y1="32" x2="24" y2="35.5" stroke="#fff" strokeWidth="1.8" />
          <circle cx="24" cy="11.5" r="2.0" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="24" cy="36.5" r="2.0" fill="none" stroke="#fff" strokeWidth="1.6" />
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
          <rect x="10.2" y="10.2" width="27.6" height="27.6" rx="5.2" transform="rotate(45 24 24)" fill="url(#dt-grad-3d)" stroke="#0B3D3B" strokeWidth="1.2" />
          <rect x="11.4" y="11.4" width="25.2" height="25.2" rx="4.4" transform="rotate(45 24 24)" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
          <polygon points="24,13 33.5,18.2 24,23.4 14.5,18.2" fill="rgba(255,255,255,0.22)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          <polygon points="14.5,18.2 24,23.4 24,34.2 14.5,29" fill="rgba(255,255,255,0.08)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          <polygon points="33.5,18.2 24,23.4 24,34.2 33.5,29" fill="rgba(255,255,255,0.14)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'polyline':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline points="2,13 6,4 11,11 14,3" fill="none" stroke="#1f618d" strokeWidth="1.6" />
          <circle cx="2" cy="13" r="1.4" fill="#c0392b" />
          <circle cx="6" cy="4" r="1.4" fill="#c0392b" />
          <circle cx="11" cy="11" r="1.4" fill="#c0392b" />
          <circle cx="14" cy="3" r="1.4" fill="#c0392b" />
        </svg>
      );
    case 'shapeCircle':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="#1f618d" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="1" fill="#c0392b" />
        </svg>
      );
    case 'arc':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M3 11A6 6 0 0 1 13 5" fill="none" stroke="#1f618d" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="3" cy="11" r="1.2" fill="#c0392b" />
          <circle cx="13" cy="5" r="1.2" fill="#c0392b" />
        </svg>
      );
    case 'dimension':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="2" y1="3" x2="2" y2="12" stroke="#555" strokeWidth="1.2" />
          <line x1="14" y1="3" x2="14" y2="12" stroke="#555" strokeWidth="1.2" />
          <line x1="2" y1="7" x2="14" y2="7" stroke="#0066cc" strokeWidth="1.5" />
          <polygon points="2,7 5,5 5,9" fill="#0066cc" />
          <polygon points="14,7 11,5 11,9" fill="#0066cc" />
        </svg>
      );
    case 'rotate':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M12 6A4.5 4.5 0 1 0 11.5 11" fill="none" stroke="#0055aa" strokeWidth="1.6" />
          <polygon points="13,3 14,7 10,6" fill="#0055aa" />
        </svg>
      );
    case 'flip':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="8" y1="2" x2="8" y2="14" stroke="#666" strokeDasharray="2 1" strokeWidth="1.2" />
          <polygon points="6,4 2,8 6,12" fill="#5dade2" stroke="#1b4f72" />
          <polygon points="10,4 14,8 10,12" fill="#f5b041" stroke="#7e5109" />
        </svg>
      );
    case 'delete':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="3" y1="3" x2="13" y2="13" stroke="#c0392b" strokeWidth="2.1" strokeLinecap="round" />
          <line x1="13" y1="3" x2="3" y2="13" stroke="#c0392b" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case 'layers':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polygon points="8,1.5 14.5,4.5 8,7.5 1.5,4.5" fill="#e53935" stroke="#7f1d1d" strokeWidth="0.9" strokeLinejoin="round" />
          <polygon points="8,5.5 14.5,8.5 8,11.5 1.5,8.5" fill="#f1c40f" stroke="#7d6608" strokeWidth="0.9" strokeLinejoin="round" />
          <polygon points="8,9.5 14.5,12.5 8,15.5 1.5,12.5" fill="#1e88e5" stroke="#0d47a1" strokeWidth="0.9" strokeLinejoin="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M7 1.5h2l.5 1.7a5 5 0 0 1 1.4.8l1.6-.6 1 1.7-1.2 1.2a5 5 0 0 1 0 1.5l1.2 1.2-1 1.7-1.6-.6a5 5 0 0 1-1.4.8L9 14.5H7l-.5-1.7a5 5 0 0 1-1.4-.8l-1.6.6-1-1.7 1.2-1.2a5 5 0 0 1 0-1.5L2.5 5.1l1-1.7 1.6.6a5 5 0 0 1 1.4-.8Z" fill="#cfd8dc" stroke="#37474f" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="8" cy="8" r="2.2" fill="#f5f5f5" stroke="#37474f" strokeWidth="1" />
        </svg>
      );
    case 'padArray':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="2" width="4" height="4" fill="#27ae60" stroke="#145a32" />
          <rect x="10" y="2" width="4" height="4" fill="#27ae60" stroke="#145a32" />
          <rect x="2" y="10" width="4" height="4" fill="#27ae60" stroke="#145a32" />
          <rect x="10" y="10" width="4" height="4" fill="#27ae60" stroke="#145a32" />
        </svg>
      );
    case 'wizard':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2.5" y="2.5" width="11" height="11" fill="#ffffff" stroke="#1565c0" strokeWidth="1.2" />
          <rect x="4" y="4" width="3" height="2" fill="#e53935" />
          <rect x="9" y="4" width="3" height="2" fill="#e53935" />
          <rect x="4" y="10" width="3" height="2" fill="#e53935" />
          <rect x="9" y="10" width="3" height="2" fill="#e53935" />
          <rect x="5.5" y="6.5" width="5" height="3" fill="#455a64" />
        </svg>
      );
    case 'specctra':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="1" y="2" width="14" height="12" fill="#f8f9fa" stroke="#555" />
          <polyline points="3,11 6,5 10,11 13,5" fill="none" stroke="#8e44ad" strokeWidth="1.5" />
        </svg>
      );
    default:
      return <svg width={s} height={s} viewBox="0 0 16 16" />;
  }
};
