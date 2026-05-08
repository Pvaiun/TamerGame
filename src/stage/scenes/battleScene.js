import Phaser from 'phaser';
import { renderCreatureSvg } from '../../art.js';

const ANCHORS = {
  p:  { selector: '#p-actor',              mirror: false, alpha: 1.0 },
  e:  { selector: '#e-actor',              mirror: true,  alpha: 1.0 },
  pb: { selector: '.stage-bench.player',   mirror: false, alpha: 0.5 },
  eb: { selector: '.stage-bench.enemy',    mirror: true,  alpha: 0.5 },
};

const TEX_RES = 280;

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create() {
    this.sprites = {};
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
    for (const k of Object.keys(this.sprites)) this.removeSprite(k);
  }

  upsert(key, creature) {
    if (!creature) { this.removeSprite(key); return; }
    if (this.creatureKeys[key] === creature.id) return;
    this.removeSprite(key);
    this.creatureKeys[key] = creature.id;
    const texKey = `creature_${creature.id}`;
    const finish = () => {
      if (this.creatureKeys[key] !== creature.id) return;
      this.makeSprite(key, texKey);
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

  makeSprite(key, texKey) {
    const info = ANCHORS[key];
    const s = this.add.image(0, 0, texKey);
    s.setOrigin(0.5, 0.5);
    if (info.mirror) s.setFlipX(true);
    s.setAlpha(info.alpha);
    s.setVisible(false);
    this.sprites[key] = s;
  }

  removeSprite(key) {
    if (this.sprites[key]) { this.sprites[key].destroy(); delete this.sprites[key]; }
    delete this.creatureKeys[key];
  }

  update() {
    for (const [key, info] of Object.entries(ANCHORS)) {
      const sprite = this.sprites[key];
      if (!sprite) continue;
      const el = document.querySelector(info.selector);
      if (!el) { sprite.setVisible(false); continue; }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { sprite.setVisible(false); continue; }
      const scale = Math.min(rect.width / TEX_RES, rect.height / TEX_RES);
      sprite.setVisible(true);
      sprite.setScale(scale);
      sprite.setPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }
}
