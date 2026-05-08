// Entry point. Loaded by index.html as a module. Loads JSON data, then kicks off
// the first render. All gameplay flows from there via state mutation + render() calls.
import { loadData } from './data.js';
import { initStage } from './stage/game.js';
import { render } from './ui/render.js';

await loadData();
initStage(document.getElementById('stage-root'));
render();
