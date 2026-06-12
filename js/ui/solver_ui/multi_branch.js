// Multi-branch solver — spawns N Web Workers with different seeds and picks
// the best result. Races all branches in parallel; the UI shows the best
// progress so far. When time is up, all workers are terminated and the
// best-so-far result is returned.
//
// Public API (same as backend_client.js):
//   SolverUI.runMultiBranch({ school, options, branches?, onFallback }) -> Source
//
// Options:
//   branches  — number of parallel workers (default: navigator.hardwareConcurrency or 4)
//   All other options forwarded to each worker (timeLimitSec, etc.)

(function (global) {
  "use strict";

  const DEFAULT_BRANCHES = Math.max(2, Math.min(
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4,
    8  // cap at 8 to avoid thrashing on low-memory devices
  ));

  function makeSubscribable() {
    const listeners = new Set();
    return {
      subscribe(h) { listeners.add(h); return () => listeners.delete(h); },
      emit(ev) { for (const h of listeners) { try { h(ev); } catch (e) { console.error(e); } } },
    };
  }

  /**
   * Spawn N workers, each with a different seed. Race them.
   * Merge progress from all branches (show best soft score).
   * When ALL finish or time expires, emit done with the best result.
   */
  function runMultiBranch(school, options, numBranches) {
    const sub = makeSubscribable();
    const N = numBranches || DEFAULT_BRANCHES;
    let cancelled = false;
    let paused = false;
    let buf = [];

    const workers = [];
    const results = [];     // { result, softScore, placed, unplaced }
    let doneCount = 0;
    let bestProgress = null;
    let bestResult = null;
    let bestScore = Infinity; // lower is better (soft score = penalty)
    let bestPlaced = 0;
    // Best mid-run placement snapshot across all branches (solver attaches
    // `snapshot` to progress events every ~2s). This is what "Accept partial
    // result" applies when no branch has finished yet.
    let bestPartial = null;

    // Aggregate progress across all branches
    const branchProgress = new Array(N).fill(null);

    function emitAggregateProgress() {
      if (cancelled) return;
      // Find the branch with best progress (most placed, then lowest soft score)
      let best = null;
      for (let i = 0; i < N; i++) {
        const p = branchProgress[i];
        if (!p) continue;
        if (!best ||
            (p.placed || 0) > (best.placed || 0) ||
            ((p.placed || 0) === (best.placed || 0) && (p.softScore || 0) < (best.softScore || 0))) {
          best = p;
        }
      }
      if (!best) return;
      const ev = {
        type: "progress",
        iter: best.iter || 0,
        softScore: best.softScore || 0,
        hardConflicts: best.hardConflicts || 0,
        backtracks: best.backtracks || 0,
        durationMs: best.durationMs || 0,
        branch: best._branch,
        totalBranches: N,
        placed: best.placed || 0,
        bestPlaced: bestPlaced,
      };
      if (paused) { buf.push(ev); return; }
      sub.emit(ev);
    }

    function onWorkerDone(branchIdx, result) {
      if (cancelled) return;
      doneCount++;

      const stats = result && result.stats;
      const placed = stats ? (stats.placed || 0) : 0;
      const unplaced = stats ? (stats.unplaced || 0) : 0;
      const softScore = (result && typeof result.softScore === "number")
        ? result.softScore : Infinity;

      // Best = most placed, then lowest soft score
      const isBetter = placed > bestPlaced ||
        (placed === bestPlaced && softScore < bestScore);

      if (isBetter || !bestResult) {
        bestResult = result;
        bestScore = softScore;
        bestPlaced = placed;
      }

      console.log(`[multi-branch] Branch ${branchIdx + 1}/${N} done: placed=${placed}, unplaced=${unplaced}, softScore=${softScore}${isBetter ? " ★ NEW BEST" : ""}`);

      // All branches done → emit the winner
      if (doneCount >= N) {
        console.log(`[multi-branch] All ${N} branches complete. Best: placed=${bestPlaced}, softScore=${bestScore}`);
        sub.emit({ type: "done", result: bestResult });
        cleanup();
      }
    }

    function onWorkerError(branchIdx, message) {
      console.error(`[multi-branch] Branch ${branchIdx + 1}/${N} error: ${message}`);
      doneCount++;
      if (doneCount >= N) {
        if (bestResult) {
          sub.emit({ type: "done", result: bestResult });
        } else {
          sub.emit({ type: "error", message: `All ${N} branches failed. Last: ${message}` });
        }
        cleanup();
      }
    }

    function cleanup() {
      for (const w of workers) {
        try { w.terminate(); } catch {}
      }
    }

    // Spawn N workers with different seeds
    const baseSeed = (options && options.seed) || 42;
    const url = "js/solver/worker.js?v=" + (window.APP_VER || "");

    for (let i = 0; i < N; i++) {
      const seed = baseSeed + i * 7919; // Prime spacing for diversity
      const w = new Worker(url, { type: "module" });
      workers.push(w);

      w.onmessage = ((branchIdx) => (ev) => {
        const m = ev.data || {};
        if (cancelled) return;

        if (m.type === "progress") {
          if (m.snapshot && m.snapshot.assignment &&
              (!bestPartial || (m.snapshot.placed || 0) > bestPartial.placed)) {
            bestPartial = { ...m.snapshot, _branch: branchIdx };
          }
          // Track placed count from progress
          branchProgress[branchIdx] = {
            ...m,
            _branch: branchIdx,
            placed: m.placed || 0,
          };
          emitAggregateProgress();
        } else if (m.type === "done") {
          onWorkerDone(branchIdx, m.result);
        } else if (m.type === "error") {
          onWorkerError(branchIdx, m.message || "worker error");
        }
      })(i);

      w.onerror = ((branchIdx) => (e) => {
        onWorkerError(branchIdx, (e && e.message) || "worker error");
      })(i);

      // Each branch gets its own seed
      w.postMessage({
        type: "solve",
        school,
        options: { ...options, seed },
      });
    }

    return {
      mode: "browser-multi",
      branches: N,
      subscribe: sub.subscribe,
      // Best result available RIGHT NOW: a finished branch's full result if
      // any, else the best mid-run snapshot, else null. SolveResponse-shaped
      // so the result panel can apply it directly.
      getPartial() {
        if (bestResult) return bestResult;
        if (!bestPartial) return null;
        return {
          status: "PARTIAL",
          partial: true,
          assignment: bestPartial.assignment,
          stats: {
            placed: bestPartial.placed,
            unplaced: bestPartial.unplaced,
            hardConflicts: bestPartial.unplaced,
            softScore: 0,
            durationMs: 0,
          },
          violations: [],
        };
      },
      cancel() {
        cancelled = true;
        cleanup();
        sub.emit({ type: "cancelled" });
      },
      pause() {
        paused = true;
      },
      resume() {
        paused = false;
        const tail = buf; buf = [];
        if (tail.length) sub.emit(tail[tail.length - 1]);
      },
    };
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.runMultiBranch = runMultiBranch;
  global.SolverUI._DEFAULT_BRANCHES = DEFAULT_BRANCHES;
})(typeof window !== "undefined" ? window : globalThis);
