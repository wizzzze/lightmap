var LightMapRenderer = function(scene, renderer){
	this.scene = scene.clone();
	this.originalScene = scene;
	this.renderer = new THREE.WebGLRenderer();

	this.renderer.setSize(512 ,512);
	this.renderer.domElement.style.position = "absolute";
	this.renderer.domElement.style.bottom = "0";
	this.renderer.setClearColor(new THREE.Color(0,0,0), 1);
	document.body.appendChild(this.renderer.domElement);

	this.viewScene = new THREE.Scene();
	this.viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	this.viewCamera.position.set( 0, 0, 1 );

	var quad = new THREE.PlaneBufferGeometry( 2 , 2 );
	this.material = new THREE.ShaderMaterial({
		uniforms : {
			buffer : { value : null },
		},
		vertexShader : ShaderLib.debugVertexShader,
		fragmentShader : ShaderLib.debugFragmentShader
	});

	this.viewQuad = new THREE.Mesh(quad, this.material);
	this.viewScene.add(this.viewQuad);
}


LightMapRenderer.prototype = {

	genUV2 : function(){
		var child, geometry, x, y, offsetX, offsetY;
		var defaultWidth = defaultHeight = 170;
		var c = 0, padding = 2;
		var u, v, u2, v2, uv, uv2;
		for(var i = 0, l = this.scene.children.length; i < l; i ++ ){
			child = this.scene.children[i];
			if(child.isMesh){
				geometry = child.geometry;
				x = c % 3;
				y = Math.floor( c / 3 );
				uv = geometry.attributes.uv.array;
				uv2 = [];
				for(var n = 0 , m = uv.length; n < m; n++){
					u = uv[n];
					v = uv[++n];
					u2 = ((u * ( defaultWidth - 4 )) + ( x * defaultWidth ) + 2 )/512;
					v2 = ((v * ( defaultHeight - 4 )) + ( y * defaultHeight ) + 2 )/512;
					uv2.push(u2, v2);
				}

				geometry.addAttribute('uv2', new THREE.Float32BufferAttribute(uv2, 2));
				this.originalScene.children[i].geometry.addAttribute('uv2', new THREE.Float32BufferAttribute(uv2, 2));
				c += 1;
			}	
		}
	},

	genTriangleUniform : function(){
		var uniforms = [];
		for(var i = 0, l = this.scene.children.length; i < l ; i ++){
			child = this.scene.children[i];
			if(child.isMesh){

				var meshUniforms = this.genMeshUniforms(child);
				uniforms = uniforms.concat(meshUniforms);
				
			}else if(child.isPointLight){
				this.light = child;
			}
		}

		return uniforms;
	},
	genMeshUniforms : function(mesh){
		var child, geometry, positions, normals, indices, uv2, worldMatrix;
		var ii, il, i1, i2, i3, pos1, pos2, pos3, nor, uv21, uv22, uv23;

		var uniforms = [];

		geometry = mesh.geometry;
		normals = geometry.attributes.normal;
		positions = geometry.attributes.position;
		indices = geometry.index;
		uv2 = geometry.attributes.uv2;
		//need to fix martix and martixWorld
		worldMatrix = mesh.matrix.elements;

		il = indices.count;
		for(ii = 0; ii < il; ii++){
			i1 = indices.array[ii];
			i2 = indices.array[++ii];
			i3 = indices.array[++ii];

			pos1 = this.localToWorld( [positions.array[i1*3], positions.array[i1*3+1], positions.array[i1*3+2]], worldMatrix );
			pos2 = this.localToWorld( [positions.array[i2*3], positions.array[i2*3+1], positions.array[i2*3+2]], worldMatrix );
			pos3 = this.localToWorld( [positions.array[i3*3], positions.array[i3*3+1], positions.array[i3*3+2]], worldMatrix );


			// nor = (new THREE.Vector3(normals.array[i1*3], normals.array[i1*3+1], normals.array[i1*3+2];)).applyMatrix4 ( worldMatrix );
			nor = [normals.array[i1*3], normals.array[i1*3+1], normals.array[i1*3+2]];
			uv21 = [uv2.array[i1*2], uv2.array[i1*2+1]];
			uv22 = [uv2.array[i2*2], uv2.array[i2*2+1]];
			uv23 = [uv2.array[i3*2], uv2.array[i3*2+1]];

			uniforms.push(this.createTri( pos1, pos2, pos3, nor, uv21, uv22, uv23));
		}
		return uniforms;
	},
	localToWorld : function(pos , e){
		var w = 1 / ( e[ 3 ] * pos[0] + e[ 7 ] * pos[1] + e[ 11 ] * pos[2] + e[ 15 ] );
		var worldPos = [
			( e[ 0 ] * pos[0] + e[ 4 ] * pos[1] + e[ 8 ] * pos[2] + e[ 12 ] ) * w,
			( e[ 1 ] * pos[0] + e[ 5 ] * pos[1] + e[ 9 ] * pos[2] + e[ 13 ] ) * w,
			( e[ 2 ] * pos[0] + e[ 6 ] * pos[1] + e[ 10 ] * pos[2] + e[ 14 ] ) * w
		];

		return worldPos;

	},
	createTri : function(pos1, pos2, pos3, nor, uv21, uv22, uv23){

		var tri = {
			pos1 : new THREE.Vector3(pos1[0], pos1[1], pos1[2]),
			pos2 : new THREE.Vector3(pos2[0], pos2[1], pos2[2]),
			pos3 : new THREE.Vector3(pos3[0], pos3[1], pos3[2]),

			nor : Array.isArray(nor)?new THREE.Vector3(nor[0], nor[1], nor[2]):nor,

			uv21 : new THREE.Vector2(uv21[0], uv21[1]),
			uv22 : new THREE.Vector2(uv22[0], uv22[1]),
			uv23 : new THREE.Vector2(uv23[0], uv23[1]),
		};
		console.log(tri);
		return tri;

	},

	bakeLightMap : function(){

		this.genUV2();
		this.uniforms = this.genTriangleUniform();
		var directLightMapMaterial = new THREE.ShaderMaterial({
			uniforms : {
				light : {
					value : {
						position : this.light.position,
						color : this.light.color,
						distance : this.light.distance?this.light.distance:20
					}
				},
				tris : { 
					value : this.uniforms
				},
			},
			vertexShader : ShaderLib.vertexShader,
			fragmentShader : ShaderLib.lightMapFragmentShader1,
		});

		var child;
		for(var i = 0, l = this.scene.children.length; i < l; i++ ){
			child = this.scene.children[i];
			if(child.isMesh){
				child.material = directLightMapMaterial;
			}
		}

		this.directLightMapBuffer = new THREE.WebGLRenderTarget( 512, 512, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});

		this.renderer.render(this.scene, this.viewCamera, this.directLightMapBuffer);

		this.material.uniforms.buffer.value = this.directLightMapBuffer.texture;

		this.renderer.render(this.viewScene, this.viewCamera);

		return this.directLightMapBuffer.texture;

	},

	render : function(){

	},


	DirectLightMapRender : function(light){
		
	}

}