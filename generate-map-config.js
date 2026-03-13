#!/usr/bin/env node
/**
 * map/ 内の PNG ファイル名から layout を生成し、map-config.json を更新する。
 * ファイル名形式: #[数値]_[右方向が+]_[下方向が+].png
 * オフセット情報がないファイルは地図が存在しないものとしてスキップする。
 */

const fs = require('fs');
const path = require('path');

const MAP_DIR = path.join(__dirname, 'map');
const CONFIG_PATH = path.join(__dirname, 'map-config.json');

// #[数値]_[オフセットX]_[オフセットZ].png にマッチ（オフセットは負数も可）
const FILENAME_PATTERN = /^#(\d+)_(-?\d+)_(-?\d+)\.png$/;

function getMapTiles() {
  const files = fs.readdirSync(MAP_DIR);
  const tiles = [];

  for (const file of files) {
    if (!file.endsWith('.png')) continue;
    const match = file.match(FILENAME_PATTERN);
    if (!match) {
      // オフセット情報なし = 地図が存在しないものとしてスキップ
      console.warn(`[スキップ] オフセット情報がないため除外: ${file}`);
      continue;
    }
    const [, idNum, offsetX, offsetZ] = match;
    tiles.push({
      id: `#${idNum}`,
      file,
      offsetX: parseInt(offsetX, 10),
      offsetZ: parseInt(offsetZ, 10),
    });
  }

  return tiles;
}

function buildLayout(tiles) {
  if (tiles.length === 0) {
    return [];
  }

  const minX = Math.min(...tiles.map((t) => t.offsetX));
  const maxX = Math.max(...tiles.map((t) => t.offsetX));
  const minZ = Math.min(...tiles.map((t) => t.offsetZ));
  const maxZ = Math.max(...tiles.map((t) => t.offsetZ));

  const rows = maxZ - minZ + 1;
  const cols = maxX - minX + 1;

  // 2次元配列を null で初期化
  const layout = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );

  for (const tile of tiles) {
    const row = tile.offsetZ - minZ;
    const col = tile.offsetX - minX;
    layout[row][col] = { id: tile.id, file: tile.file };
  }

  return layout;
}

function main() {
  console.log('map/ をスキャンして layout を生成しています...');

  const tiles = getMapTiles();
  console.log(`有効なタイル数: ${tiles.length}`);

  if (tiles.length === 0) {
    console.error('オフセット付きの地図ファイルが1枚も見つかりません。');
    process.exit(1);
  }

  const layout = buildLayout(tiles);

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('map-config.json の読み込みに失敗しました:', err.message);
    process.exit(1);
  }

  config.layout = layout;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('map-config.json を更新しました。');
}

main();
