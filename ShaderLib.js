var ShaderLib = {
vertexShader : `

attribute vec2 uv2;

varying vec2 vUv2;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;


void main(){
	vUv2 = uv2;
	vPosition = (modelMatrix * vec4(position, 1.)).xyz;
	vNormal =  normalMatrix * normal;
	vUv = uv;
	vec2 pos = uv2 * 2. - 1.;
	gl_Position = vec4(pos, 0., 1.);
}	
`,

pointLightDirectLightingFragmentShader : `

precision highp float;
precision highp int;
precision highp sampler2D;


const float DIST_MAX = 1000.;

varying vec2 vUv2;
varying vec3 vPosition;
varying	vec3 vNormal;


struct Ray { vec3 origin; vec3 direction; };
struct PointLight { vec3 position; vec3 color; float distance; };

struct Triangle{ vec3 pos1; vec3 pos2; vec3 pos3; vec3 nor; vec2 uv21; vec2 uv22; vec2 uv23;};

uniform Triangle tris[20];
uniform PointLight light;
uniform sampler2D buffer;


bool TriangleIntersect(vec3 ro, vec3 rd, Triangle tri, out float rt ){
	vec3 edge1 = tri.pos2 - tri.pos1;
	vec3 edge2 = tri.pos3 - tri.pos1;
	vec3 tvec = ro - tri.pos1;
	vec3 pvec = cross(rd, edge2);
	float det = 1.0 / dot(edge1, pvec);
	float u = dot(tvec, pvec) * det;

	rt = DIST_MAX;

	if (u < 0.0 || u > 1.0)
		return false;

	vec3 qvec = cross(tvec, edge1);

	float v = dot(rd, qvec) * det;

	if (v < 0.0 || u + v > 1.0)
		return false;

	rt = dot(edge2, qvec) * det;
	return true;
}


float castRay(vec3 ro, vec3 rd){
	float rt = DIST_MAX;
    for( int i = 0; i < 20; i++ )
    {
    	float rti;
        if( TriangleIntersect( ro, rd, tris[i], rti ) && rti < rt && rti > 0.01 )
        {   
        	//rti must greater then 0, 
            rt = rti;
        }

    }

    return rt;
}


float pow2( const in float x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }

float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	if( decayExponent > 0.0 ) {

		float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
		float maxDistanceCutoffFactor = pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
		return distanceFalloff * maxDistanceCutoffFactor;

	}

	return 1.0;

}

void main(){
	vec3 lightDirection = light.position - vPosition;
	float ldp = dot( lightDirection, vNormal);
	vec3 color = vec3(0.);

	if(ldp > 0.)
	{
	    vec4 occ = texture2D( buffer, vUv2);
	    if(occ.w < 0.1 || (occ.w > 0. && (occ.x + occ.y + occ.z) > 0. ))
	    {
		
	    	float rt = castRay(vPosition, lightDirection);
	    	float dis = distance(light.position, vPosition);
	    	if(rt > 1.)
	    	{
	    		float weight = punctualLightIntensityToIrradianceFactor(dis / 1.5, light.distance, 2.);
	    		color = light.color * weight;		
	    	}else{
	    		color = vec3(0.);
	    	}
	    }
	}

    gl_FragColor = vec4(color, 1.);
}
`,
indirectLightingFragmentShader : `

precision highp float;
precision highp int;
precision highp sampler2D;


const float DIST_MAX = 1000.;
struct Triangle{ vec3 pos1; vec3 pos2; vec3 pos3; vec3 nor; vec2 uv21; vec2 uv22; vec2 uv23;};


varying vec2 vUv2;
varying vec3 vPosition;
varying	vec3 vNormal;

uniform int frame;
uniform vec2 resolution;
uniform Triangle tris[20];
uniform sampler2D lightBuffer;
uniform sampler2D indirectLightingBuffer;
uniform sampler2D diffuseBuffer;


float seed, seed2;

float rnd() { return fract(sin(seed++)*43758.5453123); }

vec2 hash2() {
    return fract(sin(vec2(seed2+=0.1,seed2+=0.1))*vec2(43758.5453123,22578.1459123));
}

vec3 cosWeightedRandomHemisphereDirection( const vec3 n ) {
  	vec2 r = hash2();
    
	vec3  uu = normalize( cross( n, vec3(0.0,1.0,1.0) ) );
	vec3  vv = cross( uu, n );
	
	float ra = sqrt(r.y);
	float rx = ra*cos(6.2831*r.x); 
	float ry = ra*sin(6.2831*r.x);
	float rz = sqrt( 1.0-r.y );
	vec3  rr = vec3( rx*uu + ry*vv + rz*n );
    
    return normalize( rr );
}


bool TriangleIntersect(vec3 ro, vec3 rd, Triangle tri, out float rt ){
	vec3 edge1 = tri.pos2 - tri.pos1;
	vec3 edge2 = tri.pos3 - tri.pos1;
	vec3 tvec = ro - tri.pos1;
	vec3 pvec = cross(rd, edge2);
	float det = 1.0 / dot(edge1, pvec);
	float u = dot(tvec, pvec) * det;

	rt = DIST_MAX;

	if (u < 0.0 || u > 1.0)
		return false;

	vec3 qvec = cross(tvec, edge1);

	float v = dot(rd, qvec) * det;

	if (v < 0.0 || u + v > 1.0)
		return false;

	rt = dot(edge2, qvec) * det;
	return true;
}


float castRay(vec3 ro, vec3 rd, out vec2 uv2, out vec3 normal){
	float rt = DIST_MAX;
    for( int i = 0; i < 20; i++ )
    {
    	float rti;
        if( TriangleIntersect( ro, rd, tris[i], rti ) && rti < rt && rti > 0.01 )
        {   
        	//rti must greater then 0, 
        	vec3 hitPos = ro + rd * rti;

        	float d0 = distance(hitPos, tris[i].pos1);
            float d1 = distance(hitPos, tris[i].pos2);
            float d2 = distance(hitPos, tris[i].pos2);

            float sum = d0 + d1 + d2;
            float coef0 = d0 / sum;
            float coef1 = d1 / sum;
            float coef2 = d2 / sum;

            uv2 = coef0 * tris[i].uv21 + coef1 * tris[i].uv22 + coef2 * tris[i].uv23;
            normal = tris[i].nor;

            rt = rti;
        }

    }

    return rt;
}

float pow2( const in float x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }

float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	if( decayExponent > 0.0 ) {

		float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
		float maxDistanceCutoffFactor = pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
		return distanceFalloff * maxDistanceCutoffFactor;

	}

	return 1.0;

}

void main(){

    seed = 1.19364353*(gl_FragCoord.x + 40.589*gl_FragCoord.y) + float(frame)/60.*12.37929;

    vec2 p = -1.0 + 2.0 * (gl_FragCoord.xy) / resolution.xy;
    p.x *= resolution.x/resolution.y;
    seed2 = p.x + p.y * 3.43121412313 + fract(1.12345314312*float(frame));

	vec3 direction = cosWeightedRandomHemisphereDirection(vNormal);

	vec4 color = vec4(0.);

	vec2 uv2;vec3 n;

	float dt = castRay(vPosition, direction, uv2, n);

	vec4 oc = texture2D(indirectLightingBuffer , vUv2);

	if(dot( n, direction ) < 0.){
		
		color = vec4((texture2D(lightBuffer, uv2) * texture2D(diffuseBuffer , uv2 ) / (30. + pow2(dt)) ).xyz, dt / DIST_MAX);
		
	}else{
		color = oc;
	}

	gl_FragColor = color;
	// gl_FragColor = texture2D(diffuseBuffer, vUv2);
}

`,
positionOutputShader : `

varying vec2 vUv2;
varying vec4 vPosition;

void main(){
	gl_FragColor = vec4(((vPosition + 2.) / 2.).xyz, 0.);
}
`,
diffuseOutputShader : `

#ifdef USE_COLOR

uniform vec3 uColor;

#endif

#ifdef USE_MAP

varying uv2 vUv;
uniform sampler2D diffuseMap;

#endif

void main(){

	#ifdef USE_COLOR

		gl_FragColor = vec4(uColor, 1.);

	#endif

	#ifdef USE_MAP
		gl_FragColor = texture2D(diffuseMap, vUv);
	#endif
}

`,
PBROutputShader : `

varying uv2 vUv;

#ifdef USE_METALNESS

uniform float uMetalness;

#endif

#ifdef USE_METALNESS_MAP

uniform sampler2D metalnessMap;

#endif

#ifdef USE_ROUGHNESS

uniform float uRoughness;

#endif

#ifdef USE_ROUGHNESS_MAP

uniform sampler2D roughnessMap;

#endif


#ifdef USE_OPACITY

uniform float uOpacity;

#endif

#ifdef USE_ALPHA_MAP

uniform sampler2D alphaMap;

#endif

void main(){

	float metalness = 0.5;
	float roughness = 0.5;
	float opacity = 1.;

	#ifdef USE_METALNESS

		metalness = uMetalness;

	#endif

	#ifdef USE_METALNESS_MAP

		metalness *= texture2D(metalnessMap, vUv);

	#endif

	#ifdef USE_ROUGHNESS

		roughness = uRoughness;

	#endif

	#ifdef USE_ROUGHNESS_MAP

		roughness *= texture2D(roughnessMap, vUv);

	#endif

	#ifdef USE_OPACITY

		opacity = uOpacity;

	#endif

	#ifdef USE_ALPHA_MAP

		opacity = texture2D(alphaMap, vUv);

	#endif

	gl_FragColor = vec4(metalness, roughness, opacity , 1.);
}

`,
merageFragmentShader : `

uniform sampler2D buffer1;
uniform sampler2D buffer2;

varying vec2 vUv;

void main(){
	vec4 oc = texture2D(buffer1 , vUv);
	vec4 nc = texture2D(buffer2 , vUv);

	gl_FragColor = oc + nc;

	
}

`,
denoiseFragmentShader : `
uniform sampler2D buffer;
uniform vec2 resolution;

varying vec2 vUv;

void main(){

	float coordX = resolution.x * vUv.x;
	float coordY = resolution.y * vUv.y;



	vec4 color = texture2D(buffer, vUv);

	vec4 color1 = texture2D(buffer, vec2((coordX - 1.)/resolution.x , (coordY + 1.)/resolution.y));
	vec4 color2 = texture2D(buffer, vec2(vUv.x , (coordY + 1.)/resolution.y));
	vec4 color3 = texture2D(buffer, vec2((coordX + 1.)/resolution.x , (coordY + 1.)/resolution.y));

	vec4 color4 = texture2D(buffer, vec2((coordX - 1.)/resolution.x , vUv.y));
	//color5 is color
	vec4 color6 = texture2D(buffer, vec2((coordX + 1.)/resolution.x , vUv.y));

	vec4 color7 = texture2D(buffer, vec2((coordX - 1.)/resolution.x , (coordY - 1.)/resolution.y));
	vec4 color8 = texture2D(buffer, vec2(vUv.x , (coordY - 1.)/resolution.y));
	vec4 color9 = texture2D(buffer, vec2((coordX + 1.)/resolution.x , (coordY - 1.)/resolution.y));


	// color = color1 + color2 * 2. + color3 + color4 *2. + color * 4. + color6 * 2. + color7 + color8 * 2. + color9;

	color = color1 + color2 * 2. + color3 + color4 *2. + color * 2. + color6 * 2. + color7 + color8 * 2. + color9;
	color /= 14.;

	gl_FragColor = vec4(color.xyz, 1.);

}
`,
debugVertexShader : `
varying vec2 vUv;

void main(){
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}

`,

debugFragmentShader : `
varying vec2 vUv;

uniform sampler2D buffer;

void main(){
	gl_FragColor = texture2D(buffer , vUv);
}
`,
}