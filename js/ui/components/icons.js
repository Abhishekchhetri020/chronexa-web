// [vite-esm] module — shared inline SVG icon set (16px, 1.75 stroke, round
// caps) used by the editor surface so no UI text falls back to emoji.
// Usage: window.ChrxIcons.svg("teacher", 16) → "<svg …>" string.
(function (global) {
  "use strict";
  const P = {
    class:    '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 11h.01M15 11h.01M12 11h.01"/>',
    teacher:  '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    room:     '<path d="M4 21V5a2 2 0 0 1 2-2h9v18"/><path d="M15 21h5V9h-5"/><path d="M11 12h.01"/>',
    subject:  '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    grid:     '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    table:    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/>',
    rows:     '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9.5h18M3 14.5h18"/>',
    palette:  '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.3-1-.6-1.4-.3-.4-.4-.8-.4-1.1 0-1 .9-1.5 2-1.5h1.5A4.5 4.5 0 0 0 21 10.5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>',
    layers:   '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    moon:     '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    check:    '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x:        '<path d="M6 6l12 12M18 6 6 18"/>',
    search:   '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    expand:   '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    chevL:    '<path d="m14.5 6-6 6 6 6"/>',
    chevR:    '<path d="m9.5 6 6 6-6 6"/>',
    chevD:    '<path d="m6 9.5 6 6 6-6"/>',
    tray:     '<path d="M3 13v4a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/><path d="M12 3v8m0 0-3-3m3 3 3-3"/>',
    hand:     '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-6a1.5 1.5 0 0 1 3 0v6m0-5a1.5 1.5 0 0 1 3 0V13m0-2a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-5-2.7L4.7 15a1.6 1.6 0 0 1 2.6-1.8L8 14.5"/>',
    lock:     '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    warn:     '<path d="M12 3.5 21 19H3L12 3.5z"/><path d="M12 9.5v4M12 16.5h.01"/>',
    info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    sparkle:  '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    refresh:  '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    camera:   '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8z"/><circle cx="12" cy="12.5" r="3.5"/>',
    export:   '<path d="M12 15V4m0 0 4 4m-4-4-4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    print:    '<path d="M7 8V4h10v4"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v6H7z"/>',
    school:   '<path d="M3 21h18"/><path d="M4 21V10l8-6 8 6v11"/><path d="M10 21v-6h4v6"/>',
    users:    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19.5"/>',
    lesson:   '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z"/><path d="M4 18v2.5A2.5 2.5 0 0 0 6.5 23H19"/><path d="M9 8h6M9 11.5h6"/>',
    link:     '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
    flask:    '<path d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>',
    play:     '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
    cloud:    '<path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5H7z"/>',
    shield:   '<path d="M12 3 4.5 6v5.5c0 4.5 3 8.3 7.5 9.5 4.5-1.2 7.5-5 7.5-9.5V6L12 3z"/><path d="m9 12 2 2 4-4"/>',
    dot:      '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
    move:     '<path d="M12 3v18M3 12h18"/><path d="m8.5 7.5 3.5-3.5 3.5 3.5M8.5 16.5l3.5 3.5 3.5-3.5M7.5 8.5 4 12l3.5 3.5M16.5 8.5 20 12l-3.5 3.5"/>',
    bolt:     '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  };
  function svg(name, size, extra) {
    const body = P[name];
    if (!body) return "";
    const s = size || 16;
    return `<svg class="chrx-ic chrx-ic--${name}${extra ? " " + extra : ""}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function node(name, size, extra) {
    const wrap = document.createElement("span");
    wrap.className = "chrx-ic-wrap";
    wrap.innerHTML = svg(name, size, extra);
    return wrap.firstChild;
  }
  global.ChrxIcons = { svg, node, has: n => !!P[n] };
})(window);

// [vite-esm] exports
export const ChrxIcons = window.ChrxIcons;
