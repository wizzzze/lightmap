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
struct PointLight { vec3 position; vec3 color; float distance; float decay; };

struct Triangle{ vec3 pos1; vec3 pos2; vec3 pos3; vec3 nor; vec2 uv21; vec2 uv22; vec2 uv23; };

uniform Triangle tris[20];
uniform PointLight light;
uniform sampler2D buffer;

#ifdef USE_NORMAL_MAP
	
	varying vec2 vUv;
	uniform sampler2D normalMap;
	
#endif

const float adapted_lum = 0.8;

vec3 ACESToneMapping(vec3 color)
{
	const float A = 2.51;
	const float B = 0.03;
	const float C = 2.43;
	const float D = 0.59;
	const float E = 0.14;

	color *= adapted_lum;
	return (color * (A * color + B)) / (color * (C * color + D) + E);
}

bool TriangleIntersect(vec3 ro, vec3 rd, Triangle tri, out float rt ){
	rt = DIST_MAX;

	vec3 edge1 = tri.pos2 - tri.pos1;
	vec3 edge2 = tri.pos3 - tri.pos1;
	vec3 tvec = ro - tri.pos1;
	vec3 pvec = cross(rd, edge2);
	float det = 1.0 / dot(edge1, pvec);
	float u = dot(tvec, pvec) * det;

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
        if( TriangleIntersect( ro, rd, tris[i], rti ) && rti < rt && rti > 0.001 )
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

	vec3 nor = vNormal;

	#ifdef USE_NORMAL_MAP
		nor = texture2D(normalMap, vUv);
		nor = normalMatrix * nor;

	#endif

	float ldp = dot( lightDirection, nor);
	vec3 color = vec3(0.);
	float rt = DIST_MAX;
	if(ldp > 0.)
	{
	    vec4 occ = texture2D( buffer, vUv2);
	    if(occ.w == 0. || (occ.w > 0. && (occ.x + occ.y + occ.z) > 0. ))
	    {
		
	    	rt = castRay(vPosition, lightDirection);
	    	float dis = distance(light.position, vPosition);
	    	if(rt > 1.)
	    	{
	    		// float weight = punctualLightIntensityToIrradianceFactor(dis, light.distance, light.decay);
	    		float cos_a_max = sqrt(1. - clamp( 4. / pow2(dis), 0., 1.));
            	float weight = 2. * (1. - cos_a_max);
            	// color = light.color * weight;
	    		color = ACESToneMapping(light.color * weight);
	    		// color = light.color * weight * ( sqrt( ldp / (length(lightDirection) * length(nor))) );
	    	}else{
	    		color = vec3(0.);
	    	}
	    }
	}
	// gl_FragColor = texture2D(buffer, vUv2);
    gl_FragColor = vec4(color, rt / DIST_MAX);
}
`,


directionalLightDirectLightingFragmentShader : `

precision highp float;
precision highp int;
precision highp sampler2D;


const float DIST_MAX = 1000.;

varying vec2 vUv2;
varying vec3 vPosition;
varying	vec3 vNormal;


struct Ray { vec3 origin; vec3 direction; };
struct DirectionalLight { vec3 position; vec3 direction; vec3 color; };

struct Triangle{ vec3 pos1; vec3 pos2; vec3 pos3; vec3 nor; vec2 uv21; vec2 uv22; vec2 uv23; };

uniform Triangle tris[20];
uniform DirectionalLight light;
uniform sampler2D buffer;

#ifdef USE_NORMAL_MAP
	
	varying vec2 vUv;
	uniform sampler2D normalMap;
	
#endif

bool TriangleIntersect(vec3 ro, vec3 rd, Triangle tri, out float rt ){
	rt = DIST_MAX;

	vec3 edge1 = tri.pos2 - tri.pos1;
	vec3 edge2 = tri.pos3 - tri.pos1;
	vec3 tvec = ro - tri.pos1;
	vec3 pvec = cross(rd, edge2);
	float det = 1.0 / dot(edge1, pvec);
	float u = dot(tvec, pvec) * det;

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
        if( TriangleIntersect( ro, rd, tris[i], rti ) && rti < rt && rti > 0.001 )
        {   
        	//rti must greater then 0, 
            rt = rti;
        }

    }

    return rt;
}

void main(){
	vec3 lightDirection = light.direction;

	vec3 nor = vNormal;

	#ifdef USE_NORMAL_MAP
		nor = texture2D(normalMap, vUv);
		nor = normalMatrix * nor;

	#endif

	float ldp = dot( lightDirection, nor);
	vec3 color = vec3(0.);
	float rt = DIST_MAX;
	if(ldp > 0.)
	{
	    vec4 occ = texture2D( buffer, vUv2 );
	    if(occ.w == 0. ||  (occ.w > 0. && (occ.x + occ.y + occ.z) > 0. ))
	    {
	    	rt = castRay(vPosition, lightDirection);
	    	if(rt == DIST_MAX)
	    	{
	    		color = light.color * ldp /length(nor);
	    	}else{
	    		color = vec3(0.);
	    	}
	    }
	}

    gl_FragColor = vec4(color, rt / DIST_MAX);
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
uniform int sampleRays;


float seed, seed2;

float rnd() { return fract(sin(seed++)*43758.5453123); }

vec2 hash2() {
    return fract(sin(vec2(seed2+=0.1,seed2+=0.1))*vec2(43758.5453123,22578.1459123));
}

const float adapted_lum = 1.;

vec3 ACESToneMapping(vec3 color)
{
	const float A = 2.51;
	const float B = 0.03;
	const float C = 2.43;
	const float D = 0.59;
	const float E = 0.14;

	color *= adapted_lum;
	return (color * (A * color + B)) / (color * (C * color + D) + E);
}


vec3 cosWeightedRandomHemisphereDirection( const vec3 n ) {
  	vec2 r = hash2();
    
	vec3  uu = normalize( cross( n, vec3(0.0,1.0,1.0) ) );
	vec3  vv = cross( uu, n );
	
	float ra = sqrt(r.y);
	float rx = ra*cos(25.1327412287*r.x); 
	float ry = ra*sin(25.1327412287*r.x);
	float rz = sqrt( 1.0-r.y );
	vec3  rr = vec3( rx*uu + ry*vv + rz*n );
    
    return normalize( rr );
}


bool TriangleIntersect(vec3 ro, vec3 rd, Triangle tri, out float rt ){
	rt = DIST_MAX;
	
	vec3 edge1 = tri.pos2 - tri.pos1;
	vec3 edge2 = tri.pos3 - tri.pos1;
	vec3 tvec = ro - tri.pos1;
	vec3 pvec = cross(rd, edge2);
	float det = 1.0 / dot(edge1, pvec);
	float u = dot(tvec, pvec) * det;


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


void main(){

    seed = 1.19364353*(gl_FragCoord.x + 40.589*gl_FragCoord.y) + float(frame)/60.*12.37929;

    vec2 p = -1.0 + 2.0 * (gl_FragCoord.xy) / resolution.xy;
    p.x *= resolution.x/resolution.y;
    seed2 = p.x + p.y * 3.43121412313 + fract(1.12345314312*float(frame)) * 9.827;

	vec3 direction = cosWeightedRandomHemisphereDirection(vNormal);

	vec4 color = vec4(0.);

	vec2 uv2;vec3 n;

	float dt = castRay(vPosition, direction, uv2, n);

	vec4 oc = texture2D(indirectLightingBuffer , vUv2);


	if(dot( n, direction ) < 0.){

		// vec3 addColor = ACESToneMapping((texture2D(lightBuffer, uv2) * texture2D(diffuseBuffer , uv2 ) / float(sampleRays) ).xyz);
		// color = vec4(addColor, dt / DIST_MAX );
		color = vec4((texture2D(lightBuffer, uv2) * texture2D(diffuseBuffer , uv2 ) ).xyz, dt / DIST_MAX) / float(sampleRays);
		// color = vec4((texture2D(lightBuffer, uv2) * texture2D(diffuseBuffer , uv2 ) * 0.127323954618 * 2.71828182845904 ).xyz, dt / DIST_MAX) / float(sampleRays);
		
	}else{
		color = oc;
	}

	
	gl_FragColor = color ;
}

`,
indexOutputShader : `
uniform int index;

void main(){
	vec4 indexColor = vec4(0.);
	if(index > 100){
		indexColor.x = 1.;
		if(index > 200){
			indexColor.y = 1.;
			indexColor.z = float(index - 200) / 100.;
		}else{
			indexColor.y = float(index - 100)/ 100.;
		}
	}else{
		indexColor.x = float(index)/100.;
	}

	gl_FragColor = indexColor;

}
`,
positionOutputShader : `

varying vec2 vUv2;
varying vec3 vPosition;

const float DIST_MAX = 5.;

void main(){
	gl_FragColor = vec4(((vPosition + DIST_MAX) /( DIST_MAX * 2.) ), 1.);
}
`,
diffuseOutputShader : `

#ifdef USE_COLOR

uniform vec3 uColor;

#endif

#ifdef USE_MAP

varying vec2 vUv;
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
MRAAOutputShader : `

varying vec2 vUv;

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

#ifdef USE_AO_MAP

uniform sampler2D aoMap;

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
	float ao = 1.;
	float opacity = 1.;

	#ifdef USE_METALNESS

		metalness = uMetalness;

	#endif

	#ifdef USE_METALNESS_MAP

		metalness *= texture2D(metalnessMap, vUv).x;

	#endif

	#ifdef USE_ROUGHNESS

		roughness = uRoughness;

	#endif

	#ifdef USE_ROUGHNESS_MAP

		roughness *= texture2D(roughnessMap, vUv).x;

	#endif

	#ifdef USE_AO_MAP

		ao = texture2D(aoMap, vUv).x;

	#endif



	#ifdef USE_OPACITY

		opacity = uOpacity;

	#endif

	#ifdef USE_ALPHA_MAP

		opacity = texture2D(alphaMap, vUv);

	#endif

	gl_FragColor = vec4(metalness, roughness, ao , opacity);
	// gl_FragColor = vec4(1.);
}

`,
merageFragmentShader : `

uniform sampler2D buffer1;
uniform sampler2D buffer2;

varying vec2 vUv;

void main(){
	vec4 oc = texture2D(buffer1 , vUv);
	vec4 nc = texture2D(buffer2 , vUv);

	gl_FragColor = vec4(( oc + nc ).xyz, 1.);

	
}

`,

merageFragmentShader2 : `

uniform sampler2D buffer1;
uniform sampler2D buffer2;
uniform int frame

varying vec2 vUv;

void main(){
	vec4 oc = texture2D(buffer1 , vUv);
	vec4 nc = texture2D(buffer2 , vUv);

	// gl_FragColor = vec4(( oc + nc ).xyz, 1.);
	gl_FragCoord = smoothstep(oc , nc , 1. / float(frame));

	
}

`,
blurFragmentShader : `
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
	
	vec4 color6 = texture2D(buffer, vec2((coordX + 1.)/resolution.x , vUv.y));

	vec4 color7 = texture2D(buffer, vec2((coordX - 1.)/resolution.x , (coordY - 1.)/resolution.y));
	vec4 color8 = texture2D(buffer, vec2(vUv.x , (coordY - 1.)/resolution.y));
	vec4 color9 = texture2D(buffer, vec2((coordX + 1.)/resolution.x , (coordY - 1.)/resolution.y));


	color = color1 * 2. + color2 * 3. + color3 * 2. + color4 * 3. + color * 3. + color6 * 3. + color7 * 2. + color8 * 3. + color9 * 2.;
	color /= 24.;

	gl_FragColor = vec4(color.xyz, 1.);

}
`,
denoise2FragmentShader : `
uniform sampler2D buffer;
uniform sampler2D positionBuffer;
uniform sampler2D indexBuffer;
uniform vec2 resolution;

#define RAIDUS 16


varying vec2 vUv;


#define STDEV 6.5

float gaussian(float r, float c) {
    return exp(-r*c/(STDEV*STDEV));
}

void getColor(in float ci,in vec2 coord, in float i, out vec3 color, out float weight){
	vec3 addColor = vec3(0.);
	float totalWeight = 0.00001;
	for(float n = -12.; n <= 12.; n += 1.){
		vec2 uv = vec2(coord.x + float(n), coord.y)/resolution;
		// if((abs(n) + abs(i)) > 10.) continue;
		if(coord.x + n > resolution.x || coord.x + n < 0. || coord.y > resolution.y || coord.y < 0.){
			continue;
		}else{
			vec4 index = texture2D(indexBuffer, uv);
			float ni = (index.x + index.y + index.z) * 100.;
			if(ni < ci + 0.1 && ni > ci - 0.1){
				vec4 colori = texture2D(buffer, uv);
				if(colori.x + colori.y + colori.z > 0.){
					totalWeight += gaussian(i, n);
				}
				addColor += colori.xyz;
			}
		}
	}	
	weight = totalWeight;
	color = addColor;
}

void main(){

	float coordX = gl_FragCoord.x;
	float coordY = gl_FragCoord.y;
	
	float weight = 0.;
	vec3 color = vec3(0.);

	vec4 index = texture2D(indexBuffer, vUv);
	float ci = (index.x + index.y + index.z) * 100.;
	if(ci > 0.){

		for(float i = -12.; i <= 12.; i+=1.){
			vec3 addColor;
			float addWeight;
			getColor(ci, vec2(coordX, coordY + i), i, addColor, addWeight);
			weight += addWeight;
			color += addColor;
		}
		color /= weight;
		gl_FragColor = vec4(color.xyz , 1.);
	}else{
		gl_FragColor = vec4(0.);
	}

}
`,
denoiseFragmentShader : `

uniform sampler2D readBuffer;
uniform sampler2D noiseBuffer;
uniform sampler2D positionBuffer;

uniform float radius;
uniform float strength;
uniform vec2 step;
uniform vec2 resolution;
uniform int frame;


#define STDEV 6.5
#define RADIUS 12.0

float gaussian(float x) {
    return exp(-x*x/(STDEV*STDEV));

}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 offset = step.xy / resolution.xy;
    
    vec4 sum = vec4(0.0);
    vec4 denom = vec4(0.0);
   
    vec4 position = texture2D(positionBuffer, uv);
    if(position.x == 0. && position.y == 0. && position.z == 0. && position.w == 1.){
    	gl_FragColor = texture2D(noiseBuffer, uv);
    	// gl_FragColor = vec4(0.);
    }else{

	    for (float i = -RADIUS; i <= RADIUS; i += 1.0) {
	    	if(i != 0.){
		    	vec4 offsetPosition = texture2D(positionBuffer, uv + i * offset);

		        if(offsetPosition.x == 0. && offsetPosition.y == 0. && offsetPosition.z == 0.){

		        }else{
		        	vec4 noiseColor = texture2D(noiseBuffer, uv + i * offset);
		        	float g = gaussian(i);
		        	if(noiseColor.x < 0.01 && noiseColor.y < 0.01 && noiseColor.z < 0.01){
		        		g /= 10.;		
		        	}
		        	sum += g * noiseColor;
		        	denom += g;
		        	
		        }
	        }	        
	    }

	    sum /= denom;
	    
	    vec4 oc = texture2D(readBuffer, uv);

	    gl_FragColor = mix(oc, sum, 1./(1.+float(frame)));
    }
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

expand : `

varying vec2 vUv;
uniform sampler2D indexBuffer;
uniform sampler2D buffer;


vec3 getColor(float i, vec2 uv){
	vec3 color = vec3(0.);
	float weight = 0.1;
	for(float i = -2.; i < 3.; i += 1.){
		vec3 c = texture2D(buffer, vec2(uv.x , uv.y + i)).xyz;
		if(c.x + c.y + c.z > 0.){
			weight += 1.;
		}
	}

	return color / weight;
}

void main(){
	vec4 ib = texture2D(indexBuffer, vUv);
	float index = (ib.x + ib.y + ib.z) * 100.;
	if(ib.x == ib.z){
		gl_FragColor = texture2D(buffer, vUv);
		
	}else{
		vec3 color = vec3(0.);
		for(float i = -2.; i < 3.; i += 1.){
			color += getColor(i, vec2(vUv.x + i, vUv.y));
		}
		color /= 3.;
		gl_FragColor = vec4(color, 1.);
	}
	// gl_FragColor = texture2D(buffer, vUv);
}

`,
}