export const fboVelocityShader = `
uniform float uTime;
uniform sampler2D texCube;
uniform sampler2D texSphere;
uniform sampler2D texPyramid;
uniform sampler2D texStar;
uniform sampler2D texMask;
uniform sampler2D texNoise;

uniform int uOldShape;
uniform int uCurrentShape;
uniform float uMorphProgress;

uniform float uStructure;
uniform vec3 uMousePos;
uniform float uMouseRadius;
uniform float uMouseForce;
uniform float uMouseSwirl;
uniform float uMouseDisruption;

uniform float uFlowSpeed;
uniform float uTwistAmount;

vec3 getShapePos(int shapeIdx, vec2 uv) {
    if (shapeIdx == 0) return texture2D(texCube, uv).xyz;
    if (shapeIdx == 1) return texture2D(texSphere, uv).xyz;
    if (shapeIdx == 2) return texture2D(texPyramid, uv).xyz;
    if (shapeIdx == 3) return texture2D(texStar, uv).xyz;
    if (shapeIdx == 4) return texture2D(texMask, uv).xyz;
    return texture2D(texStar, uv).xyz;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    vec3 noiseVec = texture2D(texNoise, uv).xyz;

    // 1. Calculate Target Base Position
    vec3 posA = getShapePos(uOldShape, uv);
    vec3 posB = getShapePos(uCurrentShape, uv);
    vec3 targetPos = mix(posA, posB, uMorphProgress);

    // 2. Apply Spatial Twist & Flow to Target
    float flowAngle = targetPos.y * uTwistAmount + (uTime * uFlowSpeed);
    float s = sin(flowAngle); float c = cos(flowAngle);
    targetPos.xz = mat2(c, -s, s, c) * targetPos.xz;

    // 3. Spring Force (Pull back to Target gently for a fluid feel)
    // Decreased multiplier so it floats back softly instead of snapping
    vec3 springForce = (targetPos - pos) * (0.005 * uStructure);

    // 4. Ambient structural noise (wind) when structure is low
    float noiseAmplitude = (1.0 - uStructure) * 0.2;
    vec3 ambientWind = noiseVec * noiseAmplitude;
    
    // 5. Mouse Interaction Forces
    vec3 dirToMouse = pos - uMousePos;
    float distToMouse = length(dirToMouse);
    vec3 mouseForceVec = vec3(0.0);

    if (distToMouse < uMouseRadius) {
        float falloff = smoothstep(1.0, 0.0, distToMouse / uMouseRadius);
        falloff *= falloff; // softer cubic curve
        vec3 dirNorm = normalize(dirToMouse + vec3(0.0001)); 
        
        mouseForceVec += dirNorm * uMouseForce * falloff * 0.1; 
        mouseForceVec += cross(dirNorm, vec3(0.0, 1.0, 0.0)) * uMouseSwirl * falloff * 0.1; 
        mouseForceVec += noiseVec * uMouseDisruption * falloff * 0.05; 
    }

    // 6. Accumulate Forces
    vel += springForce;
    vel += ambientWind;
    vel += mouseForceVec; 

    // 7. Friction / Damping (High drag for syrup/fluid momentum)
    vel *= 0.88;

    gl_FragColor = vec4(vel, 1.0);
}
`;

export const fboPositionShader = `
void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    pos += vel;

    gl_FragColor = vec4(pos, 1.0);
}
`;

export const particleVertexShader = `
uniform sampler2D uFboPos;
uniform float uParticleSize;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uAudioBassScale;
uniform float uAudioMidGlow;
uniform float uAudioTrebleScatter;
uniform float uStructure;
uniform float uTime;
varying float vAlpha;
varying vec3 vColorOffset;

// 3D Simplex Noise for smooth, organic displacement
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
    vec3 pos = texture2D(uFboPos, uv).xyz;
    
    // 1. Audio Bass - Clean uniform heartbeat pump. 
    // This preserves the exact shape/silhouette but scales it gracefully.
    pos *= 1.0 + (uBass * uAudioBassScale * 0.4);

    // 2. Audio Mid - Fluid, organic 3D noise "dancing"
    // Instead of wavy shearing, we use Simplex noise to create a bubbling, fluid energy inside the shape.
    float n1 = snoise(pos * 1.5 + uTime * 1.5);
    float n2 = snoise(pos * 1.5 - uTime * 1.5 + vec3(100.0));
    float n3 = snoise(pos * 1.5 + vec3(0.0, uTime * 1.5, 0.0));
    vec3 dancingNoise = vec3(n1, n2, n3);
    
    pos += dancingNoise * (uMid * uAudioMidGlow * 0.25);

    // 3. Audio Treble - High-frequency localized jitter (buzz/glitch effect)
    // Moves very rapidly, but bounded to a tiny distance so it never destroys the shape.
    vec3 jitter = vec3(
        snoise(pos * 15.0 + uTime * 20.0),
        snoise(pos * 15.0 + uTime * 20.0 + 10.0),
        snoise(pos * 15.0 + uTime * 20.0 + 20.0)
    );
    pos += jitter * (uTreble * uAudioTrebleScatter * 0.15);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Particle Size pulses with Mid and Bass
    gl_PointSize = uParticleSize * (1.0 + uMid * uAudioMidGlow * 0.5 + uBass * 0.3) * (10.0 / -mvPosition.z);
    
    // Alpha Reactivity
    vAlpha = mix(0.1, 0.9, uStructure) + (uBass * 0.4);
    
    // Pass frequency bands to fragment shader to drive color tinting
    vColorOffset = vec3(uBass, uMid, uTreble);
}
`;

export const particleFragmentShader = `
varying float vAlpha;
varying vec3 vColorOffset;

void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if (ll > 0.5) discard;
    
    // Soft particle dot
    float alpha = smoothstep(0.5, 0.1, ll) * vAlpha * 0.8;
    
    // Best Practice: Map frequency bands to RGB channels for subtle audio-reactive coloring
    // Bass = slight red warmth, Mid = slight cyan/green energy, Treble = blue/white spark
    vec3 baseColor = vec3(0.85, 0.85, 0.9); // Slight off-white base
    vec3 tint = vec3(
        vColorOffset.x * 0.7,          // R: Bass
        vColorOffset.y * 0.5,          // G: Mid
        vColorOffset.z * 0.9           // B: Treble
    );
    
    // Additive color blending
    vec3 finalColor = min(baseColor + tint, vec3(1.0));
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;
