export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new ApiError(
      400,
      `${label} must be a whole number from ${min} to ${max}.`,
    );
  }
  return value;
}

export function passwordValue(value: unknown, label: string) {
  // bcrypt truncates at 72 bytes, so a character count alone is not sufficient.
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    Buffer.byteLength(value, "utf8") > 72
  ) {
    throw new ApiError(
      400,
      `${label} must contain at least 8 characters and at most 72 UTF-8 bytes.`,
    );
  }
  return value;
}

export function text(value: unknown, min: number, max: number, label: string) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    throw new ApiError(400, `${label} must contain ${min}–${max} characters.`);
  }
  return value.trim();
}

export function timeZone(value: unknown) {
  const zone = text(value, 1, 80, "Time zone");
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  } catch {
    throw new ApiError(400, "Choose a valid time zone.");
  }
  return zone;
}

export function localDay(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const DEFAULT_REWARDS = [
  "Space Explorer",
  "Math Match",
  "Puzzle Quest",
  "Word Wizard",
];
