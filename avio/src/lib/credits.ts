/**
 * Credits are stored and sent over the wire as whole "units" so that arithmetic
 * on balances is exact. 100 units make one credit, which also makes a unit the
 * smallest amount the UI ever shows (0.01 credits).
 */
export const UNITS_PER_CREDIT = 100;

export function creditsToUnits(credits: number): number {
  return Math.round(credits * UNITS_PER_CREDIT);
}

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const precise = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `precise` shows two decimals (0.42). `whole` floors to a whole credit so a
 * balance is never displayed as more than the user really has.
 */
export function formatCredits(
  units: number,
  style: "precise" | "whole" = "precise",
): string {
  const credits = units / UNITS_PER_CREDIT;
  return style === "whole"
    ? whole.format(Math.floor(credits))
    : precise.format(credits);
}
