import { ColorSchemeId } from '../../../../core/types';
import { SchThemePalette } from '../types';
/** Resolves DipTrace / GOST ESKD rendering colors for dark, light, and GOST B&W print themes. */
export function resolveSchematicPalette(scheme: ColorSchemeId): SchThemePalette {
    const isLight = scheme === 'light' || scheme === 'gost-bw';
    return {
        scheme,
        bgColor: scheme === 'gost-bw' ? '#FFFFFF' : scheme === 'light' ? '#F0F1F2' : '#000000',
        frameColor: isLight ? '#111111' : '#DCDCDC',
        compColor: isLight ? '#000000' : '#FFFFFF',
        pinColor: isLight ? '#333333' : '#CCCCCC',
        textColor: scheme === 'gost-bw' ? '#000000' : isLight ? '#004499' : '#00E5E5',
        valColor: scheme === 'gost-bw' ? '#000000' : isLight ? '#111111' : '#CCCCCC',
        wireColor: scheme === 'gost-bw' ? '#000000' : isLight ? '#006600' : '#ECECA0',
        busColor: scheme === 'gost-bw' ? '#000000' : isLight ? '#0033CC' : '#3399FF',
        portColor: scheme === 'gost-bw' ? '#000000' : '#FF4444',
        gridColor: isLight ? '#CCCCCC' : '#383838'
    };
}
