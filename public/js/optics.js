/**
 * First-order thin-lens optical model used by the CoC Lab interface.
 * All internal lengths are millimetres unless explicitly noted.
 */

export const FF_DIAGONAL_MM = Math.hypot(36, 24);

export const SENSORS = {
  'one-inch': {
    name: '1″',
    short: '1″',
    width: 13.2,
    height: 8.8,
    note: '大底手机主摄',
  },
  '1-1.28': {
    name: '1/1.28″',
    short: '1/1.28″',
    width: 9.8,
    height: 7.3,
    note: '旗舰主摄',
  },
  '1-1.3': {
    name: '1/1.3″',
    short: '1/1.3″',
    width: 9.6,
    height: 7.2,
    note: '旗舰主摄',
  },
  '1-1.56': {
    name: '1/1.56″',
    short: '1/1.56″',
    width: 8,
    height: 6,
    note: '主流主摄',
  },
  '1-2': {
    name: '1/2″',
    short: '1/2″',
    width: 6.4,
    height: 4.8,
    note: '潜望长焦',
  },
  '1-2.55': {
    name: '1/2.55″',
    short: '1/2.55″',
    width: 5.6,
    height: 4.2,
    note: '超广角',
  },
  '1-3.06': {
    name: '1/3.06″',
    short: '1/3.06″',
    width: 4.7,
    height: 3.5,
    note: '小底长焦',
  },
  custom: {
    name: '自定义',
    short: '自定义',
    width: 8,
    height: 6,
    note: '手动画幅',
  },
};

export const CAMERA_PRESETS = [
  {
    id: 'one-inch',
    name: '1″ 大底主摄',
    meta: '23 mm · f/1.75 · 50 MP',
    sensor: 'one-inch',
    equivFocal: 23,
    aperture: 1.75,
    megapixels: 50,
  },
  {
    id: 'flagship',
    name: '1/1.3″ 旗舰主摄',
    meta: '24 mm · f/1.7 · 50 MP',
    sensor: '1-1.3',
    equivFocal: 24,
    aperture: 1.7,
    megapixels: 50,
  },
  {
    id: 'mainstream',
    name: '1/1.56″ 主流主摄',
    meta: '24 mm · f/1.8 · 50 MP',
    sensor: '1-1.56',
    equivFocal: 24,
    aperture: 1.8,
    megapixels: 50,
  },
  {
    id: 'ultrawide',
    name: '1/2.55″ 超广角',
    meta: '13 mm · f/2.2 · 12 MP',
    sensor: '1-2.55',
    equivFocal: 13,
    aperture: 2.2,
    megapixels: 12,
  },
  {
    id: 'tele',
    name: '1/2″ 潜望长焦',
    meta: '90 mm · f/2.5 · 12 MP',
    sensor: '1-2',
    equivFocal: 90,
    aperture: 2.5,
    megapixels: 12,
  },
  {
    id: 'super-tele',
    name: '1/3.06″ 长焦',
    meta: '120 mm · f/2.8 · 12 MP',
    sensor: '1-3.06',
    equivFocal: 120,
    aperture: 2.8,
    megapixels: 12,
  },
];

// A fine set of common photographic stops, including the fractions used by phones.
export const APERTURES = [
  1.4, 1.6, 1.7, 1.75, 1.8, 2, 2.2, 2.4, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6,
  6.3, 7.1, 8, 9, 10, 11, 13, 14, 16,
];

export const LAYERS = [
  { id: 'fore', label: '前景', distance: 0.4, tone: 'warm' },
  { id: 'subject', label: '主体', distance: 1.2, tone: 'lime' },
  { id: 'far', label: '远景', distance: 8, tone: 'blue' },
];

export const FOCUS_MIN = 0.08;
export const FOCUS_MAX = 50;
export const WAVELENGTH_MM = 0.00055; // 550 nm, photopic green

export const DEFAULT_STATE = Object.freeze({
  preset: 'flagship',
  sensorKey: '1-1.3',
  sensorWidth: 9.6,
  sensorHeight: 7.2,
  equivFocal: 24,
  aperture: 1.7,
  focusDistance: 1.2,
  focusInfinity: false,
  megapixels: 50,
  cocMode: 'human',
  displayInches: 27,
  viewingDistanceCm: 60,
  acuityArcmin: 1,
  pixelK: 2,
  customCocUm: 8,
  backgroundDistance: 8,
  exaggeration: 3,
  scene: null,
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function cloneState(state) {
  return { ...state };
}

export function getSensor(state) {
  const width = Number(state.sensorWidth);
  const height = Number(state.sensorHeight);
  const validWidth = Number.isFinite(width) && width > 0 ? width : 8;
  const validHeight = Number.isFinite(height) && height > 0 ? height : 6;
  const diagonal = Math.hypot(validWidth, validHeight);
  const preset = SENSORS[state.sensorKey];
  return {
    key: state.sensorKey,
    name: preset?.name ?? '自定义',
    short: preset?.short ?? '自定义',
    width: validWidth,
    height: validHeight,
    diagonal,
    area: validWidth * validHeight,
    crop: FF_DIAGONAL_MM / diagonal,
  };
}

export function getActualFocalMm(equivFocal, sensor) {
  return (equivFocal * sensor.diagonal) / FF_DIAGONAL_MM;
}

export function getPixelPitchMm(sensor, megapixels) {
  const mp = Math.max(0.1, Number(megapixels) || 0.1);
  return Math.sqrt((sensor.width * sensor.height) / (mp * 1_000_000));
}

export function getCocThresholdMm(state, sensor, pixelPitchMm) {
  if (state.cocMode === 'classic') {
    return sensor.diagonal / 1500;
  }

  if (state.cocMode === 'pixel') {
    return Math.max(0.0001, state.pixelK * pixelPitchMm);
  }

  if (state.cocMode === 'custom') {
    return Math.max(0.0001, Number(state.customCocUm) / 1000);
  }

  // Human vision on a final display. The blur is first expressed on the
  // display, then projected back through the display magnification.
  const displayDiagonalMm = Math.max(25.4, state.displayInches * 25.4);
  const viewingDistanceMm = Math.max(10, state.viewingDistanceCm * 10);
  const angleRad = (Math.max(0.05, state.acuityArcmin) * Math.PI) / (180 * 60);
  const displayCocMm = 2 * viewingDistanceMm * Math.tan(angleRad / 2);
  return Math.max(0.0001, (displayCocMm * sensor.diagonal) / displayDiagonalMm);
}

export function getHyperfocalMm(focalMm, aperture, cocMm) {
  return (focalMm * focalMm) / (aperture * cocMm) + focalMm;
}

export function getDepthOfFieldMm(focalMm, aperture, cocMm, focusMm) {
  const hyperfocalMm = getHyperfocalMm(focalMm, aperture, cocMm);

  if (!Number.isFinite(focusMm)) {
    return {
      hyperfocalMm,
      nearMm: hyperfocalMm,
      farMm: Infinity,
      totalMm: Infinity,
    };
  }

  const nearDenominator = hyperfocalMm + focusMm - 2 * focalMm;
  const nearMm = (focusMm * (hyperfocalMm - focalMm)) / nearDenominator;
  const farDenominator = hyperfocalMm - focusMm;
  const farMm =
    farDenominator <= 0
      ? Infinity
      : (focusMm * (hyperfocalMm - focalMm)) / farDenominator;

  return {
    hyperfocalMm,
    nearMm,
    farMm,
    totalMm: Number.isFinite(farMm) ? farMm - nearMm : Infinity,
  };
}

/**
 * Diameter of the geometric blur circle on the sensor for an object at D.
 * Focus distance s and object distance D are both in millimetres.
 */
export function getBlurDiameterMm(focalMm, aperture, focusMm, distanceMm) {
  if (!Number.isFinite(focalMm) || focalMm <= 0) return 0;
  if (!Number.isFinite(aperture) || aperture <= 0) return 0;

  if (!Number.isFinite(focusMm)) {
    if (!Number.isFinite(distanceMm)) return 0;
    if (distanceMm <= 0) return 0;
    return (focalMm * focalMm) / (aperture * distanceMm);
  }

  const focusMinusFocal = focusMm - focalMm;
  if (focusMinusFocal <= 0) return 0;

  if (!Number.isFinite(distanceMm)) {
    return (focalMm * focalMm) / (aperture * focusMinusFocal);
  }

  if (distanceMm <= 0) return 0;

  const delta = Math.abs(distanceMm - focusMm);
  if (delta < 1e-7) return 0;

  return (
    (focalMm * focalMm * delta) /
    (aperture * distanceMm * focusMinusFocal)
  );
}

export function computeAll(state) {
  const sensor = getSensor(state);
  const megapixels = clamp(Number(state.megapixels) || 12, 1, 500);
  const pixelPitchMm = getPixelPitchMm(sensor, megapixels);
  const focalMm = getActualFocalMm(state.equivFocal, sensor);
  const aperture = Math.max(0.7, Number(state.aperture) || 1.8);
  const focusMm = state.focusInfinity
    ? Infinity
    : Math.max(FOCUS_MIN, Number(state.focusDistance) || 1) * 1000;
  const cocThresholdMm = getCocThresholdMm(state, sensor, pixelPitchMm);
  const dof = getDepthOfFieldMm(focalMm, aperture, cocThresholdMm, focusMm);
  const focusMagnification = Number.isFinite(focusMm)
    ? focalMm / Math.max(focalMm + 0.001, focusMm - focalMm)
    : 0;
  const airyMm =
    2.44 * WAVELENGTH_MM * aperture * (1 + focusMagnification);

  const imageDistanceMm = Number.isFinite(focusMm)
    ? (focalMm * focusMm) / (focusMm - focalMm)
    : focalMm;
  const nearImageDistanceMm = (focalMm * dof.nearMm) / (dof.nearMm - focalMm);
  const farImageDistanceMm = Number.isFinite(dof.farMm)
    ? (focalMm * dof.farMm) / (dof.farMm - focalMm)
    : focalMm;
  const frontFocusMm = Math.max(0, imageDistanceMm - farImageDistanceMm);
  const backFocusMm = Math.max(0, nearImageDistanceMm - imageDistanceMm);

  const displayDiagonalMm = Math.max(25.4, state.displayInches * 25.4);
  const viewingDistanceMm = Math.max(10, state.viewingDistanceCm * 10);
  const displayMagnification = displayDiagonalMm / sensor.diagonal;

  const backgroundDistance = Math.max(
    0.05,
    Number(state.backgroundDistance) || 8,
  );
  const backgroundBlurMm = getBlurDiameterMm(
    focalMm,
    aperture,
    focusMm,
    backgroundDistance * 1000,
  );
  const infinityBlurMm = getBlurDiameterMm(
    focalMm,
    aperture,
    focusMm,
    Infinity,
  );

  const pixelCocMm = state.pixelK * pixelPitchMm;
  const classicCocMm = sensor.diagonal / 1500;
  const humanAngleRad = (Math.max(0.05, state.acuityArcmin) * Math.PI) / (180 * 60);
  const humanDisplayCocMm =
    2 * viewingDistanceMm * Math.tan(humanAngleRad / 2);
  const humanCocMm =
    (humanDisplayCocMm * sensor.diagonal) / displayDiagonalMm;

  const layers = LAYERS.map((layer) => {
    const blurMm = getBlurDiameterMm(
      focalMm,
      aperture,
      focusMm,
      layer.distance * 1000,
    );
    return {
      ...layer,
      blurMm,
      blurUm: blurMm * 1000,
      pixels: blurMm / pixelPitchMm,
    };
  });

  return {
    state,
    sensor,
    megapixels,
    pixelPitchMm,
    focalMm,
    equivFocal: Number(state.equivFocal) || focalMm,
    aperture,
    focusMm,
    focusInfinity: state.focusInfinity,
    focusDistanceM: state.focusInfinity
      ? Infinity
      : Math.max(FOCUS_MIN, Number(state.focusDistance) || 1),
    focusMagnification,
    imageDistanceMm,
    frontFocusMm,
    backFocusMm,
    frontFocusUm: frontFocusMm * 1000,
    backFocusUm: backFocusMm * 1000,
    totalFocusUm: (frontFocusMm + backFocusMm) * 1000,
    fovHorizontalDeg:
      (2 * Math.atan(sensor.width / (2 * focalMm)) * 180) / Math.PI,
    fovVerticalDeg:
      (2 * Math.atan(sensor.height / (2 * focalMm)) * 180) / Math.PI,
    fovDiagonalDeg:
      (2 * Math.atan(sensor.diagonal / (2 * focalMm)) * 180) / Math.PI,
    apertureDiameterMm: focalMm / aperture,
    cocThresholdMm,
    cocThresholdUm: cocThresholdMm * 1000,
    cocThresholdPixels: cocThresholdMm / pixelPitchMm,
    cocThresholdDiagonals: sensor.diagonal / cocThresholdMm,
    classicCocMm,
    pixelCocMm,
    humanCocMm,
    humanDisplayCocMm,
    displayMagnification,
    displayDiagonalMm,
    viewingDistanceMm,
    nearMm: dof.nearMm,
    farMm: dof.farMm,
    totalDofMm: dof.totalMm,
    hyperfocalMm: dof.hyperfocalMm,
    backgroundDistance,
    backgroundBlurMm,
    backgroundBlurUm: backgroundBlurMm * 1000,
    backgroundBlurPixels: backgroundBlurMm / pixelPitchMm,
    backgroundRatio:
      backgroundBlurMm / Math.max(0.000001, cocThresholdMm),
    infinityBlurMm,
    infinityBlurUm: infinityBlurMm * 1000,
    airyMm,
    airyUm: airyMm * 1000,
    airyPixels: airyMm / pixelPitchMm,
    diffractionLimitN: (2 * pixelPitchMm) / (2.44 * WAVELENGTH_MM),
    layers,
  };
}

export function getCocAtDistance(calc, distanceM) {
  return getBlurDiameterMm(
    calc.focalMm,
    calc.aperture,
    calc.focusMm,
    distanceM * 1000,
  );
}

export function formatAperture(value) {
  if (value < 1.8) return value.toFixed(2).replace(/0$/, '');
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(1);
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '∞';
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: 0,
    }).format(value);
  }
  return value.toFixed(digits);
}

export function formatLengthMeters(meters, digits = 2) {
  if (!Number.isFinite(meters)) return '∞';
  if (meters < 0.01) return `${(meters * 1000).toFixed(0)} mm`;
  if (meters < 1) return `${(meters * 100).toFixed(1)} cm`;
  if (meters < 10) return `${meters.toFixed(digits)} m`;
  if (meters < 100) return `${meters.toFixed(1)} m`;
  return `${meters.toFixed(0)} m`;
}

export function formatDistanceWord(meters) {
  if (!Number.isFinite(meters)) return '∞';
  if (meters < 1) return `${(meters * 100).toFixed(0)} cm`;
  return `${meters.toFixed(meters < 10 ? 1 : 0)} m`;
}

export function formatMicro(valueUm) {
  if (!Number.isFinite(valueUm)) return '∞';
  if (valueUm >= 1000) return `${(valueUm / 1000).toFixed(2)} mm`;
  if (valueUm >= 100) return `${valueUm.toFixed(0)} µm`;
  if (valueUm >= 10) return `${valueUm.toFixed(1)} µm`;
  return `${valueUm.toFixed(2)} µm`;
}

export function getFocusSliderPosition(distanceM) {
  const clamped = clamp(distanceM, FOCUS_MIN, FOCUS_MAX);
  return (
    (Math.log(clamped / FOCUS_MIN) / Math.log(FOCUS_MAX / FOCUS_MIN)) * 1000
  );
}

export function getFocusFromSlider(position) {
  const t = clamp(position, 0, 1000) / 1000;
  return FOCUS_MIN * Math.pow(FOCUS_MAX / FOCUS_MIN, t);
}

export function nearestApertureIndex(value) {
  let best = 0;
  let delta = Infinity;
  APERTURES.forEach((aperture, index) => {
    const candidate = Math.abs(Math.log(aperture) - Math.log(value));
    if (candidate < delta) {
      delta = candidate;
      best = index;
    }
  });
  return best;
}
