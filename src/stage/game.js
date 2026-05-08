import Phaser from 'phaser';
import { BattleScene } from './scenes/battleScene.js';

let game = null;

export function initStage(mountEl) {
  if (game) return game;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: mountEl,
    transparent: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [BattleScene],
    banner: false,
  });
  console.log('[stage] phaser game created', { version: Phaser.VERSION });
  return game;
}

export function getGame() { return game; }

function getBattleScene() {
  return game ? game.scene.getScene('Battle') : null;
}

export function withBattleScene(fn) {
  const scene = getBattleScene();
  if (scene && scene.scene.isActive()) fn(scene);
}

export function syncBattleScene(combatants) {
  withBattleScene(scene => {
    if (combatants) scene.setCombatants(combatants);
    else scene.clearCombatants();
  });
}
