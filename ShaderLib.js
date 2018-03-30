var ShaderLib = {
vertexShader : `

attribute vec2 uv2;

varying vec2 vUv2;
varying vec3 vPosition;
varying vec3 vNormal;

float pow2( const in float x ) { return x*x; }

mat3 inverse(mat3 m) {
  float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2];
  float a10 = m[1][0], a11 = m[1][1], a12 = m[1][2];
  float a20 = m[2][0], a21 = m[2][1], a22 = m[2][2];

  float b01 = a22 * a11 - a12 * a21;
  float b11 = -a22 * a10 + a12 * a20;
  float b21 = a21 * a10 - a11 * a20;

  float det = a00 * b01 + a01 * b11 + a02 * b21;

  return mat3(b01, (-a22 * a01 + a02 * a21), (a12 * a01 - a02 * a11),
              b11, (a22 * a00 - a02 * a20), (-a12 * a00 + a02 * a10),
              b21, (-a21 * a00 + a01 * a20), (a11 * a00 - a01 * a10)) / det;
}

mat4 inverse(mat4 m) {
  float
      a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
      a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
      a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
      a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  return mat4(
      a11 * b11 - a12 * b10 + a13 * b09,
      a02 * b10 - a01 * b11 - a03 * b09,
      a31 * b05 - a32 * b04 + a33 * b03,
      a22 * b04 - a21 * b05 - a23 * b03,
      a12 * b08 - a10 * b11 - a13 * b07,
      a00 * b11 - a02 * b08 + a03 * b07,
      a32 * b02 - a30 * b05 - a33 * b01,
      a20 * b05 - a22 * b02 + a23 * b01,
      a10 * b10 - a11 * b08 + a13 * b06,
      a01 * b08 - a00 * b10 - a03 * b06,
      a30 * b04 - a31 * b02 + a33 * b00,
      a21 * b02 - a20 * b04 - a23 * b00,
      a11 * b07 - a10 * b09 - a12 * b06,
      a00 * b09 - a01 * b07 + a02 * b06,
      a31 * b01 - a30 * b03 - a32 * b00,
      a20 * b03 - a21 * b01 + a22 * b00) / det;
}

mat3 transpose(mat3 m) {
  return mat3(m[0][0], m[1][0], m[2][0],
              m[0][1], m[1][1], m[2][1],
              m[0][2], m[1][2], m[2][2]);
}

mat4 transpose(mat4 m) {
  return mat4(m[0][0], m[1][0], m[2][0], m[3][0],
              m[0][1], m[1][1], m[2][1], m[3][1],
              m[0][2], m[1][2], m[2][2], m[3][2],
              m[0][3], m[1][3], m[2][3], m[3][3]);
}

mat3 getNormalMatrix(mat4 m){
	return mat3(
		m[0][0], m[1][0], m[2][0],
		m[0][1], m[1][1], m[2][1],
		m[0][2], m[1][2], m[2][2]
	);
}

void main(){
	vUv2 = uv2;
	vPosition = (modelMatrix * vec4(position, 1.)).xyz;
	// vNormal = transpose(inverse(getNormalMatrix(modelMatrix))) * normal;
	vNormal =  normalMatrix * normal;
	vec2 pos = uv2 * 2. - 1.;
	gl_Position = vec4(pos, 0., 1.);
}	
`,

lightMapFragmentShader1 : `

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
        if( TriangleIntersect( ro, rd, tris[i], rti ) && rti < rt && rti > 0. )
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
    	float rt = castRay(vPosition, lightDirection);
    	float dis = distance(light.position, vPosition);
    	if(rt >  dis)
    	{
    		//it's not been blocked
    		
    		float weight = punctualLightIntensityToIrradianceFactor(dis , light.distance, 1.);
    		
    		color = light.color * weight;
    		// color = light.color;
    		// color = vec3(1.,1.,0.);
    	}
    }

    gl_FragColor = vec4(color, 1.);
}
`,
lightMapFragmentShader2 : `

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
// uniform sampler2D buffer;
uniform sampler2D lightBuffer;


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
        if( TriangleIntersect( ro, rd, tris[i], rti ) && rti < rt && rti > 0. )
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

	if(dt < DIST_MAX && dot( n, direction ) < 0.){
		// vec4 nc;
		// vec4 oc = texture2D(buffer , vUv2);
		// if(dt < oc.w * DIST_MAX){
			color = texture2D(lightBuffer, uv2) * .01;
			
			
		// }else{
		// 	color = oc;
		// }
	}

	gl_FragColor = vec4(color.xyz, 1.);
}

`,
positionOutputShader : `

varying vec2 vUv2;
varying vec4 vPosition;

void main(){
	gl_FragColor = vec4(((vPosition + 2.) / 2.).xyz, 0.);
}
`,
merageFragmentShader : `

uniform sampler2D buffer1;
uniform sampler2D buffer2;
uniform int frame;

varying vec2 vUv;

void main(){
	vec4 oc = texture2D(buffer1 , vUv);
	vec4 nc = texture2D(buffer2 , vUv);

	// gl_FragColor = mix(oc , nc , vec4(1/frame));

	gl_FragColor = oc + nc;

	// if(gl_FragCoord.x > 10){
	// 	gl_FragColor = vec4(0.);
	// }else{
	// 	gl_FragColor = vec4(1.);
	// }
	
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