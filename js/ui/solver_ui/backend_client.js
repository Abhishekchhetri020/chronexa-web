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
 *     { type: "progress", iter, softScore, hardConflicts, backtracks?, durationMs }
 *     { type: "done",     result: SolveResponse }
 *     { type: "error",    message }
 *
 * Cloud path (wave-3):
 *   1. POST `${CHRONEXA_BACKEND_URL}/solve/start` → { jobId }
 *   2. setInterval(1000) → GET `/solve/status/:jobId` → { state, progress, result?, error? }
 *      state ∈ "queued" | "running" | "done" | "cancelled" | "error"
 *   3. cancel() → POST `/solve/cancel/:jobId`
 *
 * Backward compat:
 *   If `/solve/start` returns 404 (older backend, sync-only), we fall back to
 *   the legacy `POST /solve` + 750ms synthesized heartbeat path. The Source
 *   contract is identical either way.
 */
(function (global) {
  "use strict";

  const HEARTBEAT_MS = 750;
  const POLL_MS = 1000;
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

  /**
   * Legacy sync /solve + 750ms synthesized heartbeat path. Used when the
   * backend doesn't yet expose /solve/start (we get a 404 on first attempt).
   */
  function runCloudSyncFallback(baseUrl, school, options, sub, t0) {
    const ctl = new AbortController();
    let cancelled = false;
    let paused = false;
    let pausedSnap = null;
    let lastIter = 0;
    const timeLimitMs = Math.max(1000, (options && options.timeLimitSec ? options.timeLimitSec : 60) * 1000);

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

    const finished = fetch(baseUrl + "/solve", {
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
        sub.emit({ type: "error", message: msg });
      })
      .finally(() => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
      });

    return {
      cancel() {
        cancelled = true;
        try { ctl.abort(); } catch {}
        clearInterval(heartbeat);
        clearTimeout(timeout);
        sub.emit({ type: "cancelled" });
      },
      pause()  { paused = true; },
      resume() { paused = false; if (pausedSnap) { sub.emit(pausedSnap); pausedSnap = null; } },
      _done: finished,
    };
  }

  /** Async /solve/start + /solve/status polling. */
  function runCloudAsync(baseUrl, school, options, sub, t0) {
    let cancelled = false;
    let paused = false;
    let pausedSnap = null;
    let jobId = null;
    let pollTimer = null;
    let cancelInFlight = false;

    function clearPoll() {
      if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null; }
    }

    function poll() {
      if (!jobId || cancelled) return;
      fetch(`${baseUrl}/solve/status/${encodeURIComponent(jobId)}`, { method: "GET" })
        .then(r => {
          if (r.status === 404) throw new Error("status-404");
          if (!r.ok) return r.text().then(t => Promise.reject(new Error(t || ("HTTP " + r.status))));
          return r.json();
        })
        .then(snap => {
          if (cancelled) return;
          const p = snap.progress || {};
          const ev = {
            type: "progress",
            iter: p.iter | 0,
            softScore: p.softScore | 0,
            hardConflicts: p.hardConflicts | 0,
            backtracks: (p.backtracks | 0) || undefined,
            durationMs: p.durationMs | 0,
          };
          if (paused) { pausedSnap = ev; }
          else { sub.emit(ev); }
          if (snap.state === "done") {
            clearPoll();
            sub.emit({ type: "done", result: snap.result });
          } else if (snap.state === "error") {
            clearPoll();
            sub.emit({ type: "error", message: snap.error || "backend error" });
          } else if (snap.state === "cancelled") {
            clearPoll();
            // Don't double-emit cancelled here; cancel() already did.
          }
        })
        .catch(err => {
          if (cancelled) return;
          // Transient errors are tolerated; surface only on persistent failure.
          // For simplicity, emit error and stop on any non-404 fault.
          clearPoll();
          sub.emit({ type: "error", message: (err && err.message) || String(err) });
        });
    }

    return {
      _started: fetch(baseUrl + "/solve/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school, options }),
      })
        .then(r => {
          if (r.status === 404) {
            const err = new Error("start-404");
            err.fallback = true;
            throw err;
          }
          if (!r.ok) return r.text().then(t => Promise.reject(new Error(t || ("HTTP " + r.status))));
          return r.json();
        })
        .then(j => {
          jobId = j && j.jobId;
          if (!jobId) throw new Error("missing jobId in /solve/start response");
          pollTimer = setInterval(poll, POLL_MS);
          // Kick off an immediate poll so first progress arrives fast.
          poll();
        }),
      cancel() {
        cancelled = true;
        clearPoll();
        if (jobId && !cancelInFlight) {
          cancelInFlight = true;
          fetch(`${baseUrl}/solve/cancel/${encodeURIComponent(jobId)}`, { method: "POST" })
            .catch(() => {});
        }
        sub.emit({ type: "cancelled" });
      },
      pause()  { paused = true; },
      resume() { paused = false; if (pausedSnap) { sub.emit(pausedSnap); pausedSnap = null; } },
      get jobId() { return jobId; },
    };
  }

  function runCloud(school, options, onFallback) {
    const sub = makeSubscribable();
    const baseUrl = (global.CHRONEXA_BACKEND_URL || "").replace(/\/+$/, "");
    if (!baseUrl) {
      if (onFallback) try { onFallback("CHRONEXA_BACKEND_URL not set"); } catch {}
      return runBrowser(school, options);
    }

    const t0 = performance.now();
    const src = {
      mode: "cloud",
      subscribe: sub.subscribe,
      cancel() {}, pause() {}, resume() {},
    };

    // Prefer the async /solve/start path; on 404 → legacy /solve fallback.
    const asyncImpl = runCloudAsync(baseUrl, school, options, sub, t0);
    asyncImpl._started
      .then(() => {
        Object.assign(src, {
          cancel: asyncImpl.cancel,
          pause:  asyncImpl.pause,
          resume: asyncImpl.resume,
        });
      })
      .catch(err => {
        if (err && err.fallback) {
          // Backend doesn't have /solve/start — gracefully fall back to legacy.
          if (onFallback) try { onFallback("backend has no /solve/start, using sync /solve"); } catch {}
          const sync = runCloudSyncFallback(baseUrl, school, options, sub, t0);
          Object.assign(src, {
            cancel: sync.cancel,
            pause:  sync.pause,
            resume: sync.resume,
          });
          return;
        }
        // Soft fallback to browser worker on cloud failure.
        const msg = (err && err.message) || String(err);
        if (onFallback) try { onFallback("cloud failed: " + msg); } catch {}
        const local = runBrowser(school, options);
        local.subscribe(sub.emit);
        Object.assign(src, local);
      });

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
