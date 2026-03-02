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
uniform float uAudioTime;
uniform float uBassSizeBump;
uniform float uSpeakerConeRadius;

varying float vAlpha;

void main() {
    vec3 pos = texture2D(uFboPos, uv).xyz;
    
    // We want to return exactly to the original math that you liked!
    // NO Simplex noise. NO accumulated time. NO particle size bumping.
    
    // Create a simple noise vector based on position, just like your original code did:
    // (In your original code, this was passed via BufferAttribute 'noiseVec', 
    // but here we can derive a stable vector from uv so we don't have to rewrite the FBO buffer)
    vec3 noiseVec = normalize(vec3(
      fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0,
      fract(sin(dot(uv, vec2(39.346, 11.135))) * 43758.5453) * 2.0 - 1.0,
      fract(sin(dot(uv, vec2(73.156, 52.235))) * 43758.5453) * 2.0 - 1.0
    ));

    // 1. Audio Treble - Scatter edges using noise vector (Directly from your original code)
    float noiseAmplitude = (1.0 - uStructure) * 3.0 + (uTreble * uAudioTrebleScatter);
    pos += noiseVec * noiseAmplitude;
    
    // 2. Audio Bass - Uniform scaling heartbeat (Directly from your original code)
    pos *= 1.0 + (uBass * uAudioBassScale);
    
    // 3. Audio Mid - Speaker Cone Push
    // Calculates distance from the center
    float dist = length(pos);
    
    // Calculate the direction pointing straight out from the center
    vec3 dir = normalize(pos + vec3(0.0001));
    
    // Create a smooth bell curve: maximum push at the center (dist=0), tapering off to 0 at the speaker cone radius.
    float coneFalloff = smoothstep(uSpeakerConeRadius, 0.0, dist);
    
    // Push particles outward along their direction vector based on the audio mid frequency.
    pos += dir * (coneFalloff * uMid * uAudioMidGlow * 3.0);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Particle Size calculation
    // Base size + optional bass bump
    gl_PointSize = uParticleSize * (1.0 + uMid * uAudioMidGlow) * (1.0 + uBass * uBassSizeBump) * (10.0 / -mvPosition.z);
    
    // Alpha calculation
    vAlpha = mix(0.1, 0.9, uStructure) + (uBass * 0.5);
}
`;

export const particleFragmentShader = `
varying float vAlpha;

void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if (ll > 0.5) discard;
    
    // Back to your exact fragment shader (pure white dots)
    // "gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, ll) * vAlpha * 0.8);"
    gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, ll) * vAlpha * 0.8);
}
`;
