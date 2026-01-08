import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

let container;
let camera, scene, renderer;
let controller;
let reticle; // 床認識カーソル
let boxMesh; // 計測用の箱
let hitTestSource = null;
let hitTestSourceRequested = false;
let isPlaced = false; // 箱を置いたかどうかのフラグ

init();
animate();

function init() {
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
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
    renderer.xr.enabled = true; // WebXR有効化
    
    // Canvas要素にスタイルを設定（ポインターイベントを下に透過させる）
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.pointerEvents = 'none'; // ポインターイベントを無視
    
    container.appendChild(renderer.domElement);

    // ARボタンを追加
    // requiredFeatures: 'hit-test' が重要（床検知に必要）
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // 計測用の箱を作成（初期状態ではシーンに追加しない）
    createBox();

    // レティクル（床検知カーソル）の作成
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // タップイベント（コントローラー）
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
    
    // スライダーのイベント設定
    const widthSlider = document.getElementById('widthSlider');
    const heightSlider = document.getElementById('heightSlider');
    const depthSlider = document.getElementById('depthSlider');

    if(widthSlider) widthSlider.addEventListener('input', updateBoxSize);
    if(heightSlider) heightSlider.addEventListener('input', updateBoxSize);
    if(depthSlider) depthSlider.addEventListener('input', updateBoxSize);
}

// 箱のオブジェクトを作る関数
function createBox() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    // 【重要】底面を基準にするためYを0.5ずらす
    geometry.translate(0, 0.5, 0);

    const material = new THREE.MeshPhongMaterial({ 
        color: 0x00aaff, 
        transparent: true, 
        opacity: 0.5,
    });
    
    boxMesh = new THREE.Mesh(geometry, material);
    
    // ワイヤーフレーム（枠線）追加
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    boxMesh.add(line);
    
    // 初期サイズ適用 (30cm)
    boxMesh.scale.set(0.3, 0.3, 0.3);
}

// 画面タップ時の処理
function onSelect() {
    if (reticle.visible && isPlaced) {
        // カーソルの位置に箱を配置しなおす
        boxMesh.position.setFromMatrixPosition(reticle.matrix);
        if (boxMesh.parent !== scene) {
            scene.add(boxMesh);
        }
    } else if (reticle.visible && !isPlaced) {
        // 初回タップ：カーソルの位置に箱を置く
        boxMesh.position.setFromMatrixPosition(reticle.matrix);
        scene.add(boxMesh);
        isPlaced = true;
    }
}

// スライダーで箱のサイズを変える処理
function updateBoxSize() {
    if(!boxMesh) return;

    const w = document.getElementById('widthSlider').value;
    const h = document.getElementById('heightSlider').value;
    const d = document.getElementById('depthSlider').value;

    // テキスト更新
    const info = document.getElementById('info');
    if(info) info.innerText = `サイズ: ${w} x ${h} x ${d} cm`;

    // 3Dモデル更新 (cm -> m)
    boxMesh.scale.set(w * 0.01, h * 0.01, d * 0.01);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// レンダリングループ
function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // ヒットテストの初期化（初回のみ）
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
                const overlay = document.getElementById('overlay');
                if(overlay) overlay.style.display = 'none'; // 終了時にUI消す
                isPlaced = false; // セッション終了時にリセット
            });
            hitTestSourceRequested = true;
            
            // AR セッション開始時に、すぐ次のフレームでUIを表示
            setTimeout(() => {
                if (!isPlaced) {
                    const overlay = document.getElementById('overlay');
                    if(overlay) overlay.style.display = 'flex';
                    isPlaced = true;
                }
            }, 500);
        }

        // ヒットテスト実行（床検知）
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