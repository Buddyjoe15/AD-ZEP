/* The single mutable game state. G.State keeps its identity across resets so modules may
   hold a reference to it; G.resetState() clears it in place. */
(function(){
  'use strict';
  const G = GW;

  const EQUIPMENT_SLOTS = ['head','chest','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg','leftFoot','rightFoot','backpack'];
  G.EQUIPMENT_SLOTS = EQUIPMENT_SLOTS;
  G.emptyEquipment = () => Object.fromEntries(EQUIPMENT_SLOTS.map(k => [k, null]));

  function fresh(){
    return {
      // Simulation
      seed: 72491, map: null, time: 0, nextId: 1, paused: true, gameOver: false,
      units: [], buildings: [], constructionSites: [], containers: [], resourceNodes: [], shots: [],
      resources: {}, heroId: null, shipId: null,
      inventory: { items: [], equipment: G.emptyEquipment() },
      expedition: null,
      grid: null, spatial: null, teamSpatial: null, paths: null,
      ledger: null,
      // Session / presentation (not simulation-critical, partially saved)
      activeSaveSlot: 1, clockReset: true, introCamera: null,
      selected: new Set(), selectionAnchorId: null, squads: { 1: [], 2: [], 3: [], 4: [] },
      camera: { x: 0, y: 0, z: 0.72 },
      formation: 'square', formationAngle: 0, formationPreview: null,
      buildMode: { active: false, builderId: null, key: null }, buildPreview: null,
      selectedContainer: null, searching: null,
      metrics: { fps: 0, drawMs: 0, updateMs: 0, visible: 0, pathCalls: 0, pathMs: 0, pathQueue: 0, flowFields: 0, entities: 0, chunks: 0, cached: 0, lod: 'detail' }
    };
  }

  G.State = fresh();
  G.resetState = function(){
    const S = G.State, keepCamera = S.camera, keepMetrics = S.metrics;
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, fresh());
    Object.assign(keepCamera, S.camera); S.camera = keepCamera;
    Object.assign(keepMetrics, S.metrics, { pathCalls: 0, pathMs: 0 }); S.metrics = keepMetrics;
    return S;
  };
  G.newId = () => G.State.nextId++;
})();
