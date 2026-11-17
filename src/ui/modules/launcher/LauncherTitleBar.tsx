import React from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './LauncherTitleBar.css';
import logo from '../../../../public/logo.svg';

export function LauncherTitleBar() {
  const minimize = () => { if (isTauri()) void getCurrentWindow().minimize(); };
  const close = () => { if (isTauri()) void getCurrentWindow().close(); };
  return <header className="launcher-titlebar" data-tauri-drag-region>
    <div className="launcher-titlebar__drag launcher-titlebar__brand" data-tauri-drag-region><img src={logo} alt="" data-tauri-drag-region /><span data-tauri-drag-region>SIPTrace</span></div>
    <div className="launcher-titlebar__controls">
      <button type="button" aria-label="Свернуть" title="Свернуть" onClick={minimize}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg></button>
      <button type="button" aria-label="Закрыть" title="Закрыть" onClick={close}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
    </div>
  </header>;
}


