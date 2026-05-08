import Phaser from 'phaser';
import { renderCreatureSvg } from '../../art.js';

const SLOTS = {
  p:  { side: 'player', kind: 'main',  mirror: false, alpha: 1.0 },
  e:  { side: 'enemy',  kind: 'main',  mirror: true,  alpha: 1.0 },
  pb: { side: 'player', kind: 'bench', mirror: false, alpha: 0.5 },
  eb: { side: 'enemy',  kind: 'bench', mirror: true,  alpha: 0.5 },
};

const TEX_RES = 280;
const ACTOR_BOX = 140;
const BENCH_BOX = 70;
const ACTOR_OFFSET_X = 30;   // px from stage edge
const ACTOR_OFFSET_Y = 24;   // px from stage bottom
const BENCH_OFFSET_X = 0;
const BENCH_OFFSET_Y = 40;

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create() {
    this.slots = {};
    this.creatureKeys = {};
    this.pendingTextures = new Set();
  }

  setCombatants({ pf, ef, bf, ebf }) {
    this.upsert('p',  pf?.creature);
    this.upsert('e',  ef?.creature);
    this.upsert('pb', bf?.creature);
    this.upsert('eb', ebf?.creature);
  }

  clearCombatants() {
    for (const k of Object.keys(this.slots)) this.removeSlot(k);
  }

  upsert(key, creature) {
    if (!creature) { this.removeSlot(key); return; }
    if (this.creatureKeys[key] === creature.id) return;
    this.removeSlot(key);
    this.creatureKeys[key] = creature.id;
    const texKey = `creature_${creature.id}`;
    const finish = () => {
      if (this.creatureKeys[key] !== creature.id) return;
      this.makeSlot(key, texKey);
    };
    if (this.textures.exists(texKey)) finish();
    else this.loadCreatureTexture(texKey, creature, finish);
  }

  loadCreatureTexture(texKey, creature, done) {
    const evtName = 'addtexture-' + texKey;
    if (this.pendingTextures.has(texKey)) {
      this.textures.once(evtName, done);
      return;
    }
    this.pendingTextures.add(texKey);
    const svg = renderCreatureSvg(creature);
    const sized = svg.replace(/<svg([^>]*)>/, (m, attrs) => {
      const stripped = attrs.replace(/\s(width|height)="[^"]*"/g, '');
      return `<svg${stripped} width="${TEX_RES}" height="${TEX_RES}">`;
    });
    const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(sized);
    this.textures.once(evtName, () => {
      this.pendingTextures.delete(texKey);
      done();
    });
    this.textures.addBase64(texKey, dataUrl);
  }

  makeSlot(key, texKey) {
    const info = SLOTS[key];
    const container = this.add.container(0, 0);
    container.setVisible(false);
    const sprite = this.add.image(0, 0, texKey);
    sprite.setOrigin(0.5, 1.0);
    if (info.mirror) sprite.setFlipX(true);
    sprite.setAlpha(info.alpha);
    container.add(sprite);

    const idleAmpl = info.kind === 'main' ? 4 : 2;
    const idleDur  = info.kind === 'main' ? 1300 : 1700;
    const idleTween = this.tweens.add({
      targets: sprite,
      y: { from: 0, to: -idleAmpl },
      duration: idleDur,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.slots[key] = { container, sprite, idleTween, info, actionTween: null };
  }

  removeSlot(key) {
    const slot = this.slots[key];
    if (slot) {
      slot.idleTween?.stop();
      slot.actionTween?.stop();
      slot.container.destroy();
    }
    delete this.slots[key];
    delete this.creatureKeys[key];
  }

  lunge(side) {
    const key = side === 'player' ? 'p' : 'e';
    const slot = this.slots[key];
    if (!slot) return;
    const dir = side === 'player' ? 1 : -1;
    slot.actionTween?.stop();
    slot.actionTween = this.tweens.add({
      targets: slot.sprite,
      x: { from: 0, to: 40 * dir },
      duration: 170,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => { slot.sprite.x = 0; slot.actionTween = null; },
    });
  }

  recoil(side) {
    const key = side === 'player' ? 'p' : 'e';
    const slot = this.slots[key];
    if (!slot) return;
    const dir = side === 'player' ? -1 : 1;
    slot.actionTween?.stop();
    slot.actionTween = this.tweens.add({
      targets: slot.sprite,
      x: { from: 0, to: 12 * dir },
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => { slot.sprite.x = 0; slot.actionTween = null; },
    });
  }

  shake() {
    this.cameras.main.shake(360, 0.005);
  }

  update() {
    const stageEl = document.getElementById('stage');
    if (!stageEl) {
      for (const slot of Object.values(this.slots)) slot.container.setVisible(false);
      return;
    }
    const r = stageEl.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      for (const slot of Object.values(this.slots)) slot.container.setVisible(false);
      return;
    }
    const positions = {
      p:  { x: r.left  + ACTOR_OFFSET_X + ACTOR_BOX / 2, y: r.bottom - ACTOR_OFFSET_Y },
      e:  { x: r.right - ACTOR_OFFSET_X - ACTOR_BOX / 2, y: r.bottom - ACTOR_OFFSET_Y },
      pb: { x: r.left  + BENCH_OFFSET_X + BENCH_BOX / 2, y: r.bottom - BENCH_OFFSET_Y },
      eb: { x: r.right - BENCH_OFFSET_X - BENCH_BOX / 2, y: r.bottom - BENCH_OFFSET_Y },
    };
    for (const [key, slot] of Object.entries(this.slots)) {
      const pos = positions[key];
      slot.container.setPosition(pos.x, pos.y);
      slot.container.setVisible(true);
      const boxH = slot.info.kind === 'main' ? ACTOR_BOX : BENCH_BOX;
      slot.sprite.setScale(boxH / TEX_RES);
    }
  }
}
