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

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uAudioTrebleScatter;
uniform float uAudioBassScale;
uniform float uAudioMidGlow;
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

    // 2. Audio Bass scales the base structural target outward organically
    targetPos *= 1.0 + (uBass * uAudioBassScale * 0.8);

    // 3. Audio Mid adds a slight breathing scale to the target
    targetPos *= 1.0 + (uMid * uAudioMidGlow * 0.2);

    // 4. Audio Treble expands the edges using the noise vector, maintaining the overall structure
    targetPos += noiseVec * (uTreble * uAudioTrebleScatter * 0.3);

    // 5. Apply Spatial Twist & Flow to Target
    float flowAngle = targetPos.y * uTwistAmount + (uTime * uFlowSpeed);
    float s = sin(flowAngle); float c = cos(flowAngle);
    targetPos.xz = mat2(c, -s, s, c) * targetPos.xz;

    // 6. Spring Force (Pull back to Target gently for a fluid feel)
    // Decreased multiplier so it floats back softly instead of snapping
    vec3 springForce = (targetPos - pos) * (0.005 * uStructure);

    // 7. Ambient structural noise (wind) when structure is low
    float noiseAmplitude = (1.0 - uStructure) * 0.2;
    vec3 ambientWind = noiseVec * noiseAmplitude;
    
    // 8. Mouse Interaction Forces
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

    // 9. Accumulate Forces
    vel += springForce;
    vel += ambientWind;
    vel += mouseForceVec; 

    // 10. Friction / Damping (High drag for syrup/fluid momentum)
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
uniform float uAudioMidGlow;
uniform float uStructure;
varying float vAlpha;

void main() {
    vec3 pos = texture2D(uFboPos, uv).xyz;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uParticleSize * (1.0 + uMid * uAudioMidGlow) * (10.0 / -mvPosition.z);
    
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
