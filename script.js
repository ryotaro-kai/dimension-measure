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
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    // 【修正】コンテナ自体はタッチを無視し、後ろ（AR世界）や子要素（ボタン）に通す
    container.style.pointerEvents = 'none'; 
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
    
    // 【修正】レンダラー（Canvas）もタッチを無視する設定（DOM Overlayを使うなら安全策としてOK）
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.pointerEvents = 'none'; 
    
    container.appendChild(renderer.domElement);

    // 【重要修正】ARボタンの設定に 'dom-overlay' を追加
    // これがないとスマホでUI（スライダー）が表示されません
    arButton = ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'], 
        domOverlay: { root: document.body } 
    });
    
    arButton.style.pointerEvents = 'auto'; // ボタンは押せるようにする
    document.body.appendChild(arButton);
    
    // イベントリスナー
    renderer.xr.addEventListener('sessionstart', onARSessionStart);
    renderer.xr.addEventListener('sessionend', onARSessionEnd);

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
    
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const depthSlider = document.getElementById('depthSlider');

    // 【念のため修正】スライダーが存在しない場合のエラーを防ぐ
    if(widthSlider) widthSlider.addEventListener('input', updateBoxSize);
    if(heightSlider) heightSlider.addEventListener('input', updateBoxSize);
    if(depthSlider) depthSlider.addEventListener('input', updateBoxSize);
}

function createBox() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

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
        // isPlacedの判定に関わらず、タップした場所に移動させる（再配置機能）
        boxMesh.position.setFromMatrixPosition(reticle.matrix);
        
        if (!isPlaced) {
            scene.add(boxMesh);
            isPlaced = true;
        }
    }
}

function updateBoxSize() {
    if(!boxMesh) return;

    // UI要素が取得できない場合のガードを入れる
    const wSlider = document.getElementById('widthSlider');
    const hSlider = document.getElementById('heightSlider');
    const dSlider = document.getElementById('depthSlider');
    
    if(!wSlider || !hSlider || !dSlider) return;

    const w = wSlider.value;
    const h = hSlider.value;
    const d = dSlider.value;

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
    console.log('AR Start');
    // オーバーレイ（UI）を表示
    const overlay = document.getElementById('overlay');
    if(overlay) {
        overlay.style.display = 'flex';
        // 【重要】UIがタップできるように pointer-events を復帰させる
        // ただしスライダーなどの操作部分のみ反応させたい場合、CSS側で制御するが
        // ここでは親要素を表示するだけでOK。
    }
}

function onARSessionEnd() {
    console.log('AR End');
    const overlay = document.getElementById('overlay');
    if(overlay) overlay.style.display = 'none';
    
    isPlaced = false;
    hitTestSourceRequested = false;
    hitTestSource = null;
    
    // 箱をシーンから消す（リセット）
    if(boxMesh.parent) scene.remove(boxMesh);
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
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}