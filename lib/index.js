// Node-side (host) half of the dsh-gpu-cleanup package.
// The plugin is browser-only — its work is to render a "Release GPU" button on
// the Web UI conversation header. There is no headless / host-side equivalent
// to register, so this entry is a deliberate no-op. The Cordis loader must
// still be able to import this package from Node, so we keep the file free of
// any `window`/`document` references.
const name = "gpu-cleanup";
const inject = [];
function apply() {
	// No host-side registration: the client half (./lib/client.js) owns the
	// UI contribution once the browser fetches /plugins/gpu-cleanup/client.js.
}
export { apply, inject, name };
