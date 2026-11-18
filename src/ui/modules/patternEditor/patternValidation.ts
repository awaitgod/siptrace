import { PatternDef } from '../../../core/types';

/**
 * Validates a land pattern / footprint against IPC-7351, IPC-2221, and GOST 23751 rules.
 * Returns an array of human-readable issues in Russian.
 */
export function validatePattern(pattern: PatternDef): string[] {
  const issues: string[] = [];

  // 1. Name validation
  const name = (pattern.name ?? '').trim();
  if (!name) {
    issues.push('Не задано наименование посадочного места (корпуса).');
  } else if (/[\\/:*?"<>|]/.test(name)) {
    issues.push(`Наименование корпуса «${name}» содержит недопустимые файловые символы (/ \\ : * ? " < > |).`);
  }

  if (!pattern.pads || pattern.pads.length === 0) {
    issues.push('В корпусе отсутствуют контактные площадки.');
    return issues;
  }

  // 2. Pad numbers uniqueness and presence
  const seenNumbers = new Set<string>();
  for (const pad of pattern.pads) {
    const num = (pad.number ?? '').trim();
    if (!num) {
      if (pad.type !== 'MountingHole') {
        issues.push(`Площадка (${pad.id}): не задан номер вывода.`);
      }
    } else {
      if (seenNumbers.has(num)) {
        issues.push(`Дубликат номера площадки «${num}».`);
      }
      seenNumbers.add(num);
    }

    // 3. Dimensions validation
    if (!Number.isFinite(pad.width) || pad.width <= 0 || !Number.isFinite(pad.height) || pad.height <= 0) {
      issues.push(`Площадка №${num || pad.id}: нулевые или некорректные размеры (${pad.width} × ${pad.height} мм).`);
    }

    if (!Number.isFinite(pad.x) || !Number.isFinite(pad.y)) {
      issues.push(`Площадка №${num || pad.id}: некорректные координаты положения.`);
    }

    // 4. Through-Hole annular ring validation (IPC-2221 / ГОСТ 23751)
    if (pad.type === 'THT' || pad.type === 'MountingHole') {
      const hole = pad.holeDiameter ?? 0;
      if (pad.type === 'THT' && hole <= 0) {
        issues.push(`Сквозная площадка №${num || pad.id}: диаметр отверстия должен быть положительным.`);
      } else if (hole > 0) {
        const minDim = Math.min(pad.width, pad.height);
        if (hole >= minDim) {
          issues.push(
            `Площадка №${num || pad.id}: диаметр отверстия (${hole} мм) превышает или равен размеру площадки (${minDim} мм).`
          );
        } else {
          const annularRing = (minDim - hole) / 2;
          if (pad.type === 'THT' && annularRing < 0.12) {
            issues.push(
              `Площадка №${num || pad.id}: поясок меди отверстия (${annularRing.toFixed(3)} мм) меньше допустимого 0.12 мм (ГОСТ 23751 / IPC-2221).`
            );
          }
        }
      }
    }

    // 5. Solder Mask & Solder Paste limits
    if (pad.solderMaskExpansion !== undefined) {
      if (pad.solderMaskExpansion < 0) {
        issues.push(`Площадка №${num || pad.id}: отрицательный зазор паяльной маски (${pad.solderMaskExpansion} мм) не допускается.`);
      } else if (pad.solderMaskExpansion > 0.25) {
        issues.push(`Площадка №${num || pad.id}: чрезмерный зазор паяльной маски (${pad.solderMaskExpansion} мм > 0.25 мм).`);
      }
    }

    if (pad.pasteMaskExpansion !== undefined) {
      if (pad.pasteMaskExpansion > 0.05) {
        issues.push(`Площадка №${num || pad.id}: расширение паяльной пасты (${pad.pasteMaskExpansion} мм) может привести к перемычкам припоя.`);
      }
      if (pad.type === 'MountingHole' && pad.pasteMaskExpansion > 0) {
        issues.push(`Крепёжное отверстие №${num || pad.id}: паяльная паста не должна наноситься.`);
      }
    }
  }

  // 6. Courtyard Boundary check
  if (pattern.courtyard) {
    const halfCw = pattern.courtyard.width / 2;
    const halfCh = pattern.courtyard.height / 2;
    for (const pad of pattern.pads) {
      const padLeft = pad.x - pad.width / 2;
      const padRight = pad.x + pad.width / 2;
      const padTop = pad.y - pad.height / 2;
      const padBottom = pad.y + pad.height / 2;
      if (
        padLeft < -halfCw - 0.05 ||
        padRight > halfCw + 0.05 ||
        padTop < -halfCh - 0.05 ||
        padBottom > halfCh + 0.05
      ) {
        issues.push(
          `Площадка №${pad.number || pad.id} выходит за пределы зоны отчуждения (Courtyard ${pattern.courtyard.width}×${pattern.courtyard.height} мм).`
        );
        break; // Report once for courtyard
      }
    }
  }

  return issues;
}
