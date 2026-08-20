const registryKey = Symbol.for("@prosewire/process-singletons");

type RegistryHost = typeof globalThis & {
  [registryKey]?: Map<string, unknown>;
};

function registry(): Map<string, unknown> {
  const host = globalThis as RegistryHost;
  return (host[registryKey] ??= new Map());
}

export function processSingleton<A>(key: string, create: () => A): A {
  const singletons = registry();
  if (singletons.has(key)) return singletons.get(key) as A;
  const value = create();
  singletons.set(key, value);
  return value;
}

export function deleteProcessSingleton(key: string): boolean {
  return registry().delete(key);
}
