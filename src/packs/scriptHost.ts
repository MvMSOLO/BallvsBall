import type { ScriptHooks } from "../sim/types";

/** Semi-sandbox: no DOM/network bindings, exceptions caught by the sim, call budget inside ctx. */
export function compileScript(source: string): ScriptHooks {
  const body = source
    .replace(/export\s+function\s+(\w+)/g, "exports.$1 = function")
    .replace(/export\s+const\s+(\w+)\s*=/g, "exports.$1 =");
  const factory = new Function(
    "exports",
    "fetch",
    "window",
    "document",
    "globalThis",
    "Function",
    "eval",
    "XMLHttpRequest",
    `"use strict";\n${body}\nreturn exports;`,
  ) as (
    exportsObj: ScriptHooks,
    fetch: undefined,
    window: undefined,
    document: undefined,
    globalThis: undefined,
    Function: undefined,
    evalArg: undefined,
    XMLHttpRequest: undefined,
  ) => ScriptHooks;
  return factory({}, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
}
