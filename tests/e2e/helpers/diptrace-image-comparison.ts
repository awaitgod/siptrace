/** Runs in Chromium so the PNGs decode with the same rendering engine as the editor. */
export async function compareDipTraceScreenshots(input: { actual: string; expected: string; lastSheet?: string }) {
  type Point = { x: number; y: number };
  type Transform = { x: number; y: number; scale: number };

  async function decode(png: string) {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // Native captures include menus and sidebars. The drawing area is the contiguous
  // dark region through the window center, with a dark majority along both axes.
  function nativeDrawingArea(image: ImageData) {
    const { data, width, height } = image;
    function bounds(horizontal: boolean): [number, number] {
      const length = horizontal ? width : height;
      const cross = horizontal ? height : width;
      function isDark(position: number) {
        let dark = 0;
        let total = 0;
        for (let i = Math.floor(cross * 0.3); i < cross * 0.7; i += 4) {
          const index = 4 * (horizontal ? i * width + position : position * width + i);
          if (Math.max(data[index], data[index + 1], data[index + 2]) <= 90) dark++;
          total++;
        }
        return dark >= total * 0.85;
      }
      // Fill short gaps caused by vertical/horizontal drawing strokes.
      let start = 0, end = 0, runStart = 0, lastDark = -Infinity;
      for (let position = 0; position < length; position++) {
        if (!isDark(position)) continue;
        if (position - lastDark > 24) runStart = position;
        lastDark = position;
        if (position - runStart + 1 <= end - start) continue;
        start = runStart;
        end = position + 1;
      }
      if (end - start < length / 2) throw new Error('Could not locate the dark DipTrace drawing area');
      return [start, end];
    }
    const [x1, x2] = bounds(true);
    const [y1, y2] = bounds(false);
    return { x1, y1, x2, y2 };
  }

  // Compare wire-colored ink. Different fonts, grids and GOST title blocks
  // are visible in the original captures and excluded from the wire metric.
  function readTraces(image: ImageData, native: boolean) {
    const { data, height, width } = image;
    const area = native ? nativeDrawingArea(image) : { x1: 0, y1: 0, x2: width, y2: height };
    const points: Point[] = [];
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = area.y1; y < area.y2; y++) {
      for (let x = area.x1; x < area.x2; x++) {
        const i = (y * width + x) * 4;
        const [red, green, blue] = [data[i], data[i + 1], data[i + 2]];
        if (green < 75 || red < green * 0.9 || red > green * 1.15 || blue >= green * 0.8) continue;
        points.push({ x, y });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (!points.length) return [];
    const scale = 440 / Math.max(maxX - minX, maxY - minY, 1);
    return points.map(({ x, y }) => ({ x: (x - (minX + maxX) / 2) * scale, y: (y - (minY + maxY) / 2) * scale }));
  }

  function sameNativeView(a: ImageData, b: ImageData) {
    if (a.width !== b.width || a.height !== b.height) return false;
    const area = nativeDrawingArea(a);
    const hasInk = (data: Uint8ClampedArray, i: number) => Math.max(data[i], data[i + 1], data[i + 2]) >= 120;
    let overlap = 0, first = 0, second = 0;
    for (let y = area.y1; y < area.y2; y++) {
      for (let x = area.x1; x < area.x2; x++) {
        const i = (y * a.width + x) * 4;
        const inFirst = hasInk(a.data, i);
        const inSecond = hasInk(b.data, i);
        first += Number(inFirst);
        second += Number(inSecond);
        overlap += Number(inFirst && inSecond);
      }
    }
    return overlap / Math.max(1, first, second) >= 0.8;
  }

  const size = 512;
  const center = size / 2;
  const tolerance = 3;
  const identity = { scale: 1, x: 0, y: 0 };

  function indices(points: Point[], transform: Transform) {
    return points.map(point => {
      const x = Math.round(center + transform.x + point.x * transform.scale);
      const y = Math.round(center + transform.y + point.y * transform.scale);
      return x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1;
    });
  }

  function mask(points: number[], radius: number) {
    const pixels = new Uint8Array(size * size);
    for (const index of new Set(points)) {
      if (index < 0) continue;
      const x = index % size;
      const y = Math.floor(index / size);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius || x + dx < 0 || y + dy < 0 || x + dx >= size || y + dy >= size) continue;
          pixels[index + dy * size + dx] = 1;
        }
      }
    }
    return pixels;
  }

  function coverage(points: number[], near: Uint8Array) {
    return points.reduce((matched, i) => matched + (near[i] ?? 0), 0) / (points.length || 1);
  }

  // DipTrace draws connected pin stubs, labels and junction markers in yellow
  // too. Score the continuous horizontal and vertical runs as routed wires.
  function routePixels(pixels: Uint8Array) {
    const routes = new Set<number>();
    for (const vertical of [false, true]) {
      for (let row = 0; row < size; row++) {
        let start = 0;
        const index = (column: number) => vertical ? column * size + row : row * size + column;
        for (let column = 0; column <= size; column++) {
          if (column < size && pixels[index(column)]) continue;
          if (column - start >= 28) {
            for (let point = start; point < column; point++) routes.add(index(point));
          }
          start = column + 1;
        }
      }
    }
    return [...routes];
  }

  const [actualImage, expectedImage] = await Promise.all([decode(input.actual), decode(input.expected)]);
  const actual = readTraces(actualImage, false);
  const expected = indices(readTraces(expectedImage, true), identity);
  const nearExpected = mask(expected, tolerance);
  // Fit only uniform zoom and pan around the bounds estimate. Do not stretch either axis.
  const sample = actual.filter((_, i) => i % Math.max(1, Math.floor(actual.length / 2000)) === 0);
  let transform = identity;
  let best = coverage(indices(sample, transform), nearExpected);
  for (const step of [4, 2, 1]) {
    const base = transform;
    for (let y = -3; y <= 3; y++) {
      for (let x = -3; x <= 3; x++) {
        for (let s = -2; s <= 2; s++) {
          const candidate = { x: base.x + x * step, y: base.y + y * step, scale: base.scale + s * step / 200 };
          const score = coverage(indices(sample, candidate), nearExpected);
          if (score <= best) continue;
          transform = candidate;
          best = score;
        }
      }
    }
  }

  const aligned = indices(actual, transform);
  const nearActual = mask(aligned, tolerance);
  const actualMatch = coverage([...new Set(aligned)], nearExpected);
  const expectedMask = mask(expected, 0);
  const referenceMatch = coverage(routePixels(expectedMask), nearActual);

  const diff = document.createElement('canvas');
  diff.width = diff.height = size;
  const ctx = diff.getContext('2d')!;
  const overlay = ctx.createImageData(size, size);
  const actualMask = mask(aligned, 0);
  for (let i = 0; i < size * size; i++) {
    const j = i * 4;
    overlay.data[j] = expectedMask[i] && !nearActual[i] ? 255 : 0;
    overlay.data[j + 1] = (expectedMask[i] && nearActual[i]) || (actualMask[i] && nearExpected[i]) ? 200 : 0;
    overlay.data[j + 2] = actualMask[i] && !nearExpected[i] ? 255 : 0;
    overlay.data[j + 3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  return {
    actualMatch,
    referenceMatch,
    duplicate: input.lastSheet ? sameNativeView(expectedImage, await decode(input.lastSheet)) : false,
    diff: diff.toDataURL('image/png').split(',')[1]
  };
}
