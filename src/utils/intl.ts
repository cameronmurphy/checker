export function getDaysOfWeek() {
  return Array.from(
    { length: 7 },
    (_, i) => new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(Date.UTC(1, 0, i + 2))),
  );
}
