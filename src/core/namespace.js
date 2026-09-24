/* Root namespace. Every module attaches to GW; load order is defined in index.html. */
(function(root){
  'use strict';
  const G = root.GW = root.GW || {};
  G.VERSION = '0.6.0';
  G.SAVE_SCHEMA = 2;
  G.PROJECT = 'AD-EZP';
  // True when running inside a browser page. Simulation modules never touch the DOM,
  // so they also run headless (Node tests, future web workers or a dedicated server).
  G.hasDOM = typeof document !== 'undefined' && typeof window !== 'undefined';
})(typeof globalThis !== 'undefined' ? globalThis : this);
