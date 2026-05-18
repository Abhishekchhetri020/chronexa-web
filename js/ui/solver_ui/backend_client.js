/* Chronexa Solver — Backend client + browser-worker adapter.
 *
 * Public API:
 *   SolverUI.run({ school, options, algorithm, onFallback }) -> Source
 *     algorithm:  "browser" | "cloud"
 *     options:    SolveRequest.options (timeLimitSec, seed, verbose, ...)
 *     onFallback: optional callback fired iff a cloud run had to fall back
 *
 *   Source = {
 *     subscribe(handler) -> unsubscribe
 *     cancel()
 *     pause(), resume()                  // visual freeze only — see SOLVER_UI.md
 *     mode: "browser" | "cloud"
 *   }
 *
 *   Handler events:
 *     { type: "progress", iter, softScore, hardConflicts, durationMs }
 *     { type: "done",     result: SolveResponse }
 *     { type: "error",    message }
 *
 * Cloud path: POST `${CHRONEXA_BACKEND_URL}/solve` with the SolveRequest
 * payload; while awaiting, synthesize heartbeat progress every 750 ms so the
 * modal stays alive. The backend exposes a synchronous /solve only (see
 * docs/DEPLOY.md) — when Agent B adds /solve/status/:id we'll switch to true
 * polling without changing this surface.
 */
(function (global) {
  "use strict";

  const HEARTBEAT_MS = 750;
  const DEFAULT_TIMEOUT_MS = 90_000;

  // Capture this script's URL at load time so the Worker URL resolves
  // correctly even when run() is called from a click handler later.
  const SELF_URL = (document.currentScript && document.currentScript.src) || location.href;

  function makeSubscribable() {
    const listeners = new Set();
    return {
      subscribe(h) { listeners.add(h); return () => listeners.delete(h); },
      emit(ev) { for (const h of listeners) { try { h(ev); } catch (e) { console.error(e); } } },
    };
  }

  // -------- browser worker source -----------------------------------------
  function runBrowser(school, options) {
    const sub = makeSubscribable();
    let paused = false;
    let buf = [];
    let cancelled = false;

    const url = new URL("../../solver/worker.js", SELF_URL);
    const worker = new Worker(url, { type: "module" });

    worker.onmessage = (ev) => {
      const m = ev.data || {};
      if (cancelled) return;
      if (paused && m.type === "progress") { buf.push(m); return; }
      if (m.type === "done") {
        sub.emit({ type: "done", result: m.result });
        worker.terminate();
      } else if (m.type === "error") {
        sub.emit({ type: "error", message: m.message || "worker error" });
        worker.terminate();
      } else if (m.type === "progress") {
        sub.emit(m);
      }
    };
    worker.onerror = (e) => sub.emit({ type: "error", message: (e && e.message) || "worker error" });

    worker.postMessage({ type: "solve", school, options });

    return {
      mode: "browser",
      subscribe: sub.subscribe,
      cancel() {
        cancelled = true;
        try { worker.terminate(); } catch {}
        sub.emit({ type: "cancelled" });
      },
      pause()  { paused = true; },
      resume() {
        paused = false;
        const tail = buf; buf = [];
        if (tail.length) sub.emit(tail[tail.length - 1]);
      },
    };
  }

  // -------- cloud (HTTP) source -------------------------------------------
  function runCloud(school, options, onFallback) {
    const sub = makeSubscribable();
    const baseUrl = (global.CHRONEXA_BACKEND_URL || "").replace(/\/+$/, "");
    if (!baseUrl) {
      if (onFallback) try { onFallback("CHRONEXA_BACKEND_URL not set"); } catch {}
      return runBrowser(school, options);
    }

    const ctl = new AbortController();
    const t0 = performance.now();
    const timeLimitMs = Math.max(1000, (options && options.timeLimitSec ? options.timeLimitSec : 60) * 1000);
    let lastIter = 0;
    let cancelled = false;
    let paused = false;
    let pausedSnap = null;

    const heartbeat = setInterval(() => {
      if (cancelled) return;
      const dt = performance.now() - t0;
      lastIter += Math.max(1, Math.round(timeLimitMs / 200));
      const ev = {
        type: "progress",
        iter: lastIter,
        softScore: 0,
        hardConflicts: 0,
        durationMs: Math.round(dt),
      };
      if (paused) { pausedSnap = ev; return; }
      sub.emit(ev);
    }, HEARTBEAT_MS);

    const timeout = setTimeout(() => {
      if (cancelled) return;
      try { ctl.abort(); } catch {}
    }, DEFAULT_TIMEOUT_MS + timeLimitMs);

    fetch(baseUrl + "/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ school, options }),
      signal: ctl.signal,
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(new Error(b.error || ("HTTP " + r.status)))))
      .then(result => {
        if (cancelled) return;
        sub.emit({ type: "done", result });
      })
      .catch(err => {
        if (cancelled) return;
        const msg = (err && err.name === "AbortError") ? "timeout" : ((err && err.message) || String(err));
        // Soft fallback: if the cloud endpoint refused or timed out, hand off to
        // the browser worker so the user still gets a result.
        if (onFallback) try { onFallback("cloud failed: " + msg); } catch {}
        const local = runBrowser(school, options);
        local.subscribe(sub.emit);
        // Caller's source object delegates cancel/pause to the local worker now.
        Object.assign(src, local);
      })
      .finally(() => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
      });

    const src = {
      mode: "cloud",
      subscribe: sub.subscribe,
      cancel() {
        cancelled = true;
        try { ctl.abort(); } catch {}
        clearInterval(heartbeat);
        clearTimeout(timeout);
        sub.emit({ type: "cancelled" });
      },
      pause()  { paused = true; },
      resume() { paused = false; if (pausedSnap) { sub.emit(pausedSnap); pausedSnap = null; } },
    };
    return src;
  }

  function run(spec) {
    const school = spec.school;
    const options = spec.options || {};
    const algo = spec.algorithm || "browser";
    if (algo === "cloud") return runCloud(school, options, spec.onFallback);
    return runBrowser(school, options);
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.run = run;
  global.SolverUI._runBrowser = runBrowser;   // exported for tests
  global.SolverUI._runCloud   = runCloud;
})(typeof window !== "undefined" ? window : globalThis);
