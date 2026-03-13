let mapConfig = null;
let canvas = null;
let ctx = null;
let loadedImages = {};
let currentMarker = null;

// 4倍縮小地図用: 1ピクセルが何ブロックか
const BLOCKS_PER_PIXEL = 4;

// 初期化
$(document).ready(async function() {
    canvas = $('#mapCanvas')[0];
    ctx = canvas.getContext('2d');
    
    // 設定ファイルの読み込み
    try {
        mapConfig = await $.getJSON('map-config.json');
        await loadAndDrawMap();
    } catch (error) {
        console.error('設定ファイルの読み込みに失敗しました:', error);
        alert('地図の読み込みに失敗しました');
    }
    
    // イベントリスナーの設定
    $('#locateBtn').on('click', locatePosition);
    $('#clearBtn').on('click', clearMarker);
    
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

// マーカー位置までスクロール
function scrollToMarker(x, y) {
    const $container = $('.map-container');
    const containerWidth = $container.width();
    const containerHeight = $container.height();
    
    // マーカーが中央に来るようにスクロール
    $container.animate({
        scrollLeft: x - containerWidth / 2,
        scrollTop: y - containerHeight / 2
    }, 500);
}

// マーカーのクリア
function clearMarker() {
    currentMarker = null;
    $('#currentCoords').fadeOut(300, function() {
        $(this).text('');
    });
    loadAndDrawMap();
}

// キャンバス上でのクリックイベント（座標確認用）
$('#mapCanvas').on('click', function(e) {
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    const worldCoords = pixelToWorld(pixelX, pixelY);
    
    console.log(`クリック位置 - ピクセル: (${Math.round(pixelX)}, ${Math.round(pixelY)}), ワールド: (${worldCoords.x}, ${worldCoords.z})`);
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
