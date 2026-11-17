import Phaser from 'phaser';
import { loadGameData } from './data';
import { GameScene } from './GameScene';
import { UI } from './ui';

// Một số máy / trình duyệt không khởi tạo được WebGL -> tự chuyển sang Canvas
window.addEventListener('error', (ev) => {
  if (/Framebuffer|WebGL/i.test(String(ev.message)) && !location.search.includes('canvas')) {
    location.search = (location.search ? location.search + '&' : '?') + 'canvas';
  }
});

async function boot() {
  await loadGameData();
  const ui = new UI();
  const scene = new GameScene();
  scene.ui = ui;
  new Phaser.Game({
    type: new URLSearchParams(location.search).has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1d3b2a',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, roundPixels: false },
    scene: [scene],
  });
  (window as any).game = scene;
}

boot();
