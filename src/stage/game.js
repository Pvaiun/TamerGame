import Phaser from 'phaser';

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    console.log('[stage] boot scene ready', {
      size: `${this.scale.width}x${this.scale.height}`,
    });
    this.scale.on('resize', (size) => {
      console.log('[stage] resize', `${size.width}x${size.height}`);
    });
  }
}

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
    scene: [BootScene],
    banner: false,
  });
  console.log('[stage] phaser game created', {
    renderer: game.config.renderType === Phaser.WEBGL ? 'WebGL (auto)' : 'auto',
    version: Phaser.VERSION,
  });
  return game;
}

export function getGame() { return game; }
