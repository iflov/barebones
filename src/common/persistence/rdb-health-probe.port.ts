export interface RdbHealthProbePort {
  ping(): Promise<void>;
}

export const RDB_HEALTH_PROBE = Symbol('RDB_HEALTH_PROBE');
