import { AppModuleId } from '../models';

/**
 * Switches the active application module within the Vite web application.
 */
export function openAppModule(moduleId: AppModuleId, onSwitch: (m: AppModuleId) => void): void {
  onSwitch(moduleId);
}
