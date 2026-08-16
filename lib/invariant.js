// Invariant companion for @princepainter/dsh-gpu-cleanup — kept for DSH
// dual-face parity (every package exposes an invariant entry; this one has no
// runtime invariant because the browser half owns the entire user-facing surface).
const PACKAGE_NAME = "@princepainter/dsh-gpu-cleanup";
const name = "gpu-cleanup-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export { apply, inject, name };
