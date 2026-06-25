import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAnnualForecastOngoing,
  calculateAnnualForecastPercentages,
  getAnnualForecastEntryDefaultYear,
  getAnnualForecastEntryInitialMode,
  getAnnualForecastEntryYearOptions,
  isPetyrAnnualConfidence
} from "../src/lib/petyr/annualForecastEntryRules";

function dateFor(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

test("Annual Forecast Entry year options start at 2026 and include at least 2026 and 2027", () => {
  assert.deepEqual(getAnnualForecastEntryYearOptions(dateFor(2026, 6, 25)), [2026, 2027]);
});

test("Annual Forecast Entry default year switches on December 10 and resets on January 1", () => {
  assert.equal(getAnnualForecastEntryDefaultYear(dateFor(2026, 12, 9)), 2026);
  assert.equal(getAnnualForecastEntryDefaultYear(dateFor(2026, 12, 10)), 2027);
  assert.equal(getAnnualForecastEntryDefaultYear(dateFor(2027, 1, 1)), 2027);
});

test("Annual Forecast Entry progressively exposes next year", () => {
  assert.deepEqual(getAnnualForecastEntryYearOptions(dateFor(2027, 1, 1)), [2026, 2027, 2028]);
});

test("FC Initial is editable only from December 10 previous year through January 10 target year", () => {
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2026, 12, 9)).editable, false);
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2026, 12, 10)).editable, true);
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2027, 1, 10)).editable, true);
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2027, 1, 11)).editable, false);
});

test("FC Ongoing sums only saved or confirmed values passed to the calculator", () => {
  assert.equal(calculateAnnualForecastOngoing([100, null, undefined, 250.5]), 350.5);
});

test("Annual Forecast Entry confidence values are closed", () => {
  assert.equal(isPetyrAnnualConfidence("01 High"), true);
  assert.equal(isPetyrAnnualConfidence("02 Mid"), true);
  assert.equal(isPetyrAnnualConfidence("03 Low"), true);
  assert.equal(isPetyrAnnualConfidence("04 Unknown"), false);
});

test("Annual Forecast Entry percentages handle zero FC Ongoing", () => {
  assert.deepEqual(calculateAnnualForecastPercentages({ revenue: 100, planned: 50, fcOngoing: 0 }), {
    revenuePct: null,
    plannedPct: null,
    uncoveredPct: null
  });
});

test("Annual Forecast Entry percentages derive revenue, planned and uncovered shares", () => {
  assert.deepEqual(calculateAnnualForecastPercentages({ revenue: 25, planned: 50, fcOngoing: 100 }), {
    revenuePct: 0.25,
    plannedPct: 0.5,
    uncoveredPct: 0.25
  });
});
