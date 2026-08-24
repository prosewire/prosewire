import { Context, Layer, type Redacted } from "effect";

export interface Shape {
  readonly redisUrl: Redacted.Redacted<string>;
}

export class Service extends Context.Service<Service, Shape>()(
  "@prosewire/jobs/Config",
) {}

export const layer = (redisUrl: Redacted.Redacted<string>) =>
  Layer.succeed(Service, Service.of({ redisUrl }));
