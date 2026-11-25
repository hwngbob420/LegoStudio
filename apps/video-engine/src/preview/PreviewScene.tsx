// Máy chiếu xem trước bằng Three.js: phát lại baked_timeline.json (do packages/director nướng).
// Không tự tính chuyển động. Hình học lấy từ .glb do Blender xuất; mặt 2D vẽ bằng canvas theo ô atlas.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ThreeCanvas } from "@remotion/three";
import { continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { useThree } from "@react-three/fiber";
import { RigModel } from "@lse/director";
import type { BakedTimeline, Manifest } from "@lse/shared";
import { ZUP_TO_YUP, actorBoneMatrices, applyCamera, cameraParams, worldFrame } from "./previewMath";
import { FX_SHAPES } from "./fxShapes";

export interface PreviewLibrary {
  manifest: Manifest;
  faceSpec: { eyes: string[]; mouths: string[]; grid: [number, number]; cell_px: number };
  palette: Record<string, string>;
  cast: Record<string, { skin: string; torso: { color: string }; face_details: string[] }>;
  lighting: Record<string, { hdri?: string; hdri_strength?: number; hdri_rotation_deg?: number; world_color?: string;
    lights: { type: string; offset: [number, number, number]; energy: number; color?: string; size?: number; aim_offset?: [number, number, number] }[] }>;
}

export interface PreviewProps {
  timeline: BakedTimeline;
  library: PreviewLibrary;
  /** Tiền tố URL tài nguyên nướng; rỗng = staticFile (thư mục public = workspace/channel_library/baked). */
  assetBase?: string;
}

const url = (base: string | undefined, p: string) => (base ? `${base.replace(/\/$/, "")}/${p}` : staticFile(p));
const col = (pal: Record<string, string>, c: string) => new THREE.Color(pal[c] ?? c);

interface Loaded {
  sets: Record<string, THREE.Group>;
  cast: Record<string, THREE.Group>;
  mug: THREE.Group;
  decals: Record<string, HTMLImageElement | null>;
  atlas: { eyes: HTMLImageElement; mouths: HTMLImageElement; details: Record<string, HTMLImageElement | null>; torso: Record<string, HTMLImageElement | null> };
  env: THREE.DataTexture | null;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function useAssets(p: PreviewProps): { data: Loaded | null; handle: number } {
  const [data, setData] = useState<Loaded | null>(null);
  const [handle] = useState(() => delayRender("Nạp glb + atlas cho máy chiếu xem trước", { timeoutInMilliseconds: 120000 }));
  useEffect(() => {
    const T = p.timeline;
    const loader = new GLTFLoader();
    const glb = (name: string) => loader.loadAsync(url(p.assetBase, `glb/${name}.glb`)).then((g) => g.scene);
    const figs = [...new Set(Object.values(T.actors).map((a) => a.fig))];
    const preset = p.library.lighting[T.sets[0].lighting];
    Promise.all([
      Promise.all(T.sets.map((s) => glb(`set_${s.id}`))),
      Promise.all(figs.map((f) => glb(`cast_${f}`))),
      glb("prop_mug"),
      loadImage(url(p.assetBase, "textures/atlas_eyes.png")),
      loadImage(url(p.assetBase, "textures/atlas_mouths.png")),
      Promise.all(figs.map((f) => loadImage(url(p.assetBase, `textures/detail_${f}.png`)))),
      Promise.all(figs.map((f) => loadImage(url(p.assetBase, `textures/torso_${f}.png`)))),
      Promise.all(Object.values(DECALS).map((d) => loadImage(url(p.assetBase, `textures/${d.file}`)))),
      preset?.hdri ? new HDRLoader().loadAsync(url(p.assetBase, `hdri/${preset.hdri}`)).catch(() => null) : Promise.resolve(null),
    ]).then(([sets, casts, mug, eyes, mouths, details, torsos, decals, env]) => {
      setData({
        sets: Object.fromEntries(T.sets.map((s, i) => [s.id, sets[i]])),
        cast: Object.fromEntries(figs.map((f, i) => [f, casts[i]])),
        mug,
        decals: Object.fromEntries(Object.keys(DECALS).map((k, i) => [k, decals[i]])),
        atlas: { eyes: eyes!, mouths: mouths!, details: Object.fromEntries(figs.map((f, i) => [f, details[i]])),
          torso: Object.fromEntries(figs.map((f, i) => [f, torsos[i]])) },
        env: env as THREE.DataTexture | null,
      });
      // continueRender happens in <Stage> once Three.js has actually drawn the first frame with the assets
    }).catch((e) => { console.error(e); continueRender(handle); });
  }, []);
  return { data, handle };
}

/** Vật liệu nhựa ABS gần giống Blender (bóng, lớp phủ). */
function absMaterial(color: THREE.Color, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.06, ...extra });
}

/** Vật liệu in hình (Blender dùng toạ độ Generated, glTF không mang theo) -> ảnh + độ phát sáng. */
const DECALS: Record<string, { file: string; emissive?: number }> = {
  ScreenCode: { file: "screen_code.png", emissive: 0.9 },
  StageChart: { file: "screen_chart.png", emissive: 0.7 },
  Menu: { file: "menu_board.png", emissive: 0.4 },
  Poster: { file: "poster_brick.png" },
};

/** UV phẳng theo hộp bao trên mặt phẳng XY cục bộ (giống toạ độ Generated của Blender). */
function planarUv(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / Math.max(1e-6, b.max.x - b.min.x);
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / Math.max(1e-6, b.max.y - b.min.y);
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

interface ActorNodes { root: THREE.Group; parts: { mesh: THREE.Object3D; bone: string }[]; faceCanvas: HTMLCanvasElement; faceTex: THREE.CanvasTexture; lastFace: string }

function buildScene(p: PreviewProps, L: Loaded) {
  const T = p.timeline, lib = p.library;
  const world = new THREE.Group();
  world.matrixAutoUpdate = false;
  world.matrix.copy(ZUP_TO_YUP);
  // bộ set
  const bricks: Record<string, THREE.Object3D> = {};
  T.sets.forEach((s) => {
    const g = L.sets[s.id].clone(true);
    g.position.set(s.origin[0], s.origin[1], s.origin[2]);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        const decal = m ? DECALS[m.name] : undefined;
        if (decal && L.decals[m.name]) {
          planarUv((o as THREE.Mesh).geometry);
          const tex = new THREE.Texture(L.decals[m.name]!);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          (o as THREE.Mesh).material = decal.emissive
            ? new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: decal.emissive, roughness: 0.15, clearcoat: 0.4 })
            : absMaterial(new THREE.Color(1, 1, 1), { map: tex });
        } else if (m && !m.emissiveMap && m.emissive?.getHex() === 0) {
          (o as THREE.Mesh).material = absMaterial(m.color.clone(), { map: m.map ?? null });
        }
        o.castShadow = true;
        o.receiveShadow = true;
      }
      if (o.name) bricks[o.name] = o;
    });
    world.add(g);
  });
  // diễn viên: mỗi mảnh đặt ma trận theo FK của bộ đạo diễn
  const actors: Record<string, ActorNodes> = {};
  for (const [aid, a] of Object.entries(T.actors)) {
    const recipe = lib.cast[a.fig];
    const root = new THREE.Group();
    const parts: ActorNodes["parts"] = [];
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = faceCanvas.height = 512;
    const faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
    faceTex.flipY = false; // glTF UV có v đảo
    L.cast[a.fig].clone(true).traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const bone = (mesh.userData?.bone as string) || "torso";
      const name = mesh.name || "";
      const base = (mesh.material as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color(1, 1, 1);
      if (name.endsWith("_head")) mesh.material = absMaterial(new THREE.Color(1, 1, 1), { map: faceTex });
      else if (name.endsWith("_torso")) {
        const tc = document.createElement("canvas");
        tc.width = tc.height = 512;
        const g2 = tc.getContext("2d")!;
        g2.fillStyle = "#" + col(lib.palette, recipe.torso.color).getHexString();
        g2.fillRect(0, 0, 512, 512);
        const im = L.atlas.torso[a.fig];
        if (im) g2.drawImage(im, 0, 0, 512, 512);
        const tt = new THREE.CanvasTexture(tc);
        tt.colorSpace = THREE.SRGBColorSpace;
        tt.wrapS = tt.wrapT = THREE.ClampToEdgeWrapping;
        tt.flipY = false;
        mesh.material = absMaterial(new THREE.Color(1, 1, 1), { map: tt });
      } else mesh.material = absMaterial(base);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      parts.push({ mesh, bone });
    });
    parts.forEach((pp) => root.add(pp.mesh));
    if (a.props.includes("mug")) {
      const mug = L.mug.clone(true);
      mug.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = absMaterial(col(lib.palette, a.prop_color ?? "white")); });
      const holder = new THREE.Group();
      holder.add(mug);
      mug.position.set(-0.086, -0.07, 0.128);
      holder.matrixAutoUpdate = false;
      root.add(holder);
      parts.push({ mesh: holder, bone: "hand.R" });
    }
    world.add(root);
    actors[aid] = { root, parts, faceCanvas, faceTex, lastFace: "" };
  }
  // hiệu ứng: nét vẽ 2D quay về camera
  const fxNodes = T.fx.map((e) => {
    const g = new THREE.Group();
    const shape = FX_SHAPES[e.kind] ?? [];
    for (const st of shape) {
      const pts = st.points.map(([x, y]) => new THREE.Vector3(x * e.size, y * e.size, 0));
      if (st.cyclic) pts.push(pts[0].clone());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      if (st.fill) {
        const sh = new THREE.Shape(st.points.map(([x, y]) => new THREE.Vector2(x * e.size, y * e.size)));
        g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: st.fill, side: THREE.DoubleSide })));
      }
      g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: st.stroke })));
    }
    g.visible = false;
    world.add(g);
    return { e, g };
  });
  return { world, bricks, actors, fxNodes };
}

function drawFace(n: ActorNodes, L: Loaded, p: PreviewProps, fig: string, eye: number, mouth: number) {
  const key = `${eye}:${mouth}`;
  if (key === n.lastFace) return;
  n.lastFace = key;
  const { grid } = p.library.faceSpec;
  const g = n.faceCanvas.getContext("2d")!;
  const recipe = p.library.cast[fig];
  g.fillStyle = "#" + col(p.library.palette, recipe.skin).getHexString();
  g.fillRect(0, 0, 512, 512);
  const det = L.atlas.details[fig];
  if (det) g.drawImage(det, 0, 0, 512, 512);
  const cell = (im: HTMLImageElement, idx: number) => {
    const cw = im.width / grid[0], ch = im.height / grid[1];
    g.drawImage(im, (idx % grid[0]) * cw, Math.floor(idx / grid[0]) * ch, cw, ch, 0, 0, 512, 512);
  };
  cell(L.atlas.eyes, eye);
  cell(L.atlas.mouths, mouth);
  n.faceTex.needsUpdate = true;
}

const Stage: React.FC<PreviewProps & { L: Loaded; handle: number }> = (props) => {
  const { timeline: T, library, L, handle } = props;
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const { scene, camera, gl } = useThree();
  const advance = useThree((st) => st.advance);
  const released = useRef(false);
  const rig = useMemo(() => new RigModel(library.manifest), [library.manifest]);
  const built = useMemo(() => buildScene(props, L), [L]);
  const lit = useRef(false);
  if (!lit.current) {
    lit.current = true;
    RectAreaLightUniformsLib.init();
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = 0.9;
    gl.shadowMap.enabled = true;
    scene.add(built.world);
    const preset = library.lighting[T.sets[0].lighting];
    if (L.env) {
      L.env.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = L.env;
      scene.environmentIntensity = (preset?.hdri_strength ?? 1) * 0.9;
      scene.environmentRotation.set(0, THREE.MathUtils.degToRad(preset?.hdri_rotation_deg ?? 0), 0);
    }
    scene.background = new THREE.Color(preset?.world_color ?? "#bcd0e2");
    // đèn theo preset (đơn vị Blender -> Three ước lượng; chỉ phục vụ xem trước)
    const lights = new THREE.Group();
    lights.matrixAutoUpdate = false;
    lights.matrix.copy(ZUP_TO_YUP);
    for (const s of T.sets) {
      for (const Ld of preset?.lights ?? []) {
        const pos = new THREE.Vector3(s.origin[0] + Ld.offset[0], s.origin[1] + Ld.offset[1], s.origin[2] + Ld.offset[2]);
        const aim = new THREE.Vector3(s.origin[0] + (Ld.aim_offset?.[0] ?? 0), s.origin[1] + (Ld.aim_offset?.[1] ?? 0), s.origin[2] + (Ld.aim_offset?.[2] ?? 0.3));
        const c = new THREE.Color(Ld.color ?? "#ffffff");
        let light: THREE.Light;
        if (Ld.type === "SUN") { const d = new THREE.DirectionalLight(c, Ld.energy * 0.8); d.castShadow = true; light = d; }
        else if (Ld.type === "AREA") { const r = new THREE.RectAreaLight(c, Ld.energy / ((Ld.size ?? 1) ** 2 * 20), Ld.size ?? 1, Ld.size ?? 1); light = r; }
        else light = new THREE.PointLight(c, Ld.energy * 0.05);
        light.position.copy(pos);
        if ((light as THREE.RectAreaLight).isRectAreaLight) {
          // RectAreaLight emits along its local -Z; lookAt points +Z at the target in Three, so aim it in Y-up space later
          lights.add(light);
          light.userData.aim = aim;
        } else {
          lights.add(light);
          if ((light as THREE.DirectionalLight).isDirectionalLight) { (light as THREE.DirectionalLight).target.position.copy(aim); lights.add((light as THREE.DirectionalLight).target); }
        }
      }
    }
    scene.add(lights);
    lights.updateMatrixWorld(true);
    lights.children.forEach((l) => {
      if (l.userData.aim) {
        const aimW = (l.userData.aim as THREE.Vector3).clone().applyMatrix4(lights.matrixWorld);
        const posW = l.getWorldPosition(new THREE.Vector3());
        const q = new THREE.Matrix4().lookAt(posW, aimW, new THREE.Vector3(0, 1, 0));
        const parentInv = lights.matrixWorld.clone().invert();
        l.quaternion.setFromRotationMatrix(parentInv.multiply(q));
      }
    });
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x8a7a66, 0.35));
  }
  const f = worldFrame(T, frame);
  // diễn viên
  for (const [aid, n] of Object.entries(built.actors)) {
    const mats = actorBoneMatrices(T, rig, aid, f);
    // ma trận của mảnh đã là thế giới Three, nên gốc diễn viên phải là đơn vị (bù phép đổi trục của nhóm world)
    n.root.matrixAutoUpdate = false;
    n.root.matrix.copy(ZUP_TO_YUP.clone().invert());
    for (const pp of n.parts) { pp.mesh.matrix.copy(mats[pp.bone]); }
    n.root.updateMatrixWorld(true);
    const [eye, mouth] = T.actors[aid].face[f - 1];
    drawFace(n, L, props, T.actors[aid].fig, eye, mouth);
  }
  // lắp ráp
  for (const a of T.assembly) {
    for (const [name, showAt] of Object.entries(a.show)) {
      const o = built.bricks[name];
      if (!o) continue;
      if (o.userData.home === undefined) o.userData.home = o.position.z;
      o.visible = f >= showAt;
      o.position.z = o.userData.home + (f === showAt ? a.lift : f === showAt + 1 ? -0.004 : 0);
    }
  }
  // camera
  const cp = cameraParams(T, f, rig, W, H);
  applyCamera(camera as THREE.PerspectiveCamera, cp, W, H);
  // hiệu ứng
  for (const { e, g } of built.fxNodes) {
    const on = f >= e.f0 && f <= e.f1;
    g.visible = on;
    if (!on) continue;
    const i = f - e.f0;
    const s = [0.55, 1.18, 1.0][i] ?? 1 + 0.04 * Math.sin(i * 2.1);
    const dy = e.kind === "sweat_drop" ? -0.05 * Math.max(0, i - 2) * e.size : e.kind === "steam" ? 0.04 * i * e.size : 0;
    g.matrixAutoUpdate = false;
    const pos = new THREE.Vector3(e.loc[0], e.loc[1], e.loc[2] + dy);
    const posY = pos.clone().applyMatrix4(ZUP_TO_YUP);
    const camPos = new THREE.Vector3().setFromMatrixPosition(cp.matrixWorld);
    const look = new THREE.Matrix4().lookAt(camPos, posY, new THREE.Vector3(0, 1, 0));
    const mw = new THREE.Matrix4().compose(posY, new THREE.Quaternion().setFromRotationMatrix(look), new THREE.Vector3(s, s, s));
    g.matrix.copy(ZUP_TO_YUP.clone().invert().multiply(mw));
  }
  // scene was mutated during render: draw now, then release the asset delayRender once (first real frame)
  useLayoutEffect(() => {
    advance(frame, true);
    if (!released.current) { released.current = true; continueRender(handle); }
  }, [frame]);
  return null;
};

export const PreviewScene: React.FC<PreviewProps> = (props) => (props.timeline ? <PreviewInner {...props} /> : null);

const PreviewInner: React.FC<PreviewProps> = (props) => {
  const { width, height } = useVideoConfig();
  const { data: L, handle } = useAssets(props);
  return (
    <ThreeCanvas width={width} height={height} linear={false} shadows gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ fov: 30, near: 0.02, far: 60 }}>
      {L ? <Stage {...props} L={L} handle={handle} /> : null}
    </ThreeCanvas>
  );
};
