import type { Clock } from "../clock.ts";

const START = new Date("2026-01-01T12:00:00Z");

export class TestClock implements Clock {
  private current = START.getTime();

  now(): Date {
    return new Date(this.current);
  }

  advance(millis: number): void {
    this.current += millis;
  }
}
