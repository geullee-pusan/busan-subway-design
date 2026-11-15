// 3D 주인공 조립. scripts/hero-pack.mjs가 만든 src/content/hero/hero3d.json(뼈대·메시·동작)과
// 텍스처 그림(hero3d.webp)으로 three.js 기본 부품만 써서 움직이는 모델을 만든다.
// 모델 로더(GLTFLoader, FBXLoader)는 쓰지 않는다: 로더 안의 네트워크 코드가 배포물에 들어가지 않게 한다.
// (C:\joosan의 src/ui/hero-model.js와 같은 방법이다.)
import {
  AnimationClip,
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  VectorKeyframeTrack,
} from 'three';

/** base64 → 형식 있는 배열 */
function decode(b64, Type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Type(bytes.buffer);
}

const TYPES = { f32: Float32Array, u16: Uint16Array, u32: Uint32Array, i16: Int16Array };
const arr = (a) => decode(a.data, TYPES[a.type]);
/** 동작 값: 16비트 정수로 담은 회전은 -1~1로 되돌린다 */
const values = (a) => (a.type === 'i16' ? Float32Array.from(arr(a), (x) => x / 32767) : arr(a));

/**
 * @param {object} data hero3d.json
 * @param {HTMLImageElement|HTMLCanvasElement|null} image 텍스처 그림(없으면 단색)
 * @returns {{root: Group, clips: Record<string, AnimationClip>, dispose: () => void}} root는 키 1, 발이 바닥(0), +z를 본다
 */
export function buildHero(data, image) {
  const geo = new BufferGeometry();
  const g = data.geometry;
  geo.setAttribute('position', new BufferAttribute(arr(g.position), 3));
  if (g.normal) geo.setAttribute('normal', new BufferAttribute(arr(g.normal), 3));
  if (g.uv) geo.setAttribute('uv', new BufferAttribute(arr(g.uv), 2));
  geo.setAttribute('skinIndex', new BufferAttribute(arr(g.skinIndex), 4));
  geo.setAttribute('skinWeight', new BufferAttribute(arr(g.skinWeight), 4));
  if (g.index) geo.setIndex(new BufferAttribute(arr(g.index), 1));
  if (!g.normal) geo.computeVertexNormals();

  let map = null;
  if (image) {
    map = new Texture(image);
    map.colorSpace = SRGBColorSpace;
    map.flipY = data.textureFlipY ?? true;
    map.needsUpdate = true;
  }
  const material = new MeshStandardMaterial({ map, color: map ? 0xffffff : 0xe8d9c4, roughness: 0.85, metalness: 0 });

  const bones = data.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    bone.position.fromArray(b.p);
    bone.quaternion.fromArray(b.q);
    bone.scale.fromArray(b.s);
    return bone;
  });
  data.bones.forEach((b, i) => {
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  const inverses = [];
  const inv = arr(data.boneInverses);
  for (let i = 0; i < bones.length; i++) inverses.push(new Matrix4().fromArray(inv, i * 16));

  const root = new Group();
  const armature = new Group();
  new Matrix4().fromArray(data.armatureMatrix).decompose(armature.position, armature.quaternion, armature.scale);
  for (let i = 0; i < bones.length; i++) if (data.bones[i].parent < 0) armature.add(bones[i]);
  const mesh = new SkinnedMesh(geo, material);
  new Matrix4().fromArray(data.meshMatrix).decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.frustumCulled = false;
  root.add(armature, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones, inverses), new Matrix4().fromArray(data.bindMatrix));

  // 키를 1로 맞추고 발을 바닥(0)에 둔다
  const s = 1 / data.height;
  const outer = new Group();
  root.scale.setScalar(s);
  root.position.set(-data.center[0] * s, -data.floor * s, -data.center[2] * s);
  outer.add(root);

  const clips = {};
  for (const c of data.clips) {
    const tracks = c.tracks.map((t) => {
      const T = t.kind === 'q' ? QuaternionKeyframeTrack : VectorKeyframeTrack;
      const times = t.times ? arr(t.times) : Float32Array.from({ length: t.n }, (_, k) => Math.min(c.duration, k / t.fps));
      return new T(t.name, times, values(t.values));
    });
    clips[c.name] = new AnimationClip(c.name, c.duration, tracks);
  }
  return {
    root: outer,
    clips,
    dispose() {
      geo.dispose();
      material.dispose();
      map?.dispose();
    },
  };
}
