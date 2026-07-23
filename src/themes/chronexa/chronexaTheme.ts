import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {neutralIconRegistry} from './icons';

const chronexaSyntax = defineSyntaxTheme({
  name: 'xds-chronexa',
  tokens: {
    keyword: ['#700084', '#efa8ff'],
    string: ['#005600', '#a6d2a2'],
    comment: ['#837a6d', '#8a8a95'],
    number: ['#9c4322', '#ffb37f'],
    function: ['#4c6e91', '#a0caff'],
    type: ['#700084', '#efa8ff'],
    variable: ['#1a1714', '#f3f3f6'],
    operator: ['#837a6d', '#8a8a95'],
    constant: ['#9c4322', '#ffb37f'],
    tag: ['#9c4322', '#ffaeaa'],
    attribute: ['#b08a3e', '#eec12f'],
    property: ['#0d4f54', '#83dac9'],
    punctuation: ['#837a6d', '#525252'],
    background: ['#f6f1e6', '#0b0b0d'],
  },
});

export const chronexaTheme = defineTheme({
  name: 'chronexa',

  typography: {
    scale: {base: 14, ratio: 1.2},
    body: {
      family: 'Inter Tight',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Fraunces',
      fallbacks:
        'serif',
      weights: {3: 'bold', 4: 'bold'},
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks:
        '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },

  motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75},

  syntax: chronexaSyntax,

  tokens: {
    // ───── Colors & Surfaces mapped to Chronexa Studio v3 Palette ─────
    '--color-background-surface': ['#ffffff', '#101014'],
    '--color-background-body':    ['#f6f1e6', '#0b0b0d'],
    '--color-background-card':    ['#ffffff', '#0b0b0d'],
    '--color-background-popover': ['#ffffff', '#0b0b0d'],
    '--color-background-muted':   ['#efe9da', '#101014'],

    // Accent + neutral surface tints (sit alongside backgrounds)
    '--color-accent':       ['#0d4f54', '#ebebeb'], // Electric deep teal
    '--color-accent-muted': ['rgba(13, 79, 84, 0.08)', '#262626'],
    '--color-neutral':      ['rgba(26, 23, 20, 0.06)', '#FFFFFF1A'],

    // Overlays (modal scrims, hover/pressed tints)
    '--color-overlay':         ['rgba(26, 23, 20, 0.42)', '#000000CC'],
    '--color-overlay-hover':   ['rgba(26, 23, 20, 0.06)', '#FFFFFF0D'],
    '--color-overlay-pressed': ['rgba(26, 23, 20, 0.12)', '#FFFFFF1A'],

    // Text
    '--color-text-primary':   ['#1a1714', '#f3f3f6'],
    '--color-text-secondary': ['#4a4339', '#cbcbd4'],
    '--color-text-disabled':  ['#837a6d', '#8a8a95'],
    '--color-text-accent':    ['#0d4f54', '#ebebeb'],

    // Status colours
    '--color-success':        ['#16a34a', '#9fe59b'],
    '--color-error':          ['#9c4322', '#ffc6c1'],
    '--color-warning':        ['#b08a3e', '#fdcf4f'],
    '--color-success-muted':  ['rgba(91, 110, 61, 0.12)', '#84c9803D'],
    '--color-error-muted':    ['rgba(156, 67, 34, 0.10)', '#ff9e973D'],
    '--color-warning-muted':  ['rgba(176, 138, 62, 0.20)', '#deb4333D'],

    // Borders
    '--color-border':             ['#d8cfbb', '#FFFFFF1A'],
    '--color-border-emphasized':  ['#837a6d', '#525252'],
  }
});
