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

  // Worker path is hardcoded relative to the page root (not the script/bundle).
  // This works because the app is always served from the repo root via GitHub
  // Pages or a static server. If the deploy path changes, update the URL in
  // runBrowserSingle() below.

  function makeSubscribable() {
    const listeners = new Set();
    return {
      subscribe(h) { listeners.add(h); return () => listeners.delete(h); },
      emit(ev) { for (const h of listeners) { try { h(ev); } catch (e) { console.error(e); } } },
    };
  }

  // -------- browser worker source -----------------------------------------
  function runBrowserSingle(school, options) {
    const sub = makeSubscribable();
    let paused = false;
    let buf = [];
    let cancelled = false;
    let lastResult = null;
    let lastSnapshot = null; // best mid-run placement (Accept-partial)

    // new URL(..., import.meta.url) lets Vite bundle the worker graph as its
    // own hashed chunk (cache-busting via the hash, no ?v= needed).
    const worker = new Worker(new URL("../../solver/worker.js", import.meta.url), { type: "module" });

    worker.onmessage = (ev) => {
      const m = ev.data || {};
      if (cancelled) return;
      if (paused && m.type === "progress") { buf.push(m); return; }
      if (m.type === "done") {
        lastResult = m.result;
        sub.emit({ type: "done", result: m.result });
        worker.terminate();
      } else if (m.type === "error") {
        sub.emit({ type: "error", message: m.message || "worker error" });
        worker.terminate();
      } else if (m.type === "progress") {
        if (m.snapshot && m.snapshot.assignment &&
            (!lastSnapshot || (m.snapshot.placed || 0) > lastSnapshot.placed)) {
          lastSnapshot = m.snapshot;
        }
        sub.emit(m);
      }
    };
    worker.onerror = (e) => sub.emit({ type: "error", message: (e && e.message) || "worker error" });

    worker.postMessage({ type: "solve", school, options });

    return {
      mode: "browser",
      subscribe: sub.subscribe,
      getPartial() {
        if (lastResult) return lastResult;
        if (!lastSnapshot) return null;
        return {
          status: "PARTIAL",
          partial: true,
          assignment: lastSnapshot.assignment,
          stats: {
            placed: lastSnapshot.placed,
            unplaced: lastSnapshot.unplaced,
            hardConflicts: lastSnapshot.unplaced,
            softScore: 0,
            durationMs: 0,
          },
          violations: [],
        };
      },
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

  function runBrowser(school, options) {
    // Use multi-branch parallel solving when available (loaded from
    // multi_branch.js). Falls back to single worker for environments
    // without multi-branch support (e.g. missing script, single-core).
    if (global.SolverUI && global.SolverUI.runMultiBranch) {
      const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
      const branches = Math.max(2, Math.min(cores, 8));
      console.log(`[solver] Using multi-branch parallel solving: ${branches} branches`);
      return global.SolverUI.runMultiBranch(school, options, branches);
    }
    return runBrowserSingle(school, options);
  }

  // -------- in-browser WASM CP-SAT source ---------------------------------
  // Runs the full OR-Tools CP-SAT portfolio in a Web Worker via the committed
  // static WASM build (js/solver/wasm/cp_sat_worker.js). Requires the page to
  // be cross-origin isolated (COOP/COEP — provided by sw.js).
  function runWasm(school, options) {
    const sub = makeSubscribable();
    let cancelled = false;
    // Deliberately a plain path string, NOT new URL(import.meta.url): the
    // Emscripten pthread runtime under wasm/dist must stay un-bundled, so
    // the whole wasm/ subtree is copied verbatim into the build output.
    const url = "js/solver/wasm/cp_sat_worker.js?v=" + (window.APP_VER || "");
    let worker;
    try {
      worker = new Worker(url, { type: "module" });
    } catch (e) {
      // Worker construction failed — surface as an error source.
      return {
        mode: "wasm",
        subscribe: sub.subscribe,
        cancel() {}, pause() {}, resume() {},
        _err: setTimeout(() => sub.emit({ type: "error", message: "WASM worker failed to start: " + ((e && e.message) || e) }), 0),
      };
    }

    worker.onmessage = (ev) => {
      const m = ev.data || {};
      if (cancelled) return;
      if (m.type === "done") {
        sub.emit({ type: "done", result: m.result });
        worker.terminate();
      } else if (m.type === "error") {
        sub.emit({ type: "error", message: m.message || "wasm worker error" });
        worker.terminate();
      } else if (m.type === "progress") {
        sub.emit(m);
      }
    };
    worker.onerror = (e) => sub.emit({ type: "error", message: (e && e.message) || "wasm worker error" });
    worker.postMessage({ type: "solve", school, options });

    return {
      mode: "wasm",
      subscribe: sub.subscribe,
      cancel() { cancelled = true; try { worker.terminate(); } catch {} sub.emit({ type: "cancelled" }); },
      pause()  {},
      resume() {},
    };
  }

  // -------- two-stage "Best" source (JS draft -> WASM-CP-SAT improve) ------
  // Stage 1: the fast JS CSP Solver produces a draft timetable. Stage 2: feed
  // that draft to WASM-CP-SAT in Improve mode to polish it toward 100%. One
  // call, fully offline. Falls back to the draft if stage 2 can't run.
  //
  // Phase markers (consumed by SolverUI.Progress.setPhase in progress_modal.js):
  //   { type: "phase", phase: "validating" }   -- emitted before stage 1 starts
  //   { type: "phase", phase: "drafting"   }   -- emitted when stage 1 begins
  //   { type: "phase", phase: "polishing"  }   -- emitted when stage 2 begins
  //   { type: "phase", phase: "applying"   }   -- emitted right before "done"
  function runTwoStage(school, options) {
    const sub = makeSubscribable();
    let cancelled = false;
    let stage2 = null;
    const budget = Math.max(15, options.timeLimitSec || 60);
    // Adaptive draft budget: the JS solver reaches a good draft in seconds,
    // so give it clamp(totalCards/500, 1, 5)s and leave the rest to the
    // CP-SAT polish (which does the real quality work).
    const totalCards = (school.lessons || []).reduce(
      (n, L) => n + (Number(L.periodsPerWeek) || 0), 0) || (school.lessons || []).length || 1;
    const t1 = Math.min(5, Math.max(1, Math.round(totalCards / 500)));
    // Reserve ~7s of the user-facing budget for fixed pipeline overhead
    // (worker spawn + WASM runtime init + CP-SAT model build + extraction),
    // so the wall clock lands on the requested budget instead of 20% over.
    const t2 = Math.max(10, budget - t1 - 5);
    let draft = null;

    // Brief validating tick so the UI shows the breadcrumb moving. The actual
    // validation is the school-shape check inside runBrowser/runWasm; this
    // marker just gives the user feedback that the pipeline acknowledged.
    queueMicrotask(() => {
      if (!cancelled) sub.emit({ type: "phase", phase: "validating" });
      // Move into drafting on the next frame so the validating chip is
      // visible for at least one paint cycle (otherwise it flashes by).
      setTimeout(() => {
        if (!cancelled) sub.emit({ type: "phase", phase: "drafting" });
      }, 80);
    });

    const stage1 = runBrowser(school, { ...options, timeLimitSec: t1 });
    stage1.subscribe((ev) => {
      if (cancelled) return;
      if (ev.type === "progress") { sub.emit({ ...ev, stage: 1 }); return; }
      if (ev.type === "error") { sub.emit({ type: "error", message: "draft failed: " + ev.message }); return; }
      if (ev.type !== "done") return;
      draft = ev.result;
      const cards = (draft && draft.assignment)
        ? draft.assignment.map((a) => ({ lessonId: a.lessonId, day: a.day, period: a.period, classroomId: a.classroomId }))
        // Cold generate must NOT fall back to the school's existing cards —
        // that would silently replay the old timetable (the "fake
        // generation" bug). Polish from scratch instead.
        : (options.mode === "generate" ? [] : (school.cards || []));
      const seeded = { ...school, cards };
      // Stage 1 finished → transition to "polishing" before kicking off stage 2.
      sub.emit({ type: "phase", phase: "polishing" });
      stage2 = runWasm(seeded, { ...options, improve: true, timeLimitSec: t2 });
      stage2.subscribe((ev2) => {
        if (cancelled) return;
        if (ev2.type === "progress") { sub.emit({ ...ev2, stage: 2 }); }
        else if (ev2.type === "done") {
          sub.emit({ type: "phase", phase: "applying" });
          // Never return a polish that places fewer cards than the draft it
          // started from (possible when the draft was infeasible in the
          // CP-SAT model and its hints could not all be honoured).
          const polished = ev2.result;
          const dp = (draft && draft.stats && draft.stats.placed) || 0;
          const pp = (polished && polished.stats && polished.stats.placed) || 0;
          sub.emit({ type: "done", result: pp >= dp ? polished : draft });
        }
        else if (ev2.type === "error") {
          // Stage 2 unavailable (e.g. no JSPI) — the draft is still a valid timetable.
          sub.emit({ type: "phase", phase: "applying" });
          sub.emit({ type: "done", result: draft });
        }
      });
    });

    return {
      mode: "auto",
      subscribe: sub.subscribe,
      cancel() { cancelled = true; try { stage1.cancel(); } catch {} try { stage2 && stage2.cancel(); } catch {} sub.emit({ type: "cancelled" }); },
      pause()  {}, resume() {},
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
    if (algo === "auto" || spec.mode === "best") return runTwoStage(school, options);

    if (algo === "cloud") return runCloud(school, options, spec.onFallback);
    if (algo === "wasm")  return runWasm(school, options);
    return runBrowser(school, options);
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.run = run;
  global.SolverUI._runBrowser = runBrowser;   // exported for tests
  global.SolverUI._runCloud   = runCloud;
})(typeof window !== "undefined" ? window : globalThis);

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const SolverUI = window.SolverUI;
