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

// Pseudo-random noise function for audio treble scatter
vec3 hash32(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx) * 2.0 - 1.0;
}

void main() {
    vec3 pos = texture2D(uFboPos, uv).xyz;
    
    float dist = length(pos);
    vec3 dir = normalize(pos + vec3(0.0001));
    
    // Generate a stable noise vector per particle for audio scattering
    vec3 noiseVec = normalize(hash32(uv * 100.0));
    
    // Edge fixation factor: 1.0 at center, drops to near 0.0 at outer edges
    // This ensures the silhouette stays recognizable while the inside dances.
    float edgeFix = smoothstep(3.5, 0.0, dist);
    
    // 1. Audio Treble - Subtle, localized jitter instead of shape-destroying scatter
    float trebleDisp = uTreble * uAudioTrebleScatter * 0.15 * edgeFix;
    pos += noiseVec * trebleDisp;
    
    // 2. Audio Mid - Radial ripple pushing outward like a speaker cone
    float midRipple = sin(dist * 6.0 - uTime * 12.0) * uMid * uAudioMidGlow * 0.15;
    pos += dir * (midRipple * edgeFix);
    
    // 3. Audio Bass - Inner particles push outward into the shell, compressing the shape internally
    float bassBump = uBass * uAudioBassScale * edgeFix;
    pos += dir * (bassBump * dist);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    gl_PointSize = uParticleSize * (1.0 + uMid * uAudioMidGlow * 0.5 + uBass * 0.5) * (10.0 / -mvPosition.z);
    
    vAlpha = mix(0.1, 0.9, uStructure) + (uBass * 0.5);
}
`;

export const particleFragmentShader = `
varying float vAlpha;
void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if (ll > 0.5) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, ll) * vAlpha * 0.8);
}
`;
