// Ô xem minifig 3D xoay được, cập nhật tức thì khi sửa công thức.
// Nếu diễn viên đã có .glb nướng thật -> dùng đúng file đó. Nếu chưa (đang ráp) -> ráp từ "bộ mảnh":
// thân lấy của Bricky, tóc/kính lấy từ diễn viên có kiểu đó, màu theo công thức; hình in áo/mặt gần đúng tới khi bấm "Nướng kho".
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

const HAIR_KIT: Record<string, string> = { messy: "max_dev", ponytail: "priya_lead", bun: "grandma_lin", short_crop: "kofi_barista", cap: "classic_yellow" };
const PRINT_KIT: Record<string, string> = { hoodie: "max_dev", blazer: "priya_lead", apron: "kofi_barista", cardigan: "grandma_lin", tee_star: "classic_yellow" };
const GLASSES_KIT: Record<string, string> = { glasses_round: "max_dev", glasses_square: "grandma_lin" };
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group | null>>();
const glb = (fig: string) => {
  if (!cache.has(fig)) cache.set(fig, loader.loadAsync(`/baked/glb/cast_${fig}.glb`).then((g) => g.scene).catch(() => null));
  return cache.get(fig)!;
};
const img = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

interface Props { recipe: any; palette: Record<string, string>; faceSpec: any; baked: boolean; expression?: string }

export const MinifigViewer: React.FC<Props> = ({ recipe, palette, faceSpec, baked, expression }) => {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; fig: THREE.Group; controls: OrbitControls } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.AgXToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 0.01, 20);
    cam.position.set(0.25, 0.3, 0.95);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 0.2, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
    const key = new THREE.DirectionalLight(0xfff1de, 2.2); key.position.set(-1, 1.5, 1.2); scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe3ff, 1.6); rim.position.set(1, 1, -1.2); scene.add(rim);
    new HDRLoader().loadAsync("/baked/hdri/studio_small_09_2k.hdr").then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; scene.environment = t; scene.environmentIntensity = 0.6; }).catch(() => {});
    const fig = new THREE.Group();
    fig.rotation.x = -Math.PI / 2; // Blender Z-up -> Three Y-up
    scene.add(fig);
    ctx.current = { renderer, scene, cam, fig, controls };
    let live = true;
    const loop = () => { if (!live) return; controls.update(); renderer.render(scene, cam); requestAnimationFrame(loop); };
    loop();
    return () => { live = false; renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => {
    if (!ctx.current || !recipe) return;
    let cancelled = false;
    const { fig } = ctx.current;
    (async () => {
      const col = (c: string) => new THREE.Color(palette[c] ?? c);
      const mat = (c: THREE.Color, map?: THREE.Texture) => new THREE.MeshPhysicalMaterial({ color: c, map: map ?? null, roughness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.06 });
      const parts: THREE.Object3D[] = [];
      const take = (g: THREE.Group | null, test: (n: string) => boolean) => {
        g?.traverse((o) => { if ((o as THREE.Mesh).isMesh && test(o.name)) parts.push(o.clone()); });
      };
      if (baked) take(await glb(recipe.id), () => true);
      else {
        take(await glb("classic_yellow"), (n) => !n.endsWith("_hair"));
        if (HAIR_KIT[recipe.hair?.style]) take(await glb(HAIR_KIT[recipe.hair.style]), (n) => n.endsWith("_hair"));
        for (const acc of recipe.accessories ?? []) if (GLASSES_KIT[acc]) take(await glb(GLASSES_KIT[acc]), (n) => n.endsWith(`_${acc}`));
      }
      // mặt
      const face = document.createElement("canvas"); face.width = face.height = 512;
      const g = face.getContext("2d")!;
      g.fillStyle = "#" + col(recipe.skin).getHexString(); g.fillRect(0, 0, 512, 512);
      const det = baked ? await img(`/baked/textures/detail_${recipe.id}.png`) : null;
      if (det) g.drawImage(det, 0, 0, 512, 512);
      const [eyes, mouths] = await Promise.all([img("/baked/textures/atlas_eyes.png"), img("/baked/textures/atlas_mouths.png")]);
      const expr = expression ?? recipe.default_expression;
      const cell = (im: HTMLImageElement | null, idx: number) => { if (!im || idx < 0) return; const [cx, cy] = faceSpec.grid; const w = im.width / cx, h = im.height / cy; g.drawImage(im, (idx % cx) * w, Math.floor(idx / cx) * h, w, h, 0, 0, 512, 512); };
      cell(eyes, faceSpec.eyes.indexOf(expr));
      cell(mouths, faceSpec.mouths.indexOf(faceSpec.expression_rest_mouth[expr]));
      const faceTex = new THREE.CanvasTexture(face); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.flipY = false;
      // áo in
      const torso = document.createElement("canvas"); torso.width = torso.height = 512;
      const tg = torso.getContext("2d")!;
      tg.fillStyle = "#" + col(recipe.torso.color).getHexString(); tg.fillRect(0, 0, 512, 512);
      const pr = await img(`/baked/textures/torso_${baked ? recipe.id : PRINT_KIT[recipe.torso.print]}.png`);
      if (pr) tg.drawImage(pr, 0, 0, 512, 512);
      const torsoTex = new THREE.CanvasTexture(torso); torsoTex.colorSpace = THREE.SRGBColorSpace; torsoTex.flipY = false;
      if (cancelled) return;
      for (const p of parts) {
        const n = p.name;
        const m = p as THREE.Mesh;
        if (n.endsWith("_head")) m.material = mat(new THREE.Color(1, 1, 1), faceTex);
        else if (n.endsWith("_torso")) m.material = mat(new THREE.Color(1, 1, 1), torsoTex);
        else if (n.endsWith("_hair")) m.material = mat(col(recipe.hair.color));
        else if (n.includes("_glasses_")) m.material = mat(col("black"));
        else if (/_leg[LR]$/.test(n)) m.material = mat(col(recipe.legs));
        else if (n.endsWith("_hips")) m.material = mat(col(recipe.hips));
        else if (/_arm[LR]$/.test(n)) m.material = mat(col(recipe.arms));
        else if (/_hand[LR]$/.test(n)) m.material = mat(col(recipe.hands));
      }
      fig.clear();
      parts.forEach((p) => fig.add(p));
    })();
    return () => { cancelled = true; };
  }, [recipe, baked, expression]);

  return <div ref={host} className="h-full w-full" />;
};
