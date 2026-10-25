import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APERTURES,
  DEFAULT_STATE,
  FF_DIAGONAL_MM,
  SENSORS,
  computeAll,
  formatAperture,
  getActualFocalMm,
  getBlurDiameterMm,
  getCocThresholdMm,
  getDepthOfFieldMm,
  getFocusFromSlider,
  getFocusSliderPosition,
  getHyperfocalMm,
  getPixelPitchMm,
  getSensor,
  nearestApertureIndex,
} from '../public/js/optics.js';

const close = (actual, expected, tolerance = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

const baseState = (overrides = {}) => ({ ...DEFAULT_STATE, ...overrides });

test('full-frame sensor has a 1.0 crop factor and 43.27 mm diagonal', () => {
  const sensor = getSensor(baseState({ sensorWidth: 36, sensorHeight: 24 }));
  close(sensor.diagonal, FF_DIAGONAL_MM, 1e-9);
  close(sensor.crop, 1, 1e-9);
});

test('phone sensor preset resolves crop and actual focal length', () => {
  const state = baseState({ sensorKey: '1-1.3' });
  const sensor = getSensor(state);
  close(sensor.width, SENSORS['1-1.3'].width);
  close(sensor.crop, FF_DIAGONAL_MM / 12, 1e-9);
  close(getActualFocalMm(24, sensor), 24 / (FF_DIAGONAL_MM / 12), 1e-9);
});

test('classic CoC is sensor diagonal divided by 1500', () => {
  const state = baseState({ cocMode: 'classic' });
  const sensor = getSensor(state);
  close(getCocThresholdMm(state, sensor, 0.001), sensor.diagonal / 1500);
});

test('human-viewing CoC matches a direct display calculation', () => {
  const state = baseState({
    cocMode: 'human',
    displayInches: 27,
    viewingDistanceCm: 60,
    acuityArcmin: 1,
  });
  const sensor = getSensor(state);
  const angle = (Math.PI / 180) / 60;
  const displayCoc = 2 * 600 * Math.tan(angle / 2);
  const expected = (displayCoc * sensor.diagonal) / (27 * 25.4);
  close(getCocThresholdMm(state, sensor, 0.001), expected, 1e-12);
  assert.ok(expected > 0.003 && expected < 0.0031);
});

test('pixel CoC scales with pixel pitch', () => {
  const sensor = getSensor(baseState());
  const pitch = getPixelPitchMm(sensor, 50);
  assert.ok(pitch > 0.0011 && pitch < 0.0012);
  close(getCocThresholdMm(baseState({ cocMode: 'pixel', pixelK: 2 }), sensor, pitch), pitch * 2);
});

test('custom CoC accepts a direct micrometre threshold', () => {
  const state = baseState({ cocMode: 'custom', customCocUm: 12.5 });
  const sensor = getSensor(state);
  close(getCocThresholdMm(state, sensor, 0.001), 0.0125, 1e-12);
});

test('hyperfocal distance follows H = f^2 / (N c) + f', () => {
  const f = 6.67;
  const n = 1.7;
  const c = 0.003054;
  close(getHyperfocalMm(f, n, c), (f * f) / (n * c) + f, 1e-9);
});

test('finite depth of field brackets the focus plane and respects the CoC threshold', () => {
  const f = 6.669;
  const n = 1.7;
  const c = 0.003054;
  const focus = 1200;
  const dof = getDepthOfFieldMm(f, n, c, focus);

  assert.ok(dof.nearMm < focus && dof.farMm > focus);
  close(getBlurDiameterMm(f, n, focus, dof.nearMm), c, 1e-9);
  close(getBlurDiameterMm(f, n, focus, dof.farMm), c, 1e-9);
  close(dof.totalMm, dof.farMm - dof.nearMm, 1e-9);
});

test('focusing at hyperfocal puts the near limit at H/2 and far at infinity', () => {
  const f = 6.669;
  const n = 1.7;
  const c = 0.003054;
  const h = getHyperfocalMm(f, n, c);
  const dof = getDepthOfFieldMm(f, n, c, h);

  close(dof.nearMm, h / 2, 1e-6);
  assert.equal(dof.farMm, Infinity);
  assert.equal(dof.totalMm, Infinity);
});

test('objects at the focus plane have zero geometric blur', () => {
  assert.equal(getBlurDiameterMm(6.67, 1.7, 1200, 1200), 0);
  close(getBlurDiameterMm(6.67, 1.7, 1200, 1200.00001), 0, 1e-8);
});

test('blur grows toward infinity behind a finite focus plane', () => {
  const f = 6.669;
  const n = 1.7;
  const focus = 1200;
  const at2m = getBlurDiameterMm(f, n, focus, 2000);
  const at8m = getBlurDiameterMm(f, n, focus, 8000);
  const atInfinity = getBlurDiameterMm(f, n, focus, Infinity);

  assert.ok(at2m > 0);
  assert.ok(at8m > at2m);
  assert.ok(atInfinity > at8m);
  close(atInfinity, (f * f) / (n * (focus - f)), 1e-9);
});

test('infinity focus has zero blur at infinity and more blur up close', () => {
  const f = 6.669;
  const n = 1.7;
  assert.equal(getBlurDiameterMm(f, n, Infinity, Infinity), 0);
  assert.ok(
    getBlurDiameterMm(f, n, Infinity, 500) >
      getBlurDiameterMm(f, n, Infinity, 2000),
  );
});

test('infinity focus depth of field begins at the hyperfocal distance', () => {
  const f = 6.669;
  const n = 1.7;
  const c = 0.003054;
  const h = getHyperfocalMm(f, n, c);
  const dof = getDepthOfFieldMm(f, n, c, Infinity);
  close(dof.nearMm, h, 1e-9);
  assert.equal(dof.farMm, Infinity);
});

test('computeAll returns a coherent default scene', () => {
  const calc = computeAll(baseState());
  assert.ok(calc.cocThresholdUm > 2.9 && calc.cocThresholdUm < 3.2);
  assert.ok(calc.hyperfocalMm > 8000 && calc.hyperfocalMm < 9000);
  assert.ok(calc.backgroundBlurUm > calc.cocThresholdUm);
  assert.ok(calc.airyUm > 2.2 && calc.airyUm < 2.4);
  assert.ok(calc.fovHorizontalDeg > 70 && calc.fovHorizontalDeg < 72);
  assert.equal(calc.layers.length, 3);
  assert.ok(calc.layers[0].blurUm > calc.layers[1].blurUm);
});

test('image-side focus depths are consistent with the thin-lens conjugates', () => {
  const calc = computeAll(baseState());
  const f = calc.focalMm;
  const image = (f * calc.focusMm) / (calc.focusMm - f);
  const nearImage = (f * calc.nearMm) / (calc.nearMm - f);
  const farImage = (f * calc.farMm) / (calc.farMm - f);

  close(calc.imageDistanceMm, image, 1e-9);
  close(calc.frontFocusUm, (image - farImage) * 1000, 1e-9);
  close(calc.backFocusUm, (nearImage - image) * 1000, 1e-9);
  close(calc.totalFocusUm, calc.frontFocusUm + calc.backFocusUm, 1e-9);
});

test('larger aperture number reduces blur and increases depth of field', () => {
  const wide = computeAll(baseState({ aperture: 1.7 }));
  const stopped = computeAll(baseState({ aperture: 3.4 }));
  assert.ok(stopped.backgroundBlurUm < wide.backgroundBlurUm);
  assert.ok(stopped.totalDofMm > wide.totalDofMm);
  assert.ok(stopped.airyUm > wide.airyUm);
});

test('longer equivalent focal length narrows the field of view', () => {
  const wide = computeAll(baseState({ equivFocal: 24 }));
  const tele = computeAll(baseState({ equivFocal: 48 }));
  assert.ok(tele.fovHorizontalDeg < wide.fovHorizontalDeg);
  assert.ok(tele.backgroundBlurUm > wide.backgroundBlurUm);
});

test('closer focus reduces depth of field and increases background blur', () => {
  const far = computeAll(baseState({ focusDistance: 1.2 }));
  const near = computeAll(baseState({ focusDistance: 0.6 }));
  assert.ok(near.totalDofMm < far.totalDofMm);
  assert.ok(near.backgroundBlurUm > far.backgroundBlurUm);
});

test('focus slider mapping is reversible and bounded', () => {
  for (const distance of [0.08, 0.15, 0.6, 1.2, 8, 50]) {
    close(getFocusFromSlider(getFocusSliderPosition(distance)), distance, 1e-9);
  }
  close(getFocusFromSlider(-100), 0.08, 1e-9);
  close(getFocusFromSlider(5000), 50, 1e-9);
});

test('aperture helpers snap and format common values', () => {
  assert.equal(nearestApertureIndex(1.72), APERTURES.indexOf(1.7));
  assert.equal(formatAperture(1.7), '1.7');
  assert.equal(formatAperture(1.75), '1.75');
  assert.equal(formatAperture(4), '4');
});
