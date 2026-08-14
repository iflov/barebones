export interface PublishMessage {
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly options?: {
    readonly attempts?: number;
    readonly deduplicationKey?: string;
    readonly delayMs?: number;
  };
}

/** 애플리케이션이 메시지 브로커 종류를 모르고 발행하기 위한 outbound port. */
export interface MessageQueuePort {
  publish(message: PublishMessage): Promise<void>;
}

export const MESSAGE_QUEUE = Symbol('MESSAGE_QUEUE');
