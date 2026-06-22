export const PETYR_DEFAULT_TIMEZONE = "Europe/Rome";

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolvePetyrTimezone(rawValue = process.env.PETYR_TIMEZONE) {
  const normalizedValue = rawValue?.trim();

  if (normalizedValue && isValidTimeZone(normalizedValue)) {
    return normalizedValue;
  }

  return PETYR_DEFAULT_TIMEZONE;
}

export function getPetyrTimezone() {
  return resolvePetyrTimezone(process.env.PETYR_TIMEZONE);
}

function getDatePartsInTimezone(date: Date, timeZone = getPetyrTimezone()) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partByType.get("year")),
    month: Number(partByType.get("month")),
    day: Number(partByType.get("day"))
  };
}

export function getPetyrYearInTimezone(date = new Date(), timeZone = getPetyrTimezone()) {
  return getDatePartsInTimezone(date, timeZone).year;
}

export function isPetyrInitialForecastConsolidationDate(date = new Date(), timeZone = getPetyrTimezone()) {
  const parts = getDatePartsInTimezone(date, timeZone);
  return parts.month === 1 && parts.day === 1;
}

export function resolvePetyrDefaultYear(rawValue = process.env.PETYR_DEFAULT_YEAR, currentDate = new Date()) {
  const currentYear = currentDate.getFullYear();
  const normalizedValue = rawValue?.trim();

  if (!normalizedValue || normalizedValue.toLowerCase() === "current") {
    return currentYear;
  }

  const parsedYear = Number(normalizedValue);
  return Number.isFinite(parsedYear) ? parsedYear : currentYear;
}

export function getPetyrDefaultYear(currentDate = new Date()) {
  return resolvePetyrDefaultYear(process.env.PETYR_DEFAULT_YEAR, currentDate);
}
