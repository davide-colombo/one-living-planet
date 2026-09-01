/**
 * GLSL for the hero globe.
 *
 * The surface shader blends the Blue Marble day texture and Black
 * Marble night lights across the terminator, driven by a sun-direction
 * uniform in world space (the mesh's current rotation is applied to
 * the earth-fixed sun vector each frame, so lighting stays glued to
 * geography while the globe drifts).
 */

export const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform vec3 rimColor;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;

    float cosSun = dot(normal, sunDir);
    // soft terminator band
    float dayness = smoothstep(-0.12, 0.18, cosSun);

    // warm the city lights slightly and lift them
    vec3 nightSide = night * vec3(1.0, 0.88, 0.72) * 1.7 + day * 0.015;
    // simple lambert-ish shaping on the day side
    vec3 daySide = day * (0.18 + 0.95 * clamp(cosSun, 0.0, 1.0));

    vec3 color = mix(nightSide, daySide, dayness);

    // warm tint inside the terminator band (low sun light)
    float twilight = smoothstep(-0.12, 0.05, cosSun) * (1.0 - smoothstep(0.05, 0.35, cosSun));
    color += rimColor * twilight * 0.12;

    // sun glint on water: broad specular, gated to blue-dominant pixels
    float oceanish = clamp((day.b - max(day.r, day.g)) * 4.0, 0.0, 1.0);
    vec3 halfway = normalize(sunDir + viewDir);
    float spec = pow(clamp(dot(normal, halfway), 0.0, 1.0), 48.0);
    color += vec3(1.0, 0.97, 0.9) * spec * oceanish * dayness * 0.4;

    // faint edge sheen — just enough to lift the limb off the sky
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
    float rimLit = 0.35 + 0.65 * smoothstep(-0.3, 0.5, cosSun);
    color += rimColor * fresnel * rimLit * 0.35;

    gl_FragColor = vec4(color, uOpacity);
  }
`;
