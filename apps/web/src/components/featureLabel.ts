import type { Feature } from '@cw/model';
import { featureLabels, type Sheet } from '@cw/rules';

/**
 * The name each feature's row, buttons and options group are known by on the Features page, and
 * what the "Hidden" drawer shows: the plain name, unless another feature on the page or in the
 * drawer has the same one (see `featureLabels`).
 */
export function featureLabeller(sheet: Sheet): (feature: Feature) => string {
  const labels = featureLabels(sheet.features, sheet.hiddenFeatures, sheet.featureSource);
  return (feature) => labels[feature.key] ?? feature.name;
}
