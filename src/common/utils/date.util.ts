import dayjs, { type ConfigType } from 'dayjs';

export function toIsoString(value: ConfigType): string {
  return dayjs(value).toISOString();
}
