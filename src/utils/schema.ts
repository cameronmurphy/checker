import { getDaysOfWeek } from './intl.ts';

export function validateRollupValue(value: string): boolean {
  const days = getDaysOfWeek();
  const hours = '([1-9]|1[0-2])(am|pm)';
  const dayOfMonth = '([23]?1st|[12]?[2-3](?:nd|rd)|[4-9]th|1[0-9]th|2[0-9]th|30th|31st)';
  const dayOfWeekAndHour = `((${days.join('|')}) ${hours})`;

  const validationPatterns = [
    'none',
    new RegExp(`^${hours}( ${hours})*$`, 'i'),
    new RegExp(`^${dayOfWeekAndHour}$`, 'i'),
    new RegExp(`^${dayOfMonth} ${hours}$`, 'i'),
  ];

  return validationPatterns.some((pattern) =>
    typeof pattern === 'string' ? value === pattern : pattern.test(value.toLowerCase())
  );
}
