/*
 * Transactional school mutations.
 *
 * The timetable model is deliberately plain data, so a small structural
 * differ is enough to provide undo/redo without pulling a patch dependency
 * into the browser bundle.  `_idx` is a derived viewer index and is rebuilt
 * after every transaction instead of being recorded as application state.
 */
(function (global) {
  "use strict";

  const APP = global.APP = global.APP || {};
  const MAX_HISTORY = 100;
  const CORE_KEY = "__chronexaMutateCore";

  if (APP[CORE_KEY]) return;

  const state = {
    undo: [],
    redo: [],
    transaction: null,
  };

  function cloneValue(value, seen = new Map()) {
    if (value === null || typeof value !== "object") return value;
    // The school model is plain JSON-shaped data.  Native structuredClone is
    // materially faster than walking the full demo school in JavaScript and
    // is available in the browsers supported by Chronexa.  Keep the guarded
    // recursive path for older runtimes and for the occasional cyclic test
    // fixture.
    if (seen.size === 0 && typeof globalThis.structuredClone === "function") {
      try { return globalThis.structuredClone(value); } catch (_) { /* fallback below */ }
    }
    if (value instanceof Date) return new Date(value.getTime());
    if (seen.has(value)) return seen.get(value);
    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) copy[key] = cloneValue(value[key], seen);
    return copy;
  }

  function snapshotSchool(school) {
    const snapshot = {};
    for (const key of Object.keys(school || {})) {
      if (key === "_idx") continue;
      snapshot[key] = cloneValue(school[key]);
    }
    return snapshot;
  }

  function isArray(value) { return Array.isArray(value); }
  function isRecord(value) {
    return value !== null && typeof value === "object" && !isArray(value) && !(value instanceof Date);
  }

  function valuesEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    if (isArray(a) !== isArray(b)) return false;
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key) || !valuesEqual(a[key], b[key])) return false;
    }
    return true;
  }

  function serializedEqual(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch (_) { return valuesEqual(a, b); }
  }

  function pathKey(path) {
    return JSON.stringify(path);
  }

  function makePatch(path, oldValue, newValue, oldExists, newExists) {
    return {
      path: path.slice(),
      oldValue: cloneValue(oldValue),
      newValue: cloneValue(newValue),
      oldExists: !!oldExists,
      newExists: !!newExists,
    };
  }

  function diffArrays(before, after, path, patches) {
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && valuesEqual(before[prefix], after[prefix])) {
      prefix++;
    }

    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      valuesEqual(before[before.length - 1 - suffix], after[after.length - 1 - suffix])
    ) {
      suffix++;
    }

    const bLen = before.length - prefix - suffix;
    const aLen = after.length - prefix - suffix;

    if (bLen > 0 && aLen === 0) {
      for (let i = before.length - 1 - suffix; i >= prefix; i--) {
        patches.push(makePatch(path.concat(i), before[i], undefined, true, false));
      }
      return;
    }

    if (bLen === 0 && aLen > 0) {
      for (let i = 0; i < aLen; i++) {
        patches.push(makePatch(path.concat(prefix + i), undefined, after[prefix + i], false, true));
      }
      return;
    }

    if (bLen === aLen) {
      for (let i = 0; i < bLen; i++) {
        const idx = prefix + i;
        if (before[idx] === after[idx]) continue;
        if (path.length <= 1 && valuesEqual(before[idx], after[idx])) continue;
        diffValues(before[idx], after[idx], path.concat(idx), patches, true, true);
      }
      return;
    }

    if (bLen * aLen > 250000) {
      patches.push(makePatch(path, before, after, true, true));
      return;
    }

    const bSlice = before.slice(prefix, before.length - suffix);
    const aSlice = after.slice(prefix, after.length - suffix);

    const dp = Array.from({ length: bLen + 1 }, () => new Uint16Array(aLen + 1));
    for (let i = 0; i < bLen; i++) {
      for (let j = 0; j < aLen; j++) {
        if (valuesEqual(bSlice[i], aSlice[j])) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const edits = [];
    let i = bLen, j = aLen;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && valuesEqual(bSlice[i - 1], aSlice[j - 1])) {
        edits.push({ type: "keep", item: bSlice[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        edits.push({ type: "insert", item: aSlice[j - 1] });
        j--;
      } else {
        edits.push({ type: "delete", item: bSlice[i - 1] });
        i--;
      }
    }
    edits.reverse();

    let simIndex = prefix;
    for (const edit of edits) {
      if (edit.type === "keep") {
        simIndex++;
      } else if (edit.type === "delete") {
        patches.push(makePatch(path.concat(simIndex), edit.item, undefined, true, false));
      } else if (edit.type === "insert") {
        patches.push(makePatch(path.concat(simIndex), undefined, edit.item, false, true));
        simIndex++;
      }
    }
  }

  function diffValues(before, after, path, patches, beforeExists = true, afterExists = true) {
    if (!beforeExists || !afterExists) {
      if (beforeExists !== afterExists || !valuesEqual(before, after)) {
        patches.push(makePatch(path, before, after, beforeExists, afterExists));
      }
      return;
    }

    if (before === after) return;
    const beforeObject = before !== null && typeof before === "object";
    const afterObject = after !== null && typeof after === "object";
   if (!beforeObject || !afterObject || isArray(before) !== isArray(after) ||
       before instanceof Date || after instanceof Date) {
     if (!valuesEqual(before, after)) patches.push(makePatch(path, before, after, true, true));
     return;
   }

   if (isArray(before) && isArray(after)) {
      diffArrays(before, after, path, patches);
     return;
   }

   if (isRecord(before) && isRecord(after)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of keys) {
        // `_idx` is a derived viewer cache. It is rebuilt after replay and is
        // deliberately never part of the school transaction payload.
        if (path.length === 0 && key === "_idx") continue;
        const beforeHas = Object.prototype.hasOwnProperty.call(before, key);
        const afterHas = Object.prototype.hasOwnProperty.call(after, key);
        if (beforeHas && afterHas && before[key] === after[key]) continue;
        // Most top-level collections are untouched by a small edit. Prove
        // that once and avoid descending into every entity on every move.
        if (path.length === 0 && beforeHas && afterHas && serializedEqual(before[key], after[key])) continue;
        diffValues(
          beforeHas ? before[key] : undefined,
          afterHas ? after[key] : undefined,
          path.concat(key),
          patches,
          beforeHas,
          afterHas,
        );
      }
      return;
    }

    patches.push(makePatch(path, before, after, true, true));
  }

  function diffSchools(before, after) {
    const patches = [];
    diffValues(before, after, [], patches, true, true);
    return patches;
  }

  function replaceSchoolContents(school, snapshot) {
    for (const key of Object.keys(school)) {
      if (key !== "_idx" && !Object.prototype.hasOwnProperty.call(snapshot, key)) delete school[key];
    }
    for (const key of Object.keys(snapshot)) school[key] = cloneValue(snapshot[key]);
  }

  function resolveParent(root, path) {
    let parent = root;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (parent[key] == null || typeof parent[key] !== "object") {
        parent[key] = typeof path[i + 1] === "number" ? [] : {};
      }
      parent = parent[key];
    }
    return parent;
  }

  function applyPatch(school, patch, direction) {
    const exists = direction === "new" ? patch.newExists : patch.oldExists;
    const value = direction === "new" ? patch.newValue : patch.oldValue;
    if (!patch.path.length) {
      replaceSchoolContents(school, value || {});
      return;
    }
   const parent = resolveParent(school, patch.path);
   const key = patch.path[patch.path.length - 1];
    if (Array.isArray(parent) && Number.isInteger(key)) {
      if (patch.oldExists && !patch.newExists) {
        if (direction === "new") parent.splice(key, 1);
        else parent.splice(key, 0, cloneValue(patch.oldValue));
      } else if (!patch.oldExists && patch.newExists) {
        if (direction === "new") parent.splice(key, 0, cloneValue(patch.newValue));
        else parent.splice(key, 1);
      } else {
        if (exists) parent[key] = cloneValue(value);
        else parent.splice(key, 1);
      }
      return;
    }
    if (exists) parent[key] = cloneValue(value);
   else delete parent[key];
 }

  function applyPatches(school, patches, direction) {
    const ordered = direction === "old" ? patches.slice().reverse() : patches;
    for (const patch of ordered) applyPatch(school, patch, direction);
  }

  function refreshDerivedIndex() {
    const createNew = global.CreateNew;
    if (createNew && typeof createNew.refreshIndex === "function" && APP.school) {
      try { createNew.refreshIndex(); } catch (error) { console.warn("[mutate] index refresh failed", error); }
    }
  }

  function dispatchChanged(label, source) {
    if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") return;
    document.dispatchEvent(new CustomEvent("app:school-changed", {
      detail: { label, source },
    }));
  }

  function mergePatches(first, second) {
    const merged = first.map((patch) => ({
      ...patch,
      path: patch.path.slice(),
      oldValue: cloneValue(patch.oldValue),
      newValue: cloneValue(patch.newValue),
    }));
    const byPath = new Map(merged.map((patch) => [pathKey(patch.path), patch]));
    for (const patch of second) {
      const key = pathKey(patch.path);
      const existing = byPath.get(key);
      if (existing) {
        existing.newValue = cloneValue(patch.newValue);
        existing.newExists = patch.newExists;
        if (existing.oldExists === existing.newExists && valuesEqual(existing.oldValue, existing.newValue)) {
          const index = merged.indexOf(existing);
          if (index >= 0) merged.splice(index, 1);
          byPath.delete(key);
        }
      } else {
        const copy = {
          ...patch,
          path: patch.path.slice(),
          oldValue: cloneValue(patch.oldValue),
          newValue: cloneValue(patch.newValue),
        };
        merged.push(copy);
        byPath.set(key, copy);
      }
    }
    return merged;
  }

  function clearHistory() {
    state.undo.length = 0;
    state.redo.length = 0;
  }

  function pushEntry(entry) {
    const previous = state.undo[state.undo.length - 1];
    const canCoalesce = entry.coalesceKey && !state.redo.length && previous &&
      previous.coalesceKey === entry.coalesceKey;
    if (canCoalesce) {
      previous.patches = mergePatches(previous.patches, entry.patches);
      previous.label = entry.label || previous.label;
      previous.timestamp = entry.timestamp;
      if (!previous.patches.length) state.undo.pop();
      return;
    }
    state.undo.push(entry);
    if (state.undo.length > MAX_HISTORY) state.undo.shift();
  }

  function mutate(label, fn, opts = {}) {
    if (typeof fn !== "function") throw new TypeError("APP.mutate requires a function");
    const school = APP.school;
    if (!school || typeof school !== "object") return;

    // Nested mutations are deliberately folded into the outer transaction.
    if (state.transaction) return fn(school);

    const before = snapshotSchool(school);
    state.transaction = { label: String(label || "Change"), before };
    let result;
    try {
      result = fn(school);
    } catch (error) {
      replaceSchoolContents(school, before);
      refreshDerivedIndex();
      state.transaction = null;
      throw error;
    }
    state.transaction = null;
    // Compare against the live school after the callback.  The old snapshot
    // is the only copy required for undo; cloning a second full demo school
    // for every small card move needlessly multiplies the hot-path cost.
    const patches = diffSchools(before, school);
    if (!patches.length) return result;

    pushEntry({
      label: String(label || "Change"),
      patches,
      coalesceKey: opts && opts.coalesceKey,
      replay: opts && opts.replay,
      timestamp: Date.now(),
    });
    state.redo.length = 0;
    refreshDerivedIndex();
    dispatchChanged(String(label || "Change"), "mutate");
    return result;
  }

  function undo() {
    const entry = state.undo.pop();
    if (!entry || !APP.school) return false;
    try {
      if (entry.replay && typeof entry.replay.undo === "function") entry.replay.undo();
      else applyPatches(APP.school, entry.patches, "old");
      state.redo.push(entry);
      refreshDerivedIndex();
      dispatchChanged(entry.label, "undo");
      return true;
    } catch (error) {
      state.undo.push(entry);
      throw error;
    }
  }

  function redo() {
    const entry = state.redo.pop();
    if (!entry || !APP.school) return false;
    try {
      if (entry.replay && typeof entry.replay.redo === "function") entry.replay.redo();
      else applyPatches(APP.school, entry.patches, "new");
      state.undo.push(entry);
      refreshDerivedIndex();
      dispatchChanged(entry.label, "redo");
      return true;
    } catch (error) {
      state.redo.push(entry);
      throw error;
    }
  }

  const history = APP.history = APP.history || {};
  Object.defineProperties(history, {
    canUndo: { configurable: true, enumerable: true, get: () => state.undo.length > 0 },
    canRedo: { configurable: true, enumerable: true, get: () => state.redo.length > 0 },
  });
  history.peek = () => state.undo[state.undo.length - 1] || null;
  history.clear = clearHistory;
  history._state = state;

  const audit = APP.audit = APP.audit || {};
  Object.defineProperties(audit, {
    undoStack: {
      configurable: true,
      get: () => state.undo,
      set: (value) => { state.undo = Array.isArray(value) ? value : []; },
    },
    redoStack: {
      configurable: true,
      get: () => state.redo,
      set: (value) => { state.redo = Array.isArray(value) ? value : []; },
    },
  });
  audit.clear = clearHistory;

  APP.mutate = mutate;
  APP.undo = undo;
  APP.redo = redo;
  APP[CORE_KEY] = { state, cloneValue, snapshotSchool, diffSchools, applyPatches };

  if (typeof global.addEventListener === "function") {
    global.addEventListener("app:school-loaded", clearHistory);
  }
})(typeof window !== "undefined" ? window : globalThis);
