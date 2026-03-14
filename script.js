let mapConfig = null;
let canvas = null;
let ctx = null;
let loadedImages = {};
let currentMarker = null;

// 4倍縮小地図用: 1ピクセルが何ブロックか
const BLOCKS_PER_PIXEL = 4;

// ズーム: 標準で表示域に何タイル分見えるか（定数化して変更可能）
const DEFAULT_VISIBLE_TILES = 5;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;

let zoomLevel = 1.0;           // 1.0 = 標準（DEFAULT_VISIBLE_TILES タイルが見える）
let baseScale = 1.0;          // コンテナから計算する基準スケール
let currentDisplayScale = 1.0; // 現在の表示スケール = baseScale * zoomLevel

// 初期化
$(document).ready(async function() {
    canvas = $('#mapCanvas')[0];
    ctx = canvas.getContext('2d');
    
    // 設定ファイルの読み込み
    try {
        mapConfig = await $.getJSON('map-config.json');
        await loadAndDrawMap();
        applyZoom(); // 標準（DEFAULT_VISIBLE_TILES タイル表示）で初期表示
    } catch (error) {
        console.error('設定ファイルの読み込みに失敗しました:', error);
        alert('地図の読み込みに失敗しました');
    }
    
    // イベントリスナーの設定
    $('#locateBtn').on('click', locatePosition);
    $('#clearBtn').on('click', clearMarker);
    $('#zoomInBtn').on('click', zoomIn);
    $('#zoomOutBtn').on('click', zoomOut);
    
    // マウスホイールでズーム（地図エリア上で）。passive: false で preventDefault を有効にする
    $('.map-container')[0].addEventListener('wheel', onMapWheel, { passive: false });
    
    // リサイズ時に基準スケールを再計算し、中心を維持して表示を更新
    $(window).on('resize', onWindowResize);
    
    // Enterキーで位置を表示
    $('#inputX, #inputZ').on('keypress', function(e) {
        if (e.which === 13) {
            locatePosition();
        }
    });
});

// 地図画像の読み込みと描画
async function loadAndDrawMap() {
    const layout = mapConfig.layout;
    const tileSize = mapConfig.tileSize;
    
    // キャンバスサイズの計算
    const maxCols = Math.max(...layout.map(row => row.length));
    const rows = layout.length;
    canvas.width = maxCols * tileSize;
    canvas.height = rows * tileSize;
    
    // 背景をクリア
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 各タイルの読み込みと描画
    const promises = [];
    for (let rowIdx = 0; rowIdx < layout.length; rowIdx++) {
        const row = layout[rowIdx];
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const tile = row[colIdx];
            if (tile) {
                promises.push(loadAndDrawTile(tile, colIdx, rowIdx));
            }
        }
    }
    
    await Promise.all(promises);
}

// コンテナの利用可能サイズ（パディング除く）
function getContainerUsableSize() {
    const $container = $('.map-container');
    const w = $container.width();
    const h = $container.height();
    const padding = 40; // style の padding 20px * 2 に合わせる
    return { width: Math.max(1, w - padding), height: Math.max(1, h - padding) };
}

// 表示域に DEFAULT_VISIBLE_TILES タイルが入る基準スケールを計算
function computeBaseScale() {
    const size = getContainerUsableSize();
    const tileSize = mapConfig.tileSize;
    const scaleByWidth = size.width / (DEFAULT_VISIBLE_TILES * tileSize);
    const scaleByHeight = size.height / (DEFAULT_VISIBLE_TILES * tileSize);
    return Math.min(scaleByWidth, scaleByHeight);
}

/**
 * ズームを適用。画面中心（または指定した割合の点）を維持するようスクロールを補正する。
 * @param {number} [centerFracX] 維持する中心の X 割合 (0〜1)。省略時は現在の表示中心。
 * @param {number} [centerFracY] 維持する中心の Y 割合 (0〜1)。
 */
function applyZoom(centerFracX, centerFracY) {
    const $container = $('.map-container');
    const oldDisplayWidth = canvas.width * currentDisplayScale;
    const oldDisplayHeight = canvas.height * currentDisplayScale;
    const scrollLeft = $container.scrollLeft();
    const scrollTop = $container.scrollTop();
    const containerWidth = $container.width();
    const containerHeight = $container.height();

    baseScale = computeBaseScale();
    currentDisplayScale = baseScale * zoomLevel;

    canvas.style.width = (canvas.width * currentDisplayScale) + 'px';
    canvas.style.height = (canvas.height * currentDisplayScale) + 'px';

    // 中心を維持するスクロール補正
    if (centerFracX !== undefined && centerFracY !== undefined) {
        const newDisplayWidth = canvas.width * currentDisplayScale;
        const newDisplayHeight = canvas.height * currentDisplayScale;
        const newCenterX = centerFracX * newDisplayWidth;
        const newCenterY = centerFracY * newDisplayHeight;
        $container.scrollLeft(Math.max(0, newCenterX - containerWidth / 2));
        $container.scrollTop(Math.max(0, newCenterY - containerHeight / 2));
    } else {
        const centerX = scrollLeft + containerWidth / 2;
        const centerY = scrollTop + containerHeight / 2;
        const fracX = oldDisplayWidth > 0 ? centerX / oldDisplayWidth : 0.5;
        const fracY = oldDisplayHeight > 0 ? centerY / oldDisplayHeight : 0.5;
        const newDisplayWidth = canvas.width * currentDisplayScale;
        const newDisplayHeight = canvas.height * currentDisplayScale;
        $container.scrollLeft(Math.max(0, fracX * newDisplayWidth - containerWidth / 2));
        $container.scrollTop(Math.max(0, fracY * newDisplayHeight - containerHeight / 2));
    }
}

function zoomIn() {
    zoomLevel = Math.min(ZOOM_MAX, zoomLevel * ZOOM_STEP);
    applyZoom();
}

function zoomOut() {
    zoomLevel = Math.max(ZOOM_MIN, zoomLevel / ZOOM_STEP);
    applyZoom();
}

function onMapWheel(e) {
    e.preventDefault();
    const $container = $('.map-container');
    const rect = $container[0].getBoundingClientRect();
    const scrollLeft = $container.scrollLeft();
    const scrollTop = $container.scrollTop();
    const contentX = scrollLeft + (e.clientX - rect.left);
    const contentY = scrollTop + (e.clientY - rect.top);
    const oldDisplayWidth = canvas.width * currentDisplayScale;
    const oldDisplayHeight = canvas.height * currentDisplayScale;
    const centerFracX = oldDisplayWidth > 0 ? contentX / oldDisplayWidth : 0.5;
    const centerFracY = oldDisplayHeight > 0 ? contentY / oldDisplayHeight : 0.5;

    if (e.deltaY < 0) {
        zoomLevel = Math.min(ZOOM_MAX, zoomLevel * ZOOM_STEP);
    } else {
        zoomLevel = Math.max(ZOOM_MIN, zoomLevel / ZOOM_STEP);
    }
    applyZoom(centerFracX, centerFracY);
}

function onWindowResize() {
    applyZoom();
}

// 個別タイルの読み込みと描画
function loadAndDrawTile(tile, col, row) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const x = col * mapConfig.tileSize;
            const y = row * mapConfig.tileSize;
            ctx.drawImage(img, x, y, mapConfig.tileSize, mapConfig.tileSize);
            loadedImages[tile.id] = { img, x, y };
            resolve();
        };
        img.onerror = function() {
            console.error(`画像の読み込みに失敗: ${tile.file}`);
            reject(new Error(`Failed to load ${tile.file}`));
        };
        img.src = `map/${encodeURIComponent(tile.file)}`;
    });
}

// ワールド座標からピクセル座標への変換
function worldToPixel(worldX, worldZ) {
    const layout = mapConfig.layout;
    let refCol = 0, refRow = 0;
    
    // #17の位置を探す
    for (let r = 0; r < layout.length; r++) {
        for (let c = 0; c < layout[r].length; c++) {
            if (layout[r][c] && layout[r][c].id === '#17') {
                refCol = c;
                refRow = r;
                break;
            }
        }
    }
    
    const tileSize = mapConfig.tileSize;
    const scale = 1 / BLOCKS_PER_PIXEL; // 1ピクセル = BLOCKS_PER_PIXELブロック
    
    // #17の左上がワールド座標(0, 0)
    const pixelX = (refCol * tileSize) + (worldX * scale);
    const pixelY = (refRow * tileSize) + (worldZ * scale);
    
    return { x: pixelX, y: pixelY };
}

// 位置を表示
function locatePosition() {
    const worldX = parseFloat($('#inputX').val());
    const worldZ = parseFloat($('#inputZ').val());
    
    if (isNaN(worldX) || isNaN(worldZ)) {
        alert('有効な座標を入力してください');
        return;
    }
    
    const pixelPos = worldToPixel(worldX, worldZ);
    
    // 既存のマーカーをクリア
    clearMarker();
    
    // 地図を再描画
    loadAndDrawMap().then(() => {
        // マーカーを描画
        drawMarker(pixelPos.x, pixelPos.y);
        currentMarker = { worldX, worldZ, pixelPos };
        
        // 座標表示を更新
        $('#currentCoords')
            .text(`現在位置: X=${worldX}, Z=${worldZ}`)
            .fadeIn();
        
        // マーカー位置までスクロール
        scrollToMarker(pixelPos.x, pixelPos.y);
    });
}

// マーカーの描画
function drawMarker(x, y) {
    // 外側の円（パルスエフェクト用）
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 2 * Math.PI);
    ctx.fill();
    
    // 内側の円
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // 十字マーカー
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
}

// マーカー位置までスクロール（x, y はキャンバスバッファ座標）
function scrollToMarker(x, y) {
    const $container = $('.map-container');
    const containerWidth = $container.width();
    const containerHeight = $container.height();
    const displayX = x * currentDisplayScale;
    const displayY = y * currentDisplayScale;
    const maxScrollLeft = Math.max(0, canvas.width * currentDisplayScale - containerWidth);
    const maxScrollTop = Math.max(0, canvas.height * currentDisplayScale - containerHeight);
    const scrollLeft = Math.min(maxScrollLeft, Math.max(0, displayX - containerWidth / 2));
    const scrollTop = Math.min(maxScrollTop, Math.max(0, displayY - containerHeight / 2));
    $container.animate({ scrollLeft, scrollTop }, 500);
}

// マーカーのクリア
function clearMarker() {
    currentMarker = null;
    $('#currentCoords').fadeOut(300, function() {
        $(this).text('');
    });
    loadAndDrawMap();
}

// キャンバス上でのクリックイベント（座標確認用）。表示座標をバッファ座標に変換してからワールド座標へ。
$('#mapCanvas').on('click', function(e) {
    const rect = canvas.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const bufferX = rect.width > 0 ? displayX * (canvas.width / rect.width) : 0;
    const bufferY = rect.height > 0 ? displayY * (canvas.height / rect.height) : 0;
    const worldCoords = pixelToWorld(bufferX, bufferY);

    const tileSize = mapConfig.tileSize;
    const col = Math.floor(bufferX / tileSize);
    const row = Math.floor(bufferY / tileSize);
    const layout = mapConfig.layout;
    const tile = layout[row] && layout[row][col];
    const tileFile = tile ? tile.file : '(地図なし)';

    $('#selectedTileDisplay').text(tileFile);
    console.log(`クリック位置 - ピクセル: (${Math.round(bufferX)}, ${Math.round(bufferY)}), ワールド: (${worldCoords.x}, ${worldCoords.z}), タイル: ${tileFile}`);
});

// ピクセル座標からワールド座標への変換（逆変換）
function pixelToWorld(pixelX, pixelY) {
    const layout = mapConfig.layout;
    let refCol = 0, refRow = 0;
    
    // #17の位置を探す
    for (let r = 0; r < layout.length; r++) {
        for (let c = 0; c < layout[r].length; c++) {
            if (layout[r][c] && layout[r][c].id === '#17') {
                refCol = c;
                refRow = r;
                break;
            }
        }
    }
    
    const tileSize = mapConfig.tileSize;
    const scale = 1 / BLOCKS_PER_PIXEL;
    
    // #17の左上のピクセル座標
    const refPixelX = refCol * tileSize;
    const refPixelY = refRow * tileSize;
    
    // ワールド座標に変換
    const worldX = (pixelX - refPixelX) / scale;
    const worldZ = (pixelY - refPixelY) / scale;
    
    return { x: Math.round(worldX), z: Math.round(worldZ) };
}
