import {
  clamp,
  formatLengthMeters,
  formatMicro,
  getCocAtDistance,
} from './optics.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      node.setAttribute(key, String(value));
    }
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function addDefs(svg) {
  const defs = svgEl('defs');

  const glow = svgEl('filter', {
    id: 'curveGlow',
    x: '-20%',
    y: '-30%',
    width: '140%',
    height: '160%',
  });
  glow.append(
    svgEl('feGaussianBlur', {
      stdDeviation: '3.2',
      result: 'blur',
    }),
  );
  const merge = svgEl('feMerge');
  merge.append(svgEl('feMergeNode', { in: 'blur' }));
  merge.append(svgEl('feMergeNode', { in: 'SourceGraphic' }));
  glow.append(merge);

  const depthGradient = svgEl('linearGradient', {
    id: 'dofGradient',
    x1: '0',
    x2: '1',
    y1: '0',
    y2: '0',
  });
  depthGradient.append(
    svgEl('stop', { offset: '0%', 'stop-color': '#6fe7d2', 'stop-opacity': '.16' }),
    svgEl('stop', { offset: '55%', 'stop-color': '#b7f36b', 'stop-opacity': '.24' }),
    svgEl('stop', { offset: '100%', 'stop-color': '#6fe7d2', 'stop-opacity': '.1' }),
  );

  const areaGradient = svgEl('linearGradient', {
    id: 'dofArea',
    x1: '0',
    x2: '0',
    y1: '0',
    y2: '1',
  });
  areaGradient.append(
    svgEl('stop', { offset: '0%', 'stop-color': '#6fe7d2', 'stop-opacity': '.1' }),
    svgEl('stop', { offset: '100%', 'stop-color': '#6fe7d2', 'stop-opacity': '0' }),
  );

  defs.append(glow, depthGradient, areaGradient);
  svg.append(defs);
}

const finiteLogMin = Math.log10(0.08);
const finiteLogMax = Math.log10(100);

function xForDistance(distance, xStart, xFiniteEnd, xEnd) {
  if (!Number.isFinite(distance)) return xEnd;
  const log = Math.log10(Math.max(0.08, Math.min(100, distance)));
  const t = (log - finiteLogMin) / (finiteLogMax - finiteLogMin);
  return xStart + t * (xFiniteEnd - xStart);
}

function niceLogTicks(min, max) {
  const base = [0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];
  return base.filter((value) => value >= min && value <= max);
}

function displaySvgWidth(svg, fallback = 640) {
  const parent = svg.parentElement;
  const width = parent ? parent.getBoundingClientRect().width : 0;
  return Math.max(300, Math.round(width || fallback));
}

export function drawDepthRuler(svg, calc) {
  if (!svg) return;
  const width = displaySvgWidth(svg, 760);
  const height = 142;
  clearSvg(svg);
  addDefs(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const xStart = 18;
  const xEnd = width - 20;
  const xFiniteEnd = xEnd - 38;
  const bandY = 50;
  const bandH = 26;
  const nearX = xForDistance(calc.nearMm / 1000, xStart, xFiniteEnd, xEnd);
  const farX = xForDistance(calc.farMm / 1000, xStart, xFiniteEnd, xEnd);
  const focusX = calc.focusInfinity
    ? xEnd
    : xForDistance(calc.focusDistanceM, xStart, xFiniteEnd, xEnd);
  const hyperX = xForDistance(calc.hyperfocalMm / 1000, xStart, xFiniteEnd, xEnd);

  // Base rail
  svg.append(
    svgEl('line', {
      x1: xStart,
      x2: xFiniteEnd,
      y1: bandY + bandH / 2,
      y2: bandY + bandH / 2,
      stroke: '#263339',
      'stroke-width': 8,
      'stroke-linecap': 'round',
    }),
    svgEl('line', {
      x1: xFiniteEnd + 8,
      x2: xEnd,
      y1: bandY + bandH / 2,
      y2: bandY + bandH / 2,
      stroke: '#263339',
      'stroke-width': 2,
      'stroke-dasharray': '2 5',
      'stroke-linecap': 'round',
    }),
  );

  // In-focus band
  if (farX > nearX) {
    svg.append(
      svgEl('rect', {
        x: nearX,
        y: bandY,
        width: Math.max(3, farX - nearX),
        height: bandH,
        rx: 7,
        fill: 'url(#dofGradient)',
        stroke: 'rgba(183,243,107,.35)',
        'stroke-width': 1,
      }),
    );
  }

  // Ticks
  const tickValues = [0.1, 0.3, 1, 3, 10, 30, 100];
  for (const value of tickValues) {
    const x = xForDistance(value, xStart, xFiniteEnd, xEnd);
    svg.append(
      svgEl('line', {
        x1: x,
        x2: x,
        y1: bandY + bandH + 6,
        y2: bandY + bandH + 11,
        stroke: '#405056',
        'stroke-width': 1,
      }),
    );
    svg.append(
      svgEl(
        'text',
        {
          x,
          y: bandY + bandH + 26,
          'text-anchor': 'middle',
          fill: '#6f8086',
          'font-size': 9.5,
          'font-family': 'Cascadia Code, Consolas, monospace',
        },
        `${value}m`,
      ),
    );
  }
  svg.append(
    svgEl('line', {
      x1: xEnd,
      x2: xEnd,
      y1: bandY + bandH + 6,
      y2: bandY + bandH + 11,
      stroke: '#405056',
      'stroke-width': 1,
    }),
    svgEl(
      'text',
      {
        x: xEnd,
        y: bandY + bandH + 26,
        'text-anchor': 'middle',
        fill: '#92a1a4',
        'font-size': 13,
        'font-family': 'Cascadia Code, Consolas, monospace',
      },
      '∞',
    ),
  );

  // Hyperfocal hint
  if (calc.hyperfocalMm / 1000 <= 100) {
    svg.append(
      svgEl('line', {
        x1: hyperX,
        x2: hyperX,
        y1: bandY + bandH + 1,
        y2: bandY + bandH + 5,
        stroke: '#829096',
        'stroke-width': 1,
        'stroke-dasharray': '2 2',
      }),
      svgEl(
        'text',
        {
          x: hyperX,
          y: 38,
          'text-anchor': 'middle',
          fill: '#7e8d92',
          'font-size': 8.5,
          'font-family': 'Cascadia Code, Consolas, monospace',
        },
        'H',
      ),
      svgEl('line', {
        x1: hyperX,
        x2: hyperX,
        y1: 41,
        y2: bandY - 2,
        stroke: '#536166',
        'stroke-width': 1,
        'stroke-dasharray': '2 3',
      }),
    );
  }

  // Near / far caps
  const cap = (x, color) =>
    svgEl('line', {
      x1: x,
      x2: x,
      y1: bandY - 3,
      y2: bandY + bandH + 3,
      stroke: color,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
  svg.append(cap(nearX, '#b7f36b'), cap(farX, '#b7f36b'));

  // Focus marker
  svg.append(
    svgEl('line', {
      x1: focusX,
      x2: focusX,
      y1: 14,
      y2: bandY - 4,
      stroke: '#ffb56b',
      'stroke-width': 1,
    }),
    svgEl('circle', {
      cx: focusX,
      cy: bandY - 6,
      r: 4,
      fill: '#10181a',
      stroke: '#ffb56b',
      'stroke-width': 1.5,
    }),
    svgEl('circle', {
      cx: focusX,
      cy: bandY - 6,
      r: 1.4,
      fill: '#ffb56b',
    }),
    svgEl(
      'text',
      {
        x: focusX,
        y: 10,
        'text-anchor': 'middle',
        fill: '#ffb56b',
        'font-size': 8.5,
        'font-family': 'Cascadia Code, Consolas, monospace',
      },
      calc.focusInfinity ? '∞' : 'FOCUS',
    ),
  );

  svg.setAttribute(
    'aria-label',
    `景深范围：近界 ${formatLengthMeters(calc.nearMm / 1000)}，远界 ${formatLengthMeters(calc.farMm / 1000)}，对焦 ${calc.focusInfinity ? '无穷远' : formatLengthMeters(calc.focusDistanceM)}。`,
  );
}

export function drawBlurChart(svg, tooltip, calc) {
  if (!svg) return;
  const width = displaySvgWidth(svg, 680);
  const height = 302;
  clearSvg(svg);
  addDefs(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const margin = { left: 45, right: 16, top: 18, bottom: 34 };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const xMin = 0.08;
  const xMax = 100;
  const logMin = Math.log10(xMin);
  const logMax = Math.log10(xMax);

  const samples = [];
  let maxBlur = 0;
  for (let i = 0; i <= 320; i += 1) {
    const t = i / 320;
    const distance = Math.pow(10, logMin + (logMax - logMin) * t);
    const blurUm = getCocAtDistance(calc, distance) * 1000;
    maxBlur = Math.max(maxBlur, blurUm);
    samples.push({ distance, blurUm });
  }

  const yMin = Math.min(0.2, calc.cocThresholdUm / 4, calc.airyUm / 4);
  const yMax = Math.min(
    30000,
    Math.max(
      30,
      calc.cocThresholdUm * 6,
      calc.airyUm * 6,
      maxBlur * 1.35,
    ),
  );

  const xScale = (distance) =>
    margin.left +
    ((Math.log10(Math.max(xMin, Math.min(xMax, distance))) - logMin) /
      (logMax - logMin)) *
      plotW;
  const yScale = (value) =>
    margin.top +
    plotH -
    ((Math.log10(Math.max(yMin, Math.min(yMax, value))) - Math.log10(yMin)) /
      (Math.log10(yMax) - Math.log10(yMin))) *
      plotH;

  // Plot background
  svg.append(
    svgEl('rect', {
      x: margin.left,
      y: margin.top,
      width: plotW,
      height: plotH,
      fill: '#0b1214',
      rx: 4,
    }),
  );

  // Grid
  const yTicks = niceLogTicks(yMin, yMax);
  for (const tick of yTicks) {
    const y = yScale(tick);
    svg.append(
      svgEl('line', {
        x1: margin.left,
        x2: margin.left + plotW,
        y1: y,
        y2: y,
        stroke: 'rgba(255,255,255,.055)',
        'stroke-width': 1,
      }),
      svgEl(
        'text',
        {
          x: margin.left - 9,
          y: y + 3.5,
          'text-anchor': 'end',
          fill: '#6d7c82',
          'font-size': 9,
          'font-family': 'Cascadia Code, Consolas, monospace',
        },
        tick >= 1000 ? `${tick / 1000}k` : String(tick),
      ),
    );
  }

  for (const tick of [0.1, 0.3, 1, 3, 10, 30, 100]) {
    const x = xScale(tick);
    svg.append(
      svgEl('line', {
        x1: x,
        x2: x,
        y1: margin.top,
        y2: margin.top + plotH,
        stroke: 'rgba(255,255,255,.045)',
        'stroke-width': 1,
      }),
      svgEl(
        'text',
        {
          x,
          y: margin.top + plotH + 20,
          'text-anchor': 'middle',
          fill: '#6d7c82',
          'font-size': 9,
          'font-family': 'Cascadia Code, Consolas, monospace',
        },
        tick === 100 ? '100m' : `${tick}`,
      ),
    );
  }

  // In-focus column
  const nearClamped = Math.max(xMin, Math.min(xMax, calc.nearMm / 1000));
  const farMeters = calc.farMm / 1000;
  const farClamped = Number.isFinite(farMeters) ? Math.min(xMax, farMeters) : xMax;
  if (farClamped > nearClamped) {
    svg.append(
      svgEl('rect', {
        x: xScale(nearClamped),
        y: margin.top,
        width: Math.max(1, xScale(farClamped) - xScale(nearClamped)),
        height: plotH,
        fill: 'url(#dofArea)',
      }),
    );
  }

  // Threshold and diffraction lines
  const thresholdY = yScale(calc.cocThresholdUm);
  const airyY = yScale(calc.airyUm);
  const thresholdLine = svgEl('line', {
    x1: margin.left,
    x2: margin.left + plotW,
    y1: thresholdY,
    y2: thresholdY,
    stroke: '#77e7d2',
    'stroke-width': 1.2,
    'stroke-dasharray': '5 4',
    opacity: '.9',
  });
  const airyLine = svgEl('line', {
    x1: margin.left,
    x2: margin.left + plotW,
    y1: airyY,
    y2: airyY,
    stroke: '#ff7ab2',
    'stroke-width': 1,
    'stroke-dasharray': '1.5 4',
    opacity: '.75',
  });
  svg.append(thresholdLine, airyLine);

  // Focus marker
  if (!calc.focusInfinity && calc.focusDistanceM >= xMin && calc.focusDistanceM <= xMax) {
    const focusX = xScale(calc.focusDistanceM);
    svg.append(
      svgEl('line', {
        x1: focusX,
        x2: focusX,
        y1: margin.top,
        y2: margin.top + plotH,
        stroke: 'rgba(255,181,107,.35)',
        'stroke-width': 1,
        'stroke-dasharray': '2 4',
      }),
      svgEl(
        'text',
        {
          x: Math.min(margin.left + plotW - 3, focusX + 5),
          y: margin.top + 11,
          fill: '#ffb56b',
          'font-size': 8.5,
          'font-family': 'Cascadia Code, Consolas, monospace',
        },
        `s ${formatLengthMeters(calc.focusDistanceM)}`,
      ),
    );
  }

  // Curve, broken at the focus point where the blur reaches zero.
  let path = '';
  let drawing = false;
  for (const sample of samples) {
    if (sample.blurUm <= yMin * 0.9) {
      drawing = false;
      continue;
    }
    const x = xScale(sample.distance);
    const y = yScale(sample.blurUm);
    path += `${drawing ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
    drawing = true;
  }
  svg.append(
    svgEl('path', {
      d: path,
      fill: 'none',
      stroke: 'rgba(255,181,107,.35)',
      'stroke-width': 5,
      'stroke-linecap': 'round',
      filter: 'url(#curveGlow)',
    }),
    svgEl('path', {
      d: path,
      fill: 'none',
      stroke: '#ffb56b',
      'stroke-width': 1.8,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }),
  );

  // Crossings
  const nearX = xScale(calc.nearMm / 1000);
  if (calc.nearMm / 1000 >= xMin && calc.nearMm / 1000 <= xMax) {
    svg.append(
      svgEl('circle', {
        cx: nearX,
        cy: thresholdY,
        r: 3.2,
        fill: '#10181a',
        stroke: '#b7f36b',
        'stroke-width': 1.5,
      }),
    );
  }
  if (Number.isFinite(farMeters) && farMeters <= xMax) {
    svg.append(
      svgEl('circle', {
        cx: xScale(farMeters),
        cy: thresholdY,
        r: 3.2,
        fill: '#10181a',
        stroke: '#b7f36b',
        'stroke-width': 1.5,
      }),
    );
  }

  // Axis titles
  svg.append(
    svgEl(
      'text',
      {
        x: margin.left,
        y: 12,
        fill: '#526267',
        'font-size': 8.5,
        'font-family': 'Cascadia Code, Consolas, monospace',
      },
      'BLUR Ø (µm) · LOG',
    ),
    svgEl(
      'text',
      {
        x: margin.left + plotW,
        y: height - 5,
        'text-anchor': 'end',
        fill: '#526267',
        'font-size': 8.5,
        'font-family': 'Cascadia Code, Consolas, monospace',
      },
      'DISTANCE (m) · LOG',
    ),
  );

  // Hover layer
  const hoverGroup = svgEl('g', { opacity: '0', 'pointer-events': 'none' });
  const hoverLine = svgEl('line', {
    y1: margin.top,
    y2: margin.top + plotH,
    stroke: 'rgba(255,255,255,.3)',
    'stroke-width': 1,
    'stroke-dasharray': '3 3',
  });
  const hoverDot = svgEl('circle', {
    r: 4,
    fill: '#10181a',
    stroke: '#fff',
    'stroke-width': 1.5,
  });
  hoverGroup.append(hoverLine, hoverDot);
  svg.append(hoverGroup);

  const hideTooltip = () => {
    hoverGroup.setAttribute('opacity', '0');
    if (tooltip) tooltip.classList.remove('is-visible');
  };

  svg.onpointermove = (event) => {
    const rect = svg.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * width;
    if (pointerX < margin.left || pointerX > margin.left + plotW) {
      hideTooltip();
      return;
    }
    const ratio = (pointerX - margin.left) / plotW;
    const distance = Math.pow(10, logMin + (logMax - logMin) * ratio);
    const blurUm = getCocAtDistance(calc, distance) * 1000;
    const x = xScale(distance);
    const y = yScale(Math.max(blurUm, yMin * 1.05));
    hoverLine.setAttribute('x1', x);
    hoverLine.setAttribute('x2', x);
    hoverDot.setAttribute('cx', x);
    hoverDot.setAttribute('cy', y);
    hoverGroup.setAttribute('opacity', '1');

    if (tooltip) {
      const ratioToThreshold = blurUm / calc.cocThresholdUm;
      tooltip.innerHTML = `
        <div class="tip-eyebrow">OBJECT DISTANCE</div>
        <div class="tip-distance">${formatLengthMeters(distance)}</div>
        <div class="tip-row"><span>几何弥散</span><b>${formatMicro(blurUm)}</b></div>
        <div class="tip-row"><span>相对判据</span><b>${ratioToThreshold >= 0.1 ? ratioToThreshold.toFixed(1) : ratioToThreshold.toFixed(2)}×</b></div>
        <div class="tip-caption">${blurUm <= calc.cocThresholdUm ? '在允许范围内' : '超过允许 CoC'}</div>
      `;
      const wrap = svg.closest('.chart-wrap');
      if (wrap) {
        const wrapRect = wrap.getBoundingClientRect();
        const localX = event.clientX - wrapRect.left;
        const localY = event.clientY - wrapRect.top;
        tooltip.style.left = `${Math.min(wrapRect.width - 150, Math.max(8, localX + 14))}px`;
        tooltip.style.top = `${Math.max(8, localY - 96)}px`;
      }
      tooltip.classList.add('is-visible');
    }
  };
  svg.onpointerleave = hideTooltip;

  svg.setAttribute(
    'aria-label',
    `弥散圆随物距变化曲线。当前允许 CoC 为 ${calc.cocThresholdUm.toFixed(2)} 微米，衍射斑为 ${calc.airyUm.toFixed(2)} 微米。`,
  );
}

/* ------------------------------------------------------------------ */
/* Textbook-style optical path                                        */
/* ------------------------------------------------------------------ */

function rayText(svg, x, y, text, options = {}) {
  const {
    fill = '#8b9a9d',
    size = 9,
    anchor = 'middle',
    weight = 400,
    opacity = 1,
    halo = true,
    letterSpacing = '0',
  } = options;
  const attrs = {
    x,
    y,
    fill,
    'font-size': size,
    'font-family': 'Cascadia Code, Consolas, monospace',
    'font-weight': weight,
    'text-anchor': anchor,
    opacity,
    'letter-spacing': letterSpacing,
  };
  if (halo) {
    attrs.stroke = '#061012';
    attrs['stroke-width'] = 3;
    attrs['paint-order'] = 'stroke';
    attrs['stroke-linejoin'] = 'round';
    attrs['stroke-linecap'] = 'round';
  }
  const node = svgEl('text', attrs, text);
  svg.append(node);
  return node;
}

function rayDimension(
  svg,
  x1,
  x2,
  y,
  label,
  color = '#637277',
  { above = true, size = 8.3, opacity = 0.95, ticks = true } = {},
) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  if (right - left < 1) return;
  svg.append(
    svgEl('line', {
      x1: left,
      x2: right,
      y1: y,
      y2: y,
      stroke: color,
      'stroke-width': 0.8,
      opacity,
    }),
  );
  if (ticks) {
    for (const x of [left, right]) {
      svg.append(
        svgEl('line', {
          x1: x,
          x2: x,
          y1: y - 4,
          y2: y + 4,
          stroke: color,
          'stroke-width': 0.9,
          opacity,
        }),
      );
    }
  }
  rayText(svg, (left + right) / 2, y + (above ? -5 : 11), label, {
    fill: color,
    size,
    opacity,
    halo: true,
  });
}

export function drawRayDiagram(svg, calc) {
  if (!svg) return;
  const width = Math.max(
    880,
    Math.round(svg.parentElement?.clientWidth || 960),
  );
  const height = 468;
  clearSvg(svg);
  addDefs(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const defs = svg.querySelector('defs');
  const lensGradient = svgEl('linearGradient', {
    id: 'lensFill',
    x1: '0',
    x2: '1',
    y1: '0',
    y2: '0',
  });
  lensGradient.append(
    svgEl('stop', { offset: '0%', 'stop-color': '#183133' }),
    svgEl('stop', { offset: '35%', 'stop-color': '#a9c2b7', 'stop-opacity': '.88' }),
    svgEl('stop', { offset: '50%', 'stop-color': '#d7e6d8', 'stop-opacity': '.7' }),
    svgEl('stop', { offset: '66%', 'stop-color': '#849f95', 'stop-opacity': '.78' }),
    svgEl('stop', { offset: '100%', 'stop-color': '#122426' }),
  );
  const insetGradient = svgEl('linearGradient', {
    id: 'insetBg',
    x1: '0',
    x2: '0',
    y1: '0',
    y2: '1',
  });
  insetGradient.append(
    svgEl('stop', { offset: '0%', 'stop-color': '#0d1719', 'stop-opacity': '.96' }),
    svgEl('stop', { offset: '100%', 'stop-color': '#070d0f', 'stop-opacity': '.96' }),
  );
  defs.append(lensGradient, insetGradient);

  const colors = {
    axis: 'rgba(255,255,255,.16)',
    focus: '#b7f36b',
    near: '#6fe7d2',
    far: '#ff7ab2',
    sensor: '#e6efe3',
    muted: '#69787d',
    dim: '#4b595d',
  };

  const xLens = Math.round(width * 0.53);
  const xSensor = width - 260;
  const yAxis = 216;
  const lensHalf = 107;
  const apertureHalf = 84;
  const vSensor = xSensor - xLens;

  const nearM = calc.nearMm / 1000;
  const farM = calc.farMm / 1000;
  const focusM = calc.focusDistanceM;
  const farFinite = Number.isFinite(farM);

  let xFocus;
  let xNear;
  let xFar;

  if (calc.focusInfinity) {
    xFocus = 64;
    xFar = 64;
    xNear = Math.max(xFocus + 150, xLens - 180);
  } else {
    xFocus = xLens - 238;
    const front = Math.max(0.0001, focusM - nearM);
    if (farFinite) {
      const back = Math.max(0.0001, farM - focusM);
      const total = front + back;
      const span = clamp(
        70 + 85 * Math.log10(1 + (total / Math.max(0.1, focusM)) * 8),
        70,
        150,
      );
      xNear = xFocus + span * (front / total);
      xFar = xFocus - span * (back / total);
    } else {
      xNear = xFocus + 55;
      xFar = 64;
    }
  }

  xNear = clamp(xNear, xFocus + 18, xLens - 52);
  xFar = clamp(xFar, 58, xFocus - 18);
  if (calc.focusInfinity) {
    xFar = xFocus;
  }

  // Visual CoC radius. It is intentionally non-linear and magnified.
  const cocNorm = clamp(
    (Math.log10(Math.max(0.1, calc.cocThresholdUm)) - Math.log10(0.3)) /
      (Math.log10(60) - Math.log10(0.3)),
    0,
    1,
  );
  const cocRadius = 5 + cocNorm * 20;
  const farRadius = farFinite
    ? cocRadius
    : Math.max(
        0.8,
        cocRadius *
          clamp(calc.infinityBlurMm / Math.max(0.000001, calc.cocThresholdMm), 0, 1),
      );
  const nearImageX =
    xLens + (apertureHalf * vSensor) / (apertureHalf - cocRadius);
  const farImageX =
    xLens + (apertureHalf * vSensor) / (apertureHalf + farRadius);

  const imageDistance = Number.isFinite(calc.focusMm)
    ? (calc.focalMm * calc.focusMm) / (calc.focusMm - calc.focalMm)
    : calc.focalMm;
  const nearImageDistance =
    (calc.focalMm * calc.nearMm) / (calc.nearMm - calc.focalMm);
  const farImageDistance = farFinite
    ? (calc.focalMm * calc.farMm) / (calc.farMm - calc.focalMm)
    : calc.focalMm;
  const frontFocusMm = Math.max(0, imageDistance - farImageDistance);
  const backFocusMm = Math.max(0, nearImageDistance - imageDistance);

  // Backdrop zones and object-side focus region.
  svg.append(
    svgEl('rect', {
      x: xFar,
      y: 105,
      width: Math.max(1, xNear - xFar),
      height: 188,
      rx: 5,
      fill: 'rgba(183,243,107,.035)',
      stroke: 'rgba(183,243,107,.08)',
      'stroke-width': 1,
    }),
  );

  // Optical axis
  svg.append(
    svgEl('line', {
      x1: 28,
      x2: width - 22,
      y1: yAxis,
      y2: yAxis,
      stroke: colors.axis,
      'stroke-width': 1,
      'stroke-dasharray': '2 5',
    }),
  );
  rayText(svg, 30, 23, '物方 / OBJECT', {
    fill: colors.dim,
    size: 7,
    anchor: 'start',
    letterSpacing: '.13em',
    halo: false,
  });
  rayText(svg, xLens + 25, 23, '像方 / IMAGE', {
    fill: colors.dim,
    size: 7.5,
    anchor: 'start',
    letterSpacing: '.13em',
    halo: false,
  });

  // Depth-of-field bracket along the top
  rayDimension(
    svg,
    xFar,
    xNear,
    43,
    `景深 ΔL ${formatLengthMeters(calc.totalDofMm / 1000)}`,
    colors.focus,
    { size: 9.2, opacity: 1 },
  );

  // Object planes and labels
  const farY = 64;
  const focusY = 80;
  let nearY = 64;
  if (xNear - xFocus < 48 || xNear - xFar < 56) nearY = 95;

  const drawPlane = (x, color, label, labelY, dashed = true) => {
    svg.append(
      svgEl('line', {
        x1: x,
        x2: x,
        y1: 104,
        y2: 294,
        stroke: color,
        'stroke-width': 1,
        'stroke-dasharray': dashed ? '3 4' : undefined,
        opacity: 0.8,
      }),
      svgEl('circle', {
        cx: x,
        cy: 104,
        r: 2.2,
        fill: color,
        opacity: 0.8,
      }),
    );
    rayText(svg, x, labelY, label, {
      fill: color,
      size: 9.2,
      opacity: 1,
    });
  };

  if (calc.focusInfinity) {
    drawPlane(xFar, colors.far, '远点', farY);
    drawPlane(
      xFocus,
      colors.focus,
      '对焦 ∞',
      xFocus === xFar ? focusY : farY,
    );
  } else {
    drawPlane(xFar, colors.far, farFinite ? '远点' : '远点 ∞', farY);
    drawPlane(
      xFocus,
      colors.focus,
      '对焦平面',
      xFocus - xFar < 58 ? focusY : farY,
    );
  }
  drawPlane(xNear, colors.near, '近点', nearY);

  // Front and rear depth brackets.
  if (!calc.focusInfinity) {
    rayDimension(
      svg,
      xFar,
      xFocus,
      309,
      `后景深 ΔL2 ${farFinite ? formatLengthMeters((farM - focusM)) : '∞'}`,
      colors.far,
      { above: true, size: 8.2 },
    );
  }
  rayDimension(
    svg,
    xFocus,
    xNear,
    333,
    `前景深 ΔL1 ${formatLengthMeters(focusM - nearM)}`,
    colors.near,
    { above: true, size: 8.2 },
  );

  // Lens body
  const lensPath = `M ${xLens} ${yAxis - lensHalf} C ${xLens - 25} ${yAxis - lensHalf * 0.55}, ${xLens - 25} ${yAxis + lensHalf * 0.55}, ${xLens} ${yAxis + lensHalf} C ${xLens + 25} ${yAxis + lensHalf * 0.55}, ${xLens + 25} ${yAxis - lensHalf * 0.55}, ${xLens} ${yAxis - lensHalf} Z`;
  svg.append(
    svgEl('path', {
      d: lensPath,
      fill: 'url(#lensFill)',
      stroke: 'rgba(193,232,210,.5)',
      'stroke-width': 1,
    }),
  );
  // Aperture limits
  for (const sign of [-1, 1]) {
    svg.append(
      svgEl('line', {
        x1: xLens - 7,
        x2: xLens + 7,
        y1: yAxis + sign * apertureHalf,
        y2: yAxis + sign * apertureHalf,
        stroke: 'rgba(230,255,236,.5)',
        'stroke-width': 1,
      }),
    );
  }
  rayText(svg, xLens, 104, `f ${calc.focalMm.toFixed(2)} mm · N ${calc.aperture}`, {
    fill: '#c0cfc3',
    size: 8.7,
    opacity: 1,
  });

  // Object-side ray bundles
  const objectRay = (xObject, color, opacity) => {
    if (!Number.isFinite(xObject)) return;
    for (const sign of [-1, 1]) {
      svg.append(
        svgEl('line', {
          x1: xObject,
          x2: xLens,
          y1: yAxis,
          y2: yAxis + sign * apertureHalf,
          stroke: color,
          'stroke-width': 0.85,
          opacity,
        }),
      );
    }
  };

  const infinityOffset = apertureHalf * 0.52;
  if (calc.focusInfinity) {
    // Parallel bundle from infinity.
    for (const sign of [-1, 1]) {
      svg.append(
        svgEl('line', {
          x1: 28,
          x2: xLens,
          y1: yAxis + sign * infinityOffset,
          y2: yAxis + sign * infinityOffset,
          stroke: colors.focus,
          'stroke-width': 1.05,
          opacity: 0.58,
        }),
      );
    }
  } else {
    objectRay(xFocus, colors.focus, 0.5);
  }
  objectRay(xNear, colors.near, 0.44);
  if (!calc.focusInfinity) objectRay(xFar, colors.far, 0.4);

  // Image-side cones
  svg.append(
    svgEl('path', {
      d: `M ${xLens} ${yAxis - apertureHalf} L ${xLens} ${yAxis + apertureHalf} L ${nearImageX} ${yAxis} Z`,
      fill: 'rgba(111,231,210,.055)',
    }),
    svgEl('path', {
      d: `M ${xLens} ${yAxis - apertureHalf} L ${xLens} ${yAxis + apertureHalf} L ${farImageX} ${yAxis} Z`,
      fill: 'rgba(255,122,178,.05)',
    }),
  );

  // Focus rays
  for (const sign of [-1, 1]) {
    const sourceOffset = calc.focusInfinity ? infinityOffset : apertureHalf;
    svg.append(
      svgEl('line', {
        x1: xLens,
        x2: xSensor,
        y1: yAxis + sign * sourceOffset,
        y2: yAxis,
        stroke: colors.focus,
        'stroke-width': 1.25,
        opacity: 0.84,
      }),
    );
  }

  // Near point rays: converge behind the sensor.
  for (const sign of [-1, 1]) {
    svg.append(
      svgEl('line', {
        x1: xLens,
        x2: nearImageX,
        y1: yAxis + sign * apertureHalf,
        y2: yAxis,
        stroke: colors.near,
        'stroke-width': 1.05,
        opacity: 0.72,
      }),
    );
  }

  // Far point rays: converge before the sensor and diverge again.
  if (!calc.focusInfinity) {
    for (const sign of [-1, 1]) {
      svg.append(
        svgEl('line', {
          x1: xLens,
          x2: xSensor,
          y1: yAxis + sign * apertureHalf,
          y2: yAxis - sign * farRadius,
          stroke: colors.far,
          'stroke-width': 1.05,
          opacity: 0.68,
        }),
      );
    }
  }

  // Image-side points
  const pointMarker = (x, color) => {
    svg.append(
      svgEl('circle', {
        cx: x,
        cy: yAxis,
        r: 2,
        fill: '#081113',
        stroke: color,
        'stroke-width': 1,
      }),
    );
  };
  pointMarker(nearImageX, colors.near);
  if (!calc.focusInfinity) pointMarker(farImageX, colors.far);

  // Sensor plane
  svg.append(
    svgEl('line', {
      x1: xSensor,
      x2: xSensor,
      y1: yAxis - 118,
      y2: yAxis + 100,
      stroke: colors.sensor,
      'stroke-width': 2,
      opacity: 0.92,
    }),
    svgEl('line', {
      x1: xSensor,
      x2: xSensor,
      y1: yAxis - 118,
      y2: yAxis + 100,
      stroke: 'rgba(230,255,236,.16)',
      'stroke-width': 7,
      opacity: 0.5,
    }),
  );
  rayText(svg, xSensor + 8, 134, '像面 / 焦平面', {
    fill: '#b8c7c0',
    size: 8.7,
    anchor: 'start',
  });

  // Total depth of focus
  rayDimension(
    svg,
    farImageX,
    nearImageX,
    160,
    `焦深 ${formatMicro((frontFocusMm + backFocusMm) * 1000)}`,
    '#9bb0ad',
    { size: 8.3, opacity: 0.95 },
  );

  // CoC disk at image plane
  svg.append(
    svgEl('circle', {
      cx: xSensor,
      cy: yAxis,
      r: cocRadius,
      fill: 'rgba(183,243,107,.13)',
      stroke: '#b7f36b',
      'stroke-width': 1.3,
    }),
  );
  rayText(svg, xSensor + 14, yAxis - cocRadius - 8, `允许 δ ${formatMicro(calc.cocThresholdUm)}`, {
    fill: colors.focus,
    size: 9.2,
    anchor: 'start',
  });

  // Short image-point captions, staggered to avoid overlap.
  if (!calc.focusInfinity) {
    rayText(svg, farImageX, yAxis + 20, '远点像', {
      fill: colors.far,
      size: 8,
      opacity: 0.95,
    });
  }
  rayText(svg, nearImageX, yAxis + 36, '近点像', {
    fill: colors.near,
    size: 8,
    opacity: 0.95,
  });

  // Image distance
  rayDimension(
    svg,
    xLens,
    xSensor,
    356,
    `像距 ${imageDistance.toFixed(2)} mm`,
    '#9baaac',
    { above: true, size: 8.3 },
  );

  // Object distance dimensions
  rayDimension(
    svg,
    xNear,
    xLens,
    394,
    `近点距离 ${formatLengthMeters(nearM)}`,
    '#8da2a4',
    { above: true, size: 8.3 },
  );
  rayDimension(
    svg,
    xFocus,
    xLens,
    422,
    `被摄体距离 ${formatLengthMeters(focusM)}`,
    '#8da2a4',
    { above: true, size: 8.3 },
  );
  rayDimension(
    svg,
    xFar,
    xLens,
    450,
    `远点距离 ${farFinite ? formatLengthMeters(farM) : '∞'}`,
    '#8da2a4',
    { above: true, size: 8.3 },
  );

  // Bottom-right sensor spot inset
  const insetW = 190;
  const insetH = 160;
  const insetX = width - insetW - 16;
  const insetY = 282;
  const cx = insetX + insetW / 2;
  const cy = insetY + 72;
  const maxDisk = Math.max(
    calc.backgroundBlurUm,
    calc.cocThresholdUm,
    calc.pixelPitchMm * 2000,
    2,
  );
  const maxRadius = 36;
  const bgRadius = Math.max(
    0.8,
    (calc.backgroundBlurUm / maxDisk) * maxRadius,
  );
  const allowedRadius = Math.max(
    1.2,
    (calc.cocThresholdUm / maxDisk) * maxRadius,
  );

  svg.append(
    svgEl('rect', {
      x: insetX,
      y: insetY,
      width: insetW,
      height: insetH,
      rx: 9,
      fill: 'url(#insetBg)',
      stroke: 'rgba(255,255,255,.12)',
      'stroke-width': 1,
    }),
    svgEl('rect', {
      x: insetX + 8,
      y: insetY + 8,
      width: insetW - 16,
      height: insetH - 16,
      rx: 6,
      fill: 'none',
      stroke: 'rgba(255,255,255,.045)',
      'stroke-width': 1,
    }),
  );
  rayText(svg, insetX + 12, insetY + 20, 'SENSOR SPOT / 像面光斑', {
    fill: '#a3b3b5',
    size: 7.8,
    anchor: 'start',
    letterSpacing: '.05em',
  });
  rayText(svg, insetX + insetW - 12, insetY + 20, '独立比例', {
    fill: colors.dim,
    size: 7,
    anchor: 'end',
  });
  svg.append(
    svgEl('line', {
      x1: cx - maxRadius - 8,
      x2: cx + maxRadius + 8,
      y1: cy,
      y2: cy,
      stroke: 'rgba(255,255,255,.07)',
      'stroke-width': 1,
    }),
    svgEl('line', {
      x1: cx,
      x2: cx,
      y1: cy - maxRadius - 8,
      y2: cy + maxRadius + 8,
      stroke: 'rgba(255,255,255,.07)',
      'stroke-width': 1,
    }),
    svgEl('circle', {
      cx,
      cy,
      r: maxRadius,
      fill: 'none',
      stroke: 'rgba(255,255,255,.08)',
      'stroke-width': 1,
      'stroke-dasharray': '2 4',
    }),
    svgEl('circle', {
      cx,
      cy,
      r: bgRadius,
      fill: 'rgba(255,181,107,.15)',
      stroke: '#ffb56b',
      'stroke-width': 1,
    }),
    svgEl('circle', {
      cx,
      cy,
      r: allowedRadius,
      fill: 'none',
      stroke: colors.focus,
      'stroke-width': 1.2,
      'stroke-dasharray': '3 3',
    }),
    svgEl('circle', {
      cx,
      cy,
      r: 1.2,
      fill: 'rgba(255,255,255,.65)',
    }),
  );
  rayText(svg, insetX + 12, insetY + 128, '允许 δ', {
    fill: colors.focus,
    size: 7.8,
    anchor: 'start',
    halo: false,
  });
  rayText(svg, insetX + insetW - 12, insetY + 128, formatMicro(calc.cocThresholdUm), {
    fill: '#d8ffc1',
    size: 9,
    anchor: 'end',
    halo: false,
  });
  rayText(svg, insetX + 12, insetY + 144, '背景 @8m', {
    fill: '#ffb56b',
    size: 7.8,
    anchor: 'start',
    halo: false,
  });
  rayText(svg, insetX + insetW - 12, insetY + 144, formatMicro(calc.backgroundBlurUm), {
    fill: '#ffd1a4',
    size: 9,
    anchor: 'end',
    halo: false,
  });

  svg.setAttribute(
    'aria-label',
    `光路示意：近点 ${formatLengthMeters(nearM)}，对焦距离 ${calc.focusInfinity ? '无穷远' : formatLengthMeters(focusM)}，远点 ${farFinite ? formatLengthMeters(farM) : '无穷远'}。允许弥散圆 ${formatMicro(calc.cocThresholdUm)}，8 米背景弥散 ${formatMicro(calc.backgroundBlurUm)}。`,
  );
}

export function drawCircleScale(svg, calc) {
  if (!svg) return;
  const width = displaySvgWidth(svg, 360);
  const height = 264;
  clearSvg(svg);
  addDefs(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const cx = width / 2;
  const cy = height / 2 + 2;
  const maxRadius = Math.min(104, width * 0.34);
  const maxDiameter = Math.max(
    calc.cocThresholdUm,
    calc.airyUm,
    calc.pixelPitchMm * 2000,
    6,
  ) * 1.16;

  const radiusFor = (diameterUm) =>
    Math.max(1.5, (diameterUm / maxDiameter) * maxRadius);

  // Decorative scale frame
  svg.append(
    svgEl('circle', {
      cx,
      cy,
      r: maxRadius,
      fill: 'none',
      stroke: 'rgba(255,255,255,.1)',
      'stroke-width': 1,
      'stroke-dasharray': '2 5',
    }),
  );

  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * Math.PI * 2;
    const inner = maxRadius + 4;
    const outer = maxRadius + (i % 9 === 0 ? 9 : 5);
    svg.append(
      svgEl('line', {
        x1: cx + Math.cos(angle) * inner,
        y1: cy + Math.sin(angle) * inner,
        x2: cx + Math.cos(angle) * outer,
        y2: cy + Math.sin(angle) * outer,
        stroke: i % 9 === 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)',
        'stroke-width': 1,
      }),
    );
  }

  // Crosshair
  svg.append(
    svgEl('line', {
      x1: cx - maxRadius - 12,
      x2: cx + maxRadius + 12,
      y1: cy,
      y2: cy,
      stroke: 'rgba(255,255,255,.07)',
      'stroke-width': 1,
    }),
    svgEl('line', {
      x1: cx,
      x2: cx,
      y1: cy - maxRadius - 12,
      y2: cy + maxRadius + 12,
      stroke: 'rgba(255,255,255,.07)',
      'stroke-width': 1,
    }),
  );

  // 1 px reference
  const pixelRadius = radiusFor(calc.pixelPitchMm * 1000);
  svg.append(
    svgEl('circle', {
      cx,
      cy,
      r: pixelRadius,
      fill: 'rgba(121,212,255,.04)',
      stroke: 'rgba(121,212,255,.35)',
      'stroke-width': 1,
      'stroke-dasharray': '1 2',
    }),
  );

  // 2 px sampling limit
  svg.append(
    svgEl('circle', {
      cx,
      cy,
      r: radiusFor(calc.pixelPitchMm * 2000),
      fill: 'none',
      stroke: '#79d4ff',
      'stroke-width': 1.2,
      'stroke-dasharray': '4 4',
    }),
  );

  // Airy disk
  svg.append(
    svgEl('circle', {
      cx,
      cy,
      r: radiusFor(calc.airyUm),
      fill: 'rgba(255,122,178,.035)',
      stroke: '#ff7ab2',
      'stroke-width': 1.2,
      'stroke-dasharray': '1.5 3.5',
    }),
  );

  // Allowed CoC
  svg.append(
    svgEl('circle', {
      cx,
      cy,
      r: radiusFor(calc.cocThresholdUm),
      fill: 'rgba(183,243,107,.09)',
      stroke: '#b7f36b',
      'stroke-width': 1.8,
    }),
    svgEl('circle', {
      cx,
      cy,
      r: 1.8,
      fill: '#b7f36b',
    }),
  );

  svg.append(
    svgEl(
      'text',
      {
        x: 12,
        y: 16,
        fill: '#526267',
        'font-size': 8.5,
        'font-family': 'Cascadia Code, Consolas, monospace',
      },
      'SAME SCALE',
    ),
    svgEl(
      'text',
      {
        x: width - 12,
        y: height - 10,
        'text-anchor': 'end',
        fill: '#526267',
        'font-size': 8.5,
        'font-family': 'Cascadia Code, Consolas, monospace',
      },
      `OUTER Ø ${formatMicro(maxDiameter)}`,
    ),
  );

  svg.setAttribute(
    'aria-label',
    `同一比例下的直径对照：允许 CoC ${formatMicro(calc.cocThresholdUm)}，艾里斑 ${formatMicro(calc.airyUm)}，两像素 ${formatMicro(calc.pixelPitchMm * 2000)}。`,
  );
}

/* ------------------------------------------------------------------ */
/* Three-plane depth preview                                          */
/* ------------------------------------------------------------------ */

const SCENE_WIDTH = 1400;
const SCENE_HEIGHT = 500;
let cachedBokeh = null;

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function getBokeh() {
  if (cachedBokeh) return cachedBokeh;
  const random = seeded(93211);
  cachedBokeh = Array.from({ length: 24 }, (_, index) => {
    const palette = [
      ['255,196,137', 0.28],
      ['255,230,187', 0.2],
      ['124,224,211', 0.18],
      ['255,143,154', 0.14],
    ];
    const [rgb, alpha] = palette[index % palette.length];
    return {
      x: 720 + random() * 660,
      y: 165 + random() * 210,
      r: 2 + random() * 13,
      rgb,
      alpha,
    };
  });
  return cachedBokeh;
}

function createLayerCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_WIDTH;
  canvas.height = SCENE_HEIGHT;
  return canvas;
}

let cachedSceneLayers = null;

function getSceneLayers() {
  if (cachedSceneLayers) return cachedSceneLayers;
  const far = createLayerCanvas();
  const subject = createLayerCanvas();
  const fore = createLayerCanvas();
  drawFarLayer(far.getContext('2d'));
  drawSubjectLayer(subject.getContext('2d'));
  drawForegroundLayer(fore.getContext('2d'));
  cachedSceneLayers = { far, subject, fore };
  return cachedSceneLayers;
}

function drawFarLayer(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, SCENE_HEIGHT);
  sky.addColorStop(0, '#0a171c');
  sky.addColorStop(0.4, '#173237');
  sky.addColorStop(0.67, '#5a5b50');
  sky.addColorStop(0.8, '#a66f4b');
  sky.addColorStop(1, '#16282a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  const sun = ctx.createRadialGradient(1080, 235, 0, 1080, 235, 190);
  sun.addColorStop(0, 'rgba(255,203,142,.6)');
  sun.addColorStop(0.35, 'rgba(255,170,100,.18)');
  sun.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(760, 0, 640, 500);

  const sunDisc = ctx.createRadialGradient(1080, 235, 0, 1080, 235, 38);
  sunDisc.addColorStop(0, 'rgba(255,231,190,.8)');
  sunDisc.addColorStop(0.7, 'rgba(255,190,120,.25)');
  sunDisc.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.fillStyle = sunDisc;
  ctx.beginPath();
  ctx.arc(1080, 235, 38, 0, Math.PI * 2);
  ctx.fill();

  // Layered distant hills
  ctx.fillStyle = 'rgba(26,48,49,.72)';
  ctx.beginPath();
  ctx.moveTo(0, 375);
  ctx.bezierCurveTo(180, 322, 300, 365, 440, 345);
  ctx.bezierCurveTo(600, 320, 740, 365, 930, 336);
  ctx.bezierCurveTo(1110, 310, 1260, 355, 1400, 326);
  ctx.lineTo(1400, 500);
  ctx.lineTo(0, 500);
  ctx.closePath();
  ctx.fill();

  // Skyline
  const random = seeded(78231);
  ctx.fillStyle = 'rgba(12,27,30,.88)';
  let x = 40;
  while (x < SCENE_WIDTH) {
    const w = 18 + random() * 58;
    const h = 24 + random() * 105;
    const top = 424 - h;
    ctx.fillRect(x, top, w, h + 40);
    if (random() > 0.45) {
      ctx.fillStyle = 'rgba(255,188,126,.5)';
      const count = 1 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const wx = x + 5 + random() * Math.max(1, w - 10);
        const wy = top + 8 + random() * Math.max(1, h - 18);
        ctx.fillRect(wx, wy, 1.8, 2.8);
      }
      ctx.fillStyle = 'rgba(12,27,30,.88)';
    }
    x += w + 5 + random() * 12;
  }

  // Bokeh lights
  for (const light of getBokeh()) {
    const gradient = ctx.createRadialGradient(
      light.x,
      light.y,
      0,
      light.x,
      light.y,
      light.r,
    );
    gradient.addColorStop(0, `rgba(${light.rgb},${light.alpha + 0.16})`);
    gradient.addColorStop(0.55, `rgba(${light.rgb},${light.alpha})`);
    gradient.addColorStop(1, `rgba(${light.rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(light.x, light.y, light.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Window mullions, slightly out of focus in the distance
  ctx.fillStyle = 'rgba(8,18,20,.55)';
  ctx.fillRect(0, 0, 26, 500);
  ctx.fillRect(1374, 0, 26, 500);
  ctx.fillRect(0, 0, 1400, 18);

  // Hanging pendant lamp on the right
  ctx.strokeStyle = 'rgba(10,20,20,.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1218, 0);
  ctx.lineTo(1218, 116);
  ctx.stroke();
  const lamp = ctx.createRadialGradient(1218, 132, 0, 1218, 132, 72);
  lamp.addColorStop(0, 'rgba(255,213,157,.85)');
  lamp.addColorStop(0.3, 'rgba(255,170,104,.28)');
  lamp.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(1218, 132, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(15,29,29,.9)';
  ctx.beginPath();
  ctx.moveTo(1188, 118);
  ctx.quadraticCurveTo(1218, 154, 1248, 118);
  ctx.closePath();
  ctx.fill();
}

function drawSubjectLayer(ctx) {
  // Table
  const table = ctx.createLinearGradient(0, 395, 0, 500);
  table.addColorStop(0, '#5d4436');
  table.addColorStop(0.12, '#3b2d28');
  table.addColorStop(1, '#161d1d');
  ctx.fillStyle = table;
  ctx.beginPath();
  ctx.moveTo(0, 412);
  ctx.lineTo(1400, 394);
  ctx.lineTo(1400, 500);
  ctx.lineTo(0, 500);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,208,160,.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 412);
  ctx.lineTo(1400, 394);
  ctx.stroke();

  // Soft shadow
  ctx.fillStyle = 'rgba(5,10,11,.42)';
  ctx.beginPath();
  ctx.ellipse(390, 430, 150, 22, -0.02, 0, Math.PI * 2);
  ctx.fill();

  // Vase
  const vase = ctx.createLinearGradient(315, 0, 468, 0);
  vase.addColorStop(0, '#b8a58d');
  vase.addColorStop(0.22, '#e7d7bd');
  vase.addColorStop(0.55, '#f0e3cd');
  vase.addColorStop(0.8, '#cbb69a');
  vase.addColorStop(1, '#8f7a66');
  ctx.fillStyle = vase;
  ctx.beginPath();
  ctx.moveTo(349, 302);
  ctx.bezierCurveTo(326, 334, 322, 382, 344, 424);
  ctx.bezierCurveTo(356, 444, 422, 444, 438, 421);
  ctx.bezierCurveTo(455, 383, 445, 332, 416, 303);
  ctx.closePath();
  ctx.fill();

  // Vase rim
  ctx.fillStyle = '#d9c5aa';
  ctx.beginPath();
  ctx.ellipse(382, 302, 34, 9, -0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4f4236';
  ctx.beginPath();
  ctx.ellipse(382, 302, 27, 5.5, -0.03, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.strokeStyle = 'rgba(255,255,255,.42)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(350, 332);
  ctx.bezierCurveTo(338, 365, 341, 398, 356, 419);
  ctx.stroke();

  // Stems
  const stemPaths = [
    [382, 305, 435, 212, 480, 150],
    [382, 306, 350, 218, 298, 174],
    [381, 305, 405, 225, 410, 142],
    [380, 305, 470, 252, 562, 228],
  ];
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a5b3d';
  ctx.lineWidth = 2.4;
  for (const [x1, y1, cx, cy, x2, y2] of stemPaths) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
  }

  // Leaves
  ctx.fillStyle = '#5b6d48';
  const leaves = [
    [443, 219, -0.7, 28, 9],
    [451, 239, 0.55, 32, 10],
    [337, 232, 0.8, 30, 9],
    [326, 211, -0.45, 24, 8],
    [402, 178, 0.15, 22, 7],
    [482, 216, -0.3, 25, 8],
  ];
  for (const [x, y, angle, rx, ry] of leaves) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Blossoms
  const blossoms = [
    [480, 143, 17],
    [410, 136, 12],
    [297, 171, 15],
    [557, 224, 11],
  ];
  for (const [bx, by, radius] of blossoms) {
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const petalX = bx + Math.cos(angle) * radius * 0.62;
      const petalY = by + Math.sin(angle) * radius * 0.62;
      const petal = ctx.createRadialGradient(
        petalX,
        petalY,
        0,
        petalX,
        petalY,
        radius * 0.65,
      );
      petal.addColorStop(0, 'rgba(255,250,235,.98)');
      petal.addColorStop(0.7, 'rgba(247,226,197,.95)');
      petal.addColorStop(1, 'rgba(231,197,165,.82)');
      ctx.fillStyle = petal;
      ctx.beginPath();
      ctx.ellipse(
        petalX,
        petalY,
        radius * 0.62,
        radius * 0.4,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(196,132,64,.95)';
    ctx.beginPath();
    ctx.arc(bx, by, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  // A small book edge on the left
  ctx.fillStyle = '#2a3332';
  ctx.beginPath();
  ctx.moveTo(80, 436);
  ctx.lineTo(342, 421);
  ctx.lineTo(356, 448);
  ctx.lineTo(92, 466);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,202,151,.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(94, 440);
  ctx.lineTo(344, 426);
  ctx.stroke();
}

function drawForegroundLayer(ctx) {
  // Framing leaves at 0.4 m
  ctx.fillStyle = 'rgba(5,15,15,.95)';
  ctx.beginPath();
  ctx.moveTo(0, 500);
  ctx.bezierCurveTo(30, 390, 144, 352, 246, 365);
  ctx.bezierCurveTo(166, 409, 112, 454, 92, 500);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(1400, 500);
  ctx.bezierCurveTo(1330, 402, 1236, 382, 1146, 400);
  ctx.bezierCurveTo(1224, 434, 1280, 466, 1304, 500);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(104,128,94,.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 493);
  ctx.quadraticCurveTo(100, 410, 214, 373);
  ctx.moveTo(1366, 495);
  ctx.quadraticCurveTo(1302, 420, 1188, 404);
  ctx.stroke();
}

function drawLayer(ctx, baseCanvas, sigma) {
  if (!ctx) return;
  if (sigma < 0.22) {
    ctx.drawImage(baseCanvas, 0, 0);
    return;
  }
  ctx.save();
  ctx.filter = `blur(${Math.min(48, sigma)}px)`;
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.restore();
}

export function drawScene(canvas, calc, state) {
  if (!canvas) return;
  canvas.width = SCENE_WIDTH;
  canvas.height = SCENE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  const { far, subject, fore } = getSceneLayers();

  const exaggeration = Math.max(1, Number(state.exaggeration) || 1);
  const pixelsPerMm = SCENE_WIDTH / calc.sensor.width;
  const sigmaFor = (cocMm) =>
    (Math.max(0, cocMm) * pixelsPerMm * exaggeration) / 2;

  const farCoc = getCocAtDistance(calc, 8);
  const subjectCoc = getCocAtDistance(calc, 1.2);
  const foreCoc = getCocAtDistance(calc, 0.4);

  drawLayer(ctx, far, sigmaFor(farCoc));
  drawLayer(ctx, subject, sigmaFor(subjectCoc));
  drawLayer(ctx, fore, sigmaFor(foreCoc));

  // Warm light spill
  const spill = ctx.createLinearGradient(600, 0, 1400, 500);
  spill.addColorStop(0, 'rgba(255,180,116,0)');
  spill.addColorStop(0.72, 'rgba(255,160,96,.08)');
  spill.addColorStop(1, 'rgba(255,140,80,.16)');
  ctx.fillStyle = spill;
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  // Vignette
  const vignette = ctx.createRadialGradient(
    SCENE_WIDTH / 2,
    SCENE_HEIGHT / 2,
    130,
    SCENE_WIDTH / 2,
    SCENE_HEIGHT / 2,
    820,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.7, 'rgba(0,0,0,.12)');
  vignette.addColorStop(1, 'rgba(0,0,0,.58)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

  // Subtle bottom fade so the overlay labels sit on a stable ground
  const bottomFade = ctx.createLinearGradient(0, 430, 0, 500);
  bottomFade.addColorStop(0, 'rgba(5,10,11,0)');
  bottomFade.addColorStop(1, 'rgba(5,10,11,.65)');
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, 430, SCENE_WIDTH, 70);

  canvas.setAttribute(
    'aria-label',
    `景深模拟画面：前景 0.4 米弥散 ${formatMicro(foreCoc * 1000)}，主体 1.2 米弥散 ${formatMicro(subjectCoc * 1000)}，远景 8 米弥散 ${formatMicro(farCoc * 1000)}。虚化增强 ${exaggeration} 倍。`,
  );
}

export function getLayerDistanceLabel(layer) {
  return layer.distance < 1
    ? `${Math.round(layer.distance * 100)}cm`
    : `${layer.distance}m`;
}
