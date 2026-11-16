import React from 'react';
import { AutorouterReport } from '../../../../../engines/autorouter';

export interface PcbAutorouteBannerProps {
  report: AutorouterReport;
  onDismiss: () => void;
}

/** Floating post-autoroute summary banner anchored near workspace bottom. */
export const PcbAutorouteBanner: React.FC<PcbAutorouteBannerProps> = ({ report, onDismiss }) => (
  <div style={{ position: 'fixed', bottom: 32, left: 210, background: '#ffffe1', border: '1px solid #999', padding: '4px 10px', fontSize: 11, boxShadow: '0 2px 6px rgba(0,0,0,0.2)', zIndex: 1000 }}>
    <b>Отчёт автотрассировщика:</b> успешно {report.routedConnections}, не разведено {report.failedConnections}, добавлено дорожек {report.addedTraces}, переходов {report.addedVias} ({report.durationMs} мс)
    <button className="dt-btn" style={{ minWidth: 20, height: 16, marginLeft: 8, padding: '0 4px' }} onClick={onDismiss}>×</button>
  </div>
);
