// Vendored from @deepseek-ai/dsh-settings@0.1.0-rc.6 (MIT, deepseek-ai/deepseek-harness).
//
// Why vendored: this profile plugin is distributed as a single self-contained
// bundle so `dsh plugin add` works on a machine where the plugin directory is
// only symlink-linked, never npm-installed. Importing the real package would
// drag in @deepseek-ai/cordis (its peer), and a second cordis instance in the
// bundle would break the plugin. These three exported helpers use only the
// `ctx` / `settings` service objects handed to them at runtime — no cordis
// import — so vendoring them here is safe and keeps the bundle cordis-free.
// Keep in sync with upstream dsh-settings when bumping to a newer rc.

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Brand a raw string as a SettingsNamespace (lowercase kebab-case). */
export function settingsNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
  }
  return value;
}

/** Value mirror of FiberState members; a const enum has no runtime object. */
const FIBER_DISPOSED = 4;
const FIBER_UNLOADING = 5;

/** Whether the consumer's own fiber is tearing down (not just losing the settings service). */
function isUnloading(ctx) {
  const state = ctx.fiber.state;
  return state === FIBER_UNLOADING || state === FIBER_DISPOSED;
}

/**
 * Install the canonical optional-settings consumer wiring: while a settings
 * service exists, register `ns` with the consumer's composition entry as the
 * `base` layer and point the source thunk at the resolved scope; when the
 * service goes away (disposal, provider reload), fall back to the entry so
 * the consumer keeps working exactly as composed.
 */
export function installSettingsSection(ctx, ns, schema, entry, hooks) {
  ctx.inject(["settings"], (sctx) => {
    const scope = sctx.settings.register(ns, schema, {
      base: entry,
      ...(hooks.validate === undefined ? {} : { validate: hooks.validate }),
    });
    hooks.setSource(() => scope.get());
    sctx.effect(() => () => {
      if (isUnloading(ctx)) return;
      hooks.setSource(() => entry);
      hooks.onChange();
    });
    hooks.onChange();
    scope.watch(() => {
      if (isUnloading(ctx)) return;
      hooks.onChange();
    });
  });
}