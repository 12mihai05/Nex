export function calculateReminderTime(programStart: Date, offsetMinutes: number): Date {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 24 * 60) throw new Error("Invalid reminder offset");
  return new Date(programStart.getTime() - offsetMinutes * 60_000);
}
