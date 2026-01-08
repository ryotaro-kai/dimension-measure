import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

let container;
let camera, scene, renderer;
let controller;
let reticle;
let boxMesh;
let hitTestSource = null;
let hitTestSourceRequested = false;
let isPlaced = false;
let arButton = null;

init();
animate();

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    // シーン設定
    scene = new THREE.Scene();

    // カメラ設定
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // ライト設定
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // レンダラー設定
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // 【重要】UIを表示させるためにDOM Overlayを確実に設定
    // document.body をルートに設定することで、HTML全体をARの上に表示させる
    arButton = ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'], 
        domOverlay: { root: document.body } 
    });
    document.body.appendChild(arButton);

    // イベントリスナー
    renderer.xr.addEventListener('sessionstart', onARSessionStart);
    renderer.xr.addEventListener('sessionend', onARSessionEnd);

    // 箱とカーソルを作成
    createBox();

    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
    
    // スライダー操作のイベント
    const wSlider = document.getElementById('widthSlider');
    const hSlider = document.getElementById('heightSlider');
    const dSlider = document.getElementById('depthSlider');
    
    if(wSlider) wSlider.addEventListener('input', updateBoxSize);
    if(hSlider) hSlider.addEventListener('input', updateBoxSize);
    if(dSlider) dSlider.addEventListener('input', updateBoxSize);
}

function createBox() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0); // 底面基準

    const material = new THREE.MeshPhongMaterial({ 
        color: 0x00aaff, 
        transparent: true, 
        opacity: 0.5,
    });
    
    boxMesh = new THREE.Mesh(geometry, material);
    
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    boxMesh.add(line);
    
    boxMesh.scale.set(0.3, 0.3, 0.3);
}

function onSelect() {
    if (reticle.visible) {
        // カーソル位置に箱を移動
        boxMesh.position.setFromMatrixPosition(reticle.matrix);
        
        // まだ置いていなければシーンに追加
        if (!isPlaced) {
            scene.add(boxMesh);
            isPlaced = true;
            
            // 【修正】置いた瞬間にカーソルを強制的に消す
            reticle.visible = false;
        }

        // 【修正】UI表示を確実に行う
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }
}

function updateBoxSize() {
    if(!boxMesh) return;

    const w = document.getElementById('widthSlider').value;
    const h = document.getElementById('heightSlider').value;
    const d = document.getElementById('depthSlider').value;

    const info = document.getElementById('info');
    if(info) info.innerText = `サイズ: ${w} x ${h} x ${d} cm`;

    boxMesh.scale.set(w * 0.01, h * 0.01, d * 0.01);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onARSessionStart() {
    // AR開始時にUIオーバーレイを非表示のまま準備（配置後に表示するため）
    const overlay = document.getElementById('overlay');
    if(overlay) overlay.style.display = 'none';
}

function onARSessionEnd() {
    // AR終了時はUIを隠す
    const overlay = document.getElementById('overlay');
    if(overlay) overlay.style.display = 'none';
    
    // 【修正】終了時にカーソルと箱を非表示にする（残像対策）
    reticle.visible = false;
    isPlaced = false;
    
    // ヒットテストのリセット
    hitTestSourceRequested = false;
    hitTestSource = null;
    
    // 箱をシーンから除去
    scene.remove(boxMesh);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            // 【修正】「床が見つかった」かつ「まだ箱を置いていない」時だけカーソルを出す
            if (hitTestResults.length > 0 && !isPlaced) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                // それ以外（床がない、または既に箱を置いた）は隠す
                reticle.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}