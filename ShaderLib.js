var ShaderLib = {
vertexShader : `
precision highp float;
precision highp int;

attribute vec2 uv2;

varying vec2 vUv2;
varying vec4 vPosition;
varying vec3 vNormal;

void main(){
	vUv2 = uv2;
	vPosition = modelMatrix * vec4(position, 1.);
	vNormal = (modelMatrix * vec4(normal, 0.)).xyz;
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
varying vec4 vPosition;
varying	vec3 vNormal;


struct Ray { vec3 origin; vec3 direction; };
struct PointLight { vec3 position; vec3 color; float distance; };

struct Triangle{ vec3 pos1; vec3 pos2; vec3 pos3; vec3 nor; vec2 uv21; vec2 uv22; vec2 uv23;};

uniform Triangle tris[10];
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
    for( int i = 0; i < 10; i++ )
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

	vec3 lightDirection = light.position - vPosition.xyz;
    float ldp = dot( lightDirection, vNormal);

    vec3 color = vec3(0.);
    if(ldp > 0.)
    {
    	float rt = castRay(vPosition.xyz, lightDirection);
    	float dis = distance(light.position, vPosition.xyz);
    	if(rt > dis)
    	{
    		//it's not been blocked
    		
    		float weight = punctualLightIntensityToIrradianceFactor(dis, light.distance, 2.);
    		
    		color = light.color * weight;
    	}
    }

    gl_FragColor = vec4(color, 1.);
}
`,

positionOutputShader : `

varying vec2 vUv2;
varying vec4 vPosition;

void main(){
	gl_FragColor = vec4(((vPosition + 2.) / 2.).xyz, 0.);
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
	// gl_FragColor = vec4(gl_FragCoord.x / 512., gl_FragCoord.y / 512., 0., 1.);
}
`,
}