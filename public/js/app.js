import {
  APERTURES,
  CAMERA_PRESETS,
  DEFAULT_STATE,
  FOCUS_MAX,
  FOCUS_MIN,
  SENSORS,
  clamp,
  computeAll,
  formatAperture,
  formatLengthMeters,
  formatMicro,
  getFocusFromSlider,
  getFocusSliderPosition,
  nearestApertureIndex,
} from './optics.js';
import {
  drawBlurChart,
  drawCircleScale,
  drawDepthRuler,
  drawRayDiagram,
  drawScene,
} from './viz.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SCENES = {
  portrait: {
    equivFocal: 50,
    aperture: 2.8,
    focusDistance: 1.2,
    focusInfinity: false,
  },
  closeup: {
    equivFocal: 24,
    aperture: 2.2,
    focusDistance: 0.15,
    focusInfinity: false,
  },
  landscape: {
    equivFocal: 24,
    aperture: 5.6,
    focusDistance: 8,
    focusInfinity: true,
  },
  street: {
    equivFocal: 35,
    aperture: 2,
    focusDistance: 2.4,
    focusInfinity: false,
  },
};

const COC_MODES = new Set(['human', 'classic', 'pixel', 'custom']);

const refs = {
  heroCocValue: $('#heroCocValue'),
  cameraPreset: $('#cameraPreset'),
  sensorSelect: $('#sensorSelect'),
  sensorInfo: $('#sensorInfo'),
  focalRange: $('#focalRange'),
  focalValue: $('#focalValue'),
  actualFocal: $('#actualFocal'),
  apertureRange: $('#apertureRange'),
  apertureValue: $('#apertureValue'),
  pupilValue: $('#pupilValue'),
  focusRange: $('#focusRange'),
  focusValue: $('#focusValue'),
  focusFoot: $('#focusFoot'),
  infinityBtn: $('#infinityBtn'),
  cocButtons: $$('[data-coc-mode]'),
  cocPanels: $$('[data-coc-panel]'),
  cocValue: $('#cocValue'),
  cocExplain: $('#cocExplain'),
  displayRange: $('#displayRange'),
  displayValue: $('#displayValue'),
  viewRange: $('#viewRange'),
  viewValue: $('#viewValue'),
  acuityRange: $('#acuityRange'),
  acuityValue: $('#acuityValue'),
  displayMagnification: $('#displayMagnification'),
  pixelKButtons: $$('[data-pixel-k]'),
  pixelKValue: $('#pixelKValue'),
  customCocInput: $('#customCocInput'),
  resolutionInput: $('#resolutionInput'),
  pixelPitchInfo: $('#pixelPitchInfo'),
  sensorWidthInput: $('#sensorWidthInput'),
  sensorHeightInput: $('#sensorHeightInput'),
  advancedPanel: $('.advanced-panel'),
  metricCoc: $('#metricCoc'),
  metricCocSub: $('#metricCocSub'),
  metricDof: $('#metricDof'),
  metricDofSub: $('#metricDofSub'),
  metricBg: $('#metricBg'),
  metricBgUnit: $('#metricBgUnit'),
  metricBgSub: $('#metricBgSub'),
  metricH: $('#metricH'),
  metricHUnit: $('#metricHUnit'),
  metricHSub: $('#metricHSub'),
  rayDiagram: $('#rayDiagram'),
  rayScroll: $('#rayScroll'),
  rayScrollHint: $('#rayScrollHint'),
  rayCoc: $('#rayCoc'),
  rayFrontFocus: $('#rayFrontFocus'),
  rayBackFocus: $('#rayBackFocus'),
  rayTotalFocus: $('#rayTotalFocus'),
  rayBgCoc: $('#rayBgCoc'),
  calcGrid: $('#calcGrid'),
  depthSvg: $('#depthSvg'),
  depthTotal: $('#depthTotal'),
  depthNear: $('#depthNear'),
  depthFocus: $('#depthFocus'),
  depthFar: $('#depthFar'),
  depthH: $('#depthH'),
  blurChart: $('#blurChart'),
  chartTip: $('#chartTip'),
  chartWrap: $('.chart-wrap'),
  circleChart: $('#circleChart'),
  circleCoc: $('#circleCoc'),
  circleAiry: $('#circleAiry'),
  circlePixel2: $('#circlePixel2'),
  circlePixel1: $('#circlePixel1'),
  readoutSensor: $('#readoutSensor'),
  readoutCrop: $('#readoutCrop'),
  readoutActualFocal: $('#readoutActualFocal'),
  readoutPupil: $('#readoutPupil'),
  readoutMag: $('#readoutMag'),
  readoutFov: $('#readoutFov'),
  readoutPitch: $('#readoutPitch'),
  readoutAiry: $('#readoutAiry'),
  insightJudgeTitle: $('#insightJudgeTitle'),
  insightJudgeText: $('#insightJudgeText'),
  insightBlurTitle: $('#insightBlurTitle'),
  insightBlurText: $('#insightBlurText'),
  insightDiffTitle: $('#insightDiffTitle'),
  insightDiffText: $('#insightDiffText'),
  effectsGrid: $('#effectsGrid'),
  sceneButtons: $$('[data-scene]'),
  exagToggle: $('#exagToggle'),
  exagLabel: $('#exagLabel'),
  layerFore: $('#layerFore'),
  layerSubject: $('#layerSubject'),
  layerFar: $('#layerFar'),
  layerPills: $$('[data-layer-pill]'),
  viewFocusLabel: $('#viewFocusLabel'),
  sceneCanvas: $('#sceneCanvas'),
  shareBtn: $('#shareBtn'),
  resetBtn: $('#resetBtn'),
  toast: $('#toast'),
};

let state = readState();
let lastCalc = null;
let renderFrame = null;
let urlTimer = null;
let toastTimer = null;
const lastVisualWidths = { depth: 0, chart: 0, circle: 0, ray: 0 };

/* ------------------------------------------------------------------ */
/* State + URL                                                        */
/* ------------------------------------------------------------------ */

function numericParam(params, key, fallback, min, max) {
  const raw = params.get(key);
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function readState() {
  const params = new URLSearchParams(window.location.search);
  const next = { ...DEFAULT_STATE };

  const preset = CAMERA_PRESETS.find((item) => item.id === params.get('pre'));
  if (preset) {
    next.preset = preset.id;
  } else if (params.get('pre') === 'custom' || params.has('pre')) {
    next.preset = 'custom';
  }

  const requestedSensor = params.get('sensor');
  let sensorKey = DEFAULT_STATE.sensorKey;
  if (requestedSensor === 'custom') {
    sensorKey = 'custom';
  } else if (requestedSensor && SENSORS[requestedSensor]) {
    sensorKey = requestedSensor;
  } else if (preset) {
    sensorKey = preset.sensor;
  } else if (params.has('sensor')) {
    sensorKey = 'custom';
  }
  next.sensorKey = sensorKey;

  if (sensorKey === 'custom') {
    next.sensorWidth = numericParam(params, 'sw', next.sensorWidth, 1, 60);
    next.sensorHeight = numericParam(params, 'sh', next.sensorHeight, 1, 60);
  } else {
    next.sensorWidth = SENSORS[sensorKey].width;
    next.sensorHeight = SENSORS[sensorKey].height;
  }

  next.equivFocal = numericParam(params, 'f', next.equivFocal, 10, 200);
  const rawAperture = params.get('n');
  next.aperture =
    rawAperture !== null && Number.isFinite(Number(rawAperture))
      ? APERTURES[nearestApertureIndex(Number(rawAperture))]
      : next.aperture;
  next.focusInfinity = params.get('d') === 'inf';
  next.focusDistance = numericParam(
    params,
    'd',
    next.focusDistance,
    FOCUS_MIN,
    FOCUS_MAX,
  );
  next.megapixels = numericParam(params, 'mp', next.megapixels, 2, 250);

  const mode = params.get('coc');
  if (COC_MODES.has(mode)) next.cocMode = mode;

  next.displayInches = numericParam(params, 'di', next.displayInches, 10, 85);
  next.viewingDistanceCm = numericParam(
    params,
    'vd',
    next.viewingDistanceCm,
    20,
    150,
  );
  next.acuityArcmin = numericParam(params, 'ac', next.acuityArcmin, 0.5, 3);
  const pixelK = Number(params.get('pk'));
  next.pixelK = [1, 2, 3].includes(pixelK) ? pixelK : next.pixelK;
  next.customCocUm = numericParam(params, 'cc', next.customCocUm, 0.2, 200);
  next.backgroundDistance = numericParam(
    params,
    'bg',
    next.backgroundDistance,
    1,
    100,
  );
  const exaggeration = Number(params.get('ex'));
  next.exaggeration = exaggeration === 1 ? 1 : 3;

  const scene = params.get('sc');
  next.scene = scene && SCENES[scene] ? scene : null;

  return next;
}

function buildSearchParams() {
  const params = new URLSearchParams();
  params.set('pre', state.preset);
  params.set('sensor', state.sensorKey);
  params.set('f', String(Math.round(state.equivFocal)));
  params.set('n', String(state.aperture));
  params.set('d', state.focusInfinity ? 'inf' : state.focusDistance.toFixed(3));
  params.set('mp', String(state.megapixels));
  params.set('coc', state.cocMode);
  params.set('di', String(state.displayInches));
  params.set('vd', String(state.viewingDistanceCm));
  params.set('ac', String(state.acuityArcmin));
  params.set('pk', String(state.pixelK));
  params.set('cc', String(state.customCocUm));
  params.set('bg', String(state.backgroundDistance));
  params.set('ex', String(state.exaggeration));
  if (state.sensorKey === 'custom') {
    params.set('sw', state.sensorWidth.toFixed(2));
    params.set('sh', state.sensorHeight.toFixed(2));
  }
  if (state.scene) params.set('sc', state.scene);
  return params;
}

function updateUrlNow(clear = false) {
  window.clearTimeout(urlTimer);
  urlTimer = null;
  if (clear) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    return;
  }
  const params = buildSearchParams();
  const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}

function scheduleUrlUpdate() {
  window.clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => updateUrlNow(), 320);
}

/* ------------------------------------------------------------------ */
/* Initial select options                                             */
/* ------------------------------------------------------------------ */

function buildSelects() {
  refs.cameraPreset.innerHTML =
    '<option value="custom">自由调参</option>' +
    CAMERA_PRESETS.map(
      (preset) =>
        `<option value="${preset.id}">${preset.name} · ${preset.meta}</option>`,
    ).join('');

  refs.sensorSelect.innerHTML = Object.entries(SENSORS)
    .map(([key, sensor]) =>
      key === 'custom'
        ? `<option value="${key}">${sensor.name} · 手动画幅</option>`
        : `<option value="${key}">${sensor.name} · ${sensor.note} · ${sensor.width} × ${sensor.height} mm</option>`,
    )
    .join('');
}

/* ------------------------------------------------------------------ */
/* Sync controls                                                      */
/* ------------------------------------------------------------------ */

function setRangeFill(element, percent) {
  element.style.setProperty('--fill', `${clamp(percent, 0, 100)}%`);
}

function setRange(element, value, fillPercent) {
  element.value = String(value);
  if (fillPercent !== undefined) setRangeFill(element, fillPercent);
}

function formatFocusInput(meters) {
  if (!Number.isFinite(meters)) return '∞';
  if (meters < 1) return meters.toFixed(2);
  if (meters < 10) return meters.toFixed(2);
  return meters.toFixed(1);
}

function syncControls() {
  const presetExists = CAMERA_PRESETS.some(
    (preset) => preset.id === state.preset,
  );
  refs.cameraPreset.value = presetExists ? state.preset : 'custom';
  refs.sensorSelect.value = SENSORS[state.sensorKey] ? state.sensorKey : 'custom';
  refs.sensorInfo.textContent = `${state.sensorWidth.toFixed(1)} × ${state.sensorHeight.toFixed(1)} mm`;

  setRange(
    refs.focalRange,
    state.equivFocal,
    ((state.equivFocal - 10) / 190) * 100,
  );
  refs.focalValue.textContent = String(Math.round(state.equivFocal));

  const apertureIndex = nearestApertureIndex(state.aperture);
  setRange(
    refs.apertureRange,
    apertureIndex,
    (apertureIndex / (APERTURES.length - 1)) * 100,
  );
  refs.apertureValue.textContent = formatAperture(APERTURES[apertureIndex]);

  if (state.focusInfinity) {
    refs.focusRange.value = '1000';
    setRangeFill(refs.focusRange, 100);
    refs.focusRange.classList.add('is-infinity');
    refs.focusValue.textContent = '∞';
    refs.focusFoot.textContent = '对焦平面 ∞';
    refs.infinityBtn.classList.add('is-active');
    refs.infinityBtn.setAttribute('aria-pressed', 'true');
  } else {
    const position = getFocusSliderPosition(state.focusDistance);
    setRange(refs.focusRange, position, position / 10);
    refs.focusRange.classList.remove('is-infinity');
    refs.focusValue.textContent = formatFocusInput(state.focusDistance);
    refs.focusFoot.textContent = `对焦平面 ${formatFocusInput(state.focusDistance)} m`;
    refs.infinityBtn.classList.remove('is-active');
    refs.infinityBtn.setAttribute('aria-pressed', 'false');
  }

  refs.cocButtons.forEach((button) => {
    const active = button.dataset.cocMode === state.cocMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  refs.cocPanels.forEach((panel) => {
    panel.hidden = panel.dataset.cocPanel !== state.cocMode;
  });

  setRange(
    refs.displayRange,
    state.displayInches,
    ((state.displayInches - 10) / 75) * 100,
  );
  refs.displayValue.textContent = `${state.displayInches.toFixed(0)}″`;
  setRange(
    refs.viewRange,
    state.viewingDistanceCm,
    ((state.viewingDistanceCm - 20) / 130) * 100,
  );
  refs.viewValue.textContent = `${state.viewingDistanceCm.toFixed(0)} cm`;
  setRange(
    refs.acuityRange,
    state.acuityArcmin,
    ((state.acuityArcmin - 0.5) / 2.5) * 100,
  );
  refs.acuityValue.textContent = `${state.acuityArcmin.toFixed(1)}′`;

  refs.pixelKButtons.forEach((button) => {
    button.classList.toggle(
      'is-active',
      Number(button.dataset.pixelK) === state.pixelK,
    );
  });

  refs.customCocInput.value = String(state.customCocUm);
  refs.resolutionInput.value = String(state.megapixels);
  refs.sensorWidthInput.value = String(state.sensorWidth);
  refs.sensorHeightInput.value = String(state.sensorHeight);

  refs.sceneButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.scene === state.scene);
  });

  refs.exagToggle.classList.toggle('is-on', state.exaggeration === 3);
  refs.exagToggle.setAttribute(
    'aria-checked',
    String(state.exaggeration === 3),
  );
  refs.exagLabel.textContent = `${state.exaggeration}× 视觉增强`;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

function commit(patch, { sync = true, url = true } = {}) {
  state = { ...state, ...patch };
  if (sync) syncControls();
  scheduleRender();
  if (url) scheduleUrlUpdate();
}

function scheduleRender() {
  if (renderFrame !== null) return;
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null;
    render();
  });
}

function trimMeters(meters) {
  if (!Number.isFinite(meters)) return '∞';
  if (meters < 1) return meters.toFixed(2);
  if (meters < 10) return meters.toFixed(2);
  if (meters < 1000) return meters.toFixed(1);
  return Math.round(meters).toString();
}

function splitMetricMicro(um) {
  if (!Number.isFinite(um)) return { value: '∞', unit: '' };
  if (um >= 1000) {
    return {
      value: (um / 1000).toFixed(um / 1000 >= 10 ? 1 : 2),
      unit: 'mm',
    };
  }
  if (um >= 100) return { value: um.toFixed(0), unit: 'µm' };
  if (um >= 10) return { value: um.toFixed(1), unit: 'µm' };
  return { value: um.toFixed(2), unit: 'µm' };
}

function splitMetricMeters(meters) {
  if (!Number.isFinite(meters)) return { value: '∞', unit: 'm' };
  if (meters >= 1000) {
    return {
      value: (meters / 1000).toFixed(meters >= 10000 ? 1 : 2),
      unit: 'km',
    };
  }
  if (meters >= 100) return { value: meters.toFixed(0), unit: 'm' };
  if (meters >= 10) return { value: meters.toFixed(1), unit: 'm' };
  return { value: meters.toFixed(2), unit: 'm' };
}

function formatDofRange(calc) {
  return `${trimMeters(calc.nearMm / 1000)} – ${trimMeters(calc.farMm / 1000)}`;
}

function formatDofTotal(calc) {
  return Number.isFinite(calc.totalDofMm)
    ? formatLengthMeters(calc.totalDofMm / 1000)
    : '∞';
}

function formatCoc(um) {
  if (um < 0.1) return um.toFixed(3);
  if (um < 1) return um.toFixed(2);
  if (um < 10) return um.toFixed(2);
  if (um < 100) return um.toFixed(1);
  return um.toFixed(0);
}

function renderHero(calc) {
  refs.heroCocValue.textContent = formatMicro(calc.cocThresholdUm);
}

function renderControlReadouts(calc) {
  refs.actualFocal.textContent = calc.focalMm.toFixed(2);
  refs.pupilValue.textContent = calc.apertureDiameterMm.toFixed(2);
  refs.displayMagnification.textContent = `${calc.displayMagnification.toFixed(0)}×`;
  refs.cocValue.textContent = formatCoc(calc.cocThresholdUm);

  if (calc.state.cocMode === 'human') {
    refs.cocExplain.textContent = `在 ${calc.state.displayInches}″ 屏幕、${calc.state.viewingDistanceCm} cm 观看距离、${calc.state.acuityArcmin}′ 视角下，传感器上超过 ${formatMicro(calc.cocThresholdUm)} 的模糊开始可辨。`;
  } else if (calc.state.cocMode === 'classic') {
    refs.cocExplain.textContent = `取画幅对角线的 1/1500 作为经验阈值，约 1/${Math.round(calc.cocThresholdDiagonals).toLocaleString('zh-CN')} 对角线。`;
  } else if (calc.state.cocMode === 'pixel') {
    refs.cocExplain.textContent = `以 ${calc.state.pixelK} 个像素作为可接受模糊直径，当前单像素为 ${calc.pixelPitchMm * 1000 < 1 ? (calc.pixelPitchMm * 1000).toFixed(2) : (calc.pixelPitchMm * 1000).toFixed(1)} µm。`;
  } else {
    refs.cocExplain.textContent = `手动画定的传感器模糊阈值。改变它只会移动“可接受”的边界，不会改变镜头的真实弥散。`;
  }

  refs.pixelKValue.textContent = formatMicro(calc.state.pixelK * calc.pixelPitchMm * 1000);
  refs.pixelPitchInfo.textContent = (calc.pixelPitchMm * 1000).toFixed(2);
}

function renderMetrics(calc) {
  refs.metricCoc.textContent = formatCoc(calc.cocThresholdUm);
  refs.metricCocSub.textContent = `≈ 1/${Math.round(calc.cocThresholdDiagonals).toLocaleString('zh-CN')} 对角线 · ${calc.cocThresholdPixels.toFixed(2)} px`;

  refs.metricDof.textContent = formatDofRange(calc);
  if (Number.isFinite(calc.totalDofMm)) {
    const front = Math.max(0, calc.focusDistanceM - calc.nearMm / 1000);
    const behind = Math.max(0, calc.farMm / 1000 - calc.focusDistanceM);
    refs.metricDofSub.textContent = `总景深 ${formatLengthMeters(calc.totalDofMm / 1000)} · 前 ${formatLengthMeters(front)} / 后 ${formatLengthMeters(behind)}`;
  } else {
    refs.metricDofSub.textContent = '总景深 ∞ · 远界不受限';
  }

  const bg = splitMetricMicro(calc.backgroundBlurUm);
  refs.metricBg.textContent = bg.value;
  refs.metricBgUnit.textContent = bg.unit;
  refs.metricBgSub.textContent = `@ ${calc.backgroundDistance.toFixed(1)} m · ${calc.backgroundRatio.toFixed(1)}× 阈值 · ${calc.backgroundBlurPixels.toFixed(1)} px`;

  const h = splitMetricMeters(calc.hyperfocalMm / 1000);
  refs.metricH.textContent = h.value;
  refs.metricHUnit.textContent = h.unit;
  refs.metricHSub.textContent = `对焦 ≥ H 时，远界为 ∞`;
}

function renderDepth(calc) {
  refs.depthTotal.textContent = formatDofTotal(calc);
  refs.depthNear.textContent = formatLengthMeters(calc.nearMm / 1000);
  refs.depthFocus.textContent = calc.focusInfinity
    ? '∞'
    : formatLengthMeters(calc.focusDistanceM);
  refs.depthFar.textContent = formatLengthMeters(calc.farMm / 1000);
  refs.depthH.textContent = formatLengthMeters(calc.hyperfocalMm / 1000);
  drawDepthRuler(refs.depthSvg, calc);
}

function renderReadouts(calc) {
  refs.readoutSensor.textContent = calc.sensor.diagonal.toFixed(2);
  refs.readoutCrop.textContent = calc.sensor.crop.toFixed(2);
  refs.readoutActualFocal.textContent = calc.focalMm.toFixed(2);
  refs.readoutPupil.textContent = calc.apertureDiameterMm.toFixed(2);
  const magnification = calc.focusMagnification;
  refs.readoutMag.textContent =
    magnification > 0 ? Math.round(1 / magnification).toString() : '∞';
  refs.readoutFov.textContent = calc.fovHorizontalDeg.toFixed(1);
  refs.readoutPitch.textContent = (calc.pixelPitchMm * 1000).toFixed(2);
  refs.readoutAiry.textContent = calc.airyPixels.toFixed(2);
}

function renderCircles(calc) {
  refs.circleCoc.textContent = formatMicro(calc.cocThresholdUm);
  refs.circleAiry.textContent = formatMicro(calc.airyUm);
  refs.circlePixel2.textContent = formatMicro(calc.pixelPitchMm * 2000);
  refs.circlePixel1.textContent = formatMicro(calc.pixelPitchMm * 1000);
  drawCircleScale(refs.circleChart, calc);
}

function renderPreview(calc) {
  const layerMap = Object.fromEntries(calc.layers.map((layer) => [layer.id, layer]));
  refs.layerFore.textContent = formatPreviewBlur(layerMap.fore.blurUm);
  refs.layerSubject.textContent = formatPreviewBlur(layerMap.subject.blurUm);
  refs.layerFar.textContent = formatPreviewBlur(layerMap.far.blurUm);
  refs.viewFocusLabel.textContent = calc.focusInfinity
    ? '∞'
    : `${formatFocusInput(calc.focusDistanceM)} m`;

  refs.layerPills.forEach((pill) => {
    const id = pill.dataset.layerPill;
    const layer = layerMap[id];
    const focused =
      !calc.focusInfinity &&
      Math.abs(layer.distance - calc.focusDistanceM) /
        Math.max(0.1, calc.focusDistanceM) <
        0.08;
    pill.classList.toggle('is-focus', focused);
  });

  drawScene(refs.sceneCanvas, calc, state);
}

function formatPreviewBlur(um) {
  if (um < 0.05) return '0 µm';
  return formatMicro(um);
}

function renderRayReadout(calc) {
  refs.rayCoc.textContent = formatMicro(calc.cocThresholdUm);
  refs.rayFrontFocus.textContent = formatMicro(calc.frontFocusUm);
  refs.rayBackFocus.textContent = formatMicro(calc.backFocusUm);
  refs.rayTotalFocus.textContent = formatMicro(calc.totalFocusUm);
  refs.rayBgCoc.textContent = formatMicro(calc.backgroundBlurUm);
}

function calcFormulaCard(index, title, formula, substitution, result, note = '') {
  return `
    <article class="calc-card">
      <div class="calc-card-head"><span>${index}</span><h4>${title}</h4></div>
      <div class="calc-formula">${formula}</div>
      <div class="calc-sub">${substitution}</div>
      <div class="calc-result"><span>${note}</span><b>${result}</b></div>
    </article>`;
}

function renderCalculations(calc) {
  if (!refs.calcGrid) return;
  const stateMode = calc.state.cocMode;
  const diag = calc.sensor.diagonal;
  const displayDiag = calc.displayDiagonalMm;
  const viewing = calc.viewingDistanceMm;
  const sLabel = calc.focusInfinity
    ? '∞'
    : `${calc.focusDistanceM.toFixed(2)} m`;
  const sMm = calc.focusInfinity ? Infinity : calc.focusMm;
  const backgroundMm = calc.backgroundDistance * 1000;
  const aperture = calc.aperture;
  const cocMm = calc.cocThresholdMm;

  let cocFormula = '';
  let cocSubstitution = '';
  let cocNote = '';

  if (stateMode === 'human') {
    cocFormula =
      'δ = 2D·tan(θ/2) · d<sub>sensor</sub> / d<sub>display</sub>';
    cocSubstitution = `2 × ${viewing.toFixed(0)} × tan(${calc.state.acuityArcmin.toFixed(1)}′/2) × ${diag.toFixed(2)} / ${displayDiag.toFixed(2)}`;
    cocNote = `${calc.state.displayInches}″ 屏 · ${calc.state.viewingDistanceCm} cm 观看`;
  } else if (stateMode === 'classic') {
    cocFormula = 'δ = d<sub>sensor</sub> / 1500';
    cocSubstitution = `${diag.toFixed(2)} / 1500 = ${cocMm.toFixed(5)} mm`;
    cocNote = '经典 1/1500 对角线';
  } else if (stateMode === 'pixel') {
    cocFormula = 'δ = k · p';
    cocSubstitution = `${calc.state.pixelK} × ${(calc.pixelPitchMm * 1000).toFixed(2)} µm = ${calc.cocThresholdUm.toFixed(2)} µm`;
    cocNote = `${calc.state.pixelK} 像素直径`;
  } else {
    cocFormula = 'δ = δ<sub>input</sub>';
    cocSubstitution = `${calc.state.customCocUm.toFixed(1)} µm（手动画定）`;
    cocNote = '自定义阈值';
  }

  const backgroundFormula = calc.focusInfinity
    ? 'δ(D) = f² / (N·D)'
    : 'δ(D) = f²·|D−s| / [N·D·(s−f)]';
  const backgroundSubstitution = calc.focusInfinity
    ? `${calc.focalMm.toFixed(2)}² / (${aperture} × ${backgroundMm.toFixed(0)}) = ${(calc.backgroundBlurMm).toFixed(5)} mm`
    : `${calc.focalMm.toFixed(2)}² × |${backgroundMm.toFixed(0)}−${sMm.toFixed(0)}| / (${aperture} × ${backgroundMm.toFixed(0)} × ${(sMm - calc.focalMm).toFixed(2)}) = ${(calc.backgroundBlurMm).toFixed(5)} mm`;

  const hyperfocalSub = `${calc.focalMm.toFixed(2)}² / (${aperture} × ${cocMm.toFixed(5)}) + ${calc.focalMm.toFixed(2)} = ${calc.hyperfocalMm.toFixed(0)} mm`;

  const dofSubstitution = `s = ${sLabel} · H = ${calc.hyperfocalMm.toFixed(0)} mm · f = ${calc.focalMm.toFixed(2)} mm`;

  const cards = [
    calcFormulaCard(
      '01',
      '允许弥散圆',
      cocFormula,
      cocSubstitution,
      formatMicro(calc.cocThresholdUm),
      cocNote,
    ),
    calcFormulaCard(
      '02',
      '实际焦距与孔径',
      'f = f<sub>eq</sub> · d<sub>sensor</sub> / 43.27<br />Ø = f / N',
      `${calc.equivFocal.toFixed(0)} × ${diag.toFixed(2)} / 43.27 = ${calc.focalMm.toFixed(2)} mm<br />${calc.focalMm.toFixed(2)} / ${aperture} = ${calc.apertureDiameterMm.toFixed(2)} mm`,
      `${calc.focalMm.toFixed(2)} mm <small>· Ø ${calc.apertureDiameterMm.toFixed(2)} mm</small>`,
      '等效焦距换算',
    ),
    calcFormulaCard(
      '03',
      '超焦距',
      'H = f² / (N·δ) + f',
      hyperfocalSub,
      formatLengthMeters(calc.hyperfocalMm / 1000),
      '对焦 ≥ H 时远界 ∞',
    ),
    calcFormulaCard(
      '04',
      '景深边界',
      's<sub>near</sub> = s(H−f) / (H+s−2f)<br />s<sub>far</sub> = s(H−f) / (H−s)',
      dofSubstitution,
      `${trimMeters(calc.nearMm / 1000)} – ${trimMeters(calc.farMm / 1000)} <small>m</small>`,
      '近界 — 远界',
    ),
    calcFormulaCard(
      '05',
      '实际弥散圆',
      backgroundFormula,
      backgroundSubstitution,
      formatMicro(calc.backgroundBlurUm),
      `@ ${calc.backgroundDistance.toFixed(1)} m · ${calc.backgroundRatio.toFixed(1)}× 阈值`,
    ),
    calcFormulaCard(
      '06',
      '衍射斑',
      'Ø<sub>Airy</sub> = 2.44·λ·N·(1+m)',
      `2.44 × 550 nm × ${aperture} × (1 + ${calc.focusMagnification.toFixed(5)})`,
      formatMicro(calc.airyUm),
      `${calc.airyPixels.toFixed(2)} px · f/${calc.diffractionLimitN.toFixed(1)} 后 > 2 px`,
    ),
  ];

  refs.calcGrid.innerHTML = cards.join('');
}

function renderInsights(calc) {
  const { cocMode } = calc.state;
  let judgeTitle = '严格，但不是绝对';
  if (cocMode === 'human') {
    if (calc.cocThresholdUm < calc.pixelPitchMm * 1200) {
      judgeTitle = '比单像素更严格';
    } else if (calc.cocThresholdUm > calc.pixelPitchMm * 4000) {
      judgeTitle = '宽松的观看判据';
    }
    refs.insightJudgeText.textContent = `在 ${calc.state.displayInches}″ 屏、${calc.state.viewingDistanceCm} cm 处观看，${formatMicro(calc.cocThresholdUm)} 的模糊已接近 ${calc.state.acuityArcmin}′ 视角的分辨极限。`;
  } else if (cocMode === 'classic') {
    judgeTitle = '一条经验规则';
    refs.insightJudgeText.textContent = `经典判据取画幅对角线的 1/1500，得到 ${formatMicro(calc.cocThresholdUm)}；它不随显示器和观看距离变化。`;
  } else if (cocMode === 'pixel') {
    judgeTitle = `${calc.state.pixelK} 像素的判据`;
    refs.insightJudgeText.textContent = `把 ${calc.state.pixelK} 个像素（${formatMicro(calc.cocThresholdUm)}）作为可接受模糊。像素越小，这条判据越严格。`;
  } else {
    judgeTitle = '自定义门槛';
    refs.insightJudgeText.textContent = `你手动画定的允许 CoC 为 ${formatMicro(calc.cocThresholdUm)}。它只改变景深边界，不改变真实光学弥散。`;
  }
  refs.insightJudgeTitle.textContent = judgeTitle;

  if (calc.backgroundRatio >= 1) {
    refs.insightBlurTitle.textContent = '背景越过门槛';
    refs.insightBlurText.textContent = `${calc.backgroundDistance.toFixed(1)} m 处的实际弥散为 ${formatMicro(calc.backgroundBlurUm)}，是允许 CoC 的 ${calc.backgroundRatio.toFixed(1)} 倍（约 ${calc.backgroundBlurPixels.toFixed(1)} 个像素），已经明显失焦。`;
  } else {
    refs.insightBlurTitle.textContent = '背景仍在范围内';
    refs.insightBlurText.textContent = `${calc.backgroundDistance.toFixed(1)} m 处的实际弥散为 ${formatMicro(calc.backgroundBlurUm)}，尚未超过允许 CoC；在这个观看条件下，它仍可被称为清晰。`;
  }

  if (calc.airyPixels >= 2) {
    refs.insightDiffTitle.textContent = '像素正在成为瓶颈';
    refs.insightDiffText.textContent = `艾里斑 ${formatMicro(calc.airyUm)}，相当于 ${calc.airyPixels.toFixed(2)} 个像素，已经越过 2 px 采样参考。继续收小光圈主要是在增加衍射。`;
  } else {
    refs.insightDiffTitle.textContent = '衍射仍受控';
    refs.insightDiffText.textContent = `艾里斑 ${formatMicro(calc.airyUm)}，相当于 ${calc.airyPixels.toFixed(2)} 个像素，尚未超过 2 px 采样参考。约在 f/${calc.diffractionLimitN.toFixed(1)} 之后开始明显。`;
  }
}

function pctChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) {
    return { text: '—', className: 'is-flat' };
  }
  const pct = ((to - from) / from) * 100;
  if (Math.abs(pct) < 0.5) return { text: '不变', className: 'is-flat' };
  return {
    text: `${pct > 0 ? '+' : ''}${Math.round(pct)}%`,
    className: pct > 0 ? 'is-up' : '',
  };
}

function effectRow(label, from, to, delta) {
  return `
    <div class="effect-row">
      <span class="effect-label">${label}</span>
      <span class="effect-values">
        <span>${from}</span>
        <i class="arrow-mini">→</i>
        <b>${to}</b>
        <em class="delta ${delta.className}">${delta.text}</em>
      </span>
    </div>`;
}

function effectCard({ index, title, tag, copy, from, to, rows, note }) {
  return `
    <article class="effect-card">
      <div class="effect-top">
        <span class="effect-num">${index}</span>
        <span class="effect-tag">${tag}</span>
      </div>
      <h3>${title}</h3>
      <p class="effect-copy">${copy}</p>
      <div class="effect-swap">
        <span class="effect-from">${from}</span>
        <span class="effect-arrow"></span>
        <span class="effect-to">${to}</span>
      </div>
      <div class="effect-rows">${rows.join('')}</div>
      <p class="effect-note">${note}</p>
    </article>`;
}

function renderEffects(base) {
  const apertureAlt = computeAll({
    ...state,
    aperture: Math.min(16, state.aperture * 2),
  });
  const apertureRows = [
    effectRow(
      '背景弥散',
      formatMicro(base.backgroundBlurUm),
      formatMicro(apertureAlt.backgroundBlurUm),
      pctChange(base.backgroundBlurUm, apertureAlt.backgroundBlurUm),
    ),
    effectRow(
      '总景深',
      formatDofTotal(base),
      formatDofTotal(apertureAlt),
      pctChange(base.totalDofMm, apertureAlt.totalDofMm),
    ),
    effectRow(
      '衍射斑',
      formatMicro(base.airyUm),
      formatMicro(apertureAlt.airyUm),
      pctChange(base.airyUm, apertureAlt.airyUm),
    ),
    effectRow('允许 CoC', formatMicro(base.cocThresholdUm), formatMicro(base.cocThresholdUm), {
      text: '不变',
      className: 'is-flat',
    }),
  ];

  const focalAlt = computeAll({
    ...state,
    equivFocal: Math.min(200, state.equivFocal * 2),
  });
  const focalRows = [
    effectRow(
      '水平视角',
      `${base.fovHorizontalDeg.toFixed(1)}°`,
      `${focalAlt.fovHorizontalDeg.toFixed(1)}°`,
      pctChange(base.fovHorizontalDeg, focalAlt.fovHorizontalDeg),
    ),
    effectRow(
      '背景弥散',
      formatMicro(base.backgroundBlurUm),
      formatMicro(focalAlt.backgroundBlurUm),
      pctChange(base.backgroundBlurUm, focalAlt.backgroundBlurUm),
    ),
    effectRow(
      '总景深',
      formatDofTotal(base),
      formatDofTotal(focalAlt),
      pctChange(base.totalDofMm, focalAlt.totalDofMm),
    ),
    effectRow(
      '实际焦距',
      `${base.focalMm.toFixed(2)} mm`,
      `${focalAlt.focalMm.toFixed(2)} mm`,
      pctChange(base.focalMm, focalAlt.focalMm),
    ),
  ];

  const baseFocusForComparison = state.focusInfinity ? 8 : state.focusDistance;
  const focusAltDistance = Math.max(0.08, baseFocusForComparison / 2);
  const focusAlt = computeAll({
    ...state,
    focusInfinity: false,
    focusDistance: focusAltDistance,
  });
  const focusRows = [
    effectRow(
      '总景深',
      formatDofTotal(base),
      formatDofTotal(focusAlt),
      pctChange(base.totalDofMm, focusAlt.totalDofMm),
    ),
    effectRow(
      '背景弥散',
      formatMicro(base.backgroundBlurUm),
      formatMicro(focusAlt.backgroundBlurUm),
      pctChange(base.backgroundBlurUm, focusAlt.backgroundBlurUm),
    ),
    effectRow(
      '对焦放大率',
      base.focusMagnification > 0
        ? `1:${Math.round(1 / base.focusMagnification)}`
        : '1:0',
      focusAlt.focusMagnification > 0
        ? `1:${Math.round(1 / focusAlt.focusMagnification)}`
        : '1:0',
      pctChange(base.focusMagnification, focusAlt.focusMagnification),
    ),
    effectRow(
      '超焦距 H',
      formatLengthMeters(base.hyperfocalMm / 1000),
      formatLengthMeters(focusAlt.hyperfocalMm / 1000),
      { text: '不变', className: 'is-flat' },
    ),
  ];

  const doubledCocUm = base.cocThresholdUm * 2;
  const cocAlt = computeAll({
    ...state,
    cocMode: 'custom',
    customCocUm: doubledCocUm,
  });
  const cocRows = [
    effectRow(
      '允许 CoC',
      formatMicro(base.cocThresholdUm),
      formatMicro(doubledCocUm),
      pctChange(base.cocThresholdUm, doubledCocUm),
    ),
    effectRow(
      '超焦距 H',
      formatLengthMeters(base.hyperfocalMm / 1000),
      formatLengthMeters(cocAlt.hyperfocalMm / 1000),
      pctChange(base.hyperfocalMm, cocAlt.hyperfocalMm),
    ),
    effectRow(
      '总景深',
      formatDofTotal(base),
      formatDofTotal(cocAlt),
      pctChange(base.totalDofMm, cocAlt.totalDofMm),
    ),
    effectRow(
      '实际背景弥散',
      formatMicro(base.backgroundBlurUm),
      formatMicro(base.backgroundBlurUm),
      { text: '不变', className: 'is-flat' },
    ),
  ];

  refs.effectsGrid.innerHTML = [
    effectCard({
      index: '01 / APERTURE',
      title: '光圈',
      tag: '几何 × 衍射',
      copy: '光圈是少数会同时改变几何弥散和衍射的变量：开大孔景深变浅，收小孔衍射变强。',
      from: `f/${formatAperture(state.aperture)}`,
      to: `f/${formatAperture(apertureAlt.aperture)}`,
      rows: apertureRows,
      note: '背景几何弥散近似 ∝ 1/N；衍射斑 ∝ N。',
    }),
    effectCard({
      index: '02 / FOCAL LENGTH',
      title: '等效焦距',
      tag: '视角 × 放大率',
      copy: '传感器不变时，焦距翻倍会收窄视角，并把背景中的细节放得更大，因此景深明显变浅。',
      from: `${Math.round(state.equivFocal)} mm`,
      to: `${Math.round(focalAlt.equivFocal)} mm`,
      rows: focalRows,
      note: '弥散随实际焦距近似按 f² 增长，光圈与对焦保持不变。',
    }),
    effectCard({
      index: '03 / FOCUS',
      title: '对焦距离',
      tag: '近摄最敏感',
      copy: state.focusInfinity
        ? '从无穷远拉回到近处，景深不再延伸到无限远，背景虚化也会随放大率变化。'
        : '对焦越近，放大率越高，景深按平方关系迅速收缩，背景弥散同时增加。',
      from: state.focusInfinity ? '∞' : `${formatFocusInput(state.focusDistance)} m`,
      to: `${formatFocusInput(focusAltDistance)} m`,
      rows: focusRows,
      note: state.focusInfinity
        ? '这里用 4 m 作为近对焦对照；实际对焦距离可自由拖动。'
        : '超焦距由镜头与判据决定，不随对焦距离变化。',
    }),
    effectCard({
      index: '04 / CRITERION',
      title: '判定标准',
      tag: '只改变“可接受”',
      copy: 'CoC 阈值不是镜头常数。把它放宽一倍，景深与超焦距会改变，但照片里的真实模糊原封不动。',
      from: formatMicro(base.cocThresholdUm),
      to: formatMicro(doubledCocUm),
      rows: cocRows,
      note: '这是观看条件的变化，不是光学系统的变化。',
    }),
  ].join('');
}

function drawCharts(calc, force = true) {
  const depthWidth = refs.depthSvg.parentElement?.clientWidth ?? 0;
  const chartWidth = refs.blurChart.parentElement?.clientWidth ?? 0;
  const circleWidth = refs.circleChart.parentElement?.clientWidth ?? 0;
  const rayWidth = refs.rayScroll?.clientWidth ?? 0;

  if (force || depthWidth !== lastVisualWidths.depth) {
    drawDepthRuler(refs.depthSvg, calc);
    lastVisualWidths.depth = depthWidth;
  }
  if (force || chartWidth !== lastVisualWidths.chart) {
    drawBlurChart(refs.blurChart, refs.chartTip, calc);
    lastVisualWidths.chart = chartWidth;
  }
  if (force || circleWidth !== lastVisualWidths.circle) {
    drawCircleScale(refs.circleChart, calc);
    lastVisualWidths.circle = circleWidth;
  }
  if (force || rayWidth !== lastVisualWidths.ray) {
    drawRayDiagram(refs.rayDiagram, calc);
    lastVisualWidths.ray = rayWidth;
    refs.rayScrollHint?.classList.toggle(
      'is-visible',
      refs.rayScroll.scrollWidth > refs.rayScroll.clientWidth + 1,
    );
  }
}

function render() {
  const calc = computeAll(state);
  lastCalc = calc;

  renderHero(calc);
  renderControlReadouts(calc);
  renderMetrics(calc);
  renderPreview(calc);
  renderRayReadout(calc);
  renderDepth(calc);
  renderReadouts(calc);
  renderCircles(calc);
  renderCalculations(calc);
  renderInsights(calc);
  renderEffects(calc);
  drawCharts(calc, true);
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

function bindEvents() {
  refs.cameraPreset.addEventListener('change', (event) => {
    const preset = CAMERA_PRESETS.find(
      (item) => item.id === event.target.value,
    );
    if (!preset) {
      commit({ preset: 'custom' });
      return;
    }
    const sensor = SENSORS[preset.sensor];
    commit({
      preset: preset.id,
      sensorKey: preset.sensor,
      sensorWidth: sensor.width,
      sensorHeight: sensor.height,
      equivFocal: preset.equivFocal,
      aperture: preset.aperture,
      megapixels: preset.megapixels,
      scene: null,
    });
  });

  refs.sensorSelect.addEventListener('change', (event) => {
    const key = event.target.value;
    const sensor = SENSORS[key];
    if (key === 'custom' || !sensor) {
      commit({ sensorKey: 'custom', preset: 'custom' });
      if (refs.advancedPanel) refs.advancedPanel.open = true;
      return;
    }
    commit({
      sensorKey: key,
      sensorWidth: sensor.width,
      sensorHeight: sensor.height,
      preset: 'custom',
      scene: null,
    });
  });

  refs.focalRange.addEventListener('input', (event) => {
    commit({
      equivFocal: Number(event.target.value),
      preset: 'custom',
      scene: null,
    });
  });

  refs.apertureRange.addEventListener('input', (event) => {
    const index = Number(event.target.value);
    commit({
      aperture: APERTURES[index],
      preset: 'custom',
      scene: null,
    });
  });

  refs.focusRange.addEventListener('input', (event) => {
    commit({
      focusInfinity: false,
      focusDistance: getFocusFromSlider(Number(event.target.value)),
      scene: null,
    });
  });

  refs.infinityBtn.addEventListener('click', () => {
    commit({
      focusInfinity: !state.focusInfinity,
      scene: null,
    });
  });

  refs.cocButtons.forEach((button) => {
    button.addEventListener('click', () => {
      commit({ cocMode: button.dataset.cocMode });
    });
  });

  refs.displayRange.addEventListener('input', (event) => {
    commit({ displayInches: Number(event.target.value) });
  });

  refs.viewRange.addEventListener('input', (event) => {
    commit({ viewingDistanceCm: Number(event.target.value) });
  });

  refs.acuityRange.addEventListener('input', (event) => {
    commit({ acuityArcmin: Number(event.target.value) });
  });

  refs.pixelKButtons.forEach((button) => {
    button.addEventListener('click', () => {
      commit({ pixelK: Number(button.dataset.pixelK) });
    });
  });

  refs.customCocInput.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    commit(
      { customCocUm: clamp(value, 0.2, 200), cocMode: 'custom' },
      { sync: false },
    );
  });
  refs.customCocInput.addEventListener('blur', syncControls);

  refs.resolutionInput.addEventListener('change', (event) => {
    commit({
      megapixels: clamp(Number(event.target.value) || 12, 2, 250),
      preset: 'custom',
    });
  });

  refs.sensorWidthInput.addEventListener('change', (event) => {
    const value = clamp(Number(event.target.value) || 8, 1, 60);
    commit({
      sensorWidth: value,
      sensorKey: 'custom',
      preset: 'custom',
      scene: null,
    });
  });

  refs.sensorHeightInput.addEventListener('change', (event) => {
    const value = clamp(Number(event.target.value) || 6, 1, 60);
    commit({
      sensorHeight: value,
      sensorKey: 'custom',
      preset: 'custom',
      scene: null,
    });
  });

  refs.sceneButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const scene = SCENES[button.dataset.scene];
      if (!scene) return;
      commit({
        ...scene,
        scene: button.dataset.scene,
        preset: 'custom',
      });
    });
  });

  refs.exagToggle.addEventListener('click', () => {
    commit({ exaggeration: state.exaggeration === 3 ? 1 : 3 });
  });

  refs.shareBtn.addEventListener('click', async () => {
    updateUrlNow();
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('参数链接已复制');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('参数链接已复制');
      } catch {
        showToast('复制失败，请从地址栏复制');
      }
      textarea.remove();
    }
  });

  refs.resetBtn.addEventListener('click', () => {
    state = { ...DEFAULT_STATE };
    syncControls();
    scheduleRender();
    updateUrlNow(true);
    showToast('已恢复默认参数');
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => {
    refs.toast.classList.remove('is-visible');
  }, 2200);
}

/* ------------------------------------------------------------------ */
/* Resize + init                                                      */
/* ------------------------------------------------------------------ */

function observeResize() {
  if (!('ResizeObserver' in window)) {
    window.addEventListener('resize', () => {
      if (lastCalc) drawCharts(lastCalc, true);
    });
    return;
  }

  let frame = null;
  const observer = new ResizeObserver(() => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      if (lastCalc) drawCharts(lastCalc, false);
    });
  });

  if (refs.depthSvg.parentElement) observer.observe(refs.depthSvg.parentElement);
  if (refs.chartWrap) observer.observe(refs.chartWrap);
  if (refs.circleChart.parentElement) {
    observer.observe(refs.circleChart.parentElement);
  }
  if (refs.rayScroll) observer.observe(refs.rayScroll);
}

function init() {
  buildSelects();
  syncControls();
  bindEvents();
  observeResize();
  render();
  window.setTimeout(() => updateUrlNow(), 200);
}

init();
